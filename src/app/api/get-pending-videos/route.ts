import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

// Same logic as in scrape-all/route.ts to identify pending videos
function shouldScrapeVideo(video: { trackingMode: string | null; scrapingCadence: string; lastScrapedAt: Date }): { shouldScrape: boolean; reason?: string } {
    // Skip deleted videos entirely
    if (video.trackingMode === 'deleted') {
        return { shouldScrape: false, reason: 'Video marked as deleted/unavailable' };
    }
    
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    
    // For testing mode (every minute), check if we're at a new normalized minute
    if (video.scrapingCadence === 'testing') {
        return { shouldScrape: true, reason: 'Testing mode - always scrape for debugging' };
    }
    
    // Videos with daily cadence: scrape once per day (matching scrape-all logic)
    if (video.scrapingCadence === 'daily') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
        
        if (hoursSinceLastScrape >= 24) {
            return { shouldScrape: true, reason: `Daily video - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else if (minutesSinceLastScrape >= 1445) { // Safety net: if missed by 5+ minutes (24h 5min)
            return { shouldScrape: true, reason: `Daily video - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)` };
        } else {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastScrape);
            return { shouldScrape: false, reason: `Daily video - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
        }
    }
    
    // Videos with hourly cadence: ensure data for every hour (matching scrape-all logic)
    if (video.scrapingCadence === 'hourly') {
        const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
        const currentHour = now.getHours();
        const lastScrapedHour = lastScraped.getHours();
        
        // CRITICAL: If we don't have data for the current hour, ALWAYS scrape
        if (currentHour !== lastScrapedHour) {
            return { shouldScrape: true, reason: `Missing data for hour ${currentHour} (last scraped hour ${lastScrapedHour})` };
        }
        
        // If we have data for current hour but it's been more than 30 minutes, scrape again (catch delayed runs)
        if (minutesSinceLastScrape >= 30) {
            return { shouldScrape: true, reason: `Hourly video - ${Math.floor(minutesSinceLastScrape)}min since last scrape (catch delayed runs)` };
        }
        
        // Only skip if we have recent data for the current hour
        const minutesRemaining = Math.ceil(30 - minutesSinceLastScrape);
        return { shouldScrape: false, reason: `Hourly video - scraped ${Math.floor(minutesSinceLastScrape)}min ago, wait ${minutesRemaining}min more` };
    }
    
    // Handle unknown/null cadence - treat as daily (matching scrape-all logic)
    const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
    const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
    
    if (hoursSinceLastScrape >= 24) {
        return { shouldScrape: true, reason: `Unknown cadence (treated as daily) - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
    } else if (minutesSinceLastScrape >= 1445) { // Safety net: if missed by 5+ minutes
        return { shouldScrape: true, reason: `Unknown cadence (treated as daily) - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)` };
    } else {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastScrape);
        return { shouldScrape: false, reason: `Unknown cadence (treated as daily) - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
    }
}

export async function GET() {
    try {
        console.log(`🔍 ===== IDENTIFYING PENDING VIDEOS =====`);

        // Get ALL active videos
        const videos = await prisma.video.findMany({
            where: { 
                isActive: true,
                OR: [
                    { trackingMode: null },
                    { trackingMode: { not: 'deleted' } }
                ]
            },
            select: {
                id: true,
                url: true,
                username: true,
                platform: true,
                lastScrapedAt: true,
                scrapingCadence: true,
                trackingMode: true,
                currentViews: true,
                createdAt: true
            }
        });

        console.log(`📊 Found ${videos.length} total active videos`);

        // Identify pending videos
        const pendingVideos: Array<{
            id: string;
            username: string;
            platform: string;
            scrapingCadence: string;
            lastScrapedAt: Date;
            minutesAgo: number;
            reason: string;
            url: string;
        }> = [];
        const readyVideos: Array<{
            id: string;
            username: string;
            platform: string;
            scrapingCadence: string;
            lastScrapedAt: Date;
            minutesAgo: number;
            reason: string;
        }> = [];
        
        // Fix videos with null/undefined cadence - set them to daily
        const videosWithNullCadence = videos.filter(video => !video.scrapingCadence || video.scrapingCadence === 'null' || video.scrapingCadence === 'undefined');
        if (videosWithNullCadence.length > 0) {
            console.log(`🔧 Fixing ${videosWithNullCadence.length} videos with null/undefined cadence...`);
            await prisma.video.updateMany({
                where: {
                    id: { in: videosWithNullCadence.map(v => v.id) }
                },
                data: {
                    scrapingCadence: 'daily'
                }
            });
            console.log(`✅ Updated ${videosWithNullCadence.length} videos to daily cadence`);
            
            // Update the local videos array to reflect the changes
            videos.forEach(video => {
                if (!video.scrapingCadence || video.scrapingCadence === 'null' || video.scrapingCadence === 'undefined') {
                    video.scrapingCadence = 'daily';
                }
            });
        }
        
        videos.forEach(video => {
            const result = shouldScrapeVideo(video);
            const now = new Date();
            const lastScraped = new Date(video.lastScrapedAt);
            const minutesSinceLastScrape = Math.floor((now.getTime() - lastScraped.getTime()) / (1000 * 60));
            
            if (result.shouldScrape) {
                pendingVideos.push({
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    scrapingCadence: video.scrapingCadence,
                    lastScrapedAt: video.lastScrapedAt,
                    minutesAgo: minutesSinceLastScrape,
                    reason: result.reason || 'Unknown reason',
                    url: video.url.substring(0, 50) + '...'
                });
            } else {
                readyVideos.push({
                    id: video.id,
                    username: video.username,
                    platform: video.platform,
                    scrapingCadence: video.scrapingCadence,
                    lastScrapedAt: video.lastScrapedAt,
                    minutesAgo: minutesSinceLastScrape,
                    reason: result.reason || 'Unknown reason'
                });
            }
        });

        // Group by cadence for summary
        const pendingByCadence = pendingVideos.reduce((acc, video) => {
            acc[video.scrapingCadence] = (acc[video.scrapingCadence] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Find oldest pending video
        const oldestPending = pendingVideos.length > 0 
            ? pendingVideos.reduce((oldest, current) => 
                current.minutesAgo > oldest.minutesAgo ? current : oldest
              )
            : null;

        console.log(`📊 PENDING ANALYSIS:`);
        console.log(`   • Total videos: ${videos.length}`);
        console.log(`   • Pending videos: ${pendingVideos.length}`);
        console.log(`   • Ready videos: ${readyVideos.length}`);
        console.log(`   • Pending by cadence:`, pendingByCadence);
        if (oldestPending) {
            console.log(`   • Oldest pending: @${oldestPending.username} (${oldestPending.platform}) - ${oldestPending.minutesAgo} minutes ago`);
        }

        return NextResponse.json({
            success: true,
            summary: {
                totalVideos: videos.length,
                pendingVideos: pendingVideos.length,
                readyVideos: readyVideos.length,
                pendingByCadence,
                oldestPending: oldestPending ? {
                    username: oldestPending.username,
                    platform: oldestPending.platform,
                    minutesAgo: oldestPending.minutesAgo,
                    reason: oldestPending.reason
                } : null
            },
            pendingVideos: pendingVideos.slice(0, 50), // Limit to first 50 for response size
            readyVideos: readyVideos.slice(0, 20) // Show some ready videos for comparison
        });

    } catch (error) {
        console.error('💥 Error identifying pending videos:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
