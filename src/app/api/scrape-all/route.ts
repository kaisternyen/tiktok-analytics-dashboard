import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface VideoResult {
    status: 'success' | 'failed' | 'skipped';
    username: string;
    platform?: string;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    changes?: {
        views: number;
        likes: number;
        comments: number;
        shares: number;
    };
    error?: string;
    reason?: string;
    cadence?: string;
    action?: string;
}

interface ProcessingResult {
    results: VideoResult[];
    successful: number;
    failed: number;
    skipped: number;
    cadenceChanges: number;
}

interface VideoRecord {
    id: string;
    url: string;
    username: string;
    platform: string;
    currentViews: number;
    currentLikes: number;
    currentComments: number;
    currentShares: number;
    lastScrapedAt: Date;
    createdAt: Date;
    scrapingCadence: string;
    lastDailyViews: number | null;
    dailyViewsGrowth: number | null;
    needsCadenceCheck: boolean;
}

// Determine if video should be scraped based on standardized timing and cadence
function shouldScrapeVideo(video: VideoRecord): { shouldScrape: boolean; reason?: string } {
    const now = new Date();
    const videoAgeInDays = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const hoursSinceLastScrape = (now.getTime() - video.lastScrapedAt.getTime()) / (1000 * 60 * 60);
    
    // Always scrape if video is less than 7 days old (Week 1 rule)
    if (videoAgeInDays < 7) {
        if (hoursSinceLastScrape >= 1) {
            return { shouldScrape: true, reason: 'Week 1 - hourly tracking' };
        } else {
            return { shouldScrape: false, reason: `Week 1 - scraped ${Math.floor(hoursSinceLastScrape * 60)} min ago` };
        }
    }
    
    // For videos older than 7 days, use adaptive cadence
    if (video.scrapingCadence === 'hourly') {
        if (hoursSinceLastScrape >= 1) {
            return { shouldScrape: true, reason: 'Hourly cadence' };
        } else {
            return { shouldScrape: false, reason: `Hourly - scraped ${Math.floor(hoursSinceLastScrape * 60)} min ago` };
        }
    } else if (video.scrapingCadence === 'daily') {
        const hoursSinceLastScrape = (now.getTime() - video.lastScrapedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastScrape >= 24) {
            return { shouldScrape: true, reason: 'Daily cadence - 24hrs elapsed' };
        } else {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastScrape);
            return { shouldScrape: false, reason: `Daily - ${hoursRemaining}hrs remaining` };
        }
    }
    
    return { shouldScrape: false, reason: 'Unknown cadence' };
}

// Calculate if video should change cadence based on performance
function evaluateCadenceChange(video: VideoRecord, newViews: number): { newCadence: string; reason: string } | null {
    const videoAgeInDays = (new Date().getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Only evaluate cadence for videos older than 7 days
    if (videoAgeInDays < 7) {
        return null;
    }
    
    // Calculate daily growth
    const dailyGrowth = video.lastDailyViews ? newViews - video.lastDailyViews : 0;
    
    // Performance thresholds
    const HIGH_PERFORMANCE_THRESHOLD = 10000; // Views per day
    
    if (video.scrapingCadence === 'hourly' && dailyGrowth < HIGH_PERFORMANCE_THRESHOLD) {
        return {
            newCadence: 'daily',
            reason: `Low growth: ${dailyGrowth.toLocaleString()} views/day < ${HIGH_PERFORMANCE_THRESHOLD.toLocaleString()}`
        };
    } else if (video.scrapingCadence === 'daily' && dailyGrowth >= HIGH_PERFORMANCE_THRESHOLD) {
        return {
            newCadence: 'hourly',
            reason: `High growth detected: ${dailyGrowth.toLocaleString()} views/day >= ${HIGH_PERFORMANCE_THRESHOLD.toLocaleString()}`
        };
    }
    
    return null;
}

// Smart processing with standardized timing and adaptive frequency
async function processVideosSmartly(videos: VideoRecord[], maxPerRun: number = 15): Promise<ProcessingResult> {
    const results: VideoResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    let cadenceChanges = 0;

    console.log(`📊 Video cadence distribution:`);
    const hourlyCount = videos.filter(v => v.scrapingCadence === 'hourly').length;
    const dailyCount = videos.filter(v => v.scrapingCadence === 'daily').length;
    console.log(`   • Hourly: ${hourlyCount} videos`);
    console.log(`   • Daily: ${dailyCount} videos`);

    // Filter videos that need scraping
    const videosToProcess = videos.filter(video => {
        const { shouldScrape, reason } = shouldScrapeVideo(video);
        if (shouldScrape) {
            return true;
        } else {
            console.log(`⏭️ Skipping @${video.username} (${video.platform}): ${reason}`);
            results.push({
                status: 'skipped',
                username: video.username,
                platform: video.platform,
                cadence: video.scrapingCadence,
                reason: reason
            });
            skipped++;
            return false;
        }
    });

    if (videosToProcess.length === 0) {
        console.log(`⚠️ No videos need scraping at this time`);
        return { results, successful, failed, skipped, cadenceChanges };
    }

    // Limit processing to avoid timeouts
    const limitedVideos = videosToProcess.slice(0, maxPerRun);
    console.log(`🎯 Processing ${limitedVideos.length}/${videosToProcess.length} videos (max ${maxPerRun} per run)`);

    // Process in smaller batches
    const batchSize = 3;
    console.log(`🚀 Starting batch processing with batch size: ${batchSize}`);

    for (let i = 0; i < limitedVideos.length; i += batchSize) {
        const batch = limitedVideos.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(limitedVideos.length / batchSize);

        console.log(`📦 ===== BATCH ${batchNum}/${totalBatches} =====`);
        console.log(`🎬 Processing: ${batch.map(v => `@${v.username} (${v.platform}, ${v.scrapingCadence})`).join(', ')}`);

        // Process batch in parallel
        const batchPromises = batch.map(async (video, index) => {
            try {
                console.log(`🎬 [${i + index + 1}/${limitedVideos.length}] Starting @${video.username} (${video.platform}, ${video.scrapingCadence})...`);

                const result = await scrapeMediaPost(video.url);

                if (result.success && result.data) {
                    const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
                    
                    // Get views based on platform
                    let views = 0;
                    let shares = 0;
                    
                    if (video.platform === 'instagram') {
                        const instaData = mediaData as InstagramPostData;
                        views = instaData.plays || instaData.views || 0;
                        shares = 0; // Instagram doesn't track shares
                    } else if (video.platform === 'youtube') {
                        const youtubeData = mediaData as YouTubeVideoData;
                        views = youtubeData.views || 0;
                        shares = 0; // YouTube doesn't track shares in our API
                    } else {
                        const tiktokData = mediaData as TikTokVideoData;
                        views = tiktokData.views || 0;
                        shares = tiktokData.shares || 0;
                    }

                    // Calculate daily growth for cadence evaluation
                    let dailyGrowth: number | null = null;
                    
                    if (video.lastDailyViews !== null) {
                        dailyGrowth = views - video.lastDailyViews;
                    }

                    // Evaluate cadence change
                    const cadenceEvaluation = evaluateCadenceChange(video, views);
                    let newCadence = video.scrapingCadence;
                    let cadenceAction = '';
                    
                    if (cadenceEvaluation) {
                        newCadence = cadenceEvaluation.newCadence;
                        cadenceAction = `Changed from ${video.scrapingCadence} to ${newCadence}: ${cadenceEvaluation.reason}`;
                        cadenceChanges++;
                        console.log(`🔄 @${video.username}: ${cadenceAction}`);
                    }

                    // Update video metrics and cadence
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            currentViews: views,
                            currentLikes: mediaData.likes,
                            currentComments: mediaData.comments,
                            currentShares: shares,
                            lastScrapedAt: new Date(),
                            // TODO: Uncomment after migration
                            // scrapingCadence: newCadence,
                            // lastDailyViews: video.currentViews,
                            // dailyViewsGrowth: dailyGrowth,
                            // needsCadenceCheck: false,
                        }
                    });

                    // Add new metrics history entry
                    await prisma.metricsHistory.create({
                        data: {
                            videoId: video.id,
                            views: views,
                            likes: mediaData.likes,
                            comments: mediaData.comments,
                            shares: shares,
                        }
                    });

                    const viewsChange = views - video.currentViews;
                    const likesChange = mediaData.likes - video.currentLikes;
                    console.log(`✅ [${i + index + 1}] @${video.username} (${video.platform}, ${newCadence}): ${views.toLocaleString()} views (+${viewsChange.toLocaleString()}), ${mediaData.likes.toLocaleString()} likes (+${likesChange.toLocaleString()})${dailyGrowth !== null ? `, daily: +${dailyGrowth.toLocaleString()}` : ''}`);

                    return {
                        status: 'success' as const,
                        username: video.username,
                        platform: video.platform,
                        views: views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: shares,
                        cadence: newCadence,
                        action: cadenceAction || `Scraped (${newCadence})`,
                        changes: {
                            views: viewsChange,
                            likes: likesChange,
                            comments: mediaData.comments - video.currentComments,
                            shares: shares - video.currentShares,
                        }
                    };
                } else {
                    console.log(`❌ [${i + index + 1}] @${video.username} (${video.platform}) failed: ${result.error}`);
                    return {
                        status: 'failed' as const,
                        username: video.username,
                        platform: video.platform,
                        cadence: video.scrapingCadence,
                        error: result.error || 'Unknown error'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`💥 [${i + index + 1}] @${video.username} (${video.platform}) crashed: ${errorMessage}`);
                return {
                    status: 'failed' as const,
                    username: video.username,
                    platform: video.platform,
                    cadence: video.scrapingCadence,
                    error: errorMessage
                };
            }
        });

        // Wait for batch to complete
        console.log(`⏳ Waiting for batch ${batchNum} to complete...`);
        const batchResults = await Promise.all(batchPromises);

        // Count results
        batchResults.forEach(result => {
            results.push(result);
            if (result.status === 'success') successful++;
            else if (result.status === 'failed') failed++;
        });

        const batchSuccess = batchResults.filter(r => r.status === 'success').length;
        const batchFailed = batchResults.filter(r => r.status === 'failed').length;
        console.log(`📊 Batch ${batchNum} complete: ${batchSuccess} success, ${batchFailed} failed`);

        // Rate limiting: wait 1 second between batches
        if (i + batchSize < limitedVideos.length) {
            console.log(`⏱️ Rate limiting: waiting 1 second before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return { results, successful, failed, skipped, cadenceChanges };
}

export async function GET() {
    const startTime = Date.now();
    console.log(`🚀 ===== CRON JOB STARTED (${new Date().toISOString()}) =====`);
    console.log(`⏰ Standardized timing: Running at minute :00`);

    try {
        // Fetch all active videos (with backward compatibility for missing cadence fields)
        console.log('📋 Fetching active videos from database...');
        
        let videos: VideoRecord[] = [];
        
        try {
            // Try to fetch with new cadence fields
            const rawVideos = await prisma.video.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    url: true,
                    username: true,
                    platform: true,
                    currentViews: true,
                    currentLikes: true,
                    currentComments: true,
                    currentShares: true,
                    lastScrapedAt: true,
                    createdAt: true,
                }
            });

            // Add default cadence values for backward compatibility
            videos = rawVideos.map(video => ({
                ...video,
                scrapingCadence: 'hourly', // Default all to hourly until migration
                lastDailyViews: null,
                dailyViewsGrowth: null,
                needsCadenceCheck: false,
            }));
            
        } catch (error) {
            console.error('💥 Error fetching videos:', error);
            throw error;
        }

        console.log(`📊 Found ${videos.length} active videos to evaluate`);
        
        if (videos.length === 0) {
            console.log('⚠️ No videos found in database');
            return NextResponse.json({
                success: true,
                message: 'No videos to process',
                status: {
                    totalVideos: 0,
                    processed: 0,
                    successful: 0,
                    failed: 0,
                    skipped: 0,
                    cadenceChanges: 0,
                    duration: Date.now() - startTime
                }
            });
        }

        // Process videos with smart cadence management
        const result = await processVideosSmartly(videos);

        const duration = Date.now() - startTime;
        console.log(`🏁 ===== CRON JOB COMPLETED =====`);
        console.log(`📊 Results: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped, ${result.cadenceChanges} cadence changes`);
        console.log(`⏱️ Duration: ${duration}ms`);

        // Build status summary
        const status = {
            totalVideos: videos.length,
            processed: result.successful + result.failed,
            successful: result.successful,
            failed: result.failed,
            skipped: result.skipped,
            cadenceChanges: result.cadenceChanges,
            duration,
            hourlyVideos: videos.filter(v => v.scrapingCadence === 'hourly').length,
            dailyVideos: videos.filter(v => v.scrapingCadence === 'daily').length,
        };

        return NextResponse.json({
            success: true,
            message: `Processed ${result.successful}/${videos.length} videos successfully with ${result.cadenceChanges} cadence changes`,
            status,
            results: result.results.slice(0, 10) // Limit results in response
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 CRON JOB CRASHED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            status: {
                duration,
                crashed: true
            }
        }, { status: 500 });
    }
}

// Keep POST endpoint for manual triggers
export async function POST() {
    console.log('🔧 Manual cron trigger requested');
    return GET();
} 