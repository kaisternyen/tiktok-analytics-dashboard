import { NextResponse } from 'next/server';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import type { TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { videoId } = await req.json();

        if (!videoId) {
            return NextResponse.json({ success: false, error: 'Video ID is required' }, { status: 400 });
        }

        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: { 
                id: true, 
                url: true, 
                username: true, 
                platform: true, 
                currentViews: true, 
                currentLikes: true, 
                currentComments: true, 
                currentShares: true 
            }
        });

        if (!video) {
            return NextResponse.json({ success: false, error: 'Video not found in database' }, { status: 404 });
        }

        console.log(`🔄 REFRESHING SINGLE VIDEO: @${video.username} (${video.platform})`);
        console.log(`📊 Current Database Values:`, {
            views: video.currentViews,
            likes: video.currentLikes,
            comments: video.currentComments,
            shares: video.currentShares
        });

        const tikHubResult = await scrapeMediaPost(video.url);

        console.log(`🔍 COMPLETE TIKHUB API RESPONSE FOR @${video.username}:`);
        console.log(`📊 Success:`, tikHubResult.success);
        console.log(`📊 Error:`, tikHubResult.error);
        console.log(`📊 Has Data:`, !!tikHubResult.data);
        console.log(`📊 Debug Info:`, tikHubResult.debugInfo);
        
        if (tikHubResult.success && tikHubResult.data) {
            console.log(`📊 All Available Fields:`, Object.keys(tikHubResult.data));
            console.log(`📊 Raw TikHub Response:`, JSON.stringify(tikHubResult.data, null, 2));
            
            // Extract values using the same logic as scrape-all
            const mediaData = tikHubResult.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
            let views = 0;
            let shares = 0;

            if (video.platform === 'tiktok') {
                const tikTokData = mediaData as TikTokVideoData;
                views = tikTokData.views || 0;
                shares = tikTokData.shares || 0;
            } else if (video.platform === 'instagram') {
                const instagramData = mediaData as InstagramPostData;
                views = instagramData.views || instagramData.plays || 0;
                shares = 0; // Instagram doesn't provide share count
            } else if (video.platform === 'youtube') {
                const youtubeData = mediaData as YouTubeVideoData;
                views = youtubeData.views || 0;
                shares = youtubeData.shares || 0;
            }

            const extractedValues = {
                views: views,
                likes: mediaData.likes || 0,
                comments: mediaData.comments || 0,
                shares: shares
            };

            console.log(`📊 EXTRACTED VALUES FOR @${video.username}:`, extractedValues);
            console.log(`📊 COMPARISON - TikHub vs Database:`, {
                tikHub: extractedValues,
                database: {
                    views: video.currentViews,
                    likes: video.currentLikes,
                    comments: video.currentComments,
                    shares: video.currentShares
                }
            });

            // Update database with new values
            const updatedVideo = await prisma.video.update({
                where: { id: videoId },
                data: {
                    currentViews: views,
                    currentLikes: mediaData.likes || 0,
                    currentComments: mediaData.comments || 0,
                    currentShares: shares,
                    lastScrapedAt: new Date(),
                }
            });

            console.log(`✅ DATABASE UPDATED FOR @${video.username}:`, {
                views: updatedVideo.currentViews,
                likes: updatedVideo.currentLikes,
                comments: updatedVideo.currentComments,
                shares: updatedVideo.currentShares
            });

            return NextResponse.json({
                success: true,
                video: {
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    url: video.url,
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
                    }
                },
                tikHubResult: {
                    success: tikHubResult.success,
                    hasData: !!tikHubResult.data,
                    error: tikHubResult.error,
                    duration: tikHubResult.debugInfo?.duration,
                    rawData: tikHubResult.debugInfo?.rawData,
                    debugInfo: tikHubResult.debugInfo,
                    extractedValues: extractedValues
                }
            });
        } else {
            console.log(`❌ TIKHUB API FAILED FOR @${video.username}:`, tikHubResult.error);
            return NextResponse.json({
                success: false,
                error: tikHubResult.error || 'TikHub API call failed',
                tikHubResult: {
                    success: tikHubResult.success,
                    error: tikHubResult.error,
                    debugInfo: tikHubResult.debugInfo
                }
            });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 Error in refresh-video API:', error);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
