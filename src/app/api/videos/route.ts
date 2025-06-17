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
        let filterGroup: { operator: string; conditions: FilterCondition[] } = { operator: 'AND', conditions: [] };
        let timeframe: [string, string] | null = null;
        if (decodedFilterParam) {
            const parsed = JSON.parse(decodedFilterParam);
            if (parsed && parsed.timeframe && Array.isArray(parsed.timeframe) && parsed.timeframe[0] && parsed.timeframe[1]) {
                timeframe = [parsed.timeframe[0], parsed.timeframe[1]];
            }
            if (parsed && parsed.operator && Array.isArray(parsed.conditions)) {
                filterGroup = { operator: parsed.operator, conditions: parsed.conditions };
            }
        }
        // Build DB where clause for non-history fields
        const dbFilters = filterGroup.conditions.filter(f => !['currentViews','currentLikes','currentComments','currentShares'].includes(f.field));
        const dbFilterGroup = { operator: filterGroup.operator, conditions: dbFilters };
        const where = parseFilters(JSON.stringify(dbFilterGroup)) || { isActive: true };
        where.isActive = true;
        const orderBy = parseSorts(decodedSortParam) || [{ createdAt: 'desc' }];
        const videos = await prisma.video.findMany({
            where,
            include: {
                metricsHistory: {
                    orderBy: { timestamp: 'asc' },
                    take: 48
                }
            },
            orderBy
        });
        // Slice metricsHistory by timeframe
        let filteredVideos = videos.map((video) => {
            let filteredHistory = video.metricsHistory;
            if (timeframe) {
                const [start, end] = timeframe;
                filteredHistory = filteredHistory.filter((h: MetricsHistoryPoint) => {
                    const t = new Date(h.timestamp).getTime();
                    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
                });
            }
            return { ...video, metricsHistory: filteredHistory };
        }).filter((video) => video.metricsHistory.length > 0);
        // Apply history-based filters (e.g., likes > 1000) to the sliced history
        const historyFilters = filterGroup.conditions.filter(f => ['currentViews','currentLikes','currentComments','currentShares'].includes(f.field));
        if (historyFilters.length > 0) {
            filteredVideos = filteredVideos.filter(video => {
                const last = video.metricsHistory[video.metricsHistory.length - 1];
                if (!last) return false;
                return historyFilters.every(f => {
                    const val =
                        f.field === 'currentViews' ? last.views :
                        f.field === 'currentLikes' ? last.likes :
                        f.field === 'currentComments' ? last.comments :
                        f.field === 'currentShares' ? last.shares : undefined;
                    if (typeof val !== 'number' || typeof f.value !== 'number') return false;
                    switch (f.operator) {
                        case '>': return val > f.value;
                        case '>=': return val >= f.value;
                        case '<': return val < f.value;
                        case '<=': return val <= f.value;
                        case '=':
                        case 'is': return val === f.value;
                        case '≠':
                        case 'is not': return val !== f.value;
                        default: return true;
                    }
                });
            });
        }
        // Apply sorting to the filtered videos based on the last value in the sliced history
        if (orderBy && orderBy.length > 0) {
            for (const sort of orderBy) {
                const field = Object.keys(sort)[0];
                const dir = sort[field];
                if (["currentViews","currentLikes","currentComments","currentShares"].includes(field)) {
                    filteredVideos = filteredVideos.sort((a, b) => {
                        const aLast = a.metricsHistory[a.metricsHistory.length - 1];
                        const bLast = b.metricsHistory[b.metricsHistory.length - 1];
                        const aVal = field === 'currentViews' ? aLast?.views : field === 'currentLikes' ? aLast?.likes : field === 'currentComments' ? aLast?.comments : aLast?.shares;
                        const bVal = field === 'currentViews' ? bLast?.views : field === 'currentLikes' ? bLast?.likes : field === 'currentComments' ? bLast?.comments : bLast?.shares;
                        if (aVal === undefined || bVal === undefined) return 0;
                        return dir === 'desc' ? bVal - aVal : aVal - bVal;
                    });
                }
            }
        }
        // Transform data for frontend
        const transformedVideos = filteredVideos.map((video) => {
            const hashtags = video.hashtags ? JSON.parse(video.hashtags) : [];
            const music = video.music ? JSON.parse(video.music) : null;
            const history = video.metricsHistory;
            let growth = { views: 0, likes: 0, comments: 0, shares: 0 };
            if (history.length >= 2) {
                const latest = history[history.length - 1];
                const previous = history[0];
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
                views: history.length > 0 ? history[history.length - 1].views : video.currentViews,
                likes: history.length > 0 ? history[history.length - 1].likes : video.currentLikes,
                comments: history.length > 0 ? history[history.length - 1].comments : video.currentComments,
                shares: history.length > 0 ? history[history.length - 1].shares : video.currentShares,
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
                }))
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