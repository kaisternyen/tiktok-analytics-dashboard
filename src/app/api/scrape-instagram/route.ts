import { NextRequest, NextResponse } from 'next/server';
import { scrapeInstagramVideo } from '@/lib/instagram';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    console.log('📸 /api/scrape-instagram endpoint hit');

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

        console.log('🚀 Starting TikHub Instagram scraping process for URL:', url);

        // Scrape the Instagram post using TikHub API
        const result = await scrapeInstagramVideo(url);

        console.log('📦 TikHub Instagram scraping result:', {
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
            console.error('❌ TikHub Instagram scraping failed:', result.error);
            return NextResponse.json({
                success: false,
                error: result.error,
                debugInfo: result.debugInfo
            }, { status: 400 });
        }

        if (!result.data) {
            console.error('❌ No data returned from TikHub Instagram');
            return NextResponse.json({
                success: false,
                error: 'No Instagram data returned',
                debugInfo: result.debugInfo
            }, { status: 400 });
        }

        console.log('✅ TikHub Instagram scraping successful, proceeding to database operations...');

        // Check if Instagram post already exists in database
        console.log('🔍 Checking if Instagram post already exists in database...');
        const existingVideo = await prisma.video.findUnique({
            where: { url: result.data.url }
        });

        if (existingVideo) {
            console.log('📋 Instagram post already exists, updating with latest data...');

            // Update existing Instagram post with latest data
            const updatedVideo = await prisma.video.update({
                where: { url: result.data.url },
                data: {
                    currentViews: result.data.views,
                    currentLikes: result.data.likes,
                    currentComments: result.data.comments,
                    currentShares: result.data.shares,
                    lastScrapedAt: new Date(),
                    isActive: true,
                    // Update Instagram-specific fields
                    isReel: result.data.isReel,
                    location: result.data.location
                }
            });

            console.log('✅ Instagram post updated successfully:', {
                id: result.data.id,
                username: updatedVideo.username,
                views: updatedVideo.currentViews,
                url: updatedVideo.url,
                isReel: updatedVideo.isReel
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
                    platform: 'instagram',
                    isReel: result.data.isReel
                }
            });
        }

        console.log('📝 Creating new Instagram post record in database...');

        // Create new Instagram post record
        const newVideo = await prisma.video.create({
            data: {
                url: result.data.url,
                username: result.data.username,
                description: result.data.description,
                thumbnailUrl: result.data.thumbnailUrl,
                platform: 'instagram',
                currentViews: result.data.views,
                currentLikes: result.data.likes,
                currentComments: result.data.comments,
                currentShares: result.data.shares,
                hashtags: result.data.hashtags ? JSON.stringify(result.data.hashtags) : null,
                // Instagram-specific fields
                isReel: result.data.isReel,
                location: result.data.location,
                isActive: true
            }
        });

        console.log('✅ New Instagram post created successfully:', {
            id: result.data.id,
            username: newVideo.username,
            views: newVideo.currentViews,
            dbId: newVideo.id,
            isReel: newVideo.isReel
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
                platform: 'instagram',
                isReel: result.data.isReel
            }
        });

    } catch (error) {
        console.error('💥 Unexpected error in /api/scrape-instagram:', error);
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