import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log('📋 Fetching videos from database...');
        console.log('🔍 Environment check:', {
            nodeEnv: process.env.NODE_ENV,
            hasDbUrl: !!process.env.DATABASE_URL,
            dbUrlPreview: process.env.DATABASE_URL?.substring(0, 20) + '...'
        });

        const videos = await prisma.video.findMany({
            where: { isActive: true },
            include: {
                metricsHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 48 // Last 48 hours for charts
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Found ${videos.length} videos in database`);
        console.log('📊 Sample video structure:', videos[0] ? Object.keys(videos[0]) : 'No videos found');

        // Transform data for frontend
        const transformedVideos = videos.map((video, index) => {
            try {
                console.log(`🔄 Processing video ${index + 1}/${videos.length}:`, {
                    id: video.id,
                    username: video.username,
                    platform: video.platform || 'unknown',
                    hasIsReel: 'isReel' in video,
                    hasLocation: 'location' in video
                });

                // Parse JSON fields safely
                let hashtags = [];
                let music = null;

                try {
                    hashtags = video.hashtags ? JSON.parse(video.hashtags) : [];
                } catch (parseError) {
                    console.warn(`⚠️ Failed to parse hashtags for video ${video.id}:`, parseError);
                    hashtags = [];
                }

                try {
                    music = video.music ? JSON.parse(video.music) : null;
                } catch (parseError) {
                    console.warn(`⚠️ Failed to parse music for video ${video.id}:`, parseError);
                    music = null;
                }

                // Calculate growth from last 2 data points
                const history = video.metricsHistory;
                let growth = { views: 0, likes: 0, comments: 0, shares: 0 };

                if (history.length >= 2) {
                    const latest = history[0];
                    const previous = history[1];

                    growth = {
                        views: previous.views > 0 ? ((latest.views - previous.views) / previous.views) * 100 : 0,
                        likes: previous.likes > 0 ? ((latest.likes - previous.likes) / previous.likes) * 100 : 0,
                        comments: previous.comments > 0 ? ((latest.comments - previous.comments) / previous.comments) * 100 : 0,
                        shares: previous.shares > 0 ? ((latest.shares - previous.shares) / previous.shares) * 100 : 0,
                    };
                }

                // Safely access platform field (might not exist in older records)
                const platform = (video as any).platform || 'tiktok';
                console.log(`📱 Video platform detected:`, { id: video.id, platform });

                // Base video data
                const baseVideo = {
                    id: video.id,
                    url: video.url,
                    username: video.username,
                    description: video.description,
                    thumbnailUrl: video.thumbnailUrl,
                    posted: video.createdAt.toISOString(),
                    lastUpdate: video.lastScrapedAt.toISOString(),
                    status: video.isActive ? 'Active' : 'Paused',
                    views: video.currentViews,
                    likes: video.currentLikes,
                    comments: video.currentComments,
                    shares: video.currentShares,
                    hashtags,
                    music,
                    platform: platform as 'tiktok' | 'instagram',
                    growth,
                    history: history.map(h => ({
                        time: h.timestamp.toISOString(),
                        views: h.views,
                        likes: h.likes,
                        comments: h.comments,
                        shares: h.shares
                    })).reverse() // Oldest first for charts
                };

                // Add Instagram-specific fields if it's an Instagram post and fields exist
                if (platform === 'instagram') {
                    console.log(`📸 Processing Instagram video:`, {
                        id: video.id,
                        hasIsReel: 'isReel' in video,
                        hasLocation: 'location' in video,
                        isReel: (video as any).isReel,
                        location: (video as any).location
                    });

                    return {
                        ...baseVideo,
                        isReel: (video as any).isReel || false,
                        location: (video as any).location || undefined
                    };
                }

                return baseVideo;

            } catch (videoError) {
                console.error(`💥 Error processing video ${video.id}:`, videoError);
                console.error('Video data:', JSON.stringify(video, null, 2));
                
                // Return minimal safe structure
                return {
                    id: video.id,
                    url: video.url,
                    username: video.username,
                    description: video.description || '',
                    thumbnailUrl: video.thumbnailUrl,
                    posted: video.createdAt.toISOString(),
                    lastUpdate: video.lastScrapedAt.toISOString(),
                    status: video.isActive ? 'Active' : 'Paused',
                    views: video.currentViews,
                    likes: video.currentLikes,
                    comments: video.currentComments,
                    shares: video.currentShares,
                    hashtags: [],
                    music: null,
                    platform: 'tiktok' as const,
                    growth: { views: 0, likes: 0, comments: 0, shares: 0 },
                    history: []
                };
            }
        });

        console.log(`✅ Successfully transformed ${transformedVideos.length} videos`);

        return NextResponse.json({
            success: true,
            videos: transformedVideos
        });

    } catch (error) {
        console.error('💥 Error fetching videos:', error);
        console.error('Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch videos',
                details: error instanceof Error ? error.message : 'Unknown error',
                debugInfo: {
                    errorType: error instanceof Error ? error.name : typeof error,
                    timestamp: new Date().toISOString(),
                    environment: process.env.NODE_ENV
                }
            },
            { status: 500 }
        );
    }
} 