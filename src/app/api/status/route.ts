import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Get basic stats
        const totalVideos = await prisma.video.count({
            where: { isActive: true }
        });

        const recentlyUpdated = await prisma.video.count({
            where: {
                isActive: true,
                lastScrapedAt: {
                    gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
                }
            }
        });

        const oldestUpdate = await prisma.video.findFirst({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'asc' },
            select: {
                username: true,
                lastScrapedAt: true
            }
        });

        const newestUpdate = await prisma.video.findFirst({
            where: { isActive: true },
            orderBy: { lastScrapedAt: 'desc' },
            select: {
                username: true,
                lastScrapedAt: true
            }
        });

        // Check if cron is working (at least one update in last 2 minutes)
        const cronHealthy = recentlyUpdated > 0;

        const status = {
            healthy: cronHealthy,
            totalVideos,
            recentlyUpdated,
            oldestUpdate: oldestUpdate ? {
                username: oldestUpdate.username,
                lastScrapedAt: oldestUpdate.lastScrapedAt,
                minutesAgo: Math.floor((Date.now() - oldestUpdate.lastScrapedAt.getTime()) / (1000 * 60))
            } : null,
            newestUpdate: newestUpdate ? {
                username: newestUpdate.username,
                lastScrapedAt: newestUpdate.lastScrapedAt,
                minutesAgo: Math.floor((Date.now() - newestUpdate.lastScrapedAt.getTime()) / (1000 * 60))
            } : null,
            timestamp: new Date().toISOString()
        };

        return NextResponse.json({
            success: true,
            status
        });

    } catch (error) {
        console.error('💥 Status check failed:', error);
        return NextResponse.json(
            {
                error: 'Status check failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
} 