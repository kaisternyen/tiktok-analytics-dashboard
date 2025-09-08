import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Debug endpoint to understand why jobs are pending
export async function GET() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 65 * 60 * 1000); // 65 minutes ago
    const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

    try {
        // Get sample of overdue videos
        const overdueHourlyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'hourly',
                lastScrapedAt: { lt: oneHourAgo }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                isActive: true
            },
            orderBy: { lastScrapedAt: 'asc' },
            take: 10
        });

        const overdueDailyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'daily',
                lastScrapedAt: { lt: oneDayAgo }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                isActive: true
            },
            orderBy: { lastScrapedAt: 'asc' },
            take: 10
        });

        const overdueAccounts = await prisma.trackedAccount.findMany({
            where: {
                isActive: true,
                lastChecked: { lt: oneHourAgo }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                lastChecked: true,
                isActive: true
            },
            orderBy: { lastChecked: 'asc' },
            take: 5
        });

        // Check what the scrape-all query would actually return
        const scrapeAllQuery = await prisma.video.findMany({
            where: { 
                isActive: true,
                OR: [
                    { trackingMode: null },
                    { trackingMode: { not: 'deleted' } }
                ]
            },
            select: {
                id: true,
                username: true,
                platform: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true
            },
            take: 5
        });

        // Check tracking modes distribution
        const trackingModeStats = await prisma.video.groupBy({
            by: ['trackingMode'],
            where: { isActive: true },
            _count: { trackingMode: true }
        });

        // Check if there are any videos at all
        const totalVideos = await prisma.video.count({ where: { isActive: true } });
        const totalAccounts = await prisma.trackedAccount.count({ where: { isActive: true } });

        return NextResponse.json({
            timestamp: now.toISOString(),
            summary: {
                totalVideos,
                totalAccounts,
                overdueHourly: overdueHourlyVideos.length,
                overdueDaily: overdueDailyVideos.length,
                overdueAccounts: overdueAccounts.length
            },
            samples: {
                overdueHourlyVideos: overdueHourlyVideos.map(v => ({
                    username: v.username,
                    platform: v.platform,
                    lastScrapedAt: v.lastScrapedAt,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    trackingMode: v.trackingMode,
                    url: v.url.substring(0, 50) + '...'
                })),
                overdueDailyVideos: overdueDailyVideos.map(v => ({
                    username: v.username,
                    platform: v.platform,
                    lastScrapedAt: v.lastScrapedAt,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    trackingMode: v.trackingMode,
                    url: v.url.substring(0, 50) + '...'
                })),
                overdueAccounts: overdueAccounts.map(a => ({
                    username: a.username,
                    platform: a.platform,
                    lastChecked: a.lastChecked,
                    minutesAgo: Math.floor((now.getTime() - new Date(a.lastChecked).getTime()) / (1000 * 60))
                }))
            },
            diagnostics: {
                scrapeAllQuerySample: scrapeAllQuery,
                trackingModeStats
            }
        });

    } catch (error) {
        console.error('Debug pending error:', error);
        return NextResponse.json({
            error: 'Failed to debug pending jobs',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
