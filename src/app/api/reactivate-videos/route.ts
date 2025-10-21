import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Reactivate paused videos
export async function POST(req: Request) {
    try {
        const { videoIds, reactivateAll = false, reactivateOrphaned = false } = await req.json();

        let whereClause: Record<string, unknown> = { isActive: false };

        if (reactivateAll) {
            // Reactivate all inactive videos
            whereClause = { isActive: false };
        } else if (reactivateOrphaned) {
            // Reactivate only orphaned videos
            whereClause = { 
                isActive: false, 
                trackingMode: 'orphaned' 
            };
        } else if (videoIds && Array.isArray(videoIds)) {
            // Reactivate specific videos by ID
            whereClause = { 
                id: { in: videoIds },
                isActive: false 
            };
        } else {
            return NextResponse.json({ 
                success: false, 
                error: 'Must provide videoIds array, reactivateAll: true, or reactivateOrphaned: true' 
            }, { status: 400 });
        }

        // Get videos that will be reactivated
        const videosToReactivate = await prisma.video.findMany({
            where: whereClause,
            select: {
                id: true,
                username: true,
                platform: true,
                trackingMode: true,
                url: true
            }
        });

        if (videosToReactivate.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No videos found to reactivate',
                reactivated: 0,
                videos: []
            });
        }

        // Reactivate the videos
        const result = await prisma.video.updateMany({
            where: whereClause,
            data: {
                isActive: true,
                trackingMode: null, // Clear any tracking mode
                lastScrapedAt: new Date() // Reset scraping timestamp
            }
        });

        console.log(`✅ Reactivated ${result.count} videos`);

        // Trigger immediate scraping for reactivated videos
        const scrapePromises = videosToReactivate.map(async (video) => {
            try {
                const scrapeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/run-single-video`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ videoId: video.id }),
                });
                
                if (scrapeResponse.ok) {
                    console.log(`✅ Triggered scrape for @${video.username}`);
                    return { success: true, video: video.username };
                } else {
                    console.log(`⚠️ Failed to trigger scrape for @${video.username}`);
                    return { success: false, video: video.username };
                }
            } catch (error) {
                console.error(`❌ Error triggering scrape for @${video.username}:`, error);
                return { success: false, video: video.username };
            }
        });

        // Wait for all scrape requests to complete
        const scrapeResults = await Promise.all(scrapePromises);
        const successfulScrapes = scrapeResults.filter(r => r.success).length;
        const failedScrapes = scrapeResults.filter(r => !r.success).length;

        console.log(`📊 Scrape results: ${successfulScrapes} successful, ${failedScrapes} failed`);

        return NextResponse.json({
            success: true,
            message: `Successfully reactivated ${result.count} videos and triggered scraping for ${successfulScrapes} videos`,
            reactivated: result.count,
            scrapesTriggered: successfulScrapes,
            scrapesFailed: failedScrapes,
            videos: videosToReactivate.map(v => ({
                id: v.id,
                username: v.username,
                platform: v.platform,
                url: v.url,
                previousTrackingMode: v.trackingMode
            }))
        });

    } catch (error) {
        console.error('❌ Error reactivating videos:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Get list of paused videos
export async function GET() {
    try {
        const pausedVideos = await prisma.video.findMany({
            where: { isActive: false },
            select: {
                id: true,
                username: true,
                platform: true,
                trackingMode: true,
                url: true,
                lastScrapedAt: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Group by tracking mode
        const grouped = pausedVideos.reduce((acc, video) => {
            const mode = video.trackingMode || 'unknown';
            if (!acc[mode]) acc[mode] = [];
            acc[mode].push(video);
            return acc;
        }, {} as Record<string, typeof pausedVideos>);

        return NextResponse.json({
            success: true,
            total: pausedVideos.length,
            grouped,
            summary: Object.keys(grouped).map(mode => ({
                mode,
                count: grouped[mode].length
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching paused videos:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
