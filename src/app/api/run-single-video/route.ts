import { NextResponse } from 'next/server';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { sanitizeMetrics, logSanitizationWarnings } from '@/lib/metrics-validation';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { videoId } = await req.json();

        if (!videoId) {
            return NextResponse.json({ success: false, error: 'Video ID is required' }, { status: 400 });
        }

        // Get video details
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: {
                id: true,
                url: true,
                username: true,
                platform: true,
                scrapingCadence: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                lastScrapedAt: true,
                isActive: true,
                trackingMode: true
            }
        });

        if (!video) {
            return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
        }

        // Remove isActive check - all videos should be scrapable
        if (video.trackingMode === 'deleted') {
            return NextResponse.json({ 
                success: false, 
                error: 'Video is marked as deleted/unavailable',
                video: {
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    trackingMode: video.trackingMode
                }
            }, { status: 400 });
        }

        console.log(`🎯 Running single video scrape for @${video.username} (${video.platform}) - ID: ${videoId}`);
        console.log(`🎯 Video trackingMode: ${video.trackingMode}`);
        console.log(`🔑 TikHub API Key Check:`, {
            hasApiKey: !!process.env.TIKHUB_API_KEY,
            apiKeyLength: process.env.TIKHUB_API_KEY?.length,
            apiKeyStart: process.env.TIKHUB_API_KEY?.substring(0, 10) + '...'
        });

        // Call TikHub API
        console.log(`🎯 Calling TikHub API for URL: ${video.url}`);
        const tikHubResult = await scrapeMediaPost(video.url);
        
        console.log(`🎯 TikHub API result:`, {
            success: tikHubResult.success,
            hasData: !!tikHubResult.data,
            error: tikHubResult.error,
            duration: tikHubResult.debugInfo?.duration
        });
        
        console.log(`🔍 FULL TikHub Result:`, JSON.stringify(tikHubResult, null, 2));
        console.log(`🔍 TikHub Result Keys:`, Object.keys(tikHubResult));
        console.log(`🔍 TikHub Result Type:`, typeof tikHubResult);
        console.log(`🔍 TikHub Result Success:`, tikHubResult.success);
        console.log(`🔍 TikHub Result Data:`, tikHubResult.data);
        console.log(`🔍 TikHub Result DebugInfo:`, tikHubResult.debugInfo);
        console.log(`🔍 TikHub Result Error:`, tikHubResult.error);

        if (!tikHubResult.success) {
            console.error(`❌ TikHub API failed for @${video.username}:`, tikHubResult.error);
            return NextResponse.json({
                success: false,
                error: 'TikHub API failed',
                details: tikHubResult.error,
                video: {
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    url: video.url,
                    currentStats: {
                        views: video.currentViews,
                        likes: video.currentLikes,
                        comments: video.currentComments,
                        shares: video.currentShares
                    }
                }
            });
        }

        // Extract stats based on platform
        let views = 0, likes = 0, comments = 0, shares = 0;
        
        console.log(`🔍 TikHub data for @${video.username}:`, JSON.stringify(tikHubResult.data, null, 2));
        console.log(`🔍 TikHub data structure analysis:`);
        console.log(`  - Has statistics?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.statistics);
        console.log(`  - Has stats?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.stats);
        console.log(`  - Has play_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.play_count);
        console.log(`  - Has view_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.view_count);
        console.log(`  - Has digg_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.digg_count);
        console.log(`  - Has like_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.like_count);
        console.log(`  - Has comment_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.comment_count);
        console.log(`  - Has share_count?:`, !!(tikHubResult.data as unknown as Record<string, unknown>)?.share_count);
        console.log(`  - All keys:`, Object.keys((tikHubResult.data as unknown as Record<string, unknown>) || {}));
        
        if (video.platform === 'tiktok' && tikHubResult.data) {
            // Data is already perfectly extracted in tikHubResult.data
            const tikTokData = tikHubResult.data as unknown as Record<string, unknown>;
            views = tikTokData.views as number || 0;
            likes = tikTokData.likes as number || 0;
            comments = tikTokData.comments as number || 0;
            shares = tikTokData.shares as number || 0;
            
            console.log(`📊 Using direct data for @${video.username}:`, { views, likes, comments, shares });
        } else if (video.platform === 'instagram' && tikHubResult.data) {
            const instagramData = tikHubResult.data as unknown as Record<string, unknown>;
            
            console.log(`📸 INSTAGRAM DEBUG for @${video.username}:`);
            console.log(`📸 Instagram data keys:`, Object.keys(instagramData));
            console.log(`📸 Instagram data:`, JSON.stringify(instagramData, null, 2));
            console.log(`📸 Instagram view_count:`, instagramData.view_count);
            console.log(`📸 Instagram views:`, instagramData.views);
            console.log(`📸 Instagram likes:`, instagramData.likes);
            console.log(`📸 Instagram comments:`, instagramData.comments);
            console.log(`📸 Instagram play_count:`, instagramData.play_count);
            console.log(`📸 Instagram statistics:`, instagramData.statistics);
            
            views = instagramData.view_count as number || 
                   instagramData.views as number || 
                   instagramData.play_count as number || 0;
            likes = instagramData.likes as number || 0;
            comments = instagramData.comments as number || 0;
            shares = 0; // Instagram doesn't have shares
            
            console.log(`📸 Instagram extracted values:`, { views, likes, comments, shares });
        } else if (video.platform === 'youtube' && tikHubResult.data) {
            const youtubeData = tikHubResult.data as unknown as Record<string, unknown>;
            views = (youtubeData.statistics as Record<string, unknown>)?.viewCount as number || youtubeData.viewCount as number || 0;
            likes = (youtubeData.statistics as Record<string, unknown>)?.likeCount as number || youtubeData.likeCount as number || 0;
            comments = (youtubeData.statistics as Record<string, unknown>)?.commentCount as number || youtubeData.commentCount as number || 0;
            shares = 0; // YouTube doesn't track shares
        }

        console.log(`📈 Raw extracted values for @${video.username}: views=${views}, likes=${likes}, comments=${comments}, shares=${shares}`);
        
        // Sanitize metrics to prevent negative values and corruption
        const sanitizedMetrics = sanitizeMetrics(
            { views, likes, comments, shares },
            { 
                views: video.currentViews, 
                likes: video.currentLikes, 
                comments: video.currentComments, 
                shares: video.currentShares 
            }
        );
        
        console.log(`🧹 Sanitized metrics for @${video.username}:`, sanitizedMetrics);
        
        // Log any sanitization warnings
        logSanitizationWarnings(video.username, sanitizedMetrics.warnings);

        // Update database with sanitized metrics
        const updatedVideo = await prisma.video.update({
            where: { id: videoId },
            data: {
                currentViews: sanitizedMetrics.views,
                currentLikes: sanitizedMetrics.likes,
                currentComments: sanitizedMetrics.comments,
                currentShares: sanitizedMetrics.shares,
                lastScrapedAt: new Date()
            },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                lastScrapedAt: true
            }
        });

        // Create metrics history entry with sanitized values
        await prisma.metricsHistory.create({
            data: {
                videoId: videoId,
                views: sanitizedMetrics.views,
                likes: sanitizedMetrics.likes,
                comments: sanitizedMetrics.comments,
                shares: sanitizedMetrics.shares,
                timestamp: new Date()
            }
        });

        console.log(`✅ Successfully updated @${video.username} - Views: ${sanitizedMetrics.views}, Likes: ${sanitizedMetrics.likes}, Comments: ${sanitizedMetrics.comments}, Shares: ${sanitizedMetrics.shares}`);

        return NextResponse.json({
            success: true,
            message: `Successfully scraped @${video.username}`,
            video: {
                id: updatedVideo.id,
                username: updatedVideo.username,
                platform: updatedVideo.platform,
                url: updatedVideo.url,
                previousStats: {
                    views: video.currentViews,
                    likes: video.currentLikes,
                    comments: video.currentComments,
                    shares: video.currentShares
                },
                newStats: {
                    views: updatedVideo.currentViews,
                    likes: updatedVideo.currentLikes,
                    comments: updatedVideo.currentComments,
                    shares: updatedVideo.currentShares
                },
                lastScrapedAt: updatedVideo.lastScrapedAt
            },
            tikHubResult: {
                success: tikHubResult.success,
                hasData: !!tikHubResult.data,
                duration: tikHubResult.debugInfo?.duration,
                extractedValues: { views, likes, comments, shares },
                // Add debugging info to frontend
                debugInfo: {
                    tikHubRawResponse: tikHubResult.debugInfo?.tikHubRawResponse,
                    rawData: tikHubResult.debugInfo?.rawData,
                    apiKeyCheck: {
                        hasApiKey: !!process.env.TIKHUB_API_KEY,
                        apiKeyLength: process.env.TIKHUB_API_KEY?.length,
                        apiKeyStart: process.env.TIKHUB_API_KEY?.substring(0, 10) + '...'
                    },
                    tikHubResultKeys: Object.keys(tikHubResult),
                    tikHubResultType: typeof tikHubResult,
                    tikHubResultSuccess: tikHubResult.success,
                    tikHubResultData: tikHubResult.data,
                    tikHubResultDebugInfo: tikHubResult.debugInfo,
                    tikHubResultError: tikHubResult.error
                }
            },
            warnings: sanitizedMetrics.warnings.length > 0 ? sanitizedMetrics.warnings : undefined
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 Error in run-single-video API:', error);
        return NextResponse.json({ 
            success: false, 
            error: errorMessage 
        }, { status: 500 });
    }
}
