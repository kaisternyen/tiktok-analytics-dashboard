import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';


// Simple cron job status endpoint - only essential info
export async function GET() {
    const now = new Date();

    try {
        // Basic system info
        const systemInfo = {
            timestamp: now.toISOString(),
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        };

        // Database health check
        let dbStatus = 'connected';
        let dbLatency = 0;
        try {
            const dbStart = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            dbLatency = Date.now() - dbStart;
        } catch (error) {
            dbStatus = 'error';
            console.error('DB Error:', error);
        }

        // Get basic counts
        const [totalVideos, totalAccounts, hourlyVideos, dailyVideos] = await Promise.all([
            prisma.video.count({ where: { isActive: true } }),
            prisma.trackedAccount.count({ where: { isActive: true } }),
            prisma.video.count({ where: { isActive: true, scrapingCadence: 'hourly' } }),
            prisma.video.count({ where: { isActive: true, scrapingCadence: 'daily' } })
        ]);

        // Check for overdue items (matching actual scraping logic from get-pending-videos)
        const hourlyThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago (0.5 hours)
        const dailyThreshold = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

        const [overdueHourlyVideos, overdueDailyVideos, overdueAccounts] = await Promise.all([
            prisma.video.count({
                where: {
                    isActive: true,
                    scrapingCadence: 'hourly',
                    lastScrapedAt: { lt: hourlyThreshold }
                }
            }),
            prisma.video.count({
                where: {
                    isActive: true,
                    scrapingCadence: 'daily',
                    lastScrapedAt: { lt: dailyThreshold }
                }
            }),
            prisma.trackedAccount.count({
                where: {
                    isActive: true,
                    lastChecked: { lt: hourlyThreshold }
                }
            })
        ]);

        // Get oldest unprocessed item
        const oldestVideo = await prisma.video.findFirst({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' },
            select: { username: true, platform: true, lastScrapedAt: true, scrapingCadence: true }
        });

        // Get detailed list of pending videos
        const pendingHourlyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'hourly',
                lastScrapedAt: { lt: hourlyThreshold }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true
            },
            orderBy: { lastScrapedAt: 'asc' },
            take: 50
        });

        const pendingDailyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'daily',
                lastScrapedAt: { lt: dailyThreshold }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true
            },
            orderBy: { lastScrapedAt: 'asc' },
            take: 50
        });

        const pendingAccounts = await prisma.trackedAccount.findMany({
            where: {
                isActive: true,
                lastChecked: { lt: hourlyThreshold }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                lastChecked: true
            },
            orderBy: { lastChecked: 'asc' },
            take: 20
        });

        const response = {
            system: {
                ...systemInfo,
                videosNeedingScrape: overdueHourlyVideos + overdueDailyVideos + overdueAccounts
            },
            database: { status: dbStatus, latency: `${dbLatency}ms` },
            statistics: { totalVideos, totalAccounts, hourlyVideos, dailyVideos },
            issues: {
                overdueHourlyVideos,
                overdueDailyVideos,
                overdueAccounts,
                totalOverdue: overdueHourlyVideos + overdueDailyVideos + overdueAccounts
            },
            oldestPending: oldestVideo ? {
                ...oldestVideo,
                minutesAgo: Math.floor((now.getTime() - new Date(oldestVideo.lastScrapedAt).getTime()) / (1000 * 60))
            } : null,
            pendingVideos: {
                hourly: pendingHourlyVideos.map(v => ({
                    ...v,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    reason: 'Pending',
                    currentStats: {
                        views: v.currentViews,
                        likes: v.currentLikes,
                        comments: v.currentComments,
                        shares: v.currentShares
                    }
                })),
                daily: pendingDailyVideos.map(v => ({
                    ...v,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    reason: 'Pending',
                    currentStats: {
                        views: v.currentViews,
                        likes: v.currentLikes,
                        comments: v.currentComments,
                        shares: v.currentShares
                    }
                }))
            },
            pendingAccounts: pendingAccounts.map(a => ({
                ...a,
                minutesAgo: Math.floor((now.getTime() - new Date(a.lastChecked).getTime()) / (1000 * 60)),
                reason: 'Pending'
            }))
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('❌ Cron status failed:', error);
        return NextResponse.json({
            error: 'Failed to get status',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
