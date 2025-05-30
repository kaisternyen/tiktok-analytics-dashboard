import { NextRequest, NextResponse } from 'next/server';
import { scrapeTikTokVideo } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    console.log('🚀 API /scrape endpoint called');

    try {
        const body = await request.json();
        console.log('📋 Request body received:', JSON.stringify(body, null, 2));

        const { url } = body;

        if (!url) {
            console.log('❌ No URL provided in request');
            return NextResponse.json(
                { error: 'URL is required' },
                { status: 400 }
            );
        }

        console.log('🔍 Processing URL:', url);
        console.log('🌍 Environment check:', {
            hasTikHubKey: !!process.env.TIKHUB_API_KEY,
            keyLength: process.env.TIKHUB_API_KEY?.length || 0
        });

        // Check if video already exists
        const existingVideo = await prisma.video.findUnique({
            where: { url: url.trim() }
        });

        if (existingVideo) {
            console.log('📺 Video already exists, updating metrics...');

            // Scrape for updated data
            const result = await scrapeTikTokVideo(url);

            if (result.success && result.data) {
                // Update video metrics
                await prisma.video.update({
                    where: { id: existingVideo.id },
                    data: {
                        currentViews: result.data.views,
                        currentLikes: result.data.likes,
                        currentComments: result.data.comments,
                        currentShares: result.data.shares,
                        lastScrapedAt: new Date(),
                    }
                });

                // Add new metrics history entry
                await prisma.metricsHistory.create({
                    data: {
                        videoId: existingVideo.id,
                        views: result.data.views,
                        likes: result.data.likes,
                        comments: result.data.comments,
                        shares: result.data.shares,
                    }
                });

                console.log('✅ Video metrics updated successfully');

                return NextResponse.json({
                    success: true,
                    data: result.data,
                    message: 'Video metrics updated'
                });
            } else {
                return NextResponse.json(
                    { error: result.error || 'Failed to scrape video' },
                    { status: 500 }
                );
            }
        }

        // Scrape the video for new entries
        console.log('🎬 Starting video scrape...');
        const result = await scrapeTikTokVideo(url);

        console.log('✅ Scrape result:', {
            success: result.success,
            hasData: !!result.data,
            error: result.error,
            debugInfo: result.debugInfo ? 'Present' : 'Missing'
        });

        if (result.success && result.data) {
            console.log('🎉 Scrape successful, saving to database...');

            // Save video to database
            const video = await prisma.video.create({
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
                }
            });

            // Create initial metrics history entry
            await prisma.metricsHistory.create({
                data: {
                    videoId: video.id,
                    views: result.data.views,
                    likes: result.data.likes,
                    comments: result.data.comments,
                    shares: result.data.shares,
                }
            });

            console.log('💾 Video saved to database with ID:', video.id);

            return NextResponse.json({
                success: true,
                data: {
                    ...result.data,
                    id: video.id // Use database ID
                },
                debugInfo: result.debugInfo
            });
        } else {
            console.log('💥 Scrape failed:', result.error);
            return NextResponse.json(
                {
                    error: result.error || 'Failed to scrape video',
                    debugInfo: result.debugInfo
                },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('💥 API endpoint error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
} 