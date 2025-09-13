import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startTime = Date.now();
    
    try {
        console.log(`🔍 ===== CRON DIAGNOSTIC STARTED (${new Date().toISOString()}) =====`);
        
        // Test database connection
        console.log(`📊 Testing database connection...`);
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        console.log(`✅ Database connection successful:`, dbTest);
        
        // Get video count and cadence breakdown
        const videoStats = await prisma.video.groupBy({
            by: ['scrapingCadence'],
            where: { isActive: true },
            _count: { id: true }
        });
        
        console.log(`📊 Video cadence breakdown:`, videoStats);
        
        // Get recent scraping activity
        const recentActivity = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                id: true,
                username: true,
                platform: true,
                scrapingCadence: true,
                lastScrapedAt: true,
                currentViews: true
            },
            orderBy: { lastScrapedAt: 'desc' },
            take: 10
        });
        
        console.log(`📊 Recent scraping activity (last 10 videos):`);
        recentActivity.forEach((video, index) => {
            const hoursSinceLastScrape = (Date.now() - video.lastScrapedAt.getTime()) / (1000 * 60 * 60);
            console.log(`   ${index + 1}. @${video.username} (${video.platform}) - ${video.scrapingCadence} - ${hoursSinceLastScrape.toFixed(1)}h ago - ${video.currentViews.toLocaleString()} views`);
        });
        
        // Check for videos that should be scraped
        const now = new Date();
        const hourlyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'hourly',
                lastScrapedAt: {
                    lt: new Date(now.getTime() - 65 * 60 * 1000) // 65 minutes ago
                }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                lastScrapedAt: true
            }
        });
        
        console.log(`⏰ Hourly videos overdue for scraping: ${hourlyVideos.length}`);
        hourlyVideos.forEach((video, index) => {
            const hoursSinceLastScrape = (Date.now() - video.lastScrapedAt.getTime()) / (1000 * 60 * 60);
            console.log(`   ${index + 1}. @${video.username} (${video.platform}) - ${hoursSinceLastScrape.toFixed(1)}h ago`);
        });
        
        const dailyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'daily',
                lastScrapedAt: {
                    lt: new Date(now.getTime() - 1445 * 60 * 1000) // 1445 minutes ago (24h 5min)
                }
            },
            select: {
                id: true,
                username: true,
                platform: true,
                lastScrapedAt: true
            }
        });
        
        console.log(`🌙 Daily videos overdue for scraping: ${dailyVideos.length}`);
        dailyVideos.forEach((video, index) => {
            const hoursSinceLastScrape = (Date.now() - video.lastScrapedAt.getTime()) / (1000 * 60 * 60);
            console.log(`   ${index + 1}. @${video.username} (${video.platform}) - ${hoursSinceLastScrape.toFixed(1)}h ago`);
        });
        
        const duration = Date.now() - startTime;
        console.log(`🏁 ===== CRON DIAGNOSTIC COMPLETED in ${duration}ms =====`);
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            duration: duration,
            database: 'connected',
            videoStats: videoStats,
            recentActivity: recentActivity,
            overdueHourly: hourlyVideos.length,
            overdueDaily: dailyVideos.length,
            overdueVideos: {
                hourly: hourlyVideos,
                daily: dailyVideos
            }
        });
        
    } catch (error) {
        console.error(`❌ CRON DIAGNOSTIC ERROR:`, error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
        }, { status: 500 });
    }
}
