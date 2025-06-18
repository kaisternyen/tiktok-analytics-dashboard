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
        // Don't apply sorting to database query if timeframe filter is present
        // We'll sort after calculating delta values
        const shouldApplyDBSorting = !timeframe;
        const orderBy = shouldApplyDBSorting ? (parseSorts(decodedSortParam) || [{ createdAt: 'desc' as const }]) : [{ createdAt: 'desc' as const }];
        console.log('📋 Fetching videos from database with:', { where, orderBy, shouldApplyDBSorting });
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
        let filteredVideos = videos;
        if (timeframe) {
            const [start, end] = timeframe;
            filteredVideos = videos.map((video) => {
                const filteredHistory = video.metricsHistory.map((h) => ({
                  timestamp: h.timestamp,
                  views: h.views,
                  likes: h.likes,
                  comments: h.comments,
                  shares: h.shares
                })).filter((h) => {
                    const t = new Date(h.timestamp).getTime();
                    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
                });
                return { ...video, metricsHistory: filteredHistory } as typeof video;
            }).filter((video) => video.metricsHistory.length > 0);
        }

        // Transform data for frontend
        const transformedVideos = filteredVideos.map((video) => {
            // Parse JSON fields
            const hashtags = video.hashtags ? JSON.parse(video.hashtags) : [];
            const music = video.music ? JSON.parse(video.music) : null;

            // Calculate growth from last 2 data points (in filtered history)
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

            // If timeframe filter is present, calculate delta values
            let views = video.currentViews;
            let likes = video.currentLikes;
            let comments = video.currentComments;
            let shares = video.currentShares;

            if (timeframe && history.length >= 2) {
                // Sort history by timestamp (oldest first)
                const sortedHistory = [...history].sort((a, b) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                const start = sortedHistory[0];
                const end = sortedHistory[sortedHistory.length - 1];
                
                // Calculate deltas
                views = end.views - start.views;
                likes = end.likes - start.likes;
                comments = end.comments - start.comments;
                shares = end.shares - start.shares;
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
                views,
                likes,
                comments,
                shares,
                hashtags,
                music,
                platform: video.platform || 'tiktok',
                scrapingCadence: video.scrapingCadence || 'hourly',
                growth,
                history: history.map((h) => ({
                    time: h.timestamp.toISOString(),
                    views: h.views,
                    likes: h.likes,
                    comments: h.comments,
                    shares: h.shares
                })).reverse() // Oldest first for charts
            };
        });

        // Apply sorting after transformation if timeframe filter is present
        let finalVideos = transformedVideos;
        if (timeframe && decodedSortParam) {
            const sorts = parseSorts(decodedSortParam);
            if (sorts && sorts.length > 0) {
                console.log('🔄 Applying post-transformation sorting for timeframe filter:', sorts);
                finalVideos = [...transformedVideos].sort((a, b) => {
                    for (const sort of sorts) {
                        const [field, order] = Object.entries(sort)[0];
                        let aValue: string | number, bValue: string | number;
                        
                        // Map database fields to transformed fields
                        switch (field) {
                            case 'currentViews':
                                aValue = a.views;
                                bValue = b.views;
                                break;
                            case 'currentLikes':
                                aValue = a.likes;
                                bValue = b.likes;
                                break;
                            case 'currentComments':
                                aValue = a.comments;
                                bValue = b.comments;
                                break;
                            case 'currentShares':
                                aValue = a.shares;
                                bValue = b.shares;
                                break;
                            case 'username':
                                aValue = a.username.toLowerCase();
                                bValue = b.username.toLowerCase();
                                break;
                            case 'createdAt':
                                aValue = new Date(a.posted).getTime();
                                bValue = new Date(b.posted).getTime();
                                break;
                            case 'lastScrapedAt':
                                aValue = new Date(a.lastUpdate).getTime();
                                bValue = new Date(b.lastUpdate).getTime();
                                break;
                            default:
                                aValue = (a as Record<string, unknown>)[field] as string | number;
                                bValue = (b as Record<string, unknown>)[field] as string | number;
                        }
                        
                        if (aValue < bValue) return order === 'asc' ? -1 : 1;
                        if (aValue > bValue) return order === 'asc' ? 1 : -1;
                    }
                    return 0;
                });
            }
        } else if (!timeframe && decodedSortParam) {
            console.log('📊 Using database-level sorting (no timeframe filter)');
        } else if (timeframe && !decodedSortParam) {
            console.log('📊 No sorting applied (timeframe filter present but no sort)');
        } else {
            console.log('📊 Using default sorting (no filters or sorts)');
        }

        return NextResponse.json({
            success: true,
            videos: finalVideos
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