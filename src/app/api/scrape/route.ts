import { NextRequest, NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/tikhub';
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

        console.log('🚀 Starting TikHub scraping process for URL:', url);

        // Scrape the video using TikHub API
        const result = await scrapeTikTokVideo(url);

        console.log('📦 TikHub scraping result:', {
            success: result.success,
            hasData: result.success && !!result.data,
            hasError: !!result.error,
            hasDebugInfo: !!result.debugInfo,
            errorMessage: result.error,
            dataPreview: result.success && result.data ? {
                id: result.data.id,
                username: result.data.username,
                views: result.data.views,
                url: result.data.url
            } : null
        });

        if (!result.success) {
            console.error('❌ TikHub scraping failed:', result.error);
            return NextResponse.json({
                success: false,
                error: result.error,
                debugInfo: result.debugInfo
            }, { status: 400 });
        }

        if (!result.data) {
            console.error('❌ No data returned from TikHub');
            return NextResponse.json({
                success: false,
                error: 'No video data returned',
                debugInfo: result.debugInfo
            }, { status: 400 });
        }

        console.log('✅ TikHub scraping successful, proceeding to database operations...');

        // Check if video already exists in database
        console.log('🔍 Checking if video already exists in database...');
        const existingVideo = await prisma.video.findUnique({
            where: { url: result.data.url }
        });

        if (existingVideo) {
            console.log('📋 Video already exists, updating with latest data...');

            // Update existing video with latest data
            const updatedVideo = await prisma.video.update({
                where: { url: result.data.url },
                data: {
                    currentViews: result.data.views,
                    currentLikes: result.data.likes,
                    currentComments: result.data.comments,
                    currentShares: result.data.shares,
                    thumbnailUrl: result.data.thumbnailUrl,
                    lastScrapedAt: new Date(),
                    isActive: true
                }
            });

            console.log('✅ Video updated successfully:', {
                id: result.data.id,
                username: updatedVideo.username,
                views: updatedVideo.currentViews,
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
                    shares: updatedVideo.currentShares
                }
            });
        }

        console.log('📝 Creating new video record in database...');

        // Create new video record
        const newVideo = await prisma.video.create({
            data: {
                url: result.data.url,
                username: result.data.username,
                description: result.data.description,
                thumbnailUrl: result.data.thumbnailUrl,
                currentViews: result.data.views,
                currentLikes: result.data.likes,
                currentComments: result.data.comments,
                currentShares: result.data.shares,
                hashtags: result.data.hashtags ? JSON.stringify(result.data.hashtags) : null,
                music: result.data.music ? JSON.stringify(result.data.music) : null,
                isActive: true
            }
        });

        console.log('✅ New video created successfully:', {
            id: result.data.id,
            username: newVideo.username,
            views: newVideo.currentViews,
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
                shares: newVideo.currentShares
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