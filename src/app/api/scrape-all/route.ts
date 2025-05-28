import { NextRequest, NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/apify';
import { prisma } from '@/lib/prisma';

interface VideoResult {
    status: 'success' | 'failed';
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
}

// Concurrent processing function
async function processVideosConcurrently(videos: any[], concurrency: number = 5) {
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process videos in batches to avoid overwhelming the service
    for (let i = 0; i < videos.length; i += concurrency) {
        const batch = videos.slice(i, i + concurrency);
        console.log(`🔄 Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(videos.length / concurrency)} (${batch.length} videos)`);

        // Process batch concurrently
        const batchPromises = batch.map(async (video) => {
            try {
                console.log(`🎬 Scraping @${video.username} (${video.url})`);

                // Scrape the video
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

                    console.log(`✅ Successfully updated @${video.username}`);

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
                    console.log(`❌ Failed to scrape @${video.username}: ${result.error}`);
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
        const batchResults = await Promise.allSettled(batchPromises);

        // Process results
        batchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
                if (result.value.status === 'success') {
                    successful++;
                } else {
                    failed++;
                }
            } else {
                failed++;
                results.push({
                    status: 'failed',
                    username: 'unknown',
                    error: result.reason?.message || 'Promise rejected'
                });
            }
        });

        // Small delay between batches to be respectful
        if (i + concurrency < videos.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return { results, successful, failed };
}

export async function GET(request: NextRequest) {
    console.log('🚀 Starting CONCURRENT automated scrape-all process...');

    try {
        // Fetch all active videos from database
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' } // Prioritize videos that haven't been scraped recently
        });

        console.log(`📋 Found ${videos.length} active videos to scrape`);

        if (videos.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No videos to scrape',
                summary: {
                    totalVideos: 0,
                    successful: 0,
                    failed: 0,
                    results: []
                }
            });
        }

        const startTime = Date.now();

        // Process videos concurrently (5 at a time)
        const { results, successful, failed } = await processVideosConcurrently(videos, 5);

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // in seconds

        const summary = {
            totalVideos: videos.length,
            successful,
            failed,
            duration: `${duration.toFixed(1)}s`,
            timestamp: new Date().toISOString(),
            results
        };

        console.log(`🎉 CONCURRENT scrape-all completed in ${duration.toFixed(1)}s: ${successful}/${videos.length} successful`);

        return NextResponse.json({
            success: true,
            message: `Processed ${videos.length} videos in ${duration.toFixed(1)}s: ${successful} successful, ${failed} failed`,
            summary
        });

    } catch (error) {
        console.error('💥 Scrape-all process failed:', error);
        return NextResponse.json(
            {
                error: 'Scrape-all process failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
    return GET(request);
} 