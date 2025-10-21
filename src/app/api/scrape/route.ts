import { NextRequest, NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { uploadToS3 } from '../../../lib/s3';
import fetch from 'node-fetch';

export async function POST(request: NextRequest) {
    console.log('🎬 ===== /api/scrape endpoint hit =====');
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('🌍 Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        hasTikHubKey: !!process.env.TIKHUB_API_KEY,
        tikHubKeyLength: process.env.TIKHUB_API_KEY?.length || 0
    });

    // Add immediate response to test if endpoint is hit
    console.log('🚨 TEST: Endpoint is being hit!');

    try {
        console.log('🔍 Parsing request body...');
        let body;
        try {
            body = await request.json();
            console.log('📦 Raw request body:', body);
        } catch (jsonError) {
            console.error('❌ JSON parsing failed:', jsonError);
            return NextResponse.json({
                success: false,
                error: 'Invalid JSON in request body',
                debugInfo: {
                    jsonError: jsonError instanceof Error ? jsonError.message : 'Unknown JSON error',
                    contentType: request.headers.get('content-type'),
                    timestamp: new Date().toISOString()
                }
            }, { status: 400 });
        }
        
        const { url } = body;
        console.log('📝 Extracted URL:', url);

        console.log('📋 Request details:', {
            url: url,
            hasUrl: !!url,
            urlType: typeof url,
            urlLength: url?.length,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries())
        });

        if (!url) {
            console.error('❌ No URL provided in request');
            console.error('📦 Full request body was:', body);
            return NextResponse.json({
                success: false,
                error: 'URL is required',
                debugInfo: {
                    receivedBody: body,
                    timestamp: new Date().toISOString()
                }
            }, { status: 400 });
        }

        console.log('🚀 Starting media scraping process for URL:', url);

        // Detect platform and scrape accordingly
        const cleanUrl = url.trim().toLowerCase();
        console.log('🧹 Cleaned URL:', cleanUrl);
        let platform: string;
        
        if (cleanUrl.includes('instagram.com')) {
            console.log('📸 Detected Instagram URL, using Instagram scraper');
            platform = 'instagram';
        } else if (cleanUrl.includes('tiktok.com')) {
            console.log('🎵 Detected TikTok URL, using TikTok scraper');
            platform = 'tiktok';
        } else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            console.log('🎬 Detected YouTube URL, using YouTube scraper');
            platform = 'youtube';
        } else {
            console.error('❌ Unsupported platform URL:', url);
            console.error('🔍 URL analysis:', {
                originalUrl: url,
                cleanedUrl: cleanUrl,
                containsInstagram: cleanUrl.includes('instagram.com'),
                containsTikTok: cleanUrl.includes('tiktok.com'),
                containsYouTube: cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')
            });
            return NextResponse.json({
                success: false,
                error: 'URL must be from TikTok, Instagram, or YouTube',
                debugInfo: {
                    originalUrl: url,
                    cleanedUrl: cleanUrl,
                    timestamp: new Date().toISOString()
                }
            }, { status: 400 });
        }

        // Use unified scraper
        console.log('🔧 Calling scrapeMediaPost with URL:', url);
        console.log('🔧 Platform detected:', platform);
        
        const result = await scrapeMediaPost(url);

        console.log('📦 Media scraping result:', {
            success: result.success,
            hasData: result.success && !!result.data,
            hasError: !!result.error,
            hasDebugInfo: !!result.debugInfo,
            errorMessage: result.error,
            platform: platform,
            dataPreview: result.success && result.data ? {
                id: result.data.id,
                platform: platform,
                url: result.data.url || url
            } : null
        });

        if (!result.success) {
            console.error('❌ Media scraping failed:', result.error);
            console.error('🔍 Full error details:', {
                error: result.error,
                debugInfo: result.debugInfo,
                platform: platform,
                url: url,
                timestamp: new Date().toISOString()
            });
            
            // Log TikHub specific error details if available
            if (result.debugInfo?.tikHubResponse) {
                console.error('🔍 TikHub API Error Details:', {
                    status: result.debugInfo.tikHubResponse.status,
                    statusText: result.debugInfo.tikHubResponse.statusText,
                    responseBody: result.debugInfo.tikHubResponse.body,
                    requestUrl: result.debugInfo.tikHubResponse.url,
                    videoId: result.debugInfo.tikHubResponse.videoId,
                    apiKeyLength: result.debugInfo.tikHubResponse.apiKeyLength
                });
            }
            
            return NextResponse.json({
                success: false,
                error: result.error,
                debugInfo: result.debugInfo,
                platform: platform,
                url: url,
                timestamp: new Date().toISOString()
            }, { status: 400 });
        }

        if (!result.data) {
            console.error('❌ No data returned from media scraper');
            return NextResponse.json({
                success: false,
                error: 'No media data returned',
                debugInfo: result.debugInfo
            }, { status: 400 });
        }

        console.log('✅ Media scraping successful, proceeding to database operations...');

        // Handle different data structures for each platform
        const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
        
        console.log(`🔍 PLATFORM DETECTION DEBUG:`, {
            detectedPlatform: platform,
            mediaDataType: typeof mediaData,
            mediaDataKeys: Object.keys(mediaData),
            mediaDataPlatform: (mediaData as unknown as Record<string, unknown>)?.platform
        });
        
        // Get platform-specific data
        let views: number, likes: number, comments: number, shares: number;
        let username: string, description: string, thumbnailUrl: string | undefined;

        if (platform === 'instagram') {
            console.log('📸 INSTAGRAM BRANCH TAKEN');
            const instaData = mediaData as InstagramPostData;
            views = instaData.plays || instaData.views || 0;
            likes = instaData.likes;
            comments = instaData.comments;
            shares = 0; // Instagram doesn't track shares
            username = instaData.username;
            description = instaData.description;
            thumbnailUrl = instaData.thumbnailUrl || instaData.displayUrl;
        } else if (platform === 'youtube') {
            console.log('📺 YOUTUBE BRANCH TAKEN');
            const ytData = mediaData as YouTubeVideoData;
            views = ytData.views;
            likes = ytData.likes;
            comments = ytData.comments;
            shares = 0; // YouTube API doesn't provide share count
            username = ytData.channelTitle;
            description = ytData.description;
            thumbnailUrl = ytData.thumbnails?.medium?.url || ytData.thumbnails?.high?.url;
        } else { // tiktok
            console.log('🎬 TIKTOK BRANCH TAKEN');
            // Use DIRECT data extraction (SAME AS REFRESH BUTTON)
            console.log('🎬 TIKTOK EXTRACTION DEBUG:');
            console.log('🎬 Raw mediaData:', JSON.stringify(mediaData, null, 2));
            console.log('🎬 URL:', url);
            
            const tikTokData = mediaData as unknown as Record<string, unknown>;
            views = tikTokData.views as number || 0;
            likes = tikTokData.likes as number || 0;
            comments = tikTokData.comments as number || 0;
            shares = tikTokData.shares as number || 0;
            username = tikTokData.username as string || 'unknown';
            description = tikTokData.description as string || '';
            thumbnailUrl = tikTokData.thumbnailUrl as string || undefined;
            
            console.log('🎬 Final values:', { views, likes, comments, shares, username, thumbnailUrl });
            
            // Extract timestamp from initial scrape data
            console.log(`📅 INITIAL SCRAPE TIMESTAMP DEBUG:`, {
                hasTimestamp: 'timestamp' in tikTokData,
                timestamp: tikTokData.timestamp,
                timestampType: typeof tikTokData.timestamp,
                allKeys: Object.keys(tikTokData)
            });
            
            const initialTimestamp = tikTokData.timestamp as string;
            if (initialTimestamp) {
                console.log(`📅 INITIAL SCRAPE timestamp found: ${initialTimestamp}`);
            } else {
                console.log(`📅 INITIAL SCRAPE no timestamp found`);
            }
        }

        // Always upload thumbnail to S3 if present
        if (thumbnailUrl) {
            console.log('🖼️ [DEBUG] Initial thumbnailUrl:', thumbnailUrl);
            try {
                console.log('📥 [DEBUG] Fetching thumbnail from original URL:', thumbnailUrl);
                const res = await fetch(thumbnailUrl);
                console.log('📥 [DEBUG] Fetch response status:', res.status);
                if (res.ok) {
                    console.log('✅ [DEBUG] Thumbnail fetch successful, preparing to upload to S3...');
                    const buffer = await res.buffer();
                    console.log('📦 [DEBUG] Buffer created, size:', buffer.length);
                    const key = `thumbnails/${result.data.id}.jpg`;
                    console.log('🔑 [DEBUG] S3 key to use:', key);
                    const s3Url = await uploadToS3(buffer, key, 'image/jpeg');
                    console.log('🔗 [DEBUG] S3 URL returned:', s3Url);
                    thumbnailUrl = s3Url;
                    console.log('✅ [DEBUG] Thumbnail uploaded to S3 and thumbnailUrl updated:', thumbnailUrl);
                } else {
                    console.error('❌ [DEBUG] Failed to fetch thumbnail, status:', res.status, 'statusText:', res.statusText);
                }
            } catch (err) {
                console.error('❌ [DEBUG] Exception during S3 upload:', err);
            }
        } else {
            console.log('⚠️ [DEBUG] No thumbnail URL found, skipping S3 upload');
        }
        console.log('📋 [DEBUG] Final thumbnail URL to be stored in DB:', thumbnailUrl);

        console.log('📝 [DEBUG] Creating new media record in database with thumbnailUrl:', thumbnailUrl);

        // Extract posted date DIRECTLY from TikHub data (SAME AS VIEWS/LIKES)
        let postedDate: Date;
        if (platform === 'tiktok') {
            const tikTokData = mediaData as unknown as Record<string, unknown>;
            console.log(`📅 TIKTOK TIMESTAMP DEBUG:`, {
                hasTimestamp: 'timestamp' in tikTokData,
                timestamp: tikTokData.timestamp,
                timestampType: typeof tikTokData.timestamp,
                allKeys: Object.keys(tikTokData),
                fullTikTokData: JSON.stringify(tikTokData, null, 2)
            });
            
            const timestamp = tikTokData.timestamp as string;
            if (timestamp) {
                postedDate = new Date(timestamp);
                console.log(`📅 DIRECT timestamp extraction: ${timestamp} -> ${postedDate.toISOString()}`);
            } else {
                postedDate = new Date(); // Fallback
                console.log(`📅 No timestamp found, using current date`);
            }
        } else if (platform === 'instagram') {
            const instaData = mediaData as unknown as Record<string, unknown>;
            const timestamp = instaData.timestamp as string;
            postedDate = timestamp ? new Date(timestamp) : new Date();
        } else { // youtube
            const ytData = mediaData as unknown as Record<string, unknown>;
            const publishedAt = ytData.publishedAt as string;
            postedDate = publishedAt ? new Date(publishedAt) : new Date();
        }
        console.log(`📅 Video posted date extracted: ${postedDate.toISOString()}`);

        // Create or update video record (upsert handles both new and existing videos)
        const newVideo = await prisma.video.upsert({
            where: { url: result.data.url || url },
            update: {
                platform: platform,
                currentViews: views,
                currentLikes: likes,
                currentComments: comments,
                currentShares: shares,
                postedAt: postedDate,  // Update with fresh timestamp
                lastScrapedAt: new Date(),
                isActive: true,
                thumbnailUrl: thumbnailUrl
            },
            create: {
                url: result.data.url || url,
                username: username,
                description: description,
                thumbnailUrl: thumbnailUrl,
                platform: platform,
                postedAt: postedDate,  // Use fresh timestamp
                currentViews: views,
                currentLikes: likes,
                currentComments: comments,
                currentShares: shares,
                hashtags: (mediaData as TikTokVideoData | InstagramPostData).hashtags ? JSON.stringify((mediaData as TikTokVideoData | InstagramPostData).hashtags) : null,
                music: (mediaData as TikTokVideoData | InstagramPostData).music ? JSON.stringify((mediaData as TikTokVideoData | InstagramPostData).music) : null,
                scrapingCadence: 'hourly', // Set new videos to hourly by default
                // Set lastScrapedAt to 2 hours ago so it gets picked up by the next cron run
                lastScrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                isActive: true
            }
        });

        console.log(`📅 DATABASE VIDEO CREATED:`, {
            id: newVideo.id,
            username: newVideo.username,
            postedAt: newVideo.postedAt,
            postedAtISO: newVideo.postedAt?.toISOString(),
            platform: newVideo.platform,
            extractedPostedDate: postedDate.toISOString()
        });

        // Add zero baseline metrics entry at the video's posted date
        // Only if the video was posted in the past (not just now)
        const timeSincePosted = Date.now() - postedDate.getTime();
        const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
        
        if (timeSincePosted > ONE_HOUR) {
            await prisma.metricsHistory.create({
                data: {
                    videoId: newVideo.id,
                    views: 0,
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    timestamp: postedDate
                }
            });
            console.log(`📊 Added zero baseline entry at posted date: ${postedDate.toISOString()}`);
        }

        // Create initial metrics history entry so the video appears on the graph immediately
        await prisma.metricsHistory.create({
            data: {
                videoId: newVideo.id,
                views: views,
                likes: likes,
                comments: comments,
                shares: shares,
                timestamp: new Date()
            }
        });
        console.log(`📊 Added initial metrics entry for immediate graph display`);

        // Use the EXACT same logic as the refresh button
        console.log(`🔄 Using refresh button logic for new video @${username}`);
        try {
            const tikHubResult = await scrapeMediaPost(newVideo.url);
            
            console.log(`🔍 COMPLETE TIKHUB API RESPONSE FOR @${username}:`);
            console.log(`📊 Success:`, tikHubResult.success);
            console.log(`📊 Error:`, tikHubResult.error);
            console.log(`📊 Has Data:`, !!tikHubResult.data);
            console.log(`📊 Debug Info:`, tikHubResult.debugInfo);
            
            if (tikHubResult.success && tikHubResult.data) {
                console.log(`📊 All Available Fields:`, Object.keys(tikHubResult.data));
                console.log(`📊 Raw TikHub Response:`, JSON.stringify(tikHubResult.data, null, 2));
                
                // Extract values using the EXACT same logic as refresh button
                const mediaData = tikHubResult.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
                let freshViews = 0;
                let freshShares = 0;

                if (platform === 'tiktok') {
                    // Use DIRECT data extraction (SAME AS REFRESH BUTTON)
                    const tikTokData = tikHubResult.data as unknown as Record<string, unknown>;
                    freshViews = tikTokData.views as number || 0;
                    freshShares = tikTokData.shares as number || 0;
                } else if (platform === 'instagram') {
                    const instagramData = mediaData as InstagramPostData;
                    freshViews = instagramData.views || instagramData.plays || 0;
                    freshShares = 0; // Instagram doesn't provide share count
                } else if (platform === 'youtube') {
                    const youtubeData = mediaData as YouTubeVideoData;
                    freshViews = youtubeData.views || 0;
                    freshShares = youtubeData.shares || 0;
                }

                const extractedValues = {
                    views: freshViews,
                    likes: mediaData.likes || 0,
                    comments: mediaData.comments || 0,
                    shares: freshShares
                };

                console.log(`📊 EXTRACTED VALUES FOR @${username}:`, extractedValues);

                // Update database with new values (SAME AS REFRESH BUTTON)
                await prisma.video.update({
                    where: { id: newVideo.id },
                    data: {
                        currentViews: extractedValues.views,
                        currentLikes: extractedValues.likes,
                        currentComments: extractedValues.comments,
                        currentShares: extractedValues.shares,
                        lastScrapedAt: new Date()
                    }
                });

                // Add fresh metrics history entry
                await prisma.metricsHistory.create({
                    data: {
                        videoId: newVideo.id,
                        views: extractedValues.views,
                        likes: extractedValues.likes,
                        comments: extractedValues.comments,
                        shares: extractedValues.shares,
                        timestamp: new Date()
                    }
                });

                console.log(`✅ Refresh-style scrape completed for @${username}:`, extractedValues);
            } else {
                console.log(`⚠️ TikHub scrape failed for @${username}, using initial data`);
            }
        } catch (error) {
            console.error(`❌ Error during refresh-style scrape for @${username}:`, error);
        }

        console.log(`✅ New media created successfully with initial metrics history:`, {
            id: result.data.id,
            username: newVideo.username,
            platform: platform,
            dbId: newVideo.id,
            postedAt: postedDate.toISOString(),
            initialViews: views,
            initialLikes: likes,
            thumbnailUrl: thumbnailUrl,
            lastScrapedAt: newVideo.lastScrapedAt.toISOString()
        });

        return NextResponse.json({
            success: true,
            message: 'added',
            data: {
                id: result.data.id,
                username: newVideo.username,
                url: newVideo.url,
                views: newVideo.currentViews,
                likes: newVideo.currentLikes,
                comments: newVideo.currentComments,
                shares: newVideo.currentShares,
                platform: platform
            },
            debugInfo: {
                platformDetection: {
                    detectedPlatform: platform,
                    mediaDataKeys: Object.keys(mediaData),
                    mediaDataPlatform: (mediaData as unknown as Record<string, unknown>)?.platform
                },
                timestampExtraction: {
                    extractedTimestamp: postedDate.toISOString(),
                    tikTokDataKeys: platform === 'tiktok' ? Object.keys(mediaData as unknown as Record<string, unknown>) : null,
                    tikTokTimestamp: platform === 'tiktok' ? (mediaData as unknown as Record<string, unknown>)?.timestamp : null
                },
                databaseResult: {
                    videoId: newVideo.id,
                    postedAt: newVideo.postedAt?.toISOString(),
                    username: newVideo.username
                }
            }
        });

    } catch (error) {
        console.error('💥 ===== SCRAPING ENDPOINT CRASHED =====');
        console.error('🕐 Timestamp:', new Date().toISOString());
        console.error('💥 Error type:', typeof error);
        console.error('💥 Error message:', error instanceof Error ? error.message : 'Unknown error');
        console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('💥 Full error object:', error);
        
        return NextResponse.json(
            {
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
                errorType: typeof error,
                timestamp: new Date().toISOString(),
                debugInfo: {
                    error: error instanceof Error ? {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    } : error,
                    timestamp: new Date().toISOString()
                }
            },
            { status: 500 }
        );
    }
} 