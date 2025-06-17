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

const ALLOWED_FIELDS = [
  'username', 'description', 'status', 'platform', 'currentViews', 'currentLikes', 'currentComments', 'currentShares', 'createdAt', 'lastScrapedAt', 'scrapingCadence'
];

function parseFilters(filterParam: string | null): Record<string, unknown> | undefined {
    if (!filterParam) return undefined;
    try {
        type FilterValue = string | number | boolean | null | string[] | number[] | Date | Date[];
        // Accept new format: { operator: 'AND' | 'OR', conditions: [...] }
        const parsed = JSON.parse(filterParam);
        const operator = parsed.operator;
        let conditions: Array<{ field: string; operator: string; value: FilterValue }> = [];
        if (parsed && typeof parsed === 'object' && parsed.operator && Array.isArray(parsed.conditions)) {
            conditions = parsed.conditions;
        } else if (Array.isArray(parsed)) {
            // fallback for old array format
            conditions = parsed;
        }
        const where: Record<string, unknown> = { [operator]: [] };
        for (const filter of conditions) {
            let { field, value } = filter;
            const op = filter.operator;
            // Map 'lastUpdate' to 'lastScrapedAt' for DB
            if (field === 'lastUpdate') field = 'lastScrapedAt';
            // Validate field
            if (!ALLOWED_FIELDS.includes(field)) {
                console.warn(`[API] Filter field '${field}' is not a valid DB field.`);
                continue;
            }
            // Normalize platform/status/cadence values
            if (['platform', 'status', 'scrapingCadence'].includes(field) && typeof value === 'string') {
                value = value.toLowerCase();
            }
            // Convert string date values to Date objects for date fields
            const dateFields = ['createdAt', 'lastScrapedAt'];
            let filterValue = value;
            if (dateFields.includes(field) && typeof value === 'string' && value) {
                filterValue = new Date(value);
            }
            const condition: Record<string, unknown> = {};
            switch (op) {
                case '=':
                case 'is':
                    condition[field] = filterValue;
                    break;
                case '≠':
                case 'is not':
                    condition[field] = { not: filterValue };
                    break;
                case '<':
                    condition[field] = { lt: filterValue };
                    break;
                case '≤':
                    condition[field] = { lte: filterValue };
                    break;
                case '>':
                    condition[field] = { gt: filterValue };
                    break;
                case '≥':
                    condition[field] = { gte: filterValue };
                    break;
                case 'contains':
                    condition[field] = { contains: filterValue, mode: 'insensitive' };
                    break;
                case 'does not contain':
                    condition[field] = { not: { contains: filterValue, mode: 'insensitive' } };
                    break;
                case 'is empty':
                    condition[field] = null;
                    break;
                case 'is not empty':
                    condition[field] = { not: null };
                    break;
                case 'is before':
                    condition[field] = { lt: filterValue };
                    break;
                case 'is after':
                    condition[field] = { gt: filterValue };
                    break;
                case 'is on or before':
                    condition[field] = { lte: filterValue };
                    break;
                case 'is on or after':
                    condition[field] = { gte: filterValue };
                    break;
                case 'is within':
                    if (Array.isArray(filterValue) && filterValue.length === 2) {
                        condition[field] = { gte: filterValue[0], lte: filterValue[1] };
                    }
                    break;
                default:
                    break;
            }
            (where[operator] as Array<Record<string, unknown>>).push(condition);
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
        return sorts.map((s) => {
            let field = s.field;
            // Map 'lastUpdate' to 'lastScrapedAt' for DB
            if (field === 'lastUpdate') field = 'lastScrapedAt';
            // Validate field
            if (!ALLOWED_FIELDS.includes(field)) {
                console.warn(`[API] Sort field '${field}' is not a valid DB field.`);
                return null;
            }
            return { [field]: s.order === 'desc' ? 'desc' : 'asc' };
        }).filter(Boolean) as Array<Record<string, 'asc' | 'desc'>>;
    } catch {
        return undefined;
    }
}

// Add type for metricsHistory
interface MetricsHistoryPoint {
  timestamp: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

// Type for filtered videos after timeframe filtering
interface FilteredVideoWithMetrics {
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
  metricsHistory: MetricsHistoryPoint[];
}

// Type for filter conditions
interface FilterCondition {
  field: string;
  operator: string;
  value: string | string[] | number | number[] | boolean | null | Date | Date[];
}

export async function GET(req: Request) {
    try {
        await runMigrationIfNeeded();
        const url = new URL(req.url);
        const filterParam = url.searchParams.get('filter');
        const sortParam = url.searchParams.get('sort');
        const decodedFilterParam = filterParam ? decodeURIComponent(filterParam) : null;
        const decodedSortParam = sortParam ? decodeURIComponent(sortParam) : null;
        console.log('RAW filterParam:', filterParam);
        let where: Record<string, unknown> = { isActive: true };
        let timeframe: [string, string] | null = null;
        let filterParamToParse = decodedFilterParam;
        if (decodedFilterParam) {
            const parsed = JSON.parse(decodedFilterParam);
            // Extract timeframe filter if present
            if (parsed && parsed.conditions) {
                const tf = parsed.conditions.find((f: FilterCondition) => f.field === 'timeframe');
                if (tf && Array.isArray(tf.value) && tf.value.length === 2 && tf.value[0] && tf.value[1]) {
                    timeframe = [tf.value[0], tf.value[1]];
                    // Remove timeframe from conditions before passing to parseFilters
                    parsed.conditions = parsed.conditions.filter((f: FilterCondition) => f.field !== 'timeframe');
                    filterParamToParse = JSON.stringify(parsed);
                }
            }
            const parsedFilters = parseFilters(filterParamToParse);
            console.log('PARSED filters:', parsedFilters);
            if (parsedFilters) where = { ...parsedFilters, isActive: true };
        }
        console.log('FINAL where clause:', where);
        const orderBy = parseSorts(decodedSortParam) || [{ createdAt: 'desc' }];
        console.log('📋 Fetching videos from database with:', { where, orderBy });
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

        console.log(`✅ Found ${videos.length} videos in database`);

        // If timeframe filter is present, filter metricsHistory and videos accordingly
        let filteredVideos: FilteredVideoWithMetrics[] = videos;
        if (timeframe) {
            const [start, end] = timeframe;
            filteredVideos = videos.map((video) => {
                const filteredHistory = video.metricsHistory.map((h) => ({
                  timestamp: h.timestamp,
                  views: h.views,
                  likes: h.likes,
                  comments: h.comments,
                  shares: h.shares
                })).filter((h: MetricsHistoryPoint) => {
                    const t = new Date(h.timestamp).getTime();
                    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
                });
                return { ...video, metricsHistory: filteredHistory };
            }).filter((video) => video.metricsHistory.length > 0);
        }

        // Transform data for frontend
        let transformedVideos = filteredVideos.map((video) => {
            // Parse JSON fields
            const hashtags = video.hashtags ? JSON.parse(video.hashtags) : [];
            const music = video.music ? JSON.parse(video.music) : null;

            // Calculate growth from last 2 data points (in filtered history)
            const history = video.metricsHistory;
            let growth = { views: 0, likes: 0, comments: 0, shares: 0 };

            // Delta calculation for metrics in timeframe
            let likesDelta = 0, viewsDelta = 0, commentsDelta = 0, sharesDelta = 0;
            if (history.length >= 2) {
                const first = history[history.length - 1]; // oldest
                const last = history[0]; // newest
                // If the timeframe covers all history (first point is earliest ever), use latest value
                const isAllTime = !timeframe || (video.metricsHistory.length === history.length);
                if (isAllTime) {
                    likesDelta = last.likes;
                    viewsDelta = last.views;
                    commentsDelta = last.comments;
                    sharesDelta = last.shares;
                } else {
                    likesDelta = last.likes - first.likes;
                    viewsDelta = last.views - first.views;
                    commentsDelta = last.comments - first.comments;
                    sharesDelta = last.shares - first.shares;
                }
            } else if (history.length === 1) {
                // Only one data point in range
                likesDelta = history[0].likes;
                viewsDelta = history[0].views;
                commentsDelta = history[0].comments;
                sharesDelta = history[0].shares;
            }

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
                likesDelta,
                viewsDelta,
                commentsDelta,
                sharesDelta,
                hashtags,
                music,
                platform: video.platform || 'tiktok',
                scrapingCadence: video.scrapingCadence || 'hourly',
                growth,
                history: history.map((h: MetricsHistoryPoint) => ({
                    time: h.timestamp.toISOString(),
                    views: h.views,
                    likes: h.likes,
                    comments: h.comments,
                    shares: h.shares
                })).reverse() // Oldest first for charts
            };
        });

        // In-memory filtering and sorting on delta fields if timeframe is set
        if (timeframe && decodedFilterParam) {
            const parsed = JSON.parse(decodedFilterParam);
            if (parsed && parsed.conditions) {
                for (const cond of parsed.conditions) {
                    let field = cond.field;
                    const op = cond.operator;
                    const value = cond.value;
                    // Always map likes/views/comments/shares (or their delta fields) to delta fields
                    if (["likes", "views", "comments", "shares", "likesDelta", "viewsDelta", "commentsDelta", "sharesDelta"].includes(field)) {
                        if (!field.endsWith("Delta")) field = field + "Delta";
                    }
                    transformedVideos = transformedVideos.filter(video => {
                        const v = (video as unknown as Record<string, number>)[field];
                        switch (op) {
                            case '>': return v > value;
                            case '>=': return v >= value;
                            case '<': return v < value;
                            case '<=': return v <= value;
                            case '=':
                            case 'is': return v === value;
                            case '≠':
                            case 'is not': return v !== value;
                            default: return true;
                        }
                    });
                }
            }
        }
        // In-memory sorting on delta fields if timeframe is set
        if (timeframe && decodedSortParam) {
            const sorts = JSON.parse(decodedSortParam);
            for (const sort of sorts) {
                let field = sort.field;
                const order = sort.order;
                // Always map likes/views/comments/shares (or their delta fields) to delta fields
                if (["likes", "views", "comments", "shares", "likesDelta", "viewsDelta", "commentsDelta", "sharesDelta"].includes(field)) {
                    if (!field.endsWith("Delta")) field = field + "Delta";
                }
                transformedVideos = transformedVideos.sort((a, b) => {
                    if (order === 'desc') return (b as unknown as Record<string, number>)[field] - (a as unknown as Record<string, number>)[field];
                    return (a as unknown as Record<string, number>)[field] - (b as unknown as Record<string, number>)[field];
                });
            }
        }

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