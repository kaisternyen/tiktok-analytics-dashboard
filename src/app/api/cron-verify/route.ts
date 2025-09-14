import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    try {
        // Test database connection
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        
        // Get count of hourly videos
        const hourlyCount = await prisma.video.count({
            where: {
                isActive: true,
                scrapingCadence: 'hourly'
            }
        });
        
        // Get count of daily videos
        const dailyCount = await prisma.video.count({
            where: {
                isActive: true,
                scrapingCadence: 'daily'
            }
        });
        
        // Get some hourly videos with their last scraped times
        const hourlyVideos = await prisma.video.findMany({
            where: {
                isActive: true,
                scrapingCadence: 'hourly'
            },
            select: {
                username: true,
                platform: true,
                lastScrapedAt: true,
                currentViews: true
            },
            take: 5,
            orderBy: { lastScrapedAt: 'desc' }
        });
        
        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            estTime: estTime.toISOString(),
            currentHour: estTime.getHours(),
            currentMinute: estTime.getMinutes(),
            environment: {
                NODE_ENV: process.env.NODE_ENV,
                VERCEL: process.env.VERCEL,
                VERCEL_URL: process.env.VERCEL_URL,
                VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET ? 'Set' : 'Not Set'
            },
            database: {
                connected: true,
                test: dbTest
            },
            videoStats: {
                totalHourly: hourlyCount,
                totalDaily: dailyCount,
                sampleHourlyVideos: hourlyVideos.map(v => ({
                    username: v.username,
                    platform: v.platform,
                    lastScrapedAt: v.lastScrapedAt,
                    hoursAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60 * 60)),
                    views: v.currentViews
                }))
            },
            cronStatus: {
                isVercelCron: !!process.env.VERCEL_CRON_SECRET,
                expectedSchedule: '0 * * * * (every hour at minute 0)',
                actualTime: `${estTime.getHours()}:${estTime.getMinutes().toString().padStart(2, '0')}`,
                isOnSchedule: estTime.getMinutes() === 0,
                planRequirement: 'Pro plan required for hourly cron jobs (Hobby plan limited to daily)'
            }
        });
        
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: now.toISOString(),
            estTime: estTime.toISOString(),
            currentHour: estTime.getHours(),
            currentMinute: estTime.getMinutes()
        }, { status: 500 });
    }
}
