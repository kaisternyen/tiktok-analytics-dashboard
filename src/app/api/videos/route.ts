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

const FIELD_TYPE_MAP: { [key: string]: string } = {
  username: 'string',
  platform: 'string',
  scrapingCadence: 'string',
  description: 'string',
  status: 'string',
  currentViews: 'number',
  currentLikes: 'number',
  currentComments: 'number',
  currentShares: 'number',
  createdAt: 'date',
  lastScrapedAt: 'date',
};

interface VideoFilter {
  field: string;
  operator: string;
  value: any;
}

interface VideoSort {
  field: string;
  direction: 'asc' | 'desc';
}

function buildWhere(filters: VideoFilter[] = []): Record<string, unknown> {
  const where: Record<string, unknown> = { isActive: true };
  for (const filter of filters) {
    const field = String(filter.field);
    const { operator, value } = filter;
    if (!FIELD_TYPE_MAP[field]) continue;
    const type = FIELD_TYPE_MAP[field];
    if (type === 'string') {
      switch (operator) {
        case 'contains':
          where[field] = { contains: value, mode: 'insensitive' };
          break;
        case 'does_not_contain':
          where[field] = { not: { contains: value, mode: 'insensitive' } };
          break;
        case 'is':
          where[field] = value;
          break;
        case 'is_not':
          where[field] = { not: value };
          break;
        case 'is_empty':
          where[field] = '';
          break;
        case 'is_not_empty':
          where[field] = { not: '' };
          break;
      }
    } else if (type === 'number') {
      switch (operator) {
        case '=':
          where[field] = Number(value);
          break;
        case '!=':
          where[field] = { not: Number(value) };
          break;
        case '<':
          where[field] = { lt: Number(value) };
          break;
        case '<=':
          where[field] = { lte: Number(value) };
          break;
        case '>':
          where[field] = { gt: Number(value) };
          break;
        case '>=':
          where[field] = { gte: Number(value) };
          break;
        case 'is_empty':
          where[field] = null;
          break;
        case 'is_not_empty':
          where[field] = { not: null };
          break;
      }
    } else if (type === 'date') {
      switch (operator) {
        case 'is':
          where[field] = new Date(value);
          break;
        case 'is_before':
          where[field] = { lt: new Date(value) };
          break;
        case 'is_after':
          where[field] = { gt: new Date(value) };
          break;
        case 'is_on_or_before':
          where[field] = { lte: new Date(value) };
          break;
        case 'is_on_or_after':
          where[field] = { gte: new Date(value) };
          break;
        case 'is_not':
          where[field] = { not: new Date(value) };
          break;
        case 'is_empty':
          where[field] = null;
          break;
        case 'is_not_empty':
          where[field] = { not: null };
          break;
        case 'is_within':
          // value: { start, end }
          where[field] = { gte: new Date(value.start), lte: new Date(value.end) };
          break;
      }
    }
  }
  return where;
}

function buildOrderBy(sorts: VideoSort[] = []): Record<string, 'asc' | 'desc'>[] {
  if (!Array.isArray(sorts) || sorts.length === 0) return [{ createdAt: 'desc' }];
  return sorts.map(sort => ({ [sort.field]: sort.direction === 'asc' ? 'asc' : 'desc' }));
}

export async function POST(req: Request) {
  try {
    await runMigrationIfNeeded();
    const { filters = [], sorts = [] }: { filters: VideoFilter[]; sorts: VideoSort[] } = await req.json();
    const where = buildWhere(filters);
    const orderBy = buildOrderBy(sorts);

    const videos = await prisma.video.findMany({
      where,
      include: {
        metricsHistory: {
          orderBy: { timestamp: 'desc' },
          take: 48
        }
      },
      orderBy
    });

    // Transform data for frontend
    const transformedVideos = videos.map((video: {
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
    }) => {
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

export async function GET() {
    try {
        // Run migration if needed
        await runMigrationIfNeeded();
        
        console.log('📋 Fetching videos from database...');

        const videos = await prisma.video.findMany({
            where: { isActive: true },
            include: {
                metricsHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 48 // Last 48 hours for charts
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Found ${videos.length} videos in database`);

        // Transform data for frontend
        const transformedVideos = videos.map((video: {
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
        }) => {
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