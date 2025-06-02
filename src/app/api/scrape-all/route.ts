import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface CronStatusResponse {
    success: boolean;
    message: string;
    status: {
        system: {
            status: string;
            totalVideos: number;
            activeVideos: number;
            dormantVideos: number;
            videosNeedingScrape: number;
        };
        cron: {
            lastActivity: string;
            minutesSinceLastActivity: number | null;
            isHealthy: boolean;
        };
        recentActivity: Array<{
            username: string;
            views: number;
            minutesAgo: number;
        }>;
    };
}

// Smart filter: check if video needs scraping based on time elapsed
function shouldScrapeVideo(video: any): boolean {
    const now = new Date();
    const lastScrape = new Date(video.lastScrapedAt);
    const timeDiff = now.getTime() - lastScrape.getTime();
    
    // For now, scrape every 30 minutes in production, every minute in development
    const scrapeInterval = process.env.NODE_ENV === 'production' ? 30 * 60 * 1000 : 60 * 1000;
    
    return timeDiff >= scrapeInterval;
}

export async function GET() {
    console.log('🔄 Cron job /api/scrape-all triggered at:', new Date().toISOString());

    try {
        // Get all active videos from database
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                id: true,
                url: true,
                username: true,
                platform: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                createdAt: true,
                lastScrapedAt: true,
                isActive: true
            }
        });

        console.log(`📊 Found ${videos.length} total videos in database`);

        // Filter videos that need scraping
        const videosToScrape = videos.filter(shouldScrapeVideo);

        console.log(`🎯 Videos needing scrape: ${videosToScrape.length} of ${videos.length}`);

        if (videosToScrape.length === 0) {
            console.log('✅ No videos need scraping at this time');
            
            const response: CronStatusResponse = {
                success: true,
                message: `All ${videos.length} videos are up to date`,
                status: {
                    system: {
                        status: 'healthy',
                        totalVideos: videos.length,
                        activeVideos: videos.length,
                        dormantVideos: 0,
                        videosNeedingScrape: 0
                    },
                    cron: {
                        lastActivity: new Date().toISOString(),
                        minutesSinceLastActivity: 0,
                        isHealthy: true
                    },
                    recentActivity: []
                }
            };

            return NextResponse.json(response);
        }

        console.log(`🚀 Starting to scrape ${videosToScrape.length} videos...`);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Process each video
        for (const video of videosToScrape) {
            try {
                console.log(`🎬 Processing @${video.username} (${video.platform})...`);

                // Scrape the video
                const result = await scrapeMediaPost(video.url);

                if (result.success && result.data) {
                    const data = result.data as TikTokVideoData | InstagramPostData;

                    // Extract metrics based on platform
                    let views = 0;
                    if (video.platform === 'instagram' || video.platform === 'youtube') {
                        const mediaData = data as InstagramPostData;
                        views = mediaData.plays || mediaData.views || 0;
                    } else {
                        const mediaData = data as TikTokVideoData;
                        views = mediaData.views || 0;
                    }
                    
                    const likes = data.likes || 0;
                    const comments = data.comments || 0;
                    const shares = video.platform === 'instagram' || video.platform === 'youtube' ? 0 : ((data as TikTokVideoData).shares || 0);

                    // Update video record
                    await prisma.video.update({
                        where: { url: video.url },
                        data: {
                            currentViews: views,
                            currentLikes: likes,
                            currentComments: comments,
                            currentShares: shares,
                            lastScrapedAt: new Date()
                        }
                    });

                    // Add metrics history entry
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: views,
                            likes: likes,
                            comments: comments,
                            shares: shares
                        }
                    });

                    const viewsChange = views - video.currentViews;
                    console.log(`✅ @${video.username}: ${views.toLocaleString()} views (+${viewsChange})`);

                    results.push({
                        username: video.username,
                        views: views,
                        change: viewsChange,
                        status: 'success'
                    });

                    successCount++;
                } else {
                    console.error(`❌ Failed to scrape @${video.username}:`, result.error);
                    errorCount++;
                    results.push({
                        username: video.username,
                        status: 'error',
                        error: result.error
                    });
                }

            } catch (error) {
                console.error(`💥 Exception scraping @${video.username}:`, error);
                errorCount++;
                results.push({
                    username: video.username,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        console.log(`🏁 Cron job completed: ${successCount} success, ${errorCount} errors`);

        // Build response
        const recentActivity = results
            .filter(r => r.status === 'success' && r.views !== undefined)
            .slice(0, 5)
            .map(r => ({
                username: r.username,
                views: r.views!,
                minutesAgo: 0
            }));

        const response: CronStatusResponse = {
            success: true,
            message: `Processed ${videosToScrape.length} videos: ${successCount} success, ${errorCount} errors`,
            status: {
                system: {
                    status: errorCount > 0 ? 'partial' : 'healthy',
                    totalVideos: videos.length,
                    activeVideos: videos.length,
                    dormantVideos: 0,
                    videosNeedingScrape: 0
                },
                cron: {
                    lastActivity: new Date().toISOString(),
                    minutesSinceLastActivity: 0,
                    isHealthy: true
                },
                recentActivity: recentActivity
            }
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('💥 Cron job failed:', error);

        const response: CronStatusResponse = {
            success: false,
            message: `Cron job failed: ${error instanceof Error ? error.message : String(error)}`,
            status: {
                system: {
                    status: 'error',
                    totalVideos: 0,
                    activeVideos: 0,
                    dormantVideos: 0,
                    videosNeedingScrape: 0
                },
                cron: {
                    lastActivity: new Date().toISOString(),
                    minutesSinceLastActivity: 0,
                    isHealthy: false
                },
                recentActivity: []
            }
        };

        return NextResponse.json(response, { status: 500 });
    }
}

// Keep POST for manual triggers
export async function POST() {
    return GET(); // Same logic for manual triggers
} 