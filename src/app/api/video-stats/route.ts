import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log(`📊 ===== VIDEO STATS REPORT STARTED (${new Date().toISOString()}) =====`);
        
        // Get all active videos with detailed information
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                id: true,
                username: true,
                platform: true,
                url: true,
                scrapingCadence: true,
                lastScrapedAt: true,
                createdAt: true,
                currentViews: true,
                currentLikes: true,
                currentComments: true,
                currentShares: true,
                trackingMode: true,
                currentPhase: true,
                phase1Notified: true,
                phase2Notified: true
            },
            orderBy: { lastScrapedAt: 'desc' }
        });

        const now = new Date();
        
        // Calculate stats for each video
        const videoStats = videos.map(video => {
            const lastScraped = new Date(video.lastScrapedAt);
            const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
            const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
            const daysSinceLastScrape = hoursSinceLastScrape / 24;
            
            // Determine if video is overdue for scraping
            let overdueStatus = 'up_to_date';
            let overdueReason = '';
            
            if (video.scrapingCadence === 'hourly') {
                if (hoursSinceLastScrape >= 1.1) { // 1 hour + 6 minutes buffer
                    overdueStatus = 'overdue';
                    overdueReason = `Hourly video - ${hoursSinceLastScrape.toFixed(1)}h since last scrape`;
                } else if (minutesSinceLastScrape >= 65) { // Safety net
                    overdueStatus = 'overdue';
                    overdueReason = `Hourly video - missed scrape (${minutesSinceLastScrape.toFixed(0)}min ago)`;
                }
            } else if (video.scrapingCadence === 'daily') {
                if (hoursSinceLastScrape >= 24.1) { // 24 hours + 6 minutes buffer
                    overdueStatus = 'overdue';
                    overdueReason = `Daily video - ${daysSinceLastScrape.toFixed(1)} days since last scrape`;
                } else if (minutesSinceLastScrape >= 1445) { // Safety net (24h 5min)
                    overdueStatus = 'overdue';
                    overdueReason = `Daily video - missed scrape (${minutesSinceLastScrape.toFixed(0)}min ago)`;
                }
            } else {
                // Unknown cadence - treat as daily
                if (hoursSinceLastScrape >= 24.1) {
                    overdueStatus = 'overdue';
                    overdueReason = `Unknown cadence (treated as daily) - ${daysSinceLastScrape.toFixed(1)} days since last scrape`;
                }
            }
            
            return {
                id: video.id,
                username: video.username,
                platform: video.platform,
                url: video.url,
                cadence: video.scrapingCadence,
                lastScrapedAt: video.lastScrapedAt,
                lastScrapedFormatted: lastScraped.toLocaleString('en-US', { 
                    timeZone: 'America/New_York',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }),
                hoursSinceLastScrape: hoursSinceLastScrape.toFixed(1),
                minutesSinceLastScrape: minutesSinceLastScrape.toFixed(0),
                daysSinceLastScrape: daysSinceLastScrape.toFixed(1),
                overdueStatus,
                overdueReason,
                currentStats: {
                    views: video.currentViews,
                    likes: video.currentLikes,
                    comments: video.currentComments,
                    shares: video.currentShares
                },
                phase: {
                    current: video.currentPhase,
                    phase1Notified: video.phase1Notified,
                    phase2Notified: video.phase2Notified
                },
                trackingMode: video.trackingMode,
                createdAt: video.createdAt,
                ageInDays: ((now.getTime() - new Date(video.createdAt).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
            };
        });

        // Calculate summary statistics
        const summary = {
            totalVideos: videos.length,
            cadenceBreakdown: {
                hourly: videos.filter(v => v.scrapingCadence === 'hourly').length,
                daily: videos.filter(v => v.scrapingCadence === 'daily').length,
                other: videos.filter(v => !['hourly', 'daily'].includes(v.scrapingCadence || '')).length
            },
            platformBreakdown: videos.reduce((acc, v) => {
                acc[v.platform] = (acc[v.platform] || 0) + 1;
                return acc;
            }, {} as Record<string, number>),
            overdueBreakdown: {
                up_to_date: videoStats.filter(v => v.overdueStatus === 'up_to_date').length,
                overdue: videoStats.filter(v => v.overdueStatus === 'overdue').length
            },
            oldestScraped: videoStats.length > 0 ? videoStats[videoStats.length - 1] : null,
            newestScraped: videoStats.length > 0 ? videoStats[0] : null
        };

        console.log(`📊 Video stats summary:`, summary);
        console.log(`📊 Overdue videos: ${summary.overdueBreakdown.overdue}/${summary.totalVideos}`);
        
        // Log overdue videos
        const overdueVideos = videoStats.filter(v => v.overdueStatus === 'overdue');
        if (overdueVideos.length > 0) {
            console.log(`⚠️ OVERDUE VIDEOS (${overdueVideos.length}):`);
            overdueVideos.forEach((video, index) => {
                console.log(`   ${index + 1}. @${video.username} (${video.platform}) - ${video.cadence} - ${video.overdueReason}`);
            });
        }

        console.log(`🏁 ===== VIDEO STATS REPORT COMPLETED =====`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            summary,
            videos: videoStats,
            overdueVideos: overdueVideos
        });

    } catch (error) {
        console.error(`❌ VIDEO STATS ERROR:`, error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
