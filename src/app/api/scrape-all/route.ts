import { NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface VideoResult {
    status: 'success' | 'failed' | 'skipped';
    username: string;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    changes?: {
        views: number;
        likes: number;
        comments: number;
        shares: number;
    };
    error?: string;
    reason?: string;
}

interface VideoRecord {
    id: string;
    url: string;
    username: string;
    currentViews: number;
    currentLikes: number;
    currentComments: number;
    currentShares: number;
    lastScrapedAt: Date;
}

// Smart processing: Only scrape videos that need updates
function shouldScrapeVideo(video: VideoRecord): boolean {
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);

    // Only scrape if it's been more than 1 minute since last scrape
    return minutesSinceLastScrape >= 1;
}

// Process videos with smart batching and rate limiting
async function processVideosSmartly(videos: VideoRecord[], maxPerRun: number = 10) {
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Filter videos that need scraping
    const videosToScrape = videos.filter(shouldScrapeVideo);

    // Limit to maxPerRun to avoid overwhelming TikHub and stay under 60s timeout
    const videosToProcess = videosToScrape.slice(0, maxPerRun);

    console.log(`📊 ===== SMART PROCESSING ANALYSIS =====`);
    console.log(`📹 Total videos in DB: ${videos.length}`);
    console.log(`🔄 Videos needing scrape: ${videosToScrape.length}`);
    console.log(`⚡ Videos to process this run: ${videosToProcess.length}`);
    console.log(`🚫 Videos to skip: ${videos.length - videosToScrape.length}`);

    // Skip videos that don't need updates
    for (const video of videos) {
        if (!videosToScrape.includes(video)) {
            const minutesAgo = Math.floor((Date.now() - video.lastScrapedAt.getTime()) / (1000 * 60));
            console.log(`⏭️ Skipping @${video.username} (scraped ${minutesAgo} min ago)`);
            results.push({
                status: 'skipped',
                username: video.username,
                reason: 'Recently updated'
            });
            skipped++;
        }
    }

    if (videosToProcess.length === 0) {
        console.log(`🏁 No videos need processing - all recently updated`);
        return { results, successful, failed, skipped };
    }

    // Process videos in parallel batches of 3 to speed up while respecting rate limits
    const batchSize = 3;
    console.log(`🚀 Starting batch processing with batch size: ${batchSize}`);

    for (let i = 0; i < videosToProcess.length; i += batchSize) {
        const batch = videosToProcess.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(videosToProcess.length / batchSize);

        console.log(`📦 ===== BATCH ${batchNum}/${totalBatches} =====`);
        console.log(`🎬 Processing: ${batch.map(v => '@' + v.username).join(', ')}`);

        // Process batch in parallel
        const batchPromises = batch.map(async (video, index) => {
            try {
                console.log(`🎬 [${i + index + 1}/${videosToProcess.length}] Starting @${video.username}...`);

                const result = await scrapeTikTokVideo(video.url);

                if (result.success && result.data) {
                    // Update video metrics
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            currentViews: result.data.views,
                            currentLikes: result.data.likes,
                            currentComments: result.data.comments,
                            currentShares: result.data.shares,
                            lastScrapedAt: new Date(),
                        }
                    });

                    // Add new metrics history entry
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: result.data.views,
                            likes: result.data.likes,
                            comments: result.data.comments,
                            shares: result.data.shares,
                        }
                    });

                    const viewsChange = result.data.views - video.currentViews;
                    const likesChange = result.data.likes - video.currentLikes;
                    console.log(`✅ [${i + index + 1}] @${video.username}: ${result.data.views.toLocaleString()} views (+${viewsChange.toLocaleString()}), ${result.data.likes.toLocaleString()} likes (+${likesChange.toLocaleString()})`);

                    return {
                        status: 'success' as const,
                        username: video.username,
                        views: result.data.views,
                        likes: result.data.likes,
                        comments: result.data.comments,
                        shares: result.data.shares,
                        changes: {
                            views: viewsChange,
                            likes: likesChange,
                            comments: result.data.comments - video.currentComments,
                            shares: result.data.shares - video.currentShares,
                        }
                    };
                } else {
                    console.log(`❌ [${i + index + 1}] @${video.username} failed: ${result.error}`);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        error: result.error || 'Unknown error'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`💥 [${i + index + 1}] @${video.username} crashed: ${errorMessage}`);
                return {
                    status: 'failed' as const,
                    username: video.username,
                    error: errorMessage
                };
            }
        });

        // Wait for batch to complete
        console.log(`⏳ Waiting for batch ${batchNum} to complete...`);
        const batchResults = await Promise.all(batchPromises);

        // Count results
        batchResults.forEach(result => {
            results.push(result);
            if (result.status === 'success') successful++;
            else if (result.status === 'failed') failed++;
        });

        const batchSuccess = batchResults.filter(r => r.status === 'success').length;
        const batchFailed = batchResults.filter(r => r.status === 'failed').length;
        console.log(`📊 Batch ${batchNum} complete: ${batchSuccess} success, ${batchFailed} failed`);

        // Rate limiting: wait 1 second between batches to be nice to TikHub
        if (i + batchSize < videosToProcess.length) {
            console.log(`⏱️ Rate limiting: waiting 1 second before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log(`🏁 ===== PROCESSING COMPLETE =====`);
    console.log(`📊 Final results: ${successful} success, ${failed} failed, ${skipped} skipped`);

    return { results, successful, failed, skipped };
}

export async function GET() {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`🚀 [${timestamp}] ===== CRON SCRAPE STARTING =====`);
    console.log(`🕐 Execution time: ${timestamp}`);
    console.log(`💾 Database connection: ${prisma ? 'Connected' : 'Failed'}`);

    try {
        // Fetch all active videos, prioritizing oldest scraped first
        console.log(`📋 Fetching active videos from database...`);
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' }
        });

        console.log(`📊 Found ${videos.length} active videos in database`);

        if (videos.length === 0) {
            console.log(`⚠️ No videos found - database might be empty`);
            console.log(`🏁 Exiting early - nothing to scrape`);
            return NextResponse.json({
                success: true,
                message: 'No videos to scrape',
                summary: {
                    totalVideos: 0,
                    successful: 0,
                    failed: 0,
                    skipped: 0,
                    results: []
                }
            });
        }

        // Log video ages
        const now = new Date();
        videos.forEach((video, index) => {
            const minutesAgo = Math.floor((now.getTime() - video.lastScrapedAt.getTime()) / (1000 * 60));
            console.log(`📹 [${index + 1}/${videos.length}] @${video.username} - last scraped ${minutesAgo} minutes ago`);
        });

        console.log(`⚡ Starting smart processing...`);
        // Smart processing with rate limiting
        const { results, successful, failed, skipped } = await processVideosSmartly(videos, 10);

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        const summary = {
            totalVideos: videos.length,
            successful,
            failed,
            skipped,
            processed: successful + failed,
            duration: `${duration.toFixed(1)}s`,
            timestamp: new Date().toISOString(),
            results: results.slice(0, 10) // Limit response size
        };

        console.log(`🎉 ===== CRON COMPLETED =====`);
        console.log(`✅ Success: ${successful} videos updated`);
        console.log(`⏭️ Skipped: ${skipped} videos (too recent)`);
        console.log(`❌ Failed: ${failed} videos had errors`);
        console.log(`⏱️ Duration: ${duration.toFixed(1)} seconds`);
        console.log(`📈 Total processed: ${successful + failed}/${videos.length}`);

        return NextResponse.json({
            success: true,
            message: `Smart cron: ${successful} updated, ${skipped} skipped, ${failed} failed in ${duration.toFixed(1)}s`,
            summary
        });

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 ===== CRON FAILED =====');
        console.error(`❌ Error: ${errorMsg}`);
        console.error(`🔍 Stack trace:`, error);
        console.error(`🕐 Failed at: ${new Date().toISOString()}`);

        return NextResponse.json(
            {
                error: 'Cron scrape failed',
                details: errorMsg,
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

// Keep POST for manual triggers
export async function POST() {
    return GET(); // Same logic for manual triggers
} 