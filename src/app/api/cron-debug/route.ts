import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log(`🔍 ===== CRON DEBUG ANALYSIS =====`);
        
        // 1. Get all videos and their cadences
        const allVideos = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                id: true,
                username: true,
                platform: true,
                scrapingCadence: true,
                lastScrapedAt: true,
                createdAt: true,
                currentViews: true,
                trackingMode: true
            },
            orderBy: { lastScrapedAt: 'asc' }
        });

        console.log(`📊 Total active videos: ${allVideos.length}`);

        // 2. Analyze cadence distribution
        const cadenceBreakdown = {
            hourly: allVideos.filter(v => v.scrapingCadence === 'hourly').length,
            daily: allVideos.filter(v => v.scrapingCadence === 'daily').length,
            other: allVideos.filter(v => !['hourly', 'daily'].includes(v.scrapingCadence || '')).length
        };

        console.log(`📈 Cadence breakdown:`, cadenceBreakdown);

        // 3. Check what shouldScrapeVideo would return for each cadence type
        const now = new Date();
        const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const currentHour = estTime.getHours();
        const currentMinute = estTime.getMinutes();

        console.log(`🕐 Current EST time: ${estTime.toLocaleString()} (Hour ${currentHour}, Minute ${currentMinute})`);

        // 4. Simulate shouldScrapeVideo logic for samples
        const hourlyVideos = allVideos.filter(v => v.scrapingCadence === 'hourly').slice(0, 5);
        const dailyVideos = allVideos.filter(v => v.scrapingCadence === 'daily').slice(0, 5);

        const hourlySamples = hourlyVideos.map(video => {
            const lastScraped = new Date(video.lastScrapedAt);
            const hoursSince = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
            
            // Simulate hourly logic
            let shouldScrape = false;
            let reason = '';
            
            if (currentMinute < 5) {
                // Top of hour window
                const estLastScrapedTime = new Date(lastScraped.toLocaleString("en-US", {timeZone: "America/New_York"}));
                const estCurrentNormalizedTime = new Date(estTime);
                estCurrentNormalizedTime.setMinutes(0, 0, 0);
                
                const estLastScrapedNormalizedTime = new Date(estLastScrapedTime);
                estLastScrapedNormalizedTime.setMinutes(0, 0, 0);
                
                if (estCurrentNormalizedTime.getTime() !== estLastScrapedNormalizedTime.getTime()) {
                    shouldScrape = true;
                    reason = 'Hourly video - new EST hour window';
                } else {
                    shouldScrape = false;
                    reason = 'Hourly video - already scraped this hour';
                }
            } else {
                shouldScrape = false;
                const minutesRemaining = 60 - currentMinute;
                reason = `Same EST hour - wait for top of next hour (${minutesRemaining}m remaining)`;
            }

            return {
                username: video.username,
                platform: video.platform,
                hoursSince: Math.round(hoursSince * 10) / 10,
                shouldScrape,
                reason
            };
        });

        const dailySamples = dailyVideos.map(video => {
            const lastScraped = new Date(video.lastScrapedAt);
            const hoursSince = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
            
            // Simulate daily logic (NEW FIXED VERSION)
            let shouldScrape = false;
            let reason = '';
            
            if (hoursSince >= 20) {
                shouldScrape = true;
                reason = `Daily video - ${Math.floor(hoursSince)}h since last scrape`;
            } else {
                shouldScrape = false;
                const hoursRemaining = Math.ceil(20 - hoursSince);
                reason = `Daily video - scraped ${Math.floor(hoursSince)}h ago, wait ${hoursRemaining}h more`;
            }

            return {
                username: video.username,
                platform: video.platform,
                hoursSince: Math.round(hoursSince * 10) / 10,
                shouldScrape,
                reason
            };
        });

        // 5. Count how many would actually be processed
        const wouldProcessHourly = hourlySamples.filter(s => s.shouldScrape).length;
        const wouldProcessDaily = dailySamples.filter(s => s.shouldScrape).length;

        // 6. Find oldest pending videos
        const oldestPending = allVideos
            .map(video => ({
                username: video.username,
                platform: video.platform,
                lastScrapedAt: video.lastScrapedAt,
                hoursSince: (now.getTime() - new Date(video.lastScrapedAt).getTime()) / (1000 * 60 * 60)
            }))
            .sort((a, b) => b.hoursSince - a.hoursSince)
            .slice(0, 10);

        const response = {
            timestamp: new Date().toISOString(),
            estTime: estTime.toISOString(),
            currentHour,
            currentMinute,
            summary: {
                totalVideos: allVideos.length,
                cadenceBreakdown,
                wouldProcessNow: {
                    hourly: wouldProcessHourly,
                    daily: wouldProcessDaily,
                    total: wouldProcessHourly + wouldProcessDaily
                }
            },
            samples: {
                hourly: hourlySamples,
                daily: dailySamples
            },
            oldestPending: oldestPending.slice(0, 5),
            analysis: {
                isTopOfHour: currentMinute < 5,
                hourlyVideosBlocked: currentMinute >= 5,
                dailyVideosReady: dailySamples.filter(s => s.shouldScrape).length,
                totalReady: wouldProcessHourly + wouldProcessDaily
            }
        };

        console.log(`📋 Analysis complete:`, response.analysis);

        return NextResponse.json(response);

    } catch (error) {
        console.error('💥 Cron debug failed:', error);
        return NextResponse.json({
            error: 'Debug analysis failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
