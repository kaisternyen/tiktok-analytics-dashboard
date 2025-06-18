import { NextRequest, NextResponse } from 'next/server';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp, getIntervalForCadence } from '@/lib/timestamp-utils';
import { uploadToS3 } from '../../../lib/s3';
import fetch from 'node-fetch';

export async function POST(request: NextRequest) {
    console.log('🎬 /api/scrape endpoint hit');

    try {
        console.log('🔍 Parsing request body...');
        const { url } = await request.json();

        console.log('📝 Request details:', {
            url: url,
            hasUrl: !!url,
            urlType: typeof url,
            urlLength: url?.length,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries())
        });

        if (!url) {
            console.error('❌ No URL provided in request');
            return NextResponse.json({
                success: false,
                error: 'URL is required'
            }, { status: 400 });
        }

        console.log('🚀 Starting media scraping process for URL:', url);

        // Detect platform and scrape accordingly
        const cleanUrl = url.trim().toLowerCase();
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
            return NextResponse.json({
                success: false,
                error: 'URL must be from TikTok, Instagram, or YouTube'
            }, { status: 400 });
        }

        // Use unified scraper
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
            return NextResponse.json({
                success: false,
                error: result.error,
                debugInfo: result.debugInfo
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

        // Check if video already exists in database
        console.log('🔍 Checking if media already exists in database...');
        const existingVideo = await prisma.video.findUnique({
            where: { url: result.data.url || url }
        });

        // Handle different data structures for each platform
        const mediaData = result.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
        
        // Get platform-specific data
        let views: number, likes: number, comments: number, shares: number;
        let username: string, description: string, thumbnailUrl: string | undefined;

        if (platform === 'instagram') {
            const instaData = mediaData as InstagramPostData;
            views = instaData.plays || instaData.views || 0;
            likes = instaData.likes;
            comments = instaData.comments;
            shares = 0; // Instagram doesn't track shares
            username = instaData.username;
            description = instaData.description;
            thumbnailUrl = instaData.thumbnailUrl || instaData.displayUrl;
        } else if (platform === 'youtube') {
            const ytData = mediaData as YouTubeVideoData;
            views = ytData.views;
            likes = ytData.likes;
            comments = ytData.comments;
            shares = 0; // YouTube API doesn't provide share count
            username = ytData.channelTitle;
            description = ytData.description;
            thumbnailUrl = ytData.thumbnails?.medium?.url || ytData.thumbnails?.high?.url;
        } else { // tiktok
            const tikData = mediaData as TikTokVideoData;
            views = tikData.views;
            likes = tikData.likes;
            comments = tikData.comments;
            shares = tikData.shares || 0;
            username = tikData.username;
            description = tikData.description;
            thumbnailUrl = tikData.thumbnailUrl;
        }

        // Always upload thumbnail to S3 if present
        if (thumbnailUrl) {
            console.log('🖼️ Starting S3 upload for thumbnail:', thumbnailUrl);
            try {
                console.log('📥 Fetching thumbnail from original URL...');
                const res = await fetch(thumbnailUrl);
                if (res.ok) {
                    console.log('✅ Thumbnail fetch successful, uploading to S3...');
                    const buffer = await res.buffer();
                    const key = `thumbnails/${existingVideo ? existingVideo.id : result.data.id}.jpg`;
                    console.log('🔑 S3 key:', key);
                    const s3Url = await uploadToS3(buffer, key, 'image/jpeg');
                    thumbnailUrl = s3Url;
                    console.log('✅ Thumbnail uploaded to S3 successfully:', s3Url);
                } else {
                    console.error('❌ Failed to fetch thumbnail, status:', res.status);
                }
            } catch (err) {
                console.error('❌ Failed to upload thumbnail to S3:', err);
            }
        } else {
            console.log('⚠️ No thumbnail URL found, skipping S3 upload');
        }
        console.log('📋 Final thumbnail URL to be stored:', thumbnailUrl);

        if (existingVideo) {
            console.log('📋 Media already exists, updating with latest data...');

            // Update existing video with latest data
            const updatedVideo = await prisma.video.update({
                where: { url: result.data.url || url },
                data: {
                    platform: platform,
                    currentViews: views,
                    currentLikes: likes,
                    currentComments: comments,
                    currentShares: shares,
                    lastScrapedAt: new Date(),
                    isActive: true,
                    thumbnailUrl: thumbnailUrl
                }
            });

            // Add metrics history entry for manual scrapes to appear on graph
            const normalizedTimestamp = getCurrentNormalizedTimestamp(getIntervalForCadence('manual'));
            
            // Check if we already have a metric entry at this normalized timestamp
            const existingMetric = await prisma.metricsHistory.findFirst({
                where: {
                    videoId: updatedVideo.id,
                    timestamp: new Date(normalizedTimestamp)
                }
            });
            
            if (!existingMetric) {
                await prisma.metricsHistory.create({
                    data: {
                        videoId: updatedVideo.id,
                        views: views,
                        likes: likes,
                        comments: comments,
                        shares: shares,
                        timestamp: new Date(normalizedTimestamp)
                    }
                });
                console.log(`📊 Created new metrics entry at normalized timestamp: ${normalizedTimestamp}`);
            } else {
                // Update existing entry with latest values (this handles multiple scrapes within the same interval)
                await prisma.metricsHistory.update({
                    where: { id: existingMetric.id },
                    data: {
                        views: views,
                        likes: likes,
                        comments: comments,
                        shares: shares,
                    }
                });
                console.log(`📊 Updated existing metrics entry at normalized timestamp: ${normalizedTimestamp}`);
            }

            console.log('✅ Media updated successfully with new metrics history:', {
                id: result.data.id,
                username: updatedVideo.username,
                platform: platform,
                url: updatedVideo.url,
                views: views,
                likes: likes
            });

            return NextResponse.json({
                success: true,
                message: 'updated',
                data: {
                    id: result.data.id,
                    username: updatedVideo.username,
                    url: updatedVideo.url,
                    views: updatedVideo.currentViews,
                    likes: updatedVideo.currentLikes,
                    comments: updatedVideo.currentComments,
                    shares: updatedVideo.currentShares,
                    platform: platform
                }
            });
        }

        console.log('📝 Creating new media record in database...');

        // Create new video record
        const newVideo = await prisma.video.create({
            data: {
                url: result.data.url || url,
                username: username,
                description: description,
                thumbnailUrl: thumbnailUrl,
                platform: platform,
                currentViews: views,
                currentLikes: likes,
                currentComments: comments,
                currentShares: shares,
                hashtags: (mediaData as TikTokVideoData | InstagramPostData).hashtags ? JSON.stringify((mediaData as TikTokVideoData | InstagramPostData).hashtags) : null,
                music: (mediaData as TikTokVideoData | InstagramPostData).music ? JSON.stringify((mediaData as TikTokVideoData | InstagramPostData).music) : null,
                isActive: true
            }
        });

        // Create initial metrics history entry so the first scrape appears on the graph
        const normalizedTimestamp = getCurrentNormalizedTimestamp(getIntervalForCadence('manual'));
        await prisma.metricsHistory.create({
            data: {
                videoId: newVideo.id,
                views: views,
                likes: likes,
                comments: comments,
                shares: shares,
                timestamp: new Date(normalizedTimestamp)
            }
        });

        console.log(`✅ New media created successfully with initial metrics history at ${normalizedTimestamp}:`, {
            id: result.data.id,
            username: newVideo.username,
            platform: platform,
            dbId: newVideo.id,
            initialViews: views,
            initialLikes: likes
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
            }
        });

    } catch (error) {
        console.error('💥 Scraping endpoint crashed:', error);
        return NextResponse.json(
            {
            success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
} 