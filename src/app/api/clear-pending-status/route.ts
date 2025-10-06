import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// HARD RESET - Just clear pending status by updating lastScrapedAt to now
// This makes all videos appear as "not pending" until the next natural check
export async function POST() {
    const startTime = Date.now();
    console.log(`🧹 ===== HARD RESET PENDING STATUS =====`);

    try {
        const now = new Date();
        
        // Update ALL active videos to have lastScrapedAt = now
        // This effectively clears them from any pending list
        const result = await prisma.video.updateMany({
            where: { 
                isActive: true,
                OR: [
                    { trackingMode: null },
                    { trackingMode: { not: 'deleted' } }
                ]
            },
            data: {
                lastScrapedAt: now
            }
        });

        const duration = Date.now() - startTime;
        
        console.log(`✅ Hard reset complete: Updated ${result.count} videos`);
        console.log(`⏱️ Duration: ${duration}ms`);

        return NextResponse.json({
            success: true,
            message: `Hard reset complete: Cleared pending status for ${result.count} videos`,
            status: {
                videosUpdated: result.count,
                duration,
                timestamp: now.toISOString()
            }
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 HARD RESET FAILED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            status: {
                duration,
                crashed: true
            }
        }, { status: 500 });
    }
}
