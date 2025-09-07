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

        // Check for overdue items
        const oneHourAgo = new Date(now.getTime() - 65 * 60 * 1000); // 65 minutes ago
        const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

        const [overdueHourlyVideos, overdueDailyVideos, overdueAccounts] = await Promise.all([
            prisma.video.count({
                where: {
                    isActive: true,
                    scrapingCadence: 'hourly',
                    lastScrapedAt: { lt: oneHourAgo }
                }
            }),
            prisma.video.count({
                where: {
                    isActive: true,
                    scrapingCadence: 'daily',
                    lastScrapedAt: { lt: oneDayAgo }
                }
            }),
            prisma.trackedAccount.count({
                where: {
                    isActive: true,
                    lastChecked: { lt: oneHourAgo }
                }
            })
        ]);

        // Get oldest unprocessed item
        const oldestVideo = await prisma.video.findFirst({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' },
            select: { username: true, platform: true, lastScrapedAt: true, scrapingCadence: true }
        });

        const response = {
            system: systemInfo,
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
            } : null
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
