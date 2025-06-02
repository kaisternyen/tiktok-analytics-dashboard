import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getIntervalForCadence, normalizeTimestamp, getCurrentNormalizedTimestamp } from '@/lib/timestamp-utils';

// Same logic as in scrape-all/route.ts
function shouldScrapeVideo(video: any): { shouldScrape: boolean; reason?: string } {
    const now = new Date();
    const interval = getIntervalForCadence(video.scrapingCadence);
    const lastScraped = new Date(video.lastScrapedAt);
    const videoAgeInDays = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Get current EST time for daily video scheduling
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    
    // For testing mode (every minute), check if we're at a new normalized minute
    if (video.scrapingCadence === 'testing') {
        const currentNormalizedTime = getCurrentNormalizedTimestamp('minute');
        const lastScrapedNormalizedTime = normalizeTimestamp(lastScraped, 'minute');
        
        if (currentNormalizedTime !== lastScrapedNormalizedTime) {
            return { shouldScrape: true, reason: 'Testing mode - new minute boundary' };
        } else {
            return { shouldScrape: false, reason: 'Testing mode - same minute boundary' };
        }
    }
    
    // All videos under 7 days old: scrape at the top of each EST hour
    if (videoAgeInDays < 7) {
        // Use EST timezone for hour boundaries
        const estCurrentNormalizedTime = normalizeTimestamp(estTime, '60min');
        const estLastScrapedTime = new Date(lastScraped.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const estLastScrapedNormalizedTime = normalizeTimestamp(estLastScrapedTime, '60min');
        
        if (estCurrentNormalizedTime !== estLastScrapedNormalizedTime) {
            return { shouldScrape: true, reason: `Video ${videoAgeInDays.toFixed(1)} days old - new EST hour` };
        } else {
            return { shouldScrape: false, reason: 'Same EST hour' };
        }
    }
    
    // Videos 7+ days old with daily cadence: scrape only at 12:00 AM EST
    if (video.scrapingCadence === 'daily') {
        if (currentHour === 0) {
            // Use EST timezone for day boundaries (normalize to start of day)
            const estCurrentDayStart = new Date(estTime);
            estCurrentDayStart.setHours(0, 0, 0, 0);
            
            const estLastScrapedTime = new Date(lastScraped.toLocaleString("en-US", {timeZone: "America/New_York"}));
            const estLastScrapedDayStart = new Date(estLastScrapedTime);
            estLastScrapedDayStart.setHours(0, 0, 0, 0);
            
            // Check if we're in a different day than when last scraped
            if (estCurrentDayStart.getTime() !== estLastScrapedDayStart.getTime()) {
                return { shouldScrape: true, reason: 'Daily video - new EST day' };
            } else {
                return { shouldScrape: false, reason: 'Daily video - already scraped today' };
            }
        } else {
            return { shouldScrape: false, reason: 'Daily video - waiting for midnight EST' };
        }
    }
    
    // Videos 7+ days old with hourly cadence: scrape at the top of each EST hour
    if (video.scrapingCadence === 'hourly') {
        // Use EST timezone for hour boundaries
        const estCurrentNormalizedTime = normalizeTimestamp(estTime, '60min');
        const estLastScrapedTime = new Date(lastScraped.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const estLastScrapedNormalizedTime = normalizeTimestamp(estLastScrapedTime, '60min');
        
        if (estCurrentNormalizedTime !== estLastScrapedNormalizedTime) {
            return { shouldScrape: true, reason: 'High-performance video - new EST hour' };
        } else {
            return { shouldScrape: false, reason: 'Same EST hour' };
        }
    }
    
    return { shouldScrape: true, reason: 'Ready to scrape' };
}

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

        // Get all active videos to check scraping status properly
        const allVideos = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                username: true,
                lastScrapedAt: true,
                createdAt: true,
                scrapingCadence: true
            }
        });

        // Use proper shouldScrapeVideo logic instead of simple time check
        const videosNeedingScrape = allVideos.filter(video => {
            const { shouldScrape } = shouldScrapeVideo(video);
            return shouldScrape;
        });

        // Calculate time since last activity
        const now = new Date();
        const lastActivity = recentHistory[0]?.timestamp;
        const minutesSinceLastActivity = lastActivity
            ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60))
            : null;

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
                needingScrape: videosNeedingScrape.map((v) => ({
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