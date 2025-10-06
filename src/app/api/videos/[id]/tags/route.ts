/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/videos/[id]/tags - Get tags for a specific video
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const video = await prisma.video.findUnique({
            where: { id },
            include: {
                videoTags: {
                    include: {
                        tag: true
                    }
                }
            } as any
        });

        if (!video) {
            return NextResponse.json(
                { success: false, error: 'Video not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: (video as any).videoTags.map((vt: any) => vt.tag)
        });
    } catch (error) {
        console.error('Error fetching video tags:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch video tags' },
            { status: 500 }
        );
    }
}

// POST /api/videos/[id]/tags - Add a tag to a video
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { tagId } = body;

        if (!tagId) {
            return NextResponse.json(
                { success: false, error: 'Tag ID is required' },
                { status: 400 }
            );
        }

        // Check if video exists
        const video = await prisma.video.findUnique({
            where: { id }
        });

        if (!video) {
            return NextResponse.json(
                { success: false, error: 'Video not found' },
                { status: 404 }
            );
        }

        // Check if tag exists
        const tag = await (prisma as any).tag.findUnique({
            where: { id: tagId }
        });

        if (!tag) {
            return NextResponse.json(
                { success: false, error: 'Tag not found' },
                { status: 404 }
            );
        }

        // Check if relationship already exists
        const existingRelation = await (prisma as any).videoTag.findUnique({
            where: {
                videoId_tagId: {
                    videoId: id,
                    tagId: tagId
                }
            }
        });

        if (existingRelation) {
            return NextResponse.json(
                { success: false, error: 'Tag already added to this video' },
                { status: 409 }
            );
        }

        // Create the relationship
        const videoTag = await (prisma as any).videoTag.create({
            data: {
                videoId: id,
                tagId: tagId
            },
            include: {
                tag: true
            }
        });

        return NextResponse.json({
            success: true,
            data: videoTag.tag,
            message: `Tag "${tag.name}" added to video`
        });
    } catch (error) {
        console.error('Error adding tag to video:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to add tag to video' },
            { status: 500 }
        );
    }
}

// DELETE /api/videos/[id]/tags - Remove a tag from a video
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const tagId = searchParams.get('tagId');

        if (!tagId) {
            return NextResponse.json(
                { success: false, error: 'Tag ID is required' },
                { status: 400 }
            );
        }

        // Check if relationship exists
        const videoTag = await (prisma as any).videoTag.findUnique({
            where: {
                videoId_tagId: {
                    videoId: id,
                    tagId: tagId
                }
            },
            include: {
                tag: true
            }
        });

        if (!videoTag) {
            return NextResponse.json(
                { success: false, error: 'Tag not found on this video' },
                { status: 404 }
            );
        }

        // Delete the relationship
        await (prisma as any).videoTag.delete({
            where: {
                videoId_tagId: {
                    videoId: id,
                    tagId: tagId
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: `Tag "${videoTag.tag.name}" removed from video`
        });
    } catch (error) {
        console.error('Error removing tag from video:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to remove tag from video' },
            { status: 500 }
        );
    }
}
