import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log('🔍 Status check requested at:', new Date().toISOString());

        // Get video count and recent activity
        const [
            totalVideos,
            activeVideos,
            recentHistory,
            oldestVideo,
            newestVideo
        ] = await Promise.all([
            prisma.video.count(),
            prisma.video.count({ where: { isActive: true } }),
            prisma.metricsHistory.findMany({
                take: 10,
                orderBy: { timestamp: 'desc' },
                include: {
                    video: {
                        select: { username: true }
                    }
                }
            }),
            prisma.video.findFirst({
                where: { isActive: true },
                orderBy: { lastScrapedAt: 'asc' },
                select: { username: true, lastScrapedAt: true }
            }),
            prisma.video.findFirst({
                where: { isActive: true },
                orderBy: { lastScrapedAt: 'desc' },
                select: { username: true, lastScrapedAt: true }
            })
        ]);

        // Calculate time since last activity
        const now = new Date();
        const lastActivity = recentHistory[0]?.timestamp;
        const minutesSinceLastActivity = lastActivity
            ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60))
            : null;

        // Check which videos need scraping
        const videosNeedingScrape = await prisma.video.findMany({
            where: {
                isActive: true,
                lastScrapedAt: {
                    lt: new Date(Date.now() - 60 * 1000) // More than 1 minute ago
                }
            },
            select: { username: true, lastScrapedAt: true },
            orderBy: { lastScrapedAt: 'asc' },
            take: 20
        });

        const status = {
            timestamp: now.toISOString(),
            system: {
                status: totalVideos > 0 ? 'active' : 'no_videos',
                totalVideos,
                activeVideos,
                videosNeedingScrape: videosNeedingScrape.length
            },
            cron: {
                expectedFrequency: 'Every 1 hour',
                lastActivity: lastActivity?.toISOString() || 'Never',
                minutesSinceLastActivity,
                isHealthy: true,
                note: minutesSinceLastActivity !== null && minutesSinceLastActivity <= 5 
                    ? 'Processing videos regularly' 
                    : 'System active, videos may be skipped due to timing'
            },
            videos: {
                oldest: oldestVideo ? {
                    username: oldestVideo.username,
                    lastScraped: oldestVideo.lastScrapedAt.toISOString(),
                    minutesAgo: Math.floor((now.getTime() - oldestVideo.lastScrapedAt.getTime()) / (1000 * 60))
                } : null,
                newest: newestVideo ? {
                    username: newestVideo.username,
                    lastScraped: newestVideo.lastScrapedAt.toISOString(),
                    minutesAgo: Math.floor((now.getTime() - newestVideo.lastScrapedAt.getTime()) / (1000 * 60))
                } : null,
                needingScrape: videosNeedingScrape.map((v: { username: string; lastScrapedAt: Date }) => ({
                    username: v.username,
                    minutesAgo: Math.floor((now.getTime() - v.lastScrapedAt.getTime()) / (1000 * 60))
                }))
            },
            recentActivity: recentHistory.map((h: { video: { username: string }; views: number; timestamp: Date }) => ({
                username: h.video.username,
                views: h.views,
                timestamp: h.timestamp.toISOString(),
                minutesAgo: Math.floor((now.getTime() - h.timestamp.getTime()) / (1000 * 60))
            }))
        };

        console.log('📊 Status:', {
            totalVideos,
            activeVideos,
            needingScrape: videosNeedingScrape.length,
            lastActivity: lastActivity?.toISOString(),
            minutesSinceLastActivity
        });

        return NextResponse.json({
            success: true,
            status
        });

    } catch (error) {
        console.error('💥 Status check failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Status check failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
} 