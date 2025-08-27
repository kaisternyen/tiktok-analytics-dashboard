import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET endpoint to check background processing progress
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: accountId } = await params;
        
        // Get the tracked account
        const account = await prisma.trackedAccount.findUnique({
            where: { id: accountId }
        });
        
        if (!account) {
            return NextResponse.json({
                success: false,
                error: 'Tracked account not found'
            }, { status: 404 });
        }
        
        // Count current tracked videos for this account
        const trackedVideos = await prisma.video.count({
            where: {
                username: account.username,
                platform: account.platform
            }
        });
        
        // Determine processing status based on lastPostAdded timestamp
        const processingComplete = account.lastPostAdded !== null;
        const createdRecently = (Date.now() - account.createdAt.getTime()) < (5 * 60 * 1000); // 5 minutes
        
        let status = 'idle';
        if (createdRecently && !processingComplete) {
            status = 'processing';
        } else if (processingComplete) {
            status = 'completed';
        }
        
        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                platform: account.platform,
                createdAt: account.createdAt.toISOString(),
                lastPostAdded: account.lastPostAdded?.toISOString() || null
            },
            processing: {
                status: status,
                trackedVideos: trackedVideos,
                processingComplete: processingComplete
            }
        });
        
    } catch (error) {
        console.error('💥 Error checking account progress:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to check account progress'
        }, { status: 500 });
    }
}
