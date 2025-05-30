import { NextRequest, NextResponse } from 'next/server';
import { scrapeInstagramVideo } from '@/lib/instagram';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    console.log('📸 /api/scrape-instagram endpoint hit');
    console.log('🔍 Environment check:', {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.TIKHUB_API_KEY,
        apiKeyLength: process.env.TIKHUB_API_KEY?.length,
        apiKeyPreview: process.env.TIKHUB_API_KEY?.substring(0, 10) + '...',
        hasDbUrl: !!process.env.DATABASE_URL
    });

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

        // Validate URL format
        if (!url.includes('instagram.com') && !url.includes('instagr.am')) {
            console.error('❌ Invalid Instagram URL format:', url);
            return NextResponse.json({
                success: false,
                error: 'Please provide a valid Instagram URL (instagram.com or instagr.am)'
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
            console.error('🐛 Debug info:', result.debugInfo);
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
        try {
            const existingVideo = await prisma.video.findUnique({
                where: { url: result.data.url }
            });

            if (existingVideo) {
                console.log('📋 Instagram post already exists, updating with latest data...');

                // Update existing Instagram post with latest data
                const updateData: any = {
                    currentViews: result.data.views,
                    currentLikes: result.data.likes,
                    currentComments: result.data.comments,
                    currentShares: result.data.shares,
                    lastScrapedAt: new Date(),
                    isActive: true
                };

                // Only update Instagram-specific fields if they exist in the schema
                try {
                    // Test if platform field exists by checking schema
                    const videoWithPlatform = await prisma.video.findFirst({
                        select: { id: true, platform: true }
                    });
                    console.log('✅ Platform field exists in schema');
                    updateData.platform = 'instagram';
                } catch {
                    console.log('⚠️ Platform field not available in current schema');
                }

                const updatedVideo = await prisma.video.update({
                    where: { url: result.data.url },
                    data: updateData
                });

                console.log('✅ Instagram post updated successfully:', {
                    id: result.data.id,
                    username: updatedVideo.username,
                    views: updatedVideo.currentViews,
                    url: updatedVideo.url,
                    isReel: result.data.isReel
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

            // Create new Instagram post record with fallback for missing fields
            const createData: any = {
                url: result.data.url,
                username: result.data.username,
                description: result.data.description,
                thumbnailUrl: result.data.thumbnailUrl,
                currentViews: result.data.views,
                currentLikes: result.data.likes,
                currentComments: result.data.comments,
                currentShares: result.data.shares,
                hashtags: result.data.hashtags ? JSON.stringify(result.data.hashtags) : null,
                isActive: true
            };

            // Test if new fields exist in schema and add them if available
            try {
                const videoWithPlatform = await prisma.video.findFirst({
                    select: { id: true, platform: true }
                });
                console.log('✅ Platform field exists, adding Instagram-specific data');
                createData.platform = 'instagram';
            } catch {
                console.log('⚠️ Platform field not available, using basic schema');
            }

            console.log('📄 Create data prepared:', Object.keys(createData));

            const newVideo = await prisma.video.create({
                data: createData
            });

            console.log('✅ New Instagram post created successfully:', {
                id: result.data.id,
                username: newVideo.username,
                views: newVideo.currentViews,
                dbId: newVideo.id,
                isReel: result.data.isReel
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

        } catch (dbError) {
            console.error('💥 Database error:', dbError);
            console.error('Database error details:', {
                name: dbError instanceof Error ? dbError.name : 'Unknown',
                message: dbError instanceof Error ? dbError.message : String(dbError),
                stack: dbError instanceof Error ? dbError.stack : undefined
            });

            return NextResponse.json({
                success: false,
                error: 'Database operation failed',
                details: dbError instanceof Error ? dbError.message : 'Unknown database error',
                debugInfo: {
                    errorType: dbError instanceof Error ? dbError.name : typeof dbError,
                    timestamp: new Date().toISOString()
                }
            }, { status: 500 });
        }

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