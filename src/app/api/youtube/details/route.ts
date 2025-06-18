import { NextRequest, NextResponse } from 'next/server';
import { YouTubeAPI } from '@/lib/youtube-enhanced';

export const dynamic = 'force-dynamic';

// GET - Get comprehensive YouTube channel details
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const channelIdentifier = searchParams.get('channel');
        const action = searchParams.get('action') || 'profile';
        const maxResults = parseInt(searchParams.get('maxResults') || '25');
        const pageToken = searchParams.get('pageToken') || undefined;

        if (!channelIdentifier) {
            return NextResponse.json({
                success: false,
                error: 'Channel identifier is required'
            }, { status: 400 });
        }

        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                success: false,
                error: 'YouTube API key not configured'
            }, { status: 500 });
        }

        const youtubeAPI = new YouTubeAPI(apiKey);

        try {
            switch (action) {
                case 'profile': {
                    const channel = await youtubeAPI.getChannel(channelIdentifier);
                    if (!channel) {
                        return NextResponse.json({
                            success: false,
                            error: `YouTube channel ${channelIdentifier} not found`
                        }, { status: 404 });
                    }

                    return NextResponse.json({
                        success: true,
                        data: {
                            channel,
                            metadata: {
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'videos': {
                    // First get channel to resolve ID if needed
                    const channel = await youtubeAPI.getChannel(channelIdentifier);
                    if (!channel) {
                        return NextResponse.json({
                            success: false,
                            error: `YouTube channel ${channelIdentifier} not found`
                        }, { status: 404 });
                    }

                    const videosData = await youtubeAPI.getChannelVideos(channel.id, maxResults, pageToken);
                    
                    return NextResponse.json({
                        success: true,
                        data: {
                            channel: {
                                id: channel.id,
                                title: channel.title,
                                thumbnails: channel.thumbnails
                            },
                            videos: videosData.videos,
                            metadata: {
                                totalResults: videosData.totalResults,
                                nextPageToken: videosData.nextPageToken,
                                hasMoreVideos: !!videosData.nextPageToken,
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'playlists': {
                    const channel = await youtubeAPI.getChannel(channelIdentifier);
                    if (!channel) {
                        return NextResponse.json({
                            success: false,
                            error: `YouTube channel ${channelIdentifier} not found`
                        }, { status: 404 });
                    }

                    const playlistsData = await youtubeAPI.getChannelPlaylists(channel.id, maxResults, pageToken);
                    
                    return NextResponse.json({
                        success: true,
                        data: {
                            channel: {
                                id: channel.id,
                                title: channel.title,
                                thumbnails: channel.thumbnails
                            },
                            playlists: playlistsData.playlists,
                            metadata: {
                                totalResults: playlistsData.totalResults,
                                nextPageToken: playlistsData.nextPageToken,
                                hasMorePlaylists: !!playlistsData.nextPageToken,
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'video': {
                    const videoId = searchParams.get('videoId');
                    if (!videoId) {
                        return NextResponse.json({
                            success: false,
                            error: 'Video ID is required for video action'
                        }, { status: 400 });
                    }

                    const video = await youtubeAPI.getVideo(videoId);
                    if (!video) {
                        return NextResponse.json({
                            success: false,
                            error: `YouTube video ${videoId} not found`
                        }, { status: 404 });
                    }

                    return NextResponse.json({
                        success: true,
                        data: {
                            video,
                            metadata: {
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'comments': {
                    const videoId = searchParams.get('videoId');
                    if (!videoId) {
                        return NextResponse.json({
                            success: false,
                            error: 'Video ID is required for comments action'
                        }, { status: 400 });
                    }

                    const commentsData = await youtubeAPI.getVideoComments(videoId, maxResults, pageToken);
                    
                    return NextResponse.json({
                        success: true,
                        data: {
                            videoId,
                            comments: commentsData.comments,
                            metadata: {
                                totalResults: commentsData.totalResults,
                                nextPageToken: commentsData.nextPageToken,
                                hasMoreComments: !!commentsData.nextPageToken,
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'search': {
                    const query = searchParams.get('query');
                    const type = searchParams.get('type') as 'video' | 'channel' | 'playlist' | 'all' || 'all';
                    
                    if (!query) {
                        return NextResponse.json({
                            success: false,
                            error: 'Search query is required for search action'
                        }, { status: 400 });
                    }

                    const searchResults = await youtubeAPI.search(query, type, maxResults, pageToken);
                    
                    return NextResponse.json({
                        success: true,
                        data: {
                            query,
                            type,
                            results: searchResults,
                            metadata: {
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                case 'trending': {
                    const regionCode = searchParams.get('regionCode') || 'US';
                    const categoryId = searchParams.get('categoryId') || undefined;
                    
                    const trendingVideos = await youtubeAPI.getTrendingVideos(regionCode, categoryId, maxResults);
                    
                    return NextResponse.json({
                        success: true,
                        data: {
                            regionCode,
                            categoryId,
                            videos: trendingVideos,
                            metadata: {
                                totalResults: trendingVideos.length,
                                lastUpdated: new Date().toISOString(),
                                source: 'youtube_data_api_v3'
                            }
                        }
                    });
                }

                default:
                    return NextResponse.json({
                        success: false,
                        error: `Unknown action: ${action}. Available actions: profile, videos, playlists, video, comments, search, trending`
                    }, { status: 400 });
            }

        } catch (apiError) {
            console.error('YouTube API Error:', apiError);
            
            // Handle specific YouTube API errors
            if (apiError instanceof Error && apiError.message.includes('403')) {
                return NextResponse.json({
                    success: false,
                    error: 'YouTube API quota exceeded or access denied. Please check your API key and quota limits.'
                }, { status: 403 });
            } else if (apiError instanceof Error && apiError.message.includes('404')) {
                return NextResponse.json({
                    success: false,
                    error: `YouTube resource not found: ${channelIdentifier}`
                }, { status: 404 });
            } else {
                return NextResponse.json({
                    success: false,
                    error: `YouTube API error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
                }, { status: 500 });
            }
        }

    } catch (error) {
        console.error('YouTube Details API Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
} 