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
                lastScrapedAt: true
            }
        });

        if (!video) {
            return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
        }

        console.log(`🎯 Running single video scrape for @${video.username} (${video.platform}) - ID: ${videoId}`);

        // Call TikHub API
        const tikHubResult = await scrapeMediaPost(video.url);

        if (!tikHubResult.success) {
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
        
        if (video.platform === 'tiktok' && tikHubResult.data) {
            const tikTokData = tikHubResult.data as unknown as Record<string, unknown>;
            views = (tikTokData.statistics as Record<string, unknown>)?.play_count as number || tikTokData.play_count as number || 0;
            likes = (tikTokData.statistics as Record<string, unknown>)?.digg_count as number || tikTokData.digg_count as number || 0;
            comments = (tikTokData.statistics as Record<string, unknown>)?.comment_count as number || tikTokData.comment_count as number || 0;
            shares = (tikTokData.statistics as Record<string, unknown>)?.share_count as number || tikTokData.share_count as number || 0;
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
