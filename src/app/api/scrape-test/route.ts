import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Copy of the shouldScrapeVideo function for testing
interface VideoTestRecord {
    trackingMode: string | null;
    scrapingCadence: string | null;
    lastScrapedAt: Date;
    createdAt: Date;
}

function shouldScrapeVideoTest(video: VideoTestRecord): { shouldScrape: boolean; reason?: string } {
    if (video.trackingMode === 'deleted') {
        return { shouldScrape: false, reason: 'Video marked as deleted/unavailable' };
    }
    
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    
    // Testing mode
    if (video.scrapingCadence === 'testing') {
        return { shouldScrape: true, reason: 'Testing mode - always scrape for demo' };
    }
    
    // Daily cadence: 18-hour flexible timing
    if (video.scrapingCadence === 'daily') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastScrape >= 18) {
            return { shouldScrape: true, reason: `Daily video - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else {
            const hoursRemaining = Math.ceil(18 - hoursSinceLastScrape);
            return { shouldScrape: false, reason: `Daily video - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
        }
    }
    
    // Hourly cadence: 50-minute flexible timing
    if (video.scrapingCadence === 'hourly') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastScrape >= 0.83) { // 50 minutes = 0.83 hours
            return { shouldScrape: true, reason: `Hourly video - ${Math.floor(hoursSinceLastScrape * 60)}min since last scrape` };
        } else {
            const minutesRemaining = Math.ceil((0.83 - hoursSinceLastScrape) * 60);
            return { shouldScrape: false, reason: `Hourly video - scraped ${Math.floor(hoursSinceLastScrape * 60)}min ago, wait ${minutesRemaining}min more` };
        }
    }
    
    return { shouldScrape: true, reason: `Default: Ready to scrape` };
}

export async function GET() {
    try {
        console.log(`🧪 ===== SCRAPE LOGIC TEST =====`);
        
        // Get sample of videos
        const videos = await prisma.video.findMany({
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
            orderBy: { lastScrapedAt: 'asc' },
            take: 20
        });

        const now = new Date();
        const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
        
        // Test each video
        const testResults = videos.map(video => {
            const { shouldScrape, reason } = shouldScrapeVideoTest(video);
            const hoursSinceLastScrape = (now.getTime() - new Date(video.lastScrapedAt).getTime()) / (1000 * 60 * 60);
            const videoAgeInDays = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            
            return {
                username: video.username,
                platform: video.platform,
                cadence: video.scrapingCadence,
                ageInDays: Math.round(videoAgeInDays * 10) / 10,
                hoursSinceLastScrape: Math.round(hoursSinceLastScrape * 100) / 100,
                shouldScrape,
                reason,
                views: video.currentViews
            };
        });

        // Count by action
        const willScrape = testResults.filter(r => r.shouldScrape).length;
        const willSkip = testResults.filter(r => !r.shouldScrape).length;
        
        // Count by cadence
        const hourlyCadence = testResults.filter(r => r.cadence === 'hourly').length;
        const dailyCadence = testResults.filter(r => r.cadence === 'daily').length;
        const otherCadence = testResults.filter(r => !['hourly', 'daily'].includes(r.cadence || '')).length;
        
        const response = {
            timestamp: new Date().toISOString(),
            estTime: estTime.toISOString(),
            currentHour: estTime.getHours(),
            currentMinute: estTime.getMinutes(),
            summary: {
                totalTested: testResults.length,
                willScrape,
                willSkip,
                scrapePercentage: Math.round((willScrape / testResults.length) * 100)
            },
            cadenceBreakdown: {
                hourly: hourlyCadence,
                daily: dailyCadence,
                other: otherCadence
            },
            sampleResults: testResults,
            analysis: {
                message: willScrape > 0 
                    ? `✅ ${willScrape} videos ready to scrape now` 
                    : `❌ No videos ready - all ${willSkip} are waiting`,
                recommendation: willScrape < testResults.length * 0.1 
                    ? "⚠️ Very low scrape rate - timing logic may be too restrictive"
                    : "✅ Scrape rate looks reasonable"
            }
        };

        console.log(`📊 Test Results: ${willScrape}/${testResults.length} videos would be scraped`);

        return NextResponse.json(response);

    } catch (error) {
        console.error('💥 Scrape test failed:', error);
        return NextResponse.json({
            error: 'Scrape test failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
