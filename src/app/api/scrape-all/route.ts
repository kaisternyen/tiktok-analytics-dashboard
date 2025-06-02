import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface VideoResult {
    status: 'success' | 'failed' | 'skipped';
    username: string;
    platform?: string;
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

interface ProcessingResult {
    results: VideoResult[];
    successful: number;
    failed: number;
    skipped: number;
}

interface VideoRecord {
    id: string;
    url: string;
    username: string;
    platform: string;
    currentViews: number;
    currentLikes: number;
    currentComments: number;
    currentShares: number;
    lastScrapedAt: Date;
}

// Smart filter: only scrape videos that need updating
function shouldScrapeVideo(video: VideoRecord): boolean {
    const now = new Date();
    const minutesSinceLastScrape = (now.getTime() - video.lastScrapedAt.getTime()) / (1000 * 60);
    
    // Skip if scraped within last 5 minutes to avoid overloading but still get frequent updates
    return minutesSinceLastScrape >= 5;
}

// Smart processing with rate limiting and error handling
async function processVideosSmartly(videos: VideoRecord[], maxPerRun: number = 10): Promise<ProcessingResult> {
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Filter videos that need scraping
    const videosToProcess = videos.filter(video => {
        if (shouldScrapeVideo(video)) {
            return true;
        } else {
            const minutesAgo = Math.floor((new Date().getTime() - video.lastScrapedAt.getTime()) / (1000 * 60));
            console.log(`⏭️ Skipping @${video.username} (${video.platform}) (scraped ${minutesAgo} min ago)`);
            results.push({
                status: 'skipped',
                username: video.username,
                platform: video.platform,
                reason: `Scraped ${minutesAgo} minutes ago`
            });
            skipped++;
            return false;
        }
    });

    if (videosToProcess.length === 0) {
        console.log(`⚠️ No videos need scraping (all recently updated)`);
        return { results, successful, failed, skipped };
    }

    // Limit processing to avoid timeouts
    const limitedVideos = videosToProcess.slice(0, maxPerRun);
    console.log(`🎯 Processing ${limitedVideos.length}/${videosToProcess.length} videos (max ${maxPerRun} per run)`);

    // Process in smaller batches
    const batchSize = 3;
    console.log(`🚀 Starting batch processing with batch size: ${batchSize}`);

    for (let i = 0; i < limitedVideos.length; i += batchSize) {
        const batch = limitedVideos.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(limitedVideos.length / batchSize);

        console.log(`📦 ===== BATCH ${batchNum}/${totalBatches} =====`);
        console.log(`🎬 Processing: ${batch.map(v => `@${v.username} (${v.platform})`).join(', ')}`);

        // Process batch in parallel
        const batchPromises = batch.map(async (video, index) => {
            try {
                console.log(`🎬 [${i + index + 1}/${limitedVideos.length}] Starting @${video.username} (${video.platform})...`);

                // Use the generic scrapeMediaPost function that handles both platforms
                const result = await scrapeMediaPost(video.url);

                if (result.success && result.data) {
                    const mediaData = result.data as TikTokVideoData | InstagramPostData;
                    const isInstagram = video.platform === 'instagram';
                    
                    // Get views based on platform
                    const views = isInstagram ? 
                        ((mediaData as InstagramPostData).plays || (mediaData as InstagramPostData).views || 0) : 
                        (mediaData as TikTokVideoData).views;
                    
                    const shares = isInstagram ? 0 : ((mediaData as TikTokVideoData).shares || 0);

                    // Update video metrics
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            currentViews: views,
                            currentLikes: mediaData.likes,
                            currentComments: mediaData.comments,
                            currentShares: shares,
                            lastScrapedAt: new Date(),
                        }
                    });

                    // Add new metrics history entry
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: views,
                            likes: mediaData.likes,
                            comments: mediaData.comments,
                            shares: shares,
                        }
                    });

                    const viewsChange = views - video.currentViews;
                    const likesChange = mediaData.likes - video.currentLikes;
                    console.log(`✅ [${i + index + 1}] @${video.username} (${video.platform}): ${views.toLocaleString()} views (+${viewsChange.toLocaleString()}), ${mediaData.likes.toLocaleString()} likes (+${likesChange.toLocaleString()})`);

                    return {
                        status: 'success' as const,
                        username: video.username,
                        platform: video.platform,
                        views: views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: shares,
                        changes: {
                            views: viewsChange,
                            likes: likesChange,
                            comments: mediaData.comments - video.currentComments,
                            shares: shares - video.currentShares,
                        }
                    };
                } else {
                    console.log(`❌ [${i + index + 1}] @${video.username} (${video.platform}) failed: ${result.error}`);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        platform: video.platform,
                        error: result.error || 'Unknown error'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`💥 [${i + index + 1}] @${video.username} (${video.platform}) crashed: ${errorMessage}`);
                return {
                    status: 'failed' as const,
                    username: video.username,
                    platform: video.platform,
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

        // Rate limiting: wait 1 second between batches to be nice to APIs
        if (i + batchSize < limitedVideos.length) {
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
            orderBy: { lastScrapedAt: 'asc' },
            select: {
                id: true,
                url: true,
                username: true,
                platform: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                lastScrapedAt: true
            }
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
            console.log(`📹 [${index + 1}/${videos.length}] @${video.username} (${video.platform}) - last scraped ${minutesAgo} minutes ago`);
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