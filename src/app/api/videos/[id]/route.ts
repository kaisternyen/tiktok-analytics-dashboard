import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        console.log(`🗑️ Deleting video with ID: ${id}`);

        // First check if video exists
        const existingVideo = await prisma.video.findUnique({
            where: { id },
            select: { id: true, username: true }
        });

        if (!existingVideo) {
            console.log(`❌ Video not found: ${id}`);
            return NextResponse.json(
                { error: 'Video not found' },
                { status: 404 }
            );
        }

        console.log(`📹 Found video to delete: @${existingVideo.username}`);

        // Delete metrics history first (foreign key constraint)
        const deletedMetrics = await prisma.metricsHistory.deleteMany({
            where: { videoId: id }
        });

        console.log(`🗑️ Deleted ${deletedMetrics.count} metrics history records`);

        // Then delete the video
        const deletedVideo = await prisma.video.delete({
            where: { id }
        });

        console.log(`✅ Successfully deleted video: @${deletedVideo.username}`);

        return NextResponse.json({
            success: true,
            message: `Video @${deletedVideo.username} deleted successfully`,
            deletedVideo: {
                id: deletedVideo.id,
                username: deletedVideo.username
            }
        });

    } catch (error) {
        console.error('💥 Error deleting video:', error);

        // Handle specific database errors
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
            return NextResponse.json(
                { error: 'Video not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                error: 'Failed to delete video',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
} 