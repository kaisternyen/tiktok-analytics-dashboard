import { NextResponse } from 'next/server';
import { scrapeMediaPost, extractTikTokStatsFromTikHubData } from '@/lib/tikhub';
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

        // Check if video is active and not deleted
        if (!video.isActive) {
            return NextResponse.json({ 
                success: false, 
                error: 'Video is inactive',
                video: {
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    isActive: video.isActive,
                    trackingMode: video.trackingMode
                }
            }, { status: 400 });
        }

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
        console.log(`🎯 Video status: isActive=${video.isActive}, trackingMode=${video.trackingMode}`);

        // Call TikHub API
        console.log(`🎯 Calling TikHub API for URL: ${video.url}`);
        const tikHubResult = await scrapeMediaPost(video.url);
        
        console.log(`🎯 TikHub API result:`, {
            success: tikHubResult.success,
            hasData: !!tikHubResult.data,
            error: tikHubResult.error,
            duration: tikHubResult.debugInfo?.duration
        });

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
        
        if (video.platform === 'tiktok' && tikHubResult.data) {
            // Use centralized TikHub data extraction
            const extractedData = extractTikTokStatsFromTikHubData(tikHubResult.data, video.url);
            console.log(`📊 Extracted data for @${video.username}:`, extractedData);
            views = extractedData.views;
            likes = extractedData.likes;
            comments = extractedData.comments;
            shares = extractedData.shares;
        } else if (video.platform === 'instagram' && tikHubResult.data) {
            const instagramData = tikHubResult.data as unknown as Record<string, unknown>;
            views = instagramData.view_count as number || 0;
            likes = instagramData.likes as number || 0;
            comments = instagramData.comments as number || 0;
            shares = 0; // Instagram doesn't have shares
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
                extractedValues: { views, likes, comments, shares }
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
