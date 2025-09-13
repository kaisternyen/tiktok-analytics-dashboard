import { NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp, normalizeTimestamp, TimestampInterval } from '@/lib/timestamp-utils';
import { checkViralThresholds, notifyViralVideo, sendDiscordNotification } from '@/lib/discord-notifications';
import { sanitizeMetrics, logSanitizationWarnings } from '@/lib/metrics-validation';
import { getPhaseNotificationMessage, determineFinalPhaseAndNotifications } from '@/lib/phase-tracking';

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
    trackingMode: string | null;
    currentPhase: string;
    phase1Notified: boolean;
    phase2Notified: boolean;
}

// Determine if video should be scraped based on standardized timing and cadence
function shouldScrapeVideo(video: VideoRecord): { shouldScrape: boolean; reason?: string } {
    // Skip deleted videos entirely
    if (video.trackingMode === 'deleted') {
        console.log(`🗑️ CRON DEBUG: @${video.username} (${video.platform}) - SKIPPED: Video marked as deleted/unavailable`);
        return { shouldScrape: false, reason: 'Video marked as deleted/unavailable' };
    }
    
    const now = new Date();
    const lastScraped = new Date(video.lastScrapedAt);
    
    console.log(`🔍 CRON DEBUG: @${video.username} (${video.platform}) - Cadence: ${video.scrapingCadence}, Last scraped: ${lastScraped.toISOString()}`);
    
    // For testing mode (every minute), check if we're at a new normalized minute
    if (video.scrapingCadence === 'testing') {
        const currentNormalizedTime = getCurrentNormalizedTimestamp('minute');
        const lastScrapedNormalizedTime = normalizeTimestamp(lastScraped, 'minute');
        
        if (currentNormalizedTime !== lastScrapedNormalizedTime) {
            return { shouldScrape: true, reason: 'Testing mode - new minute boundary' };
        } else {
            return { shouldScrape: false, reason: 'Testing mode - same minute boundary' };
        }
    }
    
    // Remove conflicting "under 7 days" rule - let cadence-based logic handle all videos
    
    // PROPER CADENCE LOGIC: Respect cadence but eliminate pending confusion
    const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);
    const minutesSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60);
    
    // Videos with hourly cadence: scrape every hour (with 5-minute safety net)
    if (video.scrapingCadence === 'hourly') {
        if (hoursSinceLastScrape >= 1) {
            console.log(`✅ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Hourly video - ${Math.floor(hoursSinceLastScrape)}h since last scrape`);
            return { shouldScrape: true, reason: `Hourly video - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else if (minutesSinceLastScrape >= 65) { // Safety net: if missed by 5+ minutes
            console.log(`⚠️ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Hourly video - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)`);
            return { shouldScrape: true, reason: `Hourly video - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)` };
        } else {
            const minutesRemaining = Math.ceil(60 - minutesSinceLastScrape);
            console.log(`⏭️ CRON DEBUG: @${video.username} (${video.platform}) - SKIP: Hourly video - scraped ${Math.floor(minutesSinceLastScrape)}min ago, wait ${minutesRemaining}min more`);
            return { shouldScrape: false, reason: `Hourly video - scraped ${Math.floor(minutesSinceLastScrape)}min ago, wait ${minutesRemaining}min more` };
        }
    }
    
    // Videos with daily cadence: scrape once per day (with 5-minute safety net)
    if (video.scrapingCadence === 'daily') {
        if (hoursSinceLastScrape >= 24) {
            console.log(`✅ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Daily video - ${Math.floor(hoursSinceLastScrape)}h since last scrape`);
            return { shouldScrape: true, reason: `Daily video - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
        } else if (minutesSinceLastScrape >= 1445) { // Safety net: if missed by 5+ minutes (24h 5min)
            console.log(`⚠️ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Daily video - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)`);
            return { shouldScrape: true, reason: `Daily video - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)` };
        } else {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastScrape);
            console.log(`⏭️ CRON DEBUG: @${video.username} (${video.platform}) - SKIP: Daily video - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more`);
            return { shouldScrape: false, reason: `Daily video - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
        }
    }
    
    // Handle unknown/null cadence - treat as daily
    if (hoursSinceLastScrape >= 24) {
        console.log(`✅ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Unknown cadence (treated as daily) - ${Math.floor(hoursSinceLastScrape)}h since last scrape`);
        return { shouldScrape: true, reason: `Unknown cadence (treated as daily) - ${Math.floor(hoursSinceLastScrape)}h since last scrape` };
    } else if (minutesSinceLastScrape >= 1445) { // Safety net: if missed by 5+ minutes
        console.log(`⚠️ CRON DEBUG: @${video.username} (${video.platform}) - SCRAPE: Unknown cadence (treated as daily) - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)`);
        return { shouldScrape: true, reason: `Unknown cadence (treated as daily) - missed scrape (${Math.floor(minutesSinceLastScrape)}min ago)` };
    } else {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastScrape);
        console.log(`⏭️ CRON DEBUG: @${video.username} (${video.platform}) - SKIP: Unknown cadence (treated as daily) - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more`);
        return { shouldScrape: false, reason: `Unknown cadence (treated as daily) - scraped ${Math.floor(hoursSinceLastScrape)}h ago, wait ${hoursRemaining}h more` };
    }
}

// Calculate if video should change cadence based on performance and age
async function evaluateCadenceChange(video: VideoRecord, newViews: number): Promise<{ newCadence: string; reason: string } | null> {
    const videoAgeInDays = (new Date().getTime() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    console.log(`📊 @${video.username}: Age ${videoAgeInDays.toFixed(1)} days, Current cadence: ${video.scrapingCadence}, Views: ${newViews.toLocaleString()}`);
    
    // RULE 1: Videos under 24 hours old - always stay hourly (high growth potential)
    if (videoAgeInDays < 1) {
        return null; // Keep new videos on hourly
    }
    
    // RULE 2: Videos 1-7 days old - switch to daily if under 1,000 total views
    if (videoAgeInDays >= 1 && videoAgeInDays < 7) {
        if (video.scrapingCadence === 'hourly' && newViews < 1000) {
            return {
                newCadence: 'daily',
                reason: `Age ${videoAgeInDays.toFixed(1)} days, Views ${newViews.toLocaleString()} < 1,000 → switching to daily (save API calls)`
            };
        }
        
        // Switch back to hourly if it starts performing well
        if (video.scrapingCadence === 'daily' && newViews >= 1000) {
            return {
                newCadence: 'hourly',
                reason: `Age ${videoAgeInDays.toFixed(1)} days, Views ${newViews.toLocaleString()} ≥ 1,000 → switching back to hourly`
            };
        }
        
        return null; // No change needed
    }
    
    // RULE 3: Videos 7+ days old - switch to daily if under 5,000 total views OR low daily growth
    if (videoAgeInDays >= 7) {
        // Simple threshold: if total views are low, switch to daily
        if (video.scrapingCadence === 'hourly' && newViews < 5000) {
            return {
                newCadence: 'daily',
                reason: `Age ${videoAgeInDays.toFixed(1)} days, Views ${newViews.toLocaleString()} < 5,000 → switching to daily (old + low views)`
            };
        }
        
        // Additional check: calculate daily growth for high-view videos
        if (video.scrapingCadence === 'hourly' && newViews >= 5000) {
            try {
                // Look for metrics from 24 hours ago
                const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
                const historicalMetric = await prisma.metricsHistory.findFirst({
                    where: {
                        videoId: video.id,
                        timestamp: {
                            gte: new Date(twentyFourHoursAgo.getTime() - (2 * 60 * 60 * 1000)), // 2 hour buffer
                            lte: new Date(twentyFourHoursAgo.getTime() + (2 * 60 * 60 * 1000))  // 2 hour buffer
                        }
                    },
                    orderBy: { timestamp: 'desc' }
                });
                
                if (historicalMetric) {
                    const dailyGrowth = Math.max(0, newViews - historicalMetric.views);
                    
                    // If daily growth is less than 1,000 views, switch to daily
                    if (dailyGrowth < 1000) {
                        return {
                            newCadence: 'daily',
                            reason: `Age ${videoAgeInDays.toFixed(1)} days, Daily growth ${dailyGrowth.toLocaleString()} < 1,000 → switching to daily (low growth)`
                        };
                    }
                    
                    console.log(`📊 @${video.username}: Daily growth ${dailyGrowth.toLocaleString()} - staying hourly`);
                }
            } catch (error) {
                console.error(`❌ Error checking daily growth for @${video.username}:`, error);
            }
        }
        
        // Switch back to hourly if daily video starts performing well
        if (video.scrapingCadence === 'daily' && newViews >= 10000) {
            return {
                newCadence: 'hourly',
                reason: `Age ${videoAgeInDays.toFixed(1)} days, Views ${newViews.toLocaleString()} ≥ 10,000 → switching back to hourly`
            };
        }
        
        return null; // No change needed
    }
    
    return null; // No cadence change needed
}

// Smart processing with standardized timing and adaptive frequency
async function processVideosSmartly(videos: VideoRecord[], maxPerRun: number = 1000): Promise<ProcessingResult> {
    const processingStartTime = Date.now();
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
    
    // DEBUG: Log hourly videos that are being processed
    const hourlyVideos = videos.filter(v => v.scrapingCadence === 'hourly');
    console.log(`🔍 DEBUG: Hourly videos being processed:`, hourlyVideos.map(v => ({
        username: v.username,
        platform: v.platform,
        lastScrapedAt: v.lastScrapedAt,
        minutesAgo: Math.floor((Date.now() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60))
    })));

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

    // Process all videos that need scraping - scale to handle thousands
    const limitedVideos = videosToProcess.slice(0, maxPerRun);
    console.log(`🎯 Processing ${limitedVideos.length}/${videosToProcess.length} videos (max ${maxPerRun} per run)`);
    console.log(`📊 Video breakdown by platform: ${Object.entries(limitedVideos.reduce((acc, v) => { acc[v.platform] = (acc[v.platform] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([k,v]) => `${k}:${v}`).join(', ')}`);
    console.log(`📊 Video breakdown by cadence: ${Object.entries(limitedVideos.reduce((acc, v) => { acc[v.scrapingCadence] = (acc[v.scrapingCadence] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([k,v]) => `${k}:${v}`).join(', ')}`);

    // Process in optimized batches for maximum throughput
    const batchSize = 10; // Increase batch size significantly for better throughput
    console.log(`🚀 Starting high-throughput batch processing with batch size: ${batchSize}`);

    for (let i = 0; i < limitedVideos.length; i += batchSize) {
        const elapsed = Date.now() - processingStartTime;
        const batch = limitedVideos.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(limitedVideos.length / batchSize);
        
        const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(`📦 ===== BATCH ${batchNum}/${totalBatches} (${elapsed}ms elapsed, ${memoryUsage}MB memory) =====`);
        console.log(`🎬 Processing: ${batch.map(v => `@${v.username} (${v.platform}, ${v.scrapingCadence})`).join(', ')}`);
        
        const batchStartTime = Date.now();

        // Process batch in parallel
        const batchPromises = batch.map(async (video, index) => {
            try {
                console.log(`🎬 [${i + index + 1}/${limitedVideos.length}] Starting @${video.username} (${video.platform}, ${video.scrapingCadence})...`);
                console.log(`🔍 DETAILED SCRAPE ATTEMPT FOR @${video.username}:`);
                console.log(`📊 Video ID: ${video.id}`);
                console.log(`📊 URL: ${video.url}`);
                console.log(`📊 Platform: ${video.platform}`);
                console.log(`📊 Current Stats: views=${video.currentViews}, likes=${video.currentLikes}, comments=${video.currentComments}, shares=${video.currentShares}`);
                console.log(`📊 Last Scraped: ${video.lastScrapedAt}`);
                console.log(`📊 Cadence: ${video.scrapingCadence}`);

                const scrapeStartTime = Date.now();
                console.log(`🚀 CALLING TIKHUB API FOR @${video.username}...`);
                
                const result = await scrapeMediaPost(video.url);
                
                const scrapeDuration = Date.now() - scrapeStartTime;
                console.log(`⏱️ TikHub API call completed in ${scrapeDuration}ms for @${video.username}`);
                console.log(`📊 TikHub API Response for @${video.username}:`, {
                    success: result.success,
                    hasData: !!result.data,
                    error: result.error,
                    debugInfo: result.debugInfo ? 'Present' : 'Missing'
                });
                
                // Show complete TikHub API response structure for debugging
                if (result.success && result.data) {
                    console.log(`🔍 COMPLETE TIKHUB API RESPONSE STRUCTURE FOR @${video.username}:`);
                    console.log(`📊 All available fields:`, Object.keys(result.data));
                    console.log(`📊 Raw response data:`, JSON.stringify(result.data, null, 2));
                }

                if (result.success && result.data) {
                    const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
                    
                    console.log(`📊 RAW MEDIA DATA FOR @${video.username}:`, {
                        views: mediaData.views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: 'shares' in mediaData ? mediaData.shares : 'N/A',
                        type: typeof mediaData.views,
                        platform: video.platform
                    });
                    
                    // Get views based on platform
                    let views = 0;
                    let shares = 0;
                    
                    if (video.platform === 'instagram') {
                        const instaData = mediaData as InstagramPostData;
                        views = instaData.plays || instaData.views || 0;
                        shares = 0; // Instagram doesn't track shares
                        console.log(`📊 INSTAGRAM EXTRACTION FOR @${video.username}:`, {
                            plays: instaData.plays,
                            views: instaData.views,
                            finalViews: views
                        });
                    } else if (video.platform === 'youtube') {
                        const youtubeData = mediaData as YouTubeVideoData;
                        views = youtubeData.views || 0;
                        shares = 0; // YouTube doesn't track shares in our API
                        console.log(`📊 YOUTUBE EXTRACTION FOR @${video.username}:`, {
                            views: youtubeData.views,
                            finalViews: views
                        });
                    } else {
                        const tiktokData = mediaData as TikTokVideoData;
                        views = tiktokData.views || 0;
                        shares = tiktokData.shares || 0;
                        console.log(`📊 TIKTOK EXTRACTION FOR @${video.username}:`, {
                            views: tiktokData.views,
                            shares: tiktokData.shares,
                            finalViews: views,
                            finalShares: shares
                        });
                    }
                    
                    console.log(`📊 FINAL EXTRACTED VALUES FOR @${video.username}:`, {
                        views: views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: shares,
                        previousViews: video.currentViews,
                        viewsChange: views - video.currentViews
                    });
                    
                    // COMPARISON: TikHub API vs Database Values
                    console.log(`🔍 TIKHUB API vs DATABASE COMPARISON FOR @${video.username}:`);
                    console.log(`📊 TikHub API Response:`, {
                        views: views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: shares
                    });
                    console.log(`📊 Database Before Update:`, {
                        views: video.currentViews,
                        likes: video.currentLikes,
                        comments: video.currentComments,
                        shares: video.currentShares
                    });
                    console.log(`📊 Will Save to Database:`, {
                        views: views,
                        likes: mediaData.likes,
                        comments: mediaData.comments,
                        shares: shares
                    });

                    // Calculate daily views for cadence evaluation (views gained since last update)
                    let dailyViews: number | null = null;
                    
                    if (video.lastDailyViews !== null) {
                        dailyViews = Math.max(0, views - video.lastDailyViews);
                    }

                    // Evaluate cadence change based on user's 10k threshold logic
                    const cadenceEvaluation = await evaluateCadenceChange(video, views);
                    let newCadence = video.scrapingCadence;
                    let cadenceAction = '';
                    
                    if (cadenceEvaluation) {
                        newCadence = cadenceEvaluation.newCadence;
                        cadenceAction = `Changed from ${video.scrapingCadence} to ${newCadence}: ${cadenceEvaluation.reason}`;
                        cadenceChanges++;
                        console.log(`🔄 @${video.username}: ${cadenceAction}`);
                    }

                    console.log(`💾 SAVING TO DATABASE FOR @${video.username}:`);
                    console.log(`📊 Video ID: ${video.id}`);
                    console.log(`📊 Values to save:`, {
                        currentViews: views,
                        currentLikes: mediaData.likes,
                        currentComments: mediaData.comments,
                        currentShares: shares,
                        scrapingCadence: newCadence,
                        lastDailyViews: video.currentViews,
                        dailyViewsGrowth: dailyViews
                    });
                    console.log(`📊 Previous values:`, {
                        currentViews: video.currentViews,
                        currentLikes: video.currentLikes,
                        currentComments: video.currentComments,
                        currentShares: video.currentShares,
                        scrapingCadence: video.scrapingCadence
                    });

                    // Sanitize metrics to prevent negative values and corruption
                    const sanitizedMetrics = sanitizeMetrics(
                        { views, likes: mediaData.likes, comments: mediaData.comments, shares },
                        { 
                            views: video.currentViews, 
                            likes: video.currentLikes, 
                            comments: video.currentComments, 
                            shares: video.currentShares 
                        }
                    );
                    
                    // Log any sanitization warnings
                    logSanitizationWarnings(video.username, sanitizedMetrics.warnings);

                    // Update video metrics and cadence with sanitized values
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            currentViews: sanitizedMetrics.views,
                            currentLikes: sanitizedMetrics.likes,
                            currentComments: sanitizedMetrics.comments,
                            currentShares: sanitizedMetrics.shares,
                            lastScrapedAt: new Date(),
                            // Enable cadence changes with user's 10k logic
                            scrapingCadence: newCadence,
                            lastDailyViews: video.currentViews, // Store current views as baseline for next calculation
                            dailyViewsGrowth: dailyViews,
                            needsCadenceCheck: false,
                        }
                    });
                    
                    console.log(`✅ DATABASE UPDATE COMPLETED FOR @${video.username}`);
                    
                    // VERIFY: Check what was actually saved to database
                    const updatedVideo = await prisma.video.findUnique({
                        where: { id: video.id },
                        select: {
                            currentViews: true,
                            currentLikes: true,
                            currentComments: true,
                            currentShares: true
                        }
                    });
                    
                    console.log(`🔍 DATABASE VERIFICATION FOR @${video.username}:`);
                    console.log(`📊 Actually Saved to Database:`, {
                        views: updatedVideo?.currentViews,
                        likes: updatedVideo?.currentLikes,
                        comments: updatedVideo?.currentComments,
                        shares: updatedVideo?.currentShares
                    });

                    // Check for viral thresholds and send Discord notifications
                    try {
                        const viralThreshold = checkViralThresholds(video.currentViews, views);
                        if (viralThreshold) {
                            console.log(`🔥 @${video.username} video went viral! Crossed ${viralThreshold.toLocaleString()} views threshold`);
                            
                            await notifyViralVideo(
                                video.username,
                                video.platform,
                                video.url,
                                mediaData.description || '',
                                views,
                                mediaData.likes,
                                viralThreshold
                            );
                        }
                    } catch (error) {
                        console.error('⚠️ Failed to send viral video Discord notification:', error);
                        // Don't fail the entire operation if Discord notification fails
                    }

                    // Check for Phase transitions and send notifications
                    try {
                        const currentPhase = video.currentPhase;
                        const phase1Notified = video.phase1Notified;
                        const phase2Notified = video.phase2Notified;
                        
                        const phaseResult = determineFinalPhaseAndNotifications(
                            views, 
                            mediaData.comments, 
                            currentPhase, 
                            phase1Notified, 
                            phase2Notified
                        );
                        
                        // Update phase and notification flags if there's a change
                        if (phaseResult.finalPhase !== currentPhase || 
                            phaseResult.newPhase1Notified !== phase1Notified || 
                            phaseResult.newPhase2Notified !== phase2Notified) {
                            
                            console.log(`🔄 @${video.username} phase transition: ${currentPhase} → ${phaseResult.finalPhase}`);
                            
                            await prisma.video.update({
                                where: { id: video.id },
                                data: { 
                                    currentPhase: phaseResult.finalPhase,
                                    phase1Notified: phaseResult.newPhase1Notified,
                                    phase2Notified: phaseResult.newPhase2Notified
                                }
                            });
                            
                            // Send notifications for the appropriate phases
                            if (phaseResult.shouldNotifyPhase1) {
                                const notificationMessage = getPhaseNotificationMessage(
                                    video.username,
                                    video.platform,
                                    video.url,
                                    currentPhase,
                                    phaseResult.finalPhase,
                                    views,
                                    mediaData.comments
                                );
                                
                                await sendDiscordNotification(notificationMessage, 'viral-alerts');
                                console.log(`📢 Phase 1 notification sent for @${video.username}`);
                            }
                            
                            if (phaseResult.shouldNotifyPhase2) {
                                const notificationMessage = getPhaseNotificationMessage(
                                    video.username,
                                    video.platform,
                                    video.url,
                                    currentPhase,
                                    phaseResult.finalPhase,
                                    views,
                                    mediaData.comments
                                );
                                
                                await sendDiscordNotification(notificationMessage, 'viral-alerts');
                                console.log(`📢 Phase 2 notification sent for @${video.username}`);
                            }
                        }

                    } catch (phaseError) {
                        console.error(`❌ Phase tracking error for @${video.username}:`, phaseError);
                    }

                    // Add new metrics history entry with consistent timestamp normalization
                    // All hourly videos should use 60min intervals, testing uses 1min intervals
                    let timestampInterval: TimestampInterval;
                    if (video.scrapingCadence === 'testing') {
                        timestampInterval = 'minute';
                    } else {
                        // Both hourly and daily cadences use 60min intervals for consistency
                        timestampInterval = '60min';
                    }
                    
                    const normalizedTimestamp = getCurrentNormalizedTimestamp(timestampInterval);
                    
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
                        console.log(`📊 [${i + index + 1}] Created new metrics entry at ${normalizedTimestamp} (${timestampInterval} interval)`);
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
                        console.log(`📊 [${i + index + 1}] Updated existing metrics entry at ${normalizedTimestamp} (${timestampInterval} interval)`);
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
                    console.error(`❌ [${i + index + 1}] @${video.username} (${video.platform}) FAILED TO SCRAPE:`);
                    console.error(`📊 TikHub API Error Details:`, {
                        success: result.success,
                        error: result.error,
                        hasDebugInfo: !!result.debugInfo,
                        debugInfo: result.debugInfo,
                        url: video.url,
                        platform: video.platform
                    });
                    console.error(`📊 Video Details:`, {
                        id: video.id,
                        username: video.username,
                        currentViews: video.currentViews,
                        lastScrapedAt: video.lastScrapedAt
                    });
                    
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
                console.error(`💥 [${i + index + 1}] @${video.username} (${video.platform}) CRASHED:`);
                console.error(`📊 Crash Details:`, {
                    error: errorMessage,
                    stack: error instanceof Error ? error.stack : 'No stack trace',
                    url: video.url,
                    platform: video.platform,
                    id: video.id
                });
                console.error(`📊 Video State:`, {
                    username: video.username,
                    currentViews: video.currentViews,
                    lastScrapedAt: video.lastScrapedAt,
                    scrapingCadence: video.scrapingCadence
                });
                
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

        const batchDuration = Date.now() - batchStartTime;
        const batchSuccess = batchResults.filter(r => r.status === 'success').length;
        const batchFailed = batchResults.filter(r => r.status === 'failed').length;
        const avgTimePerVideo = batchDuration / batch.length;
        
        console.log(`📊 Batch ${batchNum} complete in ${batchDuration}ms: ${batchSuccess} success, ${batchFailed} failed (avg ${avgTimePerVideo.toFixed(0)}ms per video)`);
        
        // Track slow batches
        if (avgTimePerVideo > 3000) {
            console.log(`🐌 SLOW BATCH: Batch ${batchNum} averaged ${avgTimePerVideo.toFixed(0)}ms per video`);
        }
        
        // No artificial delays - let it run at full speed
        if (i + batchSize < limitedVideos.length) {
            console.log(`⚡ Moving to next batch immediately...`);
        }
    }

    return { results, successful, failed, skipped, cadenceChanges };
}

export async function GET() {
    const startTime = Date.now();
    console.log(`🚀 ===== CRON JOB STARTED (${new Date().toISOString()}) =====`);
    console.log(`🔧 Process info: PID ${process.pid}, Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`🔧 Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`);
    console.log(`🔧 Headers: User-Agent=${process.env.HTTP_USER_AGENT || 'Not set'}`);
    console.log(`🔧 Request URL: ${process.env.VERCEL_URL || 'localhost'}`);
    console.log(`🔧 Cron Job Source: ${process.env.VERCEL_CRON_SECRET ? 'Vercel Cron' : 'Manual/Test'}`);
    console.log(`⚡ 100% RELIABILITY MODE: Every video processed every hour`);
    console.log(`⏰ Hourly videos: Scrape every 1h (65min safety net)`);
    console.log(`🌙 Daily videos: Scrape every 24h (1445min safety net)`);
    console.log(`📋 Strategy: Zero pending videos - maximum 2 cron runs to process any video`);
    console.log(`🔍 CRON DEBUG: This execution will be logged with detailed scraping decisions`);
    
    // Test database connection immediately
    try {
        console.log(`📊 Step 1: Testing database connection...`);
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        console.log(`✅ Database connection successful:`, dbTest);
    } catch (error) {
        console.error(`❌ CRITICAL: Database connection failed:`, error);
        return NextResponse.json({ 
            error: 'Database connection failed', 
            details: error instanceof Error ? error.message : 'Unknown',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
    
    // Get current EST time for logging
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = estTime.getHours();
    console.log(`🕐 Current EST time: ${estTime.toLocaleTimeString('en-US', {timeZone: 'America/New_York'})} (Hour ${currentHour})`);
    
    if (currentHour === 0) {
        console.log(`🌙 MIDNIGHT EST: Cadence evaluation window active - performance-based switching enabled`);
    } else {
        console.log(`⏰ Non-midnight hour: Hourly videos + performance-based switching`);
    }

    try {
        // Fetch all active videos (with backward compatibility for missing cadence fields)
        console.log(`📊 Step 2: Fetching active videos from database...`);
        
        let videos: VideoRecord[] = [];
        
        try {
            console.log(`🔍 Query conditions: isActive=true AND (trackingMode=null OR trackingMode!='deleted')`);
            // Try to fetch with new cadence fields
            const rawVideos = await prisma.video.findMany({
                where: { 
                    isActive: true,
                    OR: [
                        { trackingMode: null },
                        { trackingMode: { not: 'deleted' } }
                    ]
                },
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
                    scrapingCadence: true,
                    lastDailyViews: true,
                    dailyViewsGrowth: true,
                    needsCadenceCheck: true,
                    trackingMode: true,
                    currentPhase: true,
                    phase1Notified: true,
                    phase2Notified: true,
                }
            });

            // Map to VideoRecord format with proper cadence logic
            videos = rawVideos.map((video: {
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
                scrapingCadence: string | null;
                lastDailyViews: number | null;
                dailyViewsGrowth: number | null;
                needsCadenceCheck: boolean | null;
                trackingMode: string | null;
                currentPhase: string | null;
                phase1Notified: boolean | null;
                phase2Notified: boolean | null;
            }) => {
                // Determine proper cadence based on current setting
                const cadence = video.scrapingCadence || 'hourly';
                
                // Keep testing cadence as is - don't override it
                // Other cadences can be adjusted based on age/performance logic
                
                return {
                    ...video,
                    scrapingCadence: cadence,
                    lastDailyViews: video.lastDailyViews || null,
                    dailyViewsGrowth: video.dailyViewsGrowth || null,
                    needsCadenceCheck: video.needsCadenceCheck || false,
                    trackingMode: video.trackingMode || null,
                    currentPhase: video.currentPhase || 'PHS 0',
                    phase1Notified: video.phase1Notified || false,
                    phase2Notified: video.phase2Notified || false,
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
        
        // Log detailed breakdown
        const hourlyCount = videos.filter(v => v.scrapingCadence === 'hourly').length;
        const dailyCount = videos.filter(v => v.scrapingCadence === 'daily').length;
        const otherCount = videos.length - hourlyCount - dailyCount;
        console.log(`📊 Cadence breakdown: ${hourlyCount} hourly, ${dailyCount} daily, ${otherCount} other`);
        
        // Log platform breakdown
        const platformStats = videos.reduce((acc, v) => {
            acc[v.platform] = (acc[v.platform] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        console.log(`📊 Platform breakdown:`, platformStats);
        
        // Log oldest videos
        const oldestVideos = videos.sort((a, b) => new Date(a.lastScrapedAt).getTime() - new Date(b.lastScrapedAt).getTime()).slice(0, 3);
        console.log(`📊 Oldest 3 videos by lastScrapedAt:`, oldestVideos.map(v => ({
            username: v.username,
            platform: v.platform,
            lastScrapedAt: v.lastScrapedAt,
            minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
            cadence: v.scrapingCadence
        })));
        
        // DEBUG: Log all hourly videos to see what's happening
        const hourlyVideos = videos.filter(v => v.scrapingCadence === 'hourly');
        console.log(`🔍 DEBUG: Found ${hourlyVideos.length} hourly videos:`, hourlyVideos.map(v => ({
            username: v.username,
            platform: v.platform,
            lastScrapedAt: v.lastScrapedAt,
            minutesAgo: Math.floor((now.getTime() - new Date(v.lastScrapedAt).getTime()) / (1000 * 60)),
            cadence: v.scrapingCadence
        })));
        
        if (videos.length === 0) {
            console.log('❌ CRITICAL: No videos found in database - this explains why nothing is being scraped!');
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
        console.log(`📊 Step 3: Processing ${videos.length} videos with smart cadence management...`);
        const result = await processVideosSmartly(videos);

        const duration = Date.now() - startTime;
        console.log(`🏁 ===== CRON JOB COMPLETED =====`);
        console.log(`📊 Results: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped, ${result.cadenceChanges} cadence changes`);
        
        // CRON DEBUG SUMMARY
        console.log(`🔍 CRON DEBUG SUMMARY:`);
        console.log(`   • Total videos checked: ${videos.length}`);
        console.log(`   • Videos scraped: ${result.successful}`);
        console.log(`   • Videos skipped: ${result.skipped}`);
        console.log(`   • Videos failed: ${result.failed}`);
        console.log(`   • Execution time: ${duration}ms`);
        console.log(`   • Hourly videos: ${videos.filter(v => v.scrapingCadence === 'hourly').length}`);
        console.log(`   • Daily videos: ${videos.filter(v => v.scrapingCadence === 'daily').length}`);
        
        // Log any failures in detail
        if (result.failed > 0) {
            console.log(`❌ FAILURES DETECTED: ${result.failed} videos failed to process`);
        }
        if (result.skipped > 0) {
            console.log(`⏭️ SKIPPED: ${result.skipped} videos were skipped`);
        }
        if (result.successful === 0 && videos.length > 0) {
            console.log(`🚨 CRITICAL: 0 videos processed successfully out of ${videos.length} total!`);
        }
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

        // Include detailed failure information for debugging
        const failedResults = result.results.filter(r => r.status === 'failed');
        const zeroStatsResults = result.results.filter(r => r.status === 'success' && r.changes && r.changes.views === 0);
        
        return NextResponse.json({
            success: true,
            message: `Processed ${result.successful}/${videos.length} videos successfully with ${result.cadenceChanges} cadence changes`,
            status,
            results: result.results.slice(0, 20), // Show more results
            debugInfo: {
                totalVideos: videos.length,
                successful: result.successful,
                failed: result.failed,
                skipped: result.skipped,
                failedCount: failedResults.length,
                zeroStatsCount: zeroStatsResults.length,
                failedVideos: failedResults.slice(0, 10), // Show first 10 failures
                zeroStatsVideos: zeroStatsResults.slice(0, 10) // Show first 10 zero stats
            }
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