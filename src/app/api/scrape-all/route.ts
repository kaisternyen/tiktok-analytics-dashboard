import { NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/apify';
import { prisma } from '@/lib/prisma';

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

    // Only scrape if it's been more than 15 minutes since last scrape
    return minutesSinceLastScrape >= 15;
}

// Process videos with smart batching and rate limiting
async function processVideosSmartly(videos: VideoRecord[], maxPerRun: number = 10) {
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Filter videos that need scraping
    const videosToScrape = videos.filter(shouldScrapeVideo);

    // Limit to maxPerRun to avoid overwhelming Apify and stay under 60s timeout
    const videosToProcess = videosToScrape.slice(0, maxPerRun);

    console.log(`📊 Analysis: ${videos.length} total, ${videosToScrape.length} need updates, processing ${videosToProcess.length}`);

    // Skip videos that don't need updates
    for (const video of videos) {
        if (!videosToScrape.includes(video)) {
            results.push({
                status: 'skipped',
                username: video.username,
                reason: 'Recently updated'
            });
            skipped++;
        }
    }

    // Process videos in parallel batches of 3 to speed up while respecting rate limits
    const batchSize = 3;
    for (let i = 0; i < videosToProcess.length; i += batchSize) {
        const batch = videosToProcess.slice(i, i + batchSize);

        // Process batch in parallel
        const batchPromises = batch.map(async (video, index) => {
            try {
                console.log(`🎬 [${i + index + 1}/${videosToProcess.length}] Scraping @${video.username}`);

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

                    console.log(`✅ Updated @${video.username}: ${result.data.views} views`);

                    return {
                        status: 'success' as const,
                        username: video.username,
                        views: result.data.views,
                        likes: result.data.likes,
                        comments: result.data.comments,
                        shares: result.data.shares,
                        changes: {
                            views: result.data.views - video.currentViews,
                            likes: result.data.likes - video.currentLikes,
                            comments: result.data.comments - video.currentComments,
                            shares: result.data.shares - video.currentShares,
                        }
                    };
                } else {
                    console.log(`❌ Failed @${video.username}: ${result.error}`);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        error: result.error || 'Unknown error'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`💥 Error processing @${video.username}:`, error);
                return {
                    status: 'failed' as const,
                    username: video.username,
                    error: errorMessage
                };
            }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Count results
        batchResults.forEach(result => {
            results.push(result);
            if (result.status === 'success') successful++;
            else if (result.status === 'failed') failed++;
        });

        // Rate limiting: wait 1 second between batches to be nice to Apify
        if (i + batchSize < videosToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return { results, successful, failed, skipped };
}

export async function GET() {
    const startTime = Date.now();
    console.log(`🚀 [${new Date().toISOString()}] Starting smart cron scrape...`);

    try {
        // Fetch all active videos, prioritizing oldest scraped first
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' }
        });

        console.log(`📋 Found ${videos.length} active videos`);

        if (videos.length === 0) {
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

        console.log(`🎉 Cron completed: ${successful}/${videos.length} updated, ${skipped} skipped, ${failed} failed in ${duration.toFixed(1)}s`);

        return NextResponse.json({
            success: true,
            message: `Smart cron: ${successful} updated, ${skipped} skipped, ${failed} failed in ${duration.toFixed(1)}s`,
            summary
        });

    } catch (error) {
        console.error('💥 Cron scrape failed:', error);
        return NextResponse.json(
            {
                error: 'Cron scrape failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// Keep POST for manual triggers
export async function POST() {
    return GET(); // Same logic for manual triggers
} 