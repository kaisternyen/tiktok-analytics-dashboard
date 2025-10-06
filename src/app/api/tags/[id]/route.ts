/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/tags/[id] - Get a specific tag
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const tag = await (prisma as any).tag.findUnique({
            where: { id },
            include: {
                videoTags: {
                    include: {
                        video: {
                            select: {
                                id: true,
                                url: true,
                                username: true,
                                description: true,
                                platform: true
                            }
                        }
                    }
                }
            }
        });

        if (!tag) {
            return NextResponse.json(
                { success: false, error: 'Tag not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                ...tag,
                videos: tag.videoTags.map((vt: any) => vt.video)
            }
        });
    } catch (error) {
        console.error('Error fetching tag:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch tag' },
            { status: 500 }
        );
    }
}

// PUT /api/tags/[id] - Update a tag
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, color, description } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Tag name is required' },
                { status: 400 }
            );
        }

        // Check if another tag with this name exists
        const existingTag = await (prisma as any).tag.findFirst({
            where: { 
                name: name.trim(),
                NOT: { id }
            }
        });

        if (existingTag) {
            return NextResponse.json(
                { success: false, error: 'Tag name already exists' },
                { status: 409 }
            );
        }

        const tag = await (prisma as any).tag.update({
            where: { id },
            data: {
                name: name.trim(),
                color: color || null,
                description: description || null
            }
        });

        return NextResponse.json({
            success: true,
            data: tag
        });
    } catch (error) {
        console.error('Error updating tag:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update tag' },
            { status: 500 }
        );
    }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        // Check if tag exists
        const tag = await (prisma as any).tag.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { videoTags: true }
                }
            }
        });

        if (!tag) {
            return NextResponse.json(
                { success: false, error: 'Tag not found' },
                { status: 404 }
            );
        }

        // Delete the tag (cascade will handle videoTags)
        await (prisma as any).tag.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: `Tag "${tag.name}" deleted successfully`,
            videosAffected: tag._count.videoTags
        });
    } catch (error) {
        console.error('Error deleting tag:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete tag' },
            { status: 500 }
        );
    }
}
