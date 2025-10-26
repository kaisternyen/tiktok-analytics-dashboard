import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        console.log('🔄 Starting zero baseline migration...');
        
        // Get all videos
        const videos = await prisma.video.findMany({
            where: {
                postedAt: { not: null }
            },
            select: {
                id: true,
                username: true,
                postedAt: true
            }
        });
        
        console.log(`📊 Found ${videos.length} videos to check`);
        
        let videosUpdated = 0;
        let videosAlreadyHadBaseline = 0;
        let videosWithoutPostedDate = 0;
        let errors = 0;
        
        for (const video of videos) {
            try {
                if (!video.postedAt) {
                    videosWithoutPostedDate++;
                    continue;
                }
                
                // Check if this video already has a zero baseline entry
                const existingZeroBaseline = await prisma.metricsHistory.findFirst({
                    where: {
                        videoId: video.id,
                        views: 0,
                        likes: 0,
                        comments: 0,
                        shares: 0
                    }
                });
                
                if (existingZeroBaseline) {
                    videosAlreadyHadBaseline++;
                    continue;
                }
                
                // Get the first metrics history entry
                const firstEntry = await prisma.metricsHistory.findFirst({
                    where: { videoId: video.id },
                    orderBy: { timestamp: 'asc' }
                });
                
                if (!firstEntry) {
                    // No history at all - add zero baseline
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: 0,
                            likes: 0,
                            comments: 0,
                            shares: 0,
                            timestamp: video.postedAt
                        }
                    });
                    videosUpdated++;
                    console.log(`✅ Added zero baseline for @${video.username}`);
                } else {
                    // Calculate baseline timestamp (1 hour before first entry)
                    const baselineTime = new Date(video.postedAt.getTime());
                    
                    // Ensure baseline is before first entry
                    if (baselineTime >= firstEntry.timestamp) {
                        baselineTime.setTime(firstEntry.timestamp.getTime() - 60 * 60 * 1000);
                    }
                    
                    // Add zero baseline entry
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: 0,
                            likes: 0,
                            comments: 0,
                            shares: 0,
                            timestamp: baselineTime
                        }
                    });
                    videosUpdated++;
                    console.log(`✅ Added zero baseline for @${video.username} at ${baselineTime.toISOString()}`);
                }
            } catch (error) {
                errors++;
                console.error(`❌ Error processing @${video.username}:`, error);
            }
        }
        
        console.log(`✅ Migration complete!`);
        console.log(`📊 Summary:`);
        console.log(`   - Videos updated: ${videosUpdated}`);
        console.log(`   - Videos already had baseline: ${videosAlreadyHadBaseline}`);
        console.log(`   - Videos without posted date: ${videosWithoutPostedDate}`);
        console.log(`   - Errors: ${errors}`);
        
        return NextResponse.json({
            success: true,
            message: `Successfully added zero baselines`,
            summary: {
                videosUpdated,
                videosAlreadyHadBaseline,
                videosWithoutPostedDate,
                errors,
                totalProcessed: videos.length
            }
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return NextResponse.json({
            success: false,
            error: 'Migration failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

