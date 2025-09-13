import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log(`📊 ===== SCRAPING STATUS REPORT (${new Date().toISOString()}) =====`);
        
        // Get all active videos with basic scraping info
        const videos = await prisma.video.findMany({
            where: { isActive: true },
            select: {
                username: true,
                platform: true,
                scrapingCadence: true,
                lastScrapedAt: true,
                currentViews: true,
                trackingMode: true
            },
            orderBy: { lastScrapedAt: 'asc' } // Oldest first
        });

        const now = new Date();
        
        // Group videos by status
        const statusGroups = {
            hourly: { overdue: [], up_to_date: [] },
            daily: { overdue: [], up_to_date: [] },
            other: { overdue: [], up_to_date: [] }
        };

        videos.forEach(video => {
            const lastScraped = new Date(video.lastScrapedAt);
            const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
            const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
            
            let isOverdue = false;
            let timeInfo = '';
            
            if (video.scrapingCadence === 'hourly') {
                if (hoursSinceLastScrape >= 1.1 || minutesSinceLastScrape >= 65) {
                    isOverdue = true;
                    timeInfo = `${hoursSinceLastScrape.toFixed(1)}h ago`;
                } else {
                    timeInfo = `${minutesSinceLastScrape.toFixed(0)}min ago`;
                }
            } else if (video.scrapingCadence === 'daily') {
                if (hoursSinceLastScrape >= 24.1 || minutesSinceLastScrape >= 1445) {
                    isOverdue = true;
                    timeInfo = `${(hoursSinceLastScrape / 24).toFixed(1)} days ago`;
                } else {
                    timeInfo = `${hoursSinceLastScrape.toFixed(1)}h ago`;
                }
            } else {
                // Unknown cadence - treat as daily
                if (hoursSinceLastScrape >= 24.1) {
                    isOverdue = true;
                    timeInfo = `${(hoursSinceLastScrape / 24).toFixed(1)} days ago`;
                } else {
                    timeInfo = `${hoursSinceLastScrape.toFixed(1)}h ago`;
                }
            }
            
            const videoInfo = {
                username: video.username,
                platform: video.platform,
                cadence: video.scrapingCadence,
                lastScraped: video.lastScrapedAt,
                timeInfo,
                views: video.currentViews.toLocaleString(),
                trackingMode: video.trackingMode
            };
            
            const group = video.scrapingCadence === 'hourly' ? 'hourly' : 
                         video.scrapingCadence === 'daily' ? 'daily' : 'other';
            
            if (isOverdue) {
                statusGroups[group].overdue.push(videoInfo);
            } else {
                statusGroups[group].up_to_date.push(videoInfo);
            }
        });

        // Calculate totals
        const totals = {
            hourly: {
                total: statusGroups.hourly.overdue.length + statusGroups.hourly.up_to_date.length,
                overdue: statusGroups.hourly.overdue.length,
                up_to_date: statusGroups.hourly.up_to_date.length
            },
            daily: {
                total: statusGroups.daily.overdue.length + statusGroups.daily.up_to_date.length,
                overdue: statusGroups.daily.overdue.length,
                up_to_date: statusGroups.daily.up_to_date.length
            },
            other: {
                total: statusGroups.other.overdue.length + statusGroups.other.up_to_date.length,
                overdue: statusGroups.other.overdue.length,
                up_to_date: statusGroups.other.up_to_date.length
            }
        };

        const grandTotal = {
            total: videos.length,
            overdue: totals.hourly.overdue + totals.daily.overdue + totals.other.overdue,
            up_to_date: totals.hourly.up_to_date + totals.daily.up_to_date + totals.other.up_to_date
        };

        console.log(`📊 SCRAPING STATUS SUMMARY:`);
        console.log(`   Total Videos: ${grandTotal.total}`);
        console.log(`   Overdue: ${grandTotal.overdue} (${((grandTotal.overdue / grandTotal.total) * 100).toFixed(1)}%)`);
        console.log(`   Up to Date: ${grandTotal.up_to_date} (${((grandTotal.up_to_date / grandTotal.total) * 100).toFixed(1)}%)`);
        console.log(`   Hourly: ${totals.hourly.total} total (${totals.hourly.overdue} overdue)`);
        console.log(`   Daily: ${totals.daily.total} total (${totals.daily.overdue} overdue)`);

        // Log overdue videos
        if (grandTotal.overdue > 0) {
            console.log(`⚠️ OVERDUE VIDEOS:`);
            [...statusGroups.hourly.overdue, ...statusGroups.daily.overdue, ...statusGroups.other.overdue]
                .forEach((video, index) => {
                    console.log(`   ${index + 1}. @${video.username} (${video.platform}) - ${video.cadence} - ${video.timeInfo} - ${video.views} views`);
                });
        }

        console.log(`🏁 ===== SCRAPING STATUS REPORT COMPLETED =====`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                grandTotal,
                totals,
                overduePercentage: ((grandTotal.overdue / grandTotal.total) * 100).toFixed(1)
            },
            statusGroups,
            overdueVideos: [...statusGroups.hourly.overdue, ...statusGroups.daily.overdue, ...statusGroups.other.overdue]
        });

    } catch (error) {
        console.error(`❌ SCRAPING STATUS ERROR:`, error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
