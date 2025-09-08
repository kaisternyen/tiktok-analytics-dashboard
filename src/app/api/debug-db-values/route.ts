import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('🔍 Checking database values for @antoine.lockedin...');
        
        const videos = await prisma.video.findMany({
            where: {
                username: 'antoine.lockedin'
            },
            select: {
                id: true,
                username: true,
                url: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                lastScrapedAt: true
            }
        });
        
        console.log(`📊 Found ${videos.length} videos for @antoine.lockedin:`);
        videos.forEach((video, index) => {
            console.log(`Video ${index + 1}:`, {
                id: video.id,
                url: video.url,
                currentViews: video.currentViews,
                currentLikes: video.currentLikes,
                currentComments: video.currentComments,
                currentShares: video.currentShares,
                lastScrapedAt: video.lastScrapedAt
            });
        });
        
        return NextResponse.json({
            success: true,
            count: videos.length,
            videos: videos
        });
        
    } catch (error) {
        console.error('❌ Error checking database:', error);
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}
