/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/tags - Get all tags
export async function GET() {
    try {
        const tags = await (prisma as any).tag.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { videoTags: true }
                }
            }
        });

            return NextResponse.json({
                success: true,
                data: tags.map((tag: any) => ({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color,
                    description: tag.description,
                    createdAt: tag.createdAt,
                    videoCount: tag._count.videoTags
                }))
            });
    } catch (error) {
        console.error('Error fetching tags:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch tags' },
            { status: 500 }
        );
    }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, color, description } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Tag name is required' },
                { status: 400 }
            );
        }

        // Check if tag already exists
        const existingTag = await (prisma as any).tag.findUnique({
            where: { name: name.trim() }
        });

        if (existingTag) {
            return NextResponse.json(
                { success: false, error: 'Tag already exists' },
                { status: 409 }
            );
        }

        const tag = await (prisma as any).tag.create({
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
        console.error('Error creating tag:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create tag' },
            { status: 500 }
        );
    }
}
