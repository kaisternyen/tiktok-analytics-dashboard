import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

// Same logic as in scrape-all/route.ts to identify pending videos
function shouldScrapeVideo(video: { trackingMode: string | null; scrapingCadence: string; lastScrapedAt: Date }): { shouldScrape: boolean; reason?: string } {
    // Skip deleted videos entirely
    if (video.trackingMode === 'deleted') {
        return { shouldScrape: false, reason: 'Video marked as deleted/unavailable' };
    }
    
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    
    // For testing mode (every minute), check if we're at a new normalized minute
    if (video.scrapingCadence === 'testing') {
        return { shouldScrape: true, reason: 'Testing mode - always scrape for debugging' };
    }
    
    // Videos with daily cadence: scrape once per day with guaranteed processing
    if (video.scrapingCadence === 'daily') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        
        // GUARANTEED PROCESSING: Daily videos get scraped every 12+ hours
        if (hoursSinceLastScrape >= 12) {
            return { shouldScrape: true, reason: `Daily video - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else {
            const hoursRemaining = Math.ceil(12 - hoursSinceLastScrape);
            return { shouldScrape: false, reason: `Daily video - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
        }
    }
    
    // Videos with hourly cadence: GUARANTEED processing every hour
    if (video.scrapingCadence === 'hourly') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        
        // GUARANTEED PROCESSING: Hourly videos get scraped every 30+ minutes
        if (hoursSinceLastScrape >= 0.5) { // 30 minutes = 0.5 hours
            return { shouldScrape: true, reason: `Hourly video - ${Math.floor(hoursSinceLastScrape * 60)}min since last scrape` };
        } else {
            const minutesRemaining = Math.ceil((0.5 - hoursSinceLastScrape) * 60);
            return { shouldScrape: false, reason: `Hourly video - scraped ${Math.floor(hoursSinceLastScrape * 60)}min ago, wait ${minutesRemaining}min more` };
        }
    }
    
    return { shouldScrape: true, reason: `Ready to scrape (unknown cadence)` };
}

interface VideoResult {
    status: 'success' | 'failed' | 'skipped';
    username: string;
    platform?: string;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    error?: string;
    reason?: string;
}

interface ProcessingResult {
    results: VideoResult[];
    successful: number;
    failed: number;
    skipped: number;
}

// CLEAR SPECIFIC PENDING VIDEOS - Only process videos that are actually pending
async function clearPendingVideos(): Promise<ProcessingResult> {
    const startTime = Date.now();
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    const skipped = 0;

    console.log(`🚀 ===== CLEARING SPECIFIC PENDING VIDEOS =====`);

    try {
        // Get ALL active videos first
        const allVideos = await prisma.video.findMany({
            where: { 
                isActive: true,
                OR: [
                    { trackingMode: null },
                    { trackingMode: { not: 'deleted' } }
                ]
            },
            select: {
                id: true,
                url: true,
                username: true,
                platform: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                lastScrapedAt: true,
                createdAt: true,
                scrapingCadence: true,
                lastDailyViews: true,
                dailyViewsGrowth: true,
                needsCadenceCheck: true,
                trackingMode: true,
            }
        });

        console.log(`📊 Found ${allVideos.length} total active videos`);

        // Use the same shouldScrapeVideo logic as get-pending-videos
        const pendingVideos = allVideos.filter(video => {
            const result = shouldScrapeVideo(video);
            return result.shouldScrape;
        });

        console.log(`📊 Found ${pendingVideos.length} pending videos to process (out of ${allVideos.length} total)`);

        if (pendingVideos.length === 0) {
            console.log('✅ No pending videos found to process - all caught up!');
            return { results, successful, failed, skipped };
        }

        // Process in batches for better performance
        const batchSize = 10;
        console.log(`🚀 Processing ${pendingVideos.length} pending videos in batches of ${batchSize}`);

        for (let i = 0; i < pendingVideos.length; i += batchSize) {
            const batch = pendingVideos.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(pendingVideos.length / batchSize);
            
            console.log(`📦 Processing batch ${batchNum}/${totalBatches}: ${batch.map(v => `@${v.username}`).join(', ')}`);

            const batchPromises = batch.map(async (video, index) => {
                try {
                    console.log(`🎬 [${i + index + 1}/${pendingVideos.length}] Processing @${video.username} (${video.platform})...`);

                    const result = await scrapeMediaPost(video.url);

                    if (result.success && result.data) {
                        const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
                        
                        // Get views based on platform
                        let views = 0;
                        let shares = 0;
                        
                        if (video.platform === 'instagram') {
                            const instaData = mediaData as InstagramPostData;
                            views = instaData.plays || instaData.views || 0;
                            shares = 0;
                        } else if (video.platform === 'youtube') {
                            const youtubeData = mediaData as YouTubeVideoData;
                            views = youtubeData.views || 0;
                            shares = 0;
                        } else {
                            const tiktokData = mediaData as TikTokVideoData;
                            views = tiktokData.views || 0;
                            shares = tiktokData.shares || 0;
                        }

                        // Update video metrics
                        await prisma.video.update({
                            where: { id: video.id },
                            data: {
                                currentViews: views,
                                currentLikes: mediaData.likes,
                                currentComments: mediaData.comments,
                                currentShares: shares,
                                lastScrapedAt: new Date(),
                                lastDailyViews: video.currentViews,
                                dailyViewsGrowth: video.lastDailyViews !== null ? Math.max(0, views - video.lastDailyViews) : null,
                                needsCadenceCheck: false,
                            }
                        });

                        // Add metrics history entry
                        await prisma.metricsHistory.create({
                            data: {
                                videoId: video.id,
                                views: views,
                                likes: mediaData.likes,
                                comments: mediaData.comments,
                                shares: shares,
                                timestamp: new Date()
                            }
                        });

                        const viewsChange = views - video.currentViews;
                        const likesChange = mediaData.likes - video.currentLikes;
                        console.log(`✅ [${i + index + 1}] @${video.username}: ${views.toLocaleString()} views (+${viewsChange.toLocaleString()}), ${mediaData.likes.toLocaleString()} likes (+${likesChange.toLocaleString()})`);

                        return {
                            status: 'success' as const,
                            username: video.username,
                            platform: video.platform,
                            views: views,
                            likes: mediaData.likes,
                            comments: mediaData.comments,
                            shares: shares,
                            reason: 'Cleared from pending'
                        };
                    } else {
                        console.error(`❌ [${i + index + 1}] @${video.username} failed: ${result.error}`);
                        return {
                            status: 'failed' as const,
                            username: video.username,
                            platform: video.platform,
                            error: result.error || 'Unknown error'
                        };
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`💥 [${i + index + 1}] @${video.username} crashed: ${errorMessage}`);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        platform: video.platform,
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

            const batchDuration = Date.now() - startTime;
            const batchSuccess = batchResults.filter(r => r.status === 'success').length;
            const batchFailed = batchResults.filter(r => r.status === 'failed').length;
            
            console.log(`📊 Batch ${batchNum} complete in ${batchDuration}ms: ${batchSuccess} success, ${batchFailed} failed`);
        }

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 ===== CLEARING COMPLETED =====`);
        console.log(`📊 Results: ${successful} successful, ${failed} failed, ${skipped} skipped`);
        console.log(`⏱️ Total duration: ${totalDuration}ms`);

        return { results, successful, failed, skipped };

    } catch (error) {
        console.error('💥 Error clearing pending videos:', error);
        throw error;
    }
}

export async function POST() {
    const startTime = Date.now();
    console.log(`🚀 ===== CLEAR ALL PENDING VIDEOS REQUESTED =====`);

    try {
        const result = await clearPendingVideos();
        const duration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            message: `Cleared ${result.successful} videos successfully`,
            status: {
                totalProcessed: result.successful + result.failed,
                successful: result.successful,
                failed: result.failed,
                skipped: result.skipped,
                duration
            },
            results: result.results.slice(0, 20) // Limit results in response
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 CLEAR PENDING FAILED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            status: {
                duration,
                crashed: true
            }
        }, { status: 500 });
    }
}
