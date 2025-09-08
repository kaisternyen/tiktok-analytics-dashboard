import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    const body = await request.json();
    
    const { 
      action, 
      moderatedBy, 
      threadsPlanted, 
      gotTopComment 
    } = body;

    // Validate input
    if (!action || !['mark_moderated', 'update_threads', 'update_star'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: mark_moderated, update_threads, or update_star' },
        { status: 400 }
      );
    }

    // Build update data based on action
    let updateData: Record<string, unknown> = {};

    switch (action) {
      case 'mark_moderated':
        updateData = {
          lastModeratedAt: new Date(),
          moderatedBy: moderatedBy || 'anonymous'
        };
        break;
        
      case 'update_threads':
        if (typeof threadsPlanted !== 'number' || threadsPlanted < 0) {
          return NextResponse.json(
            { error: 'threadsPlanted must be a non-negative number' },
            { status: 400 }
          );
        }
        updateData = { threadsPlanted };
        break;
        
      case 'update_star':
        if (typeof gotTopComment !== 'boolean') {
          return NextResponse.json(
            { error: 'gotTopComment must be a boolean' },
            { status: 400 }
          );
        }
        updateData = { gotTopComment };
        break;
    }

    // Update the video
    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: updateData,
      select: {
        id: true,
        lastModeratedAt: true,
        moderatedBy: true,
        threadsPlanted: true,
        gotTopComment: true,
        username: true,
        platform: true
      }
    });

    console.log(`📝 Moderation update for ${updatedVideo.username} (${updatedVideo.platform}): ${action}`, updateData);

    return NextResponse.json({
      success: true,
      video: updatedVideo,
      message: `Successfully updated ${action.replace('_', ' ')}`
    });

  } catch (error) {
    console.error('❌ Error updating video moderation:', error);
    
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update video moderation' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch moderation status for a specific video
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        lastModeratedAt: true,
        moderatedBy: true,
        threadsPlanted: true,
        gotTopComment: true,
        username: true,
        platform: true,
        phase1Notified: true,
        phase2Notified: true
      }
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ video });

  } catch (error) {
    console.error('❌ Error fetching video moderation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video moderation' },
      { status: 500 }
    );
  }
}
