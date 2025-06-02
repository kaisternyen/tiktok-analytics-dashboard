import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface VideoRecord {
    id: string;
    url: string;
    username: string;
    platform: string;
    currentViews: number;
    currentLikes: number;
    currentComments: number;
    currentShares: number;
    trackingMode: string;
    lastModeChange: Date;
    lastDailyViews: number;
    createdAt: Date;
    lastScrapedAt: Date;
    isActive: boolean;
}

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

// Smart filter: adaptive tracking with synchronized timing boundaries
function shouldScrapeVideo(video: VideoRecord): boolean {
    const now = new Date();
    const lastScrape = new Date(video.lastScrapedAt);
    
    // Check if video needs tracking mode evaluation
    const needsModeEvaluation = shouldEvaluateTrackingMode(video);
    
    if (video.trackingMode === 'active') {
        // Active videos: hourly tracking (production) or minutely (testing)
        // For testing: check if we're in a new minute since last scrape
        const currentMinute = now.getMinutes();
        const lastScrapeMinute = lastScrape.getMinutes();
        const currentHour = now.getHours();
        const lastScrapeHour = lastScrape.getHours();
        const currentDay = now.getDate();
        const lastScrapeDay = lastScrape.getDate();
        
        // Testing mode: scrape at every minute boundary (:00, :01, :02, etc.)
        const isNewMinuteBoundary = currentMinute !== lastScrapeMinute || 
                                   currentHour !== lastScrapeHour || 
                                   currentDay !== lastScrapeDay;
        
        // Production mode would be hourly boundaries:
        // const isNewHourBoundary = currentHour !== lastScrapeHour || currentDay !== lastScrapeDay;
        
        console.log(`⏰ @${video.username} (active): Last: ${lastScrapeHour}:${lastScrapeMinute.toString().padStart(2, '0')}, Now: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, New boundary: ${isNewMinuteBoundary}`);
        
        return isNewMinuteBoundary || needsModeEvaluation;
    } else {
        // Dormant videos: daily tracking at day boundaries
        const currentDay = now.getDate();
        const lastScrapeDay = lastScrape.getDate();
        const currentMonth = now.getMonth();
        const lastScrapeMonth = lastScrape.getMonth();
        const currentYear = now.getFullYear();
        const lastScrapeYear = lastScrape.getFullYear();
        
        const isNewDayBoundary = currentDay !== lastScrapeDay || 
                                currentMonth !== lastScrapeMonth || 
                                currentYear !== lastScrapeYear;
        
        // For testing, also allow minutely updates for dormant videos to see the system working
        const currentMinute = now.getMinutes();
        const lastScrapeMinute = lastScrape.getMinutes();
        const currentHour = now.getHours();
        const lastScrapeHour = lastScrape.getHours();
        const isNewMinuteBoundary = currentMinute !== lastScrapeMinute || 
                                   currentHour !== lastScrapeHour || 
                                   currentDay !== lastScrapeDay;
        
        console.log(`⏰ @${video.username} (dormant): Last: ${lastScrapeDay}/${lastScrapeMonth} ${lastScrapeHour}:${lastScrapeMinute.toString().padStart(2, '0')}, Now: ${currentDay}/${currentMonth} ${currentHour}:${currentMinute.toString().padStart(2, '0')}, New day: ${isNewDayBoundary}, New minute: ${isNewMinuteBoundary}`);
        
        return isNewDayBoundary || isNewMinuteBoundary || needsModeEvaluation;
    }
}

// Determine if a video needs tracking mode evaluation
function shouldEvaluateTrackingMode(video: VideoRecord): boolean {
    const now = new Date();
    const daysSinceCreated = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const hoursSinceLastModeChange = (now.getTime() - video.lastModeChange.getTime()) / (1000 * 60 * 60);
    
    // Only evaluate if it's been at least 1 hour since last mode change
    if (hoursSinceLastModeChange < 1) return false;
    
    // Videos older than 7 days should be evaluated for dormant mode
    if (daysSinceCreated >= 7 && video.trackingMode === 'active') {
        return true;
    }
    
    // Dormant videos should be evaluated if they might be gaining traction
    if (video.trackingMode === 'dormant') {
        return true;
    }
    
    return false;
}

// Determine the appropriate tracking mode for a video
async function evaluateTrackingMode(video: VideoRecord): Promise<'active' | 'dormant'> {
    const now = new Date();
    const daysSinceCreated = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Videos less than 7 days old are always active
    if (daysSinceCreated < 7) {
        return 'active';
    }
    
    // For videos older than 7 days, check daily growth
    // Get views from 24 hours ago
    const viewsYesterday = video.lastDailyViews || video.currentViews;
    const dailyGrowth = video.currentViews - viewsYesterday;
    
    console.log(`📊 Evaluating tracking mode for @${video.username}:`, {
        age: `${daysSinceCreated.toFixed(1)} days`,
        currentViews: video.currentViews,
        viewsYesterday,
        dailyGrowth,
        threshold: 10000
    });
    
    // If daily growth is > 10,000 views, switch to active
    if (dailyGrowth > 10000) {
        console.log(`🚀 @${video.username} gained ${dailyGrowth} views in 24h - switching to ACTIVE tracking`);
        return 'active';
    }
    
    // Otherwise, keep as dormant for older videos
    if (daysSinceCreated >= 7) {
        console.log(`💤 @${video.username} gained ${dailyGrowth} views in 24h - keeping DORMANT tracking`);
        return 'dormant';
    }
    
    return 'active';
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
                trackingMode: true,
                lastModeChange: true,
                lastDailyViews: true,
                createdAt: true,
                lastScrapedAt: true,
                isActive: true
            }
        });

        console.log(`📊 Found ${videos.length} total videos in database`);

        // Filter videos that need scraping (adaptive scheduling)
        const videosToScrape = videos.filter(shouldScrapeVideo);
        const activeVideos = videos.filter(v => v.trackingMode === 'active');
        const dormantVideos = videos.filter(v => v.trackingMode === 'dormant');

        console.log(`🎯 Adaptive tracking status:`, {
            total: videos.length,
            active: activeVideos.length,
            dormant: dormantVideos.length,
            needingScrape: videosToScrape.length
        });

        if (videosToScrape.length === 0) {
            console.log('✅ No videos need scraping at this time');
            
            const response: CronStatusResponse = {
                success: true,
                message: `All ${videos.length} videos are up to date`,
                status: {
                    system: {
                        status: 'healthy',
                        totalVideos: videos.length,
                        activeVideos: activeVideos.length,
                        dormantVideos: dormantVideos.length,
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
                console.log(`🎬 Processing @${video.username} (${video.platform}, ${video.trackingMode} mode)...`);

                // Evaluate tracking mode if needed
                const needsModeEvaluation = shouldEvaluateTrackingMode(video);
                let newTrackingMode = video.trackingMode;
                
                if (needsModeEvaluation) {
                    newTrackingMode = await evaluateTrackingMode(video);
                    
                    if (newTrackingMode !== video.trackingMode) {
                        console.log(`🔄 @${video.username} tracking mode: ${video.trackingMode} → ${newTrackingMode}`);
                        
                        // Update tracking mode in database
                        await prisma.video.update({
                            where: { id: video.id },
                            data: {
                                trackingMode: newTrackingMode,
                                lastModeChange: new Date(),
                                lastDailyViews: video.currentViews // Store current views for next evaluation
                            }
                        });
                    }
                }

                // Scrape the video
                const result = await scrapeMediaPost(video.url);

                if (result.success && result.data) {
                    const data = result.data as TikTokVideoData | InstagramPostData;

                    // Extract metrics
                    const views = data.plays || data.views || 0;
                    const likes = data.likes || 0;
                    const comments = data.comments || 0;
                    const shares = (data as TikTokVideoData).shares || 0;

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
                        status: 'success',
                        trackingMode: newTrackingMode
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
            .filter(r => r.status === 'success' && r.views)
            .slice(0, 5)
            .map(r => ({
                username: r.username,
                views: r.views,
                minutesAgo: 0
            }));

        // Refresh counts after processing
        const finalVideos = await prisma.video.findMany({
            where: { isActive: true },
            select: { trackingMode: true }
        });

        const finalActiveCount = finalVideos.filter(v => v.trackingMode === 'active').length;
        const finalDormantCount = finalVideos.filter(v => v.trackingMode === 'dormant').length;

        const response: CronStatusResponse = {
            success: true,
            message: `Processed ${videosToScrape.length} videos: ${successCount} success, ${errorCount} errors`,
            status: {
                system: {
                    status: errorCount > 0 ? 'partial' : 'healthy',
                    totalVideos: finalVideos.length,
                    activeVideos: finalActiveCount,
                    dormantVideos: finalDormantCount,
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