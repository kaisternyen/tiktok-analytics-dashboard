import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
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
    error?: string;
    reason?: string;
}

interface ProcessingResult {
    results: VideoResult[];
    successful: number;
    failed: number;
    skipped: number;
}

// CLEAR ALL PENDING VIDEOS - Force scrape everything regardless of timing
async function clearAllPendingVideos(): Promise<ProcessingResult> {
    const startTime = Date.now();
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    const skipped = 0;

    console.log(`🚀 ===== CLEARING ALL PENDING VIDEOS =====`);

    try {
        // Get ALL active videos - ignore timing completely
        const videos = await prisma.video.findMany({
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

        console.log(`📊 Found ${videos.length} active videos to process`);

        if (videos.length === 0) {
            console.log('❌ No videos found to process');
            return { results, successful, failed, skipped };
        }

        // Process in batches for better performance
        const batchSize = 10;
        console.log(`🚀 Processing ${videos.length} videos in batches of ${batchSize}`);

        for (let i = 0; i < videos.length; i += batchSize) {
            const batch = videos.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(videos.length / batchSize);
            
            console.log(`📦 Processing batch ${batchNum}/${totalBatches}: ${batch.map(v => `@${v.username}`).join(', ')}`);

            const batchPromises = batch.map(async (video, index) => {
                try {
                    console.log(`🎬 [${i + index + 1}/${videos.length}] Processing @${video.username} (${video.platform})...`);

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
        const result = await clearAllPendingVideos();
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
