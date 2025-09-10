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
      gotTopComment,
      commentsModerated,
      notes,
      threadsJustPlanted,
      currentPhase
    } = body;

    // Validate input
    if (!action || !['mark_moderated', 'update_threads', 'update_star', 'add_moderation_session', 'update_threads_just_moderated', 'mark_moderated_with_threads', 'update_phase'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: mark_moderated, update_threads, update_star, add_moderation_session, update_threads_just_moderated, mark_moderated_with_threads, or update_phase' },
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

      case 'update_threads_just_moderated':
        if (typeof threadsJustPlanted !== 'number' || threadsJustPlanted < 0) {
          return NextResponse.json(
            { error: 'threadsJustPlanted must be a non-negative number' },
            { status: 400 }
          );
        }
        updateData = { 
          threadsJustPlanted,
          totalThreadsPlanted: {
            increment: threadsJustPlanted
          }
        };
        break;

      case 'mark_moderated_with_threads':
        // Handle both number and text input - convert to number, default to 0 if invalid
        const threadsValue = typeof threadsJustPlanted === 'number' ? threadsJustPlanted : 
                            typeof threadsJustPlanted === 'string' ? parseInt(threadsJustPlanted) || 0 : 0;
        
        if (threadsValue < 0) {
          return NextResponse.json(
            { error: 'threadsJustPlanted must be a non-negative number' },
            { status: 400 }
          );
        }
        updateData = {
          lastModeratedAt: new Date(),
          moderatedBy: moderatedBy || 'anonymous',
          threadsJustPlanted: 0, // Reset to 0 after adding to total
          lastSessionThreads: threadsValue, // Store the threads from this session
          totalThreadsPlanted: {
            increment: threadsValue
          }
        };
        break;

      case 'update_phase':
        if (!currentPhase || !['PHS 0', 'In PHS 1', 'PHS 1 Complete', 'In PHS 2', 'PHS 2 Complete'].includes(currentPhase)) {
          return NextResponse.json(
            { error: 'currentPhase must be one of: PHS 0, In PHS 1, PHS 1 Complete, In PHS 2, PHS 2 Complete' },
            { status: 400 }
          );
        }
        updateData = { currentPhase };
        break;

      case 'add_moderation_session':
        // Create a detailed moderation history entry
        await prisma.moderationHistory.create({
          data: {
            videoId,
            moderatedBy: moderatedBy || 'anonymous',
            commentsModerated: commentsModerated || 0,
            threadsStarted: threadsPlanted || 0,
            gotTopComment: gotTopComment || false,
            notes: notes || null
          }
        });

        // Update the video's totals
        updateData = {
          lastModeratedAt: new Date(),
          moderatedBy: moderatedBy || 'anonymous',
          totalCommentsModerated: {
            increment: commentsModerated || 0
          },
          threadsPlanted: threadsPlanted || 0,
          gotTopComment: gotTopComment || false
        };
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
        threadsJustPlanted: true,
        totalThreadsPlanted: true,
        lastSessionThreads: true,
        currentPhase: true,
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
        threadsJustPlanted: true,
        totalThreadsPlanted: true,
        lastSessionThreads: true,
        currentPhase: true,
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
