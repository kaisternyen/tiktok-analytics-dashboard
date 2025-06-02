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

// Smart filter: adaptive tracking based on video age and performance
function shouldScrapeVideo(video: VideoRecord): boolean {
    const now = new Date();
    const minutesSinceLastScrape = (now.getTime() - video.lastScrapedAt.getTime()) / (1000 * 60);
    const daysSinceCreated = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Always use rapid testing interval (1 minute) for now during testing
    const testingInterval = 1;
    
    // Check if video needs tracking mode evaluation
    const needsModeEvaluation = shouldEvaluateTrackingMode(video);
    
    if (video.trackingMode === 'active') {
        // Active videos (hourly in production, 1 min for testing)
        return minutesSinceLastScrape >= testingInterval || needsModeEvaluation;
    } else {
        // Dormant videos (daily in production, but still 1 min for testing)
        return minutesSinceLastScrape >= testingInterval || needsModeEvaluation;
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
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
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