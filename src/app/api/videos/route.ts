import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Migration flag to run only once
let migrationRun = false;

async function runMigrationIfNeeded() {
    if (migrationRun) return;
    
    try {
        console.log('🔧 Running adaptive cadence migration...');
        
        // Add the new columns to the videos table
        await prisma.$executeRaw`
            ALTER TABLE videos 
            ADD COLUMN IF NOT EXISTS "scrapingCadence" TEXT DEFAULT 'hourly',
            ADD COLUMN IF NOT EXISTS "lastDailyViews" INTEGER,
            ADD COLUMN IF NOT EXISTS "dailyViewsGrowth" INTEGER,
            ADD COLUMN IF NOT EXISTS "needsCadenceCheck" BOOLEAN DEFAULT false
        `;

        // Update existing videos to have default cadence
        await prisma.$executeRaw`
            UPDATE videos 
            SET "scrapingCadence" = 'hourly', "needsCadenceCheck" = false 
            WHERE "scrapingCadence" IS NULL
        `;

        console.log('✅ Adaptive cadence migration completed');
        migrationRun = true;
        
    } catch (error) {
        console.log('Migration may already be applied or failed:', error);
        migrationRun = true; // Prevent retry loops
    }
}

function parseFilters(filterParam: string | null): Record<string, unknown> | undefined {
    if (!filterParam) return undefined;
    try {
        const filters: Array<{ field: string; operator: string; value: any }> = JSON.parse(filterParam);
        const where: Record<string, unknown> = { AND: [] };
        for (const filter of filters) {
            const { field, operator, value } = filter;
            const condition: Record<string, unknown> = {};
            switch (operator) {
                case '=':
                case 'is':
                    condition[field] = value;
                    break;
                case '≠':
                case 'is not':
                    condition[field] = { not: value };
                    break;
                case '<':
                    condition[field] = { lt: value };
                    break;
                case '≤':
                    condition[field] = { lte: value };
                    break;
                case '>':
                    condition[field] = { gt: value };
                    break;
                case '≥':
                    condition[field] = { gte: value };
                    break;
                case 'contains':
                    condition[field] = { contains: value, mode: 'insensitive' };
                    break;
                case 'does not contain':
                    condition[field] = { not: { contains: value, mode: 'insensitive' } };
                    break;
                case 'is empty':
                    condition[field] = null;
                    break;
                case 'is not empty':
                    condition[field] = { not: null };
                    break;
                case 'is before':
                    condition[field] = { lt: value };
                    break;
                case 'is after':
                    condition[field] = { gt: value };
                    break;
                case 'is on or before':
                    condition[field] = { lte: value };
                    break;
                case 'is on or after':
                    condition[field] = { gte: value };
                    break;
                case 'is within':
                    condition[field] = { gte: value[0], lte: value[1] };
                    break;
                default:
                    break;
            }
            (where.AND as Array<Record<string, unknown>>).push(condition);
        }
        return where;
    } catch {
        return undefined;
    }
}

function parseSorts(sortParam: string | null): Array<Record<string, 'asc' | 'desc'>> | undefined {
    if (!sortParam) return undefined;
    try {
        const sorts: Array<{ field: string; order: string }> = JSON.parse(sortParam);
        return sorts.map((s) => ({ [s.field]: s.order === 'desc' ? 'desc' : 'asc' }));
    } catch {
        return undefined;
    }
}

export async function GET(req: Request) {
    try {
        // Run migration if needed
        await runMigrationIfNeeded();
        
        const url = new URL(req.url);
        const filterParam = url.searchParams.get('filter');
        const sortParam = url.searchParams.get('sort');
        const where = parseFilters(filterParam) || { isActive: true };
        if (!where.isActive) where.isActive = true;
        const orderBy = parseSorts(sortParam) || [{ createdAt: 'desc' }];
        console.log('📋 Fetching videos from database with:', { where, orderBy });

        const videos = await prisma.video.findMany({
            where,
            include: {
                metricsHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 48 // Last 48 hours for charts
                }
            },
            orderBy
        });

        console.log(`✅ Found ${videos.length} videos in database`);

        // Transform data for frontend
        type VideoWithMetrics = {
            id: string;
            url: string;
            username: string;
            description: string;
            thumbnailUrl: string | null;
            createdAt: Date;
            lastScrapedAt: Date;
            isActive: boolean;
            currentViews: number;
            currentLikes: number;
            currentComments: number;
            currentShares: number;
            hashtags: string | null;
            music: string | null;
            platform: string | null;
            scrapingCadence: string | null;
            metricsHistory: Array<{
                timestamp: Date;
                views: number;
                likes: number;
                comments: number;
                shares: number;
            }>;
        };
        const transformedVideos = videos.map((video: VideoWithMetrics) => {
            // Parse JSON fields
            const hashtags = video.hashtags ? JSON.parse(video.hashtags) : [];
            const music = video.music ? JSON.parse(video.music) : null;

            // Calculate growth from last 2 data points
            const history = video.metricsHistory;
            let growth = { views: 0, likes: 0, comments: 0, shares: 0 };

            if (history.length >= 2) {
                const latest = history[0];
                const previous = history[1];

                growth = {
                    views: previous.views > 0 ? ((latest.views - previous.views) / previous.views) * 100 : 0,
                    likes: previous.likes > 0 ? ((latest.likes - previous.likes) / previous.likes) * 100 : 0,
                    comments: previous.comments > 0 ? ((latest.comments - previous.comments) / previous.comments) * 100 : 0,
                    shares: previous.shares > 0 ? ((latest.shares - previous.shares) / previous.shares) * 100 : 0,
                };
            }

            return {
                id: video.id,
                url: video.url,
                username: video.username,
                description: video.description,
                thumbnailUrl: video.thumbnailUrl,
                posted: video.createdAt.toISOString(),
                lastUpdate: video.lastScrapedAt.toISOString(),
                status: video.isActive ? 'Active' : 'Paused',
                views: video.currentViews,
                likes: video.currentLikes,
                comments: video.currentComments,
                shares: video.currentShares,
                hashtags,
                music,
                platform: video.platform || 'tiktok',
                scrapingCadence: video.scrapingCadence || 'hourly',
                growth,
                history: history.map((h: {
                    timestamp: Date;
                    views: number;
                    likes: number;
                    comments: number;
                    shares: number;
                }) => ({
                    time: h.timestamp.toISOString(),
                    views: h.views,
                    likes: h.likes,
                    comments: h.comments,
                    shares: h.shares
                })).reverse() // Oldest first for charts
            };
        });

        return NextResponse.json({
            success: true,
            videos: transformedVideos
        });

    } catch (error) {
        console.error('💥 Error fetching videos:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch videos',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
} 