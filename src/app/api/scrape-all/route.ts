import { NextRequest, NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/apify';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    console.log('🔄 Starting automated scrape-all process...');

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

        const results = [];
        let successful = 0;
        let failed = 0;

        // Process each video
        for (const video of videos) {
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

                    successful++;
                    results.push({
                        username: video.username,
                        status: 'success',
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
                    });

                    console.log(`✅ Successfully updated @${video.username}`);
                } else {
                    failed++;
                    results.push({
                        username: video.username,
                        status: 'failed',
                        error: result.error || 'Unknown error'
                    });
                    console.log(`❌ Failed to scrape @${video.username}: ${result.error}`);
                }

                // Add a small delay between requests to be respectful
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                failed++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                results.push({
                    username: video.username,
                    status: 'failed',
                    error: errorMessage
                });
                console.error(`💥 Error processing @${video.username}:`, error);
            }
        }

        const summary = {
            totalVideos: videos.length,
            successful,
            failed,
            timestamp: new Date().toISOString(),
            results
        };

        console.log(`🎉 Scrape-all completed: ${successful}/${videos.length} successful`);

        return NextResponse.json({
            success: true,
            message: `Processed ${videos.length} videos: ${successful} successful, ${failed} failed`,
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