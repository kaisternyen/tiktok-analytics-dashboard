import { NextRequest, NextResponse } from 'next/server';
import { scrapeTikTokVideo, scrapeMediaPost, TikTokVideoData, InstagramPostData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

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
        const cleanUrl = url.trim();
        let result;
        
        if (cleanUrl.includes('instagram.com')) {
            console.log('📸 Detected Instagram URL, using Instagram scraper');
            result = await scrapeMediaPost(url);
        } else if (cleanUrl.includes('tiktok.com')) {
            console.log('🎵 Detected TikTok URL, using TikTok scraper');
            result = await scrapeTikTokVideo(url);
        } else {
            console.error('❌ Unsupported platform URL:', url);
            return NextResponse.json({
                success: false,
                error: 'URL must be from TikTok or Instagram'
            }, { status: 400 });
        }

        console.log('📦 Media scraping result:', {
            success: result.success,
            hasData: result.success && !!result.data,
            hasError: !!result.error,
            hasDebugInfo: !!result.debugInfo,
            errorMessage: result.error,
            dataPreview: result.success && result.data ? {
                id: result.data.id,
                username: result.data.username,
                platform: cleanUrl.includes('instagram.com') ? 'Instagram' : 'TikTok',
                url: result.data.url
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
            where: { url: result.data.url }
        });

        // Handle different data structures for TikTok vs Instagram
        const isInstagram = cleanUrl.includes('instagram.com');
        const mediaData = result.data as TikTokVideoData | InstagramPostData;
        const platform = isInstagram ? 'instagram' : 'tiktok';

        if (existingVideo) {
            console.log('📋 Media already exists, updating with latest data...');

            // Update existing video with latest data
            const updatedVideo = await prisma.video.update({
                where: { url: result.data.url },
                data: {
                    platform: platform,
                    currentViews: isInstagram ? 
                        ((mediaData as InstagramPostData).plays || (mediaData as InstagramPostData).views || 0) : 
                        (mediaData as TikTokVideoData).views,
                    currentLikes: mediaData.likes,
                    currentComments: mediaData.comments,
                    currentShares: isInstagram ? 0 : ((mediaData as TikTokVideoData).shares || 0),
                    lastScrapedAt: new Date(),
                    isActive: true
                }
            });

            console.log('✅ Media updated successfully:', {
                id: result.data.id,
                username: updatedVideo.username,
                platform: platform,
                url: updatedVideo.url
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
                url: result.data.url,
                username: mediaData.username,
                description: mediaData.description,
                thumbnailUrl: mediaData.thumbnailUrl || (mediaData as InstagramPostData).displayUrl,
                platform: platform,
                currentViews: isInstagram ? 
                    ((mediaData as InstagramPostData).plays || (mediaData as InstagramPostData).views || 0) : 
                    (mediaData as TikTokVideoData).views,
                currentLikes: mediaData.likes,
                currentComments: mediaData.comments,
                currentShares: isInstagram ? 0 : ((mediaData as TikTokVideoData).shares || 0),
                hashtags: mediaData.hashtags ? JSON.stringify(mediaData.hashtags) : null,
                music: mediaData.music ? JSON.stringify(mediaData.music) : null,
                isActive: true
            }
        });

        console.log('✅ New media created successfully:', {
            id: result.data.id,
            username: newVideo.username,
            platform: platform,
            dbId: newVideo.id
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
        console.error('💥 Unexpected error in /api/scrape:', error);
        console.error('Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error',
            debugInfo: {
                errorType: error instanceof Error ? error.name : typeof error,
                timestamp: new Date().toISOString()
            }
        }, { status: 500 });
    }
} 