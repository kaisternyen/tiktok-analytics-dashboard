import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Get basic stats
        const totalVideos = await prisma.video.count();
        const activeVideos = await prisma.video.count({
            where: { isActive: true }
        });

        // Get recent activity
        const recentUpdates = await prisma.video.findMany({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'desc' },
            take: 5,
            select: {
                username: true,
                lastScrapedAt: true,
                currentViews: true,
                currentLikes: true
            }
        });

        // Get total metrics count
        const totalMetricsHistory = await prisma.metricsHistory.count();

        // Get earliest and latest scrapes
        const oldestScrape = await prisma.metricsHistory.findFirst({
            orderBy: { timestamp: 'asc' },
            select: { timestamp: true }
        });

        const latestScrape = await prisma.metricsHistory.findFirst({
            orderBy: { timestamp: 'desc' },
            select: { timestamp: true }
        });

        return NextResponse.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                totalVideos,
                activeVideos,
                totalMetricsHistory,
                tracking_period: {
                    start: oldestScrape?.timestamp,
                    latest: latestScrape?.timestamp
                }
            },
            recent_activity: recentUpdates.map(video => ({
                username: video.username,
                lastScrapedAt: video.lastScrapedAt,
                views: video.currentViews,
                likes: video.currentLikes
            })),
            automation: {
                scrape_all_endpoint: '/api/scrape-all',
                github_actions: 'Runs every hour',
                next_estimated_run: 'Top of next hour'
            }
        });

    } catch (error) {
        return NextResponse.json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
} 