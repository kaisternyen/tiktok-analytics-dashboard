import { NextResponse } from 'next/server';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { videoId } = await req.json();
        
        if (!videoId) {
            return NextResponse.json({ 
                success: false, 
                error: 'Video ID is required' 
            }, { status: 400 });
        }

        console.log(`🧪 TESTING SINGLE VIDEO: ${videoId}`);

        // Get video from database
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
                currentShares: true,
                lastScrapedAt: true
            }
        });

        if (!video) {
            return NextResponse.json({ 
                success: false, 
                error: 'Video not found' 
            }, { status: 404 });
        }

        console.log(`📊 Video details:`, {
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
        });

        // Test TikHub API call
        console.log(`🚀 CALLING TIKHUB API FOR @${video.username}...`);
        const startTime = Date.now();
        
        const result = await scrapeMediaPost(video.url);
        
        const duration = Date.now() - startTime;
        console.log(`⏱️ TikHub API call completed in ${duration}ms`);

        // Return detailed results
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
                }
            },
            tikHubResult: {
                success: result.success,
                hasData: !!result.data,
                error: result.error,
                duration: duration,
                rawData: result.data,
                debugInfo: result.debugInfo
            }
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 TEST SINGLE VIDEO ERROR:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage
        }, { status: 500 });
    }
}
