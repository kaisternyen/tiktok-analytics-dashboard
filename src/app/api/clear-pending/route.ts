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
    url?: string;
    removedFromDatabase?: boolean;
}

interface ProcessingResult {
    results: VideoResult[];
    successful: number;
    failed: number;
    skipped: number;
    removedCount: number;
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
            return { results, successful, failed, skipped, removedCount: 0 };
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
                    console.log(`🔗 URL: ${video.url}`);
                    console.log(`📅 Last scraped: ${video.lastScrapedAt}`);
                    console.log(`⏰ Cadence: ${video.scrapingCadence}`);

                    const result = await scrapeMediaPost(video.url);
                    
                    // Log the full TikHub API response
                    console.log(`📡 TikHub API Response for @${video.username}:`, {
                        success: result.success,
                        error: result.error,
                        data: result.data ? {
                            views: result.data.views,
                            likes: result.data.likes,
                            comments: result.data.comments,
                            shares: 'shares' in result.data ? result.data.shares : 'N/A',
                            // Don't log full data to avoid spam, just key metrics
                        } : null,
                        // Log the debug info if available (contains actual TikHub API response)
                        debugInfo: result.debugInfo ? {
                            tikHubUrl: result.debugInfo.tikHubUrl,
                            videoId: result.debugInfo.videoId,
                            apiResponse: result.debugInfo.apiResponse
                        } : null
                    });

                    if (result.success && result.data) {
                        const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
                        
                        console.log('🔍 EXTRACTING VALUES FROM MEDIA DATA:');
                        console.log('📊 Platform:', video.platform);
                        console.log('📊 Raw mediaData:', {
                            views: mediaData.views,
                            likes: mediaData.likes,
                            comments: mediaData.comments,
                            shares: 'shares' in mediaData ? mediaData.shares : 'N/A',
                            type: typeof mediaData.views
                        });
                        
                        // Get views based on platform
                        let views = 0;
                        let shares = 0;
                        
                        if (video.platform === 'instagram') {
                            const instaData = mediaData as InstagramPostData;
                            views = instaData.plays || instaData.views || 0;
                            shares = 0;
                            console.log('📊 Instagram extraction:', { plays: instaData.plays, views: instaData.views, finalViews: views });
                        } else if (video.platform === 'youtube') {
                            const youtubeData = mediaData as YouTubeVideoData;
                            views = youtubeData.views || 0;
                            shares = 0;
                            console.log('📊 YouTube extraction:', { views: youtubeData.views, finalViews: views });
                        } else {
                            const tiktokData = mediaData as TikTokVideoData;
                            views = tiktokData.views || 0;
                            shares = tiktokData.shares || 0;
                            console.log('📊 TikTok extraction:', { views: tiktokData.views, shares: tiktokData.shares, finalViews: views, finalShares: shares });
                        }

                        console.log('💾 SAVING TO DATABASE:');
                        console.log('📊 Video ID:', video.id);
                        console.log('📊 Username:', video.username);
                        console.log('📊 Platform:', video.platform);
                        console.log('📊 Views to save:', views, '(type:', typeof views, ')');
                        console.log('📊 Likes to save:', mediaData.likes, '(type:', typeof mediaData.likes, ')');
                        console.log('📊 Comments to save:', mediaData.comments, '(type:', typeof mediaData.comments, ')');
                        console.log('📊 Shares to save:', shares, '(type:', typeof shares, ')');
                        console.log('📊 Previous views:', video.currentViews);
                        console.log('📊 Daily growth:', video.lastDailyViews !== null ? Math.max(0, views - video.lastDailyViews) : null);

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
                        
                        console.log('✅ Database update completed for @' + video.username);

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
                        console.error(`❌ [${i + index + 1}] @${video.username} (${video.platform}) FAILED`);
                        console.error(`🔗 Failed URL: ${video.url}`);
                        console.error(`📡 TikHub Error: ${result.error}`);
                        console.error(`📊 Full TikHub Response:`, JSON.stringify(result, null, 2));
                        
                        // Log the actual TikHub API response if available
                        if (result.debugInfo && result.debugInfo.apiResponse) {
                            console.error(`🔍 ACTUAL TikHub API Response:`, JSON.stringify(result.debugInfo.apiResponse, null, 2));
                            console.error(`🌐 TikHub API URL used: ${result.debugInfo.tikHubUrl}`);
                            console.error(`🆔 Video ID extracted: ${result.debugInfo.videoId}`);
                        }
                        
                        // Check if this looks like a deleted/unavailable video based on actual TikHub API response
                        let isLikelyDeleted = false;
                        
                        // Check the actual TikHub API response first
                        if (result.debugInfo && result.debugInfo.apiResponse) {
                            const apiResponse = result.debugInfo.apiResponse;
                            
                            // Check TikHub API error codes that indicate deleted/private videos
                            if (apiResponse.code === 404 || 
                                apiResponse.code === 403 || 
                                apiResponse.msg?.includes('not found') ||
                                apiResponse.msg?.includes('private') ||
                                apiResponse.msg?.includes('deleted') ||
                                apiResponse.msg?.includes('unavailable')) {
                                isLikelyDeleted = true;
                                console.log(`🗑️ TikHub API indicates video is deleted/private: code=${apiResponse.code}, msg=${apiResponse.msg}`);
                            }
                        }
                        
                        // Fallback to generic error message check
                        if (!isLikelyDeleted && result.error && (
                            result.error.includes('deleted') ||
                            result.error.includes('private') ||
                            result.error.includes('not found') ||
                            result.error.includes('unavailable') ||
                            result.error.includes('No video data returned')
                        )) {
                            isLikelyDeleted = true;
                            console.log(`🗑️ Generic error message indicates video is deleted: ${result.error}`);
                        }
                        
                        if (isLikelyDeleted) {
                            console.log(`🗑️ Removing @${video.username} from database due to: ${result.error}`);
                            // Remove video completely from database
                            await prisma.video.delete({
                                where: { id: video.id }
                            });
                            console.log(`✅ Successfully removed @${video.username} from database`);
                        }
                        
                        return {
                            status: 'failed' as const,
                            username: video.username,
                            platform: video.platform,
                            error: result.error || 'Unknown error',
                            url: video.url,
                            removedFromDatabase: !!isLikelyDeleted
                        };
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`💥 [${i + index + 1}] @${video.username} (${video.platform}) CRASHED`);
                    console.error(`🔗 Crashed URL: ${video.url}`);
                    console.error(`💥 Error: ${errorMessage}`);
                    console.error(`📊 Full Error Object:`, error);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        platform: video.platform,
                        error: errorMessage,
                        url: video.url
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
        const removedCount = results.filter(r => r.status === 'failed' && 'removedFromDatabase' in r && r.removedFromDatabase).length;
        
        console.log(`🏁 ===== CLEARING COMPLETED =====`);
        console.log(`📊 Results: ${successful} successful, ${failed} failed, ${skipped} skipped`);
        console.log(`🗑️ Removed from database: ${removedCount} deleted videos`);
        console.log(`⏱️ Total duration: ${totalDuration}ms`);

        return { results, successful, failed, skipped, removedCount };

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
            message: `Cleared ${result.successful} videos successfully, removed ${result.removedCount} deleted videos`,
            status: {
                totalProcessed: result.successful + result.failed,
                successful: result.successful,
                failed: result.failed,
                skipped: result.skipped,
                removedCount: result.removedCount,
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
