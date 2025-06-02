import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp, getIntervalForCadence } from '@/lib/timestamp-utils';

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
    const interval = getIntervalForCadence(video.scrapingCadence);
    const lastScraped = new Date(video.lastScrapedAt);
    const videoAgeInDays = (now.getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // For testing mode (every minute), always scrape
    if (video.scrapingCadence === 'testing') {
        return { shouldScrape: true, reason: 'Testing mode - always scrape' };
    }
    
    // All videos under 7 days old: scrape every hour
    if (videoAgeInDays < 7) {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastScrape >= 1) {
            return { shouldScrape: true, reason: `Video ${videoAgeInDays.toFixed(1)} days old - hourly tracking` };
        } else {
            return { shouldScrape: false, reason: `Recently scraped ${Math.floor(hoursSinceLastScrape * 60)} minutes ago` };
        }
    }
    
    // Videos 7+ days old with daily cadence: scrape once per day (24 hour spacing)
    if (video.scrapingCadence === 'daily') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastScrape >= 24) {
            return { shouldScrape: true, reason: `Daily video - ${Math.floor(hoursSinceLastScrape)} hours since last scrape` };
        } else {
            const hoursUntilNext = Math.ceil(24 - hoursSinceLastScrape);
            return { shouldScrape: false, reason: `Daily video - next scrape in ${hoursUntilNext}h` };
        }
    }
    
    // Videos 7+ days old with hourly cadence: scrape every hour (high-performance videos)
    if (video.scrapingCadence === 'hourly') {
        const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastScrape >= 1) {
            return { shouldScrape: true, reason: `High-performance video - hourly tracking` };
        } else {
            return { shouldScrape: false, reason: `Recently scraped ${Math.floor(hoursSinceLastScrape * 60)} minutes ago` };
        }
    }
    
    return { shouldScrape: true, reason: `Ready to scrape (${interval} interval)` };
}

// Calculate if video should change cadence based on performance and age
function evaluateCadenceChange(video: VideoRecord, newViews: number): { newCadence: string; reason: string } | null {
    const videoAgeInDays = (new Date().getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Videos under 7 days old always stay on hourly tracking
    if (videoAgeInDays < 7) {
        return null; // No cadence changes for new videos - always hourly first week
    }
    
    // For videos 7+ days old, calculate daily views from last known data point
    const dailyViews = video.lastDailyViews ? Math.max(0, newViews - video.lastDailyViews) : 0;
    
    // Threshold: 10,000 daily views
    const DAILY_VIEWS_THRESHOLD = 10000;
    
    // Switch from hourly to daily if views drop below threshold
    if (video.scrapingCadence === 'hourly' && dailyViews < DAILY_VIEWS_THRESHOLD) {
        return {
            newCadence: 'daily',
            reason: `Daily views dropped to ${dailyViews.toLocaleString()} < ${DAILY_VIEWS_THRESHOLD.toLocaleString()} → switching to daily tracking`
        };
    } 
    
    // Switch from daily to hourly if views exceed threshold
    if (video.scrapingCadence === 'daily' && dailyViews >= DAILY_VIEWS_THRESHOLD) {
        return {
            newCadence: 'hourly',
            reason: `Daily views spiked to ${dailyViews.toLocaleString()} ≥ ${DAILY_VIEWS_THRESHOLD.toLocaleString()} → switching to hourly tracking`
        };
    }
    
    return null; // No change needed
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

                    // Calculate daily views for cadence evaluation (views gained since last update)
                    let dailyViews: number | null = null;
                    
                    if (video.lastDailyViews !== null) {
                        dailyViews = Math.max(0, views - video.lastDailyViews);
                    }

                    // Evaluate cadence change based on user's 10k threshold logic
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
                            // Enable cadence changes with user's 10k logic
                            scrapingCadence: newCadence,
                            lastDailyViews: video.currentViews, // Store current views as baseline for next calculation
                            dailyViewsGrowth: dailyViews,
                            needsCadenceCheck: false,
                        }
                    });

                    // Add new metrics history entry
                    const videoInterval = getIntervalForCadence(video.scrapingCadence);
                    const normalizedTimestamp = getCurrentNormalizedTimestamp(videoInterval);
                    
                    // Check if we already have a metric entry at this normalized timestamp
                    const existingMetric = await prisma.metricsHistory.findFirst({
                        where: {
                            videoId: video.id,
                            timestamp: new Date(normalizedTimestamp)
                        }
                    });
                    
                    if (!existingMetric) {
                        await prisma.metricsHistory.create({
                            data: {
                                videoId: video.id,
                                views: views,
                                likes: mediaData.likes,
                                comments: mediaData.comments,
                                shares: shares,
                                timestamp: new Date(normalizedTimestamp)
                            }
                        });
                        console.log(`📊 [${i + index + 1}] Created new metrics entry at ${normalizedTimestamp} (${videoInterval} interval)`);
                    } else {
                        // Update existing entry with latest values
                        await prisma.metricsHistory.update({
                            where: { id: existingMetric.id },
                            data: {
                                views: views,
                                likes: mediaData.likes,
                                comments: mediaData.comments,
                                shares: shares,
                            }
                        });
                        console.log(`📊 [${i + index + 1}] Updated existing metrics entry at ${normalizedTimestamp} (${videoInterval} interval)`);
                    }

                    const viewsChange = views - video.currentViews;
                    const likesChange = mediaData.likes - video.currentLikes;
                    console.log(`✅ [${i + index + 1}] @${video.username} (${video.platform}, ${newCadence}): ${views.toLocaleString()} views (+${viewsChange.toLocaleString()}), ${mediaData.likes.toLocaleString()} likes (+${likesChange.toLocaleString()})${dailyViews !== null ? `, daily: +${dailyViews.toLocaleString()}` : ''}`);

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
    console.log(`⏰ Hourly scraping: Running at :00 minutes of each hour`);
    console.log(`📋 Strategy: First week = hourly, After week 1 = 10k daily views threshold`);
    console.log(`🔄 Dynamic switching: >10k daily views = hourly, <10k daily views = daily`);

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
            videos = rawVideos.map(video => {
                const ageInDays = (new Date().getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                return {
                    ...video,
                    scrapingCadence: ageInDays < 7 ? 'hourly' : 'hourly', // Default all to hourly, evaluation will adjust
                    lastDailyViews: null,
                    dailyViewsGrowth: null,
                    needsCadenceCheck: false,
                };
            });
            
        } catch (error) {
            console.error('💥 Error fetching videos:', error);
            throw error;
        }

        console.log(`📊 Found ${videos.length} active videos to evaluate`);
        
        // Log age distribution and strategy
        const newVideos = videos.filter(v => (new Date().getTime() - v.createdAt.getTime()) / (1000 * 60 * 60 * 24) < 7);
        const oldVideos = videos.filter(v => (new Date().getTime() - v.createdAt.getTime()) / (1000 * 60 * 60 * 24) >= 7);
        console.log(`📊 Age distribution: ${newVideos.length} videos <7 days (hourly), ${oldVideos.length} videos 7+ days (10k threshold)`);
        
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