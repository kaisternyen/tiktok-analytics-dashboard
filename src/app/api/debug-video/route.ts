import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeMediaPost, InstagramPostData, YouTubeVideoData, extractTikTokStatsFromTikHubData } from '@/lib/tikhub';

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

        console.log(`🔍 DEBUG: Analyzing video @${video.username} (${video.platform}) - ID: ${videoId}`);
        console.log(`🔍 Video URL: ${video.url}`);
        console.log(`🔍 Current stats: views=${video.currentViews}, likes=${video.currentLikes}, comments=${video.currentComments}, shares=${video.currentShares}`);
        console.log(`🔍 Last scraped: ${video.lastScrapedAt}`);
        console.log(`🔍 Tracking mode: ${video.trackingMode}`);

        // Test TikHub API call
        console.log(`🔍 Testing TikHub API call...`);
        const tikHubResult = await scrapeMediaPost(video.url);
        
        console.log(`🔍 TikHub API result:`, {
            success: tikHubResult.success,
            hasData: !!tikHubResult.data,
            error: tikHubResult.error,
            duration: tikHubResult.debugInfo?.duration
        });

        if (tikHubResult.data) {
            console.log(`🔍 TikHub raw data:`, JSON.stringify(tikHubResult.data, null, 2));
        }

        // Extract stats based on platform
        let views = 0, likes = 0, comments = 0, shares = 0;
        
        if (video.platform === 'tiktok' && tikHubResult.data) {
            // Use centralized TikHub data extraction
            const extractedData = extractTikTokStatsFromTikHubData(tikHubResult.data, video.url);
            views = extractedData.views;
            likes = extractedData.likes;
            comments = extractedData.comments;
            shares = extractedData.shares;
        } else if (video.platform === 'instagram' && tikHubResult.data) {
            const instaData = tikHubResult.data as InstagramPostData;
            views = instaData.plays || instaData.views || 0;
            likes = instaData.likes || 0;
            comments = instaData.comments || 0;
            shares = 0; // Instagram doesn't track shares
        } else if (video.platform === 'youtube' && tikHubResult.data) {
            const youtubeData = tikHubResult.data as YouTubeVideoData;
            views = youtubeData.views || 0;
            likes = youtubeData.likes || 0;
            comments = youtubeData.comments || 0;
            shares = 0; // YouTube doesn't track shares
        }

        console.log(`🔍 Extracted values: views=${views}, likes=${likes}, comments=${comments}, shares=${shares}`);

        return NextResponse.json({
            success: true,
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
                },
                lastScrapedAt: video.lastScrapedAt,
                trackingMode: video.trackingMode,
                isActive: video.isActive
            },
            tikHubResult: {
                success: tikHubResult.success,
                hasData: !!tikHubResult.data,
                error: tikHubResult.error,
                duration: tikHubResult.debugInfo?.duration,
                rawData: tikHubResult.data
            },
            extractedValues: { views, likes, comments, shares },
            analysis: {
                hasZeroStats: video.currentViews === 0 && video.currentLikes === 0 && video.currentComments === 0 && video.currentShares === 0,
                tikHubWorking: tikHubResult.success,
                tikHubHasData: !!tikHubResult.data,
                extractedValuesValid: views >= 0 && likes >= 0 && comments >= 0 && shares >= 0
            }
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 Error in debug-video API:', error);
        return NextResponse.json({ 
            success: false, 
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
