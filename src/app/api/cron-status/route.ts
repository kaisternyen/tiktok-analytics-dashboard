import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Simple backup check logic - just check if videos are overdue by basic time thresholds
function isVideoPending(video: { trackingMode: string | null; scrapingCadence: string; lastScrapedAt: Date }): { isPending: boolean; reason?: string } {
    // Skip deleted videos entirely
    if (video.trackingMode === 'deleted') {
        return { isPending: false, reason: 'Video marked as deleted/unavailable' };
    }
    
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
    const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
    
    // For testing mode - always pending for debugging
    if (video.scrapingCadence === 'testing') {
        return { isPending: true, reason: 'Testing mode - always pending for debugging' };
    }
    
    // Daily videos: pending if not scraped in over 24 hours
    if (video.scrapingCadence === 'daily') {
        if (hoursSinceLastScrape > 24) {
            return { isPending: true, reason: `Daily video overdue - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else {
            return { isPending: false, reason: `Daily video up to date - scraped ${Math.floor(hoursSinceLastScrape)}h ago` };
        }
    }
    
    // Hourly videos: pending if not scraped in over 1 hour
    if (video.scrapingCadence === 'hourly') {
        if (hoursSinceLastScrape > 1) {
            return { isPending: true, reason: `Hourly video overdue - ${Math.floor(minutesSinceLastScrape)}min since last scrape` };
        } else {
            return { isPending: false, reason: `Hourly video up to date - scraped ${Math.floor(minutesSinceLastScrape)}min ago` };
        }
    }
    
    // Handle unknown/null cadence - treat as daily
    if (hoursSinceLastScrape > 24) {
        return { isPending: true, reason: `Unknown cadence (treated as daily) - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
    } else {
        return { isPending: false, reason: `Unknown cadence (treated as daily) - scraped ${Math.floor(hoursSinceLastScrape)}h ago` };
    }
}

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

        // Get all active videos to check with proper logic
        const allVideos = await prisma.video.findMany({
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
                url: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true
            }
        });

        // Use simple time thresholds to identify pending videos
        const pendingHourlyVideos = allVideos.filter(video => 
            video.scrapingCadence === 'hourly' && isVideoPending(video).isPending
        );
        const pendingDailyVideos = allVideos.filter(video => 
            video.scrapingCadence === 'daily' && isVideoPending(video).isPending
        );

        const overdueHourlyVideos = pendingHourlyVideos.length;
        const overdueDailyVideos = pendingDailyVideos.length;

        // Check accounts (keep simple threshold for accounts)
        const hourlyThreshold = new Date(now.getTime() - 65 * 60 * 1000);
        const overdueAccounts = await prisma.trackedAccount.count({
            where: {
                isActive: true,
                lastChecked: { lt: hourlyThreshold }
            }
        });

        // Get oldest unprocessed item
        const oldestVideo = await prisma.video.findFirst({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' },
            select: { username: true, platform: true, lastScrapedAt: true, scrapingCadence: true }
        });

        // Use the already filtered pending videos (limit to 50 each)
        const limitedPendingHourlyVideos = pendingHourlyVideos
            .sort((a, b) => new Date(a.lastScrapedAt).getTime() - new Date(b.lastScrapedAt).getTime())
            .slice(0, 50);
        
        const limitedPendingDailyVideos = pendingDailyVideos
            .sort((a, b) => new Date(a.lastScrapedAt).getTime() - new Date(b.lastScrapedAt).getTime())
            .slice(0, 50);

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
                hourly: limitedPendingHourlyVideos.map(v => ({
                    ...v,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    reason: isVideoPending(v).reason || 'Pending',
                    currentStats: {
                        views: v.currentViews,
                        likes: v.currentLikes,
                        comments: v.currentComments,
                        shares: v.currentShares
                    }
                })),
                daily: limitedPendingDailyVideos.map(v => ({
                    ...v,
                    minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
                    reason: isVideoPending(v).reason || 'Pending',
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
