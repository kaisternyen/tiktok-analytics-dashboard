import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Type definitions for video with includes
type VideoWithIncludes = {
    id: string;
    url: string;
    videoId: string | null;
    username: string;
    description: string;
    thumbnailUrl: string | null;
    currentViews: number;
    currentLikes: number;
    currentComments: number;
    currentShares: number;
    hashtags: string | null;
    music: string | null;
    isActive: boolean;
    createdAt: Date;
    lastScrapedAt: Date;
    postedAt: Date | null;
    platform: string;
    lastDailyViews: number | null;
    scrapingCadence: string;
    dailyViewsGrowth: number | null;
    needsCadenceCheck: boolean;
    lastModeChange: Date | null;
    trackingMode: string | null;
    phase1Notified: boolean;
    phase2Notified: boolean;
    currentPhase: string;
    lastModeratedAt: Date | null;
    moderatedBy: string | null;
    threadsPlanted: number;
    gotTopComment: boolean;
    totalCommentsModerated: number;
    threadsPlantedNote: string | null;
    hasBeenNotifiedViral: boolean;
    metricsHistory: Array<{
        id: string;
        videoId: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        timestamp: Date;
    }>;
    videoTags: Array<{
        id: string;
        videoId: string;
        tagId: string;
        tag: {
            id: string;
            name: string;
            color: string | null;
            description: string | null;
            createdAt: Date;
        };
    }>;
};

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
        
        // Add performance indexes
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_isActive ON videos("isActive")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_platform ON videos("platform")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_username ON videos("username")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_currentViews ON videos("currentViews")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_createdAt ON videos("createdAt")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_videos_lastScrapedAt ON videos("lastScrapedAt")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON "MetricsHistory"("timestamp")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_metrics_videoId_timestamp ON "MetricsHistory"("videoId", "timestamp")`;;

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
  'username', 'description', 'status', 'platform', 'currentViews', 'currentLikes', 'currentComments', 'currentShares', 'createdAt', 'lastScrapedAt', 'scrapingCadence', 'currentPhase', 'tags'
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
            
            // Special handling for tag filtering
            if (field === 'tags') {
                let tagCondition: Record<string, unknown> = {};
                if (op === 'contains' || op === 'is') {
                    // Filter videos that have a specific tag
                    tagCondition = {
                        videoTags: {
                            some: {
                                tag: {
                                    name: { equals: value, mode: 'insensitive' }
                                }
                            }
                        }
                    };
                } else if (op === 'does not contain' || op === 'is not') {
                    // Filter videos that don't have a specific tag
                    tagCondition = {
                        NOT: {
                            videoTags: {
                                some: {
                                    tag: {
                                        name: { equals: value, mode: 'insensitive' }
                                    }
                                }
                            }
                        }
                    };
                }
                (where[operator] as Array<Record<string, unknown>>).push(tagCondition);
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
        let hasTimeframeFilter = false;
        
        if (decodedFilterParam) {
            const parsed = JSON.parse(decodedFilterParam);
            // Extract timeframe filter if present
            if (parsed && parsed.conditions) {
                const tf = parsed.conditions.find((f: FilterCondition) => f.field === 'timeframe');
                if (tf && Array.isArray(tf.value) && tf.value.length === 2 && tf.value[0] && tf.value[1]) {
                    timeframe = [tf.value[0], tf.value[1]];
                    hasTimeframeFilter = true;
                    // Remove timeframe from conditions before passing to parseFilters
                    parsed.conditions = parsed.conditions.filter((f: FilterCondition) => f.field !== 'timeframe');
                    filterParamToParse = JSON.stringify(parsed);
                }
            }
            // Only apply database-level filtering if there's no timeframe filter
            // When timeframe is present, we'll apply filtering after calculating deltas
            if (!hasTimeframeFilter) {
                const parsedFilters = parseFilters(filterParamToParse);
                console.log('PARSED filters:', JSON.stringify(parsedFilters, null, 2));
                if (parsedFilters) where = { 
                    ...parsedFilters, 
                    isActive: true
                };
            } else {
                // Only filter by isActive in DB, all other filters after delta calculation
                where = { 
                    isActive: true
                };
                console.log('⏰ Timeframe filter detected - will apply other filters after delta calculation');
            }
        }
        console.log('FINAL where clause:', JSON.stringify(where, null, 2));
        // Don't apply sorting to database query if timeframe filter is present
        // We'll sort after calculating delta values
        const shouldApplyDBSorting = !timeframe;
        const orderBy = shouldApplyDBSorting ? (parseSorts(decodedSortParam) || [{ createdAt: 'desc' as const }]) : [{ createdAt: 'desc' as const }];
        console.log('📋 Fetching videos from database with:', JSON.stringify({ where, orderBy, shouldApplyDBSorting }, null, 2));
        const videos = await prisma.video.findMany({
            where,
            include: {
                metricsHistory: timeframe ? {
                    where: {
                        timestamp: {
                            gte: new Date(timeframe[0]),
                            lte: new Date(timeframe[1])
                        }
                    },
                    orderBy: { timestamp: 'desc' }
                } : {
                    orderBy: { timestamp: 'desc' },
                    take: 10 // Limit history to last 10 entries when no timeframe
                },
                videoTags: {
                    include: {
                        tag: true
                    }
                } as any // eslint-disable-line @typescript-eslint/no-explicit-any
            },
            orderBy
        }) as VideoWithIncludes[];

        console.log(`✅ Found ${videos.length} videos in database`);
        
        // Removed verbose logging to prevent console spam every 30 seconds

        // If timeframe filter is present, filter metricsHistory and videos accordingly
        let filteredVideos = videos;
        if (timeframe) {
            const [start, end] = timeframe;
            filteredVideos = videos.map((video) => {
                const filteredHistory = video.metricsHistory.filter((h) => {
                    const t = new Date(h.timestamp).getTime();
                    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
                });
                return { ...video, metricsHistory: filteredHistory };
            }).filter((video) => video.metricsHistory.length > 0);
        }

        // Transform data for frontend
        let transformedVideos;
        try {
            console.log(`🔄 Starting transformation of ${filteredVideos.length} videos`);
            transformedVideos = filteredVideos.map((video) => {
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

                // Calculate period-specific deltas and total views
                let periodViews = 0;
                let periodLikes = 0;
                let periodComments = 0;
                let periodShares = 0;

                // Total views are always the current values
                const totalViews = video.currentViews;
                const totalLikes = video.currentLikes;
                const totalComments = video.currentComments;
                const totalShares = video.currentShares;

                if (timeframe) {
                    if (history.length >= 2) {
                        // Sort history by timestamp (oldest first)
                        const sortedHistory = [...history].sort((a, b) => 
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );
                        const start = sortedHistory[0];
                        const end = sortedHistory[sortedHistory.length - 1];
                        // Calculate deltas for the specified timeframe
                        periodViews = end.views - start.views;
                        periodLikes = end.likes - start.likes;
                        periodComments = end.comments - start.comments;
                        periodShares = end.shares - start.shares;
                        
                // Removed debug logging for performance
                    } else {
                        // Not enough data points in timeframe, use 0 for period deltas
                        periodViews = 0;
                        periodLikes = 0;
                        periodComments = 0;
                        periodShares = 0;
                        
                        // Removed debug logging for performance
                    }
                } else {
                    // No timeframe, period values same as totals for backward compatibility
                    periodViews = totalViews;
                    periodLikes = totalLikes;
                    periodComments = totalComments;
                    periodShares = totalShares;
                    
                // Removed debug logging for performance
                }

                // Calculate new comments since last moderation
                let newCommentsCount = 0;
                let commentsAtLastModeration = 0;
                
                if (video.lastModeratedAt) {
                    // Find the comment count closest to when it was last moderated
                    const moderatedTime = new Date(video.lastModeratedAt).getTime();
                    const historicalPoint = history.find((h) => 
                        new Date(h.timestamp).getTime() <= moderatedTime
                    );
                    
                    if (historicalPoint) {
                        commentsAtLastModeration = historicalPoint.comments;
                        newCommentsCount = Math.max(0, totalComments - commentsAtLastModeration);
                    } else {
                        // If no historical data at moderation time, assume all current comments are new
                        newCommentsCount = totalComments;
                    }
                } else {
                    // Never moderated - all comments are "new"
                    newCommentsCount = totalComments;
                }

                const transformedVideo = {
                    id: video.id,
                    url: video.url,
                    username: video.username,
                    description: video.description,
                    thumbnailUrl: video.thumbnailUrl,
                    posted: video.createdAt.toISOString(),
                    lastUpdate: video.lastScrapedAt.toISOString(),
                    status: video.isActive ? 'Active' : 'Paused',
                    // Period-specific values (for filtered timeframes)
                    views: periodViews,
                    likes: periodLikes,
                    comments: periodComments,
                    shares: periodShares,
                    // Total values (always current totals)
                    totalViews,
                    totalLikes,
                    totalComments,
                    totalShares,
                    hashtags,
                    music,
                    platform: video.platform || 'tiktok',
                    scrapingCadence: video.scrapingCadence || 'hourly',
                    growth,
                    // Tags
                    tags: video.videoTags.map((vt) => ({
                        id: vt.tag.id,
                        name: vt.tag.name,
                        color: vt.tag.color,
                        description: vt.tag.description
                    })),
                    // Moderation fields
                    lastModeratedAt: video.lastModeratedAt ? video.lastModeratedAt.toISOString() : null,
                    moderatedBy: video.moderatedBy || null,
                    threadsPlanted: video.threadsPlanted || 0,
                    gotTopComment: video.gotTopComment || false,
                    totalCommentsModerated: video.totalCommentsModerated || 0,
                    newCommentsCount,
                    commentsAtLastModeration,
                    threadsPlantedNote: video.threadsPlantedNote || '',
                    phase1Notified: video.phase1Notified || false,
                    phase2Notified: video.phase2Notified || false,
                    currentPhase: video.currentPhase || 'PHS 0',
                    history: history.map((h) => ({
                        time: h.timestamp.toISOString(),
                        views: h.views,
                        likes: h.likes,
                        comments: h.comments,
                        shares: h.shares
                    })).reverse() // Oldest first for charts
                };
                
                // Removed debug logging for performance
                
                return transformedVideo;
            });
            
            // Simplified logging to prevent performance issues
            console.log(`✅ Transformed ${transformedVideos.length} videos for frontend`);
            
            console.log('Videos after delta transformation:', transformedVideos.length, transformedVideos.map(v => ({ username: v.username, views: v.views })));
        } catch (err) {
            console.error('Error during delta transformation:', err);
            throw err;
        }

        // Apply sorting after transformation if timeframe filter is present
        let finalVideos = transformedVideos;
        
        // Apply filtering after delta calculation if timeframe filter is present
        if (hasTimeframeFilter && decodedFilterParam) {
            const parsed = JSON.parse(decodedFilterParam);
            if (parsed && parsed.conditions) {
                const nonTimeframeConditions = parsed.conditions.filter((f: FilterCondition) => f.field !== 'timeframe');
                if (nonTimeframeConditions.length > 0) {
                    try {
                        console.log('🔍 Applying post-transformation filtering for timeframe:', nonTimeframeConditions);
                        finalVideos = finalVideos.filter((video) => {
                            return nonTimeframeConditions.every((condition: FilterCondition) => {
                                const { field, operator, value } = condition;
                                let videoValue: string | number;
                                // Map database fields to transformed fields
                                switch (field) {
                                    case 'currentViews':
                                        videoValue = video.views; // Period views for filtering
                                        break;
                                    case 'currentLikes':
                                        videoValue = video.likes; // Period likes for filtering
                                        break;
                                    case 'currentComments':
                                        videoValue = video.comments; // Period comments for filtering
                                        break;
                                    case 'currentShares':
                                        videoValue = video.shares; // Period shares for filtering
                                        break;
                                    case 'username':
                                        videoValue = video.username.toLowerCase();
                                        break;
                                    case 'description':
                                        videoValue = video.description.toLowerCase();
                                        break;
                                    case 'status':
                                        videoValue = video.status.toLowerCase();
                                        break;
                                    case 'platform':
                                        videoValue = video.platform.toLowerCase();
                                        break;
                                    case 'scrapingCadence':
                                        videoValue = video.scrapingCadence.toLowerCase();
                                        break;
                                    case 'tags':
                                        // Special handling for tags in post-transformation filtering
                                        const tagNames = (video as { tags: { name: string }[] }).tags.map(t => t.name.toLowerCase());
                                        const searchTag = String(value || '').toLowerCase();
                                        switch (operator) {
                                            case 'contains':
                                            case 'is':
                                                return tagNames.includes(searchTag);
                                            case 'does not contain':
                                            case 'is not':
                                                return !tagNames.includes(searchTag);
                                            default:
                                                return true;
                                        }
                                    default:
                                        videoValue = (video as Record<string, unknown>)[field] as string | number;
                                }
                                const filterValue = typeof value === 'string' ? value.toLowerCase() : value;
                                switch (operator) {
                                    case '=':
                                    case 'is':
                                        return videoValue === filterValue;
                                    case '≠':
                                    case 'is not':
                                        return videoValue !== filterValue;
                                    case '<':
                                        return videoValue < (filterValue ?? 0);
                                    case '≤':
                                        return videoValue <= (filterValue ?? 0);
                                    case '>':
                                        return videoValue > (filterValue ?? 0);
                                    case '≥':
                                        return videoValue >= (filterValue ?? 0);
                                    case 'contains':
                                        return String(videoValue).includes(String(filterValue || ''));
                                    case 'does not contain':
                                        return !String(videoValue).includes(String(filterValue || ''));
                                    default:
                                        return true;
                                }
                            });
                        });
                        console.log('Videos after delta filtering:', finalVideos.length, finalVideos.map(v => ({ username: v.username, views: v.views })));
                    } catch (err) {
                        console.error('Error during delta filtering:', err);
                        throw err;
                    }
                }
            }
        }
        
        if (timeframe && decodedSortParam) {
            console.log('🔄 Applying post-transformation sorting for timeframe filter:', decodedSortParam);
            finalVideos = [...finalVideos].sort((a, b) => {
                const sorts = parseSorts(decodedSortParam);
                if (sorts && sorts.length > 0) {
                    for (const sort of sorts) {
                        const [field, order] = Object.entries(sort)[0];
                        let aValue: string | number, bValue: string | number;
                        
                        // Map database fields to transformed fields
                        switch (field) {
                            case 'currentViews':
                                aValue = a.views; // Period views for sorting
                                bValue = b.views;
                                break;
                            case 'currentLikes':
                                aValue = a.likes; // Period likes for sorting
                                bValue = b.likes;
                                break;
                            case 'currentComments':
                                aValue = a.comments; // Period comments for sorting
                                bValue = b.comments;
                                break;
                            case 'currentShares':
                                aValue = a.shares; // Period shares for sorting
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
                }
                return 0;
            });
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