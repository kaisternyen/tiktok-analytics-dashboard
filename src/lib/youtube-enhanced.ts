// Enhanced YouTube integration using YouTube Data API v3
// Comprehensive implementation with multiple endpoints

export interface YouTubeChannel {
    id: string;
    title: string;
    description: string;
    customUrl?: string;
    publishedAt: string;
    thumbnails: {
        default?: { url: string; width: number; height: number };
        medium?: { url: string; width: number; height: number };
        high?: { url: string; width: number; height: number };
    };
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    hiddenSubscriberCount: boolean;
    country?: string;
    keywords?: string[];
}

export interface YouTubeVideo {
    id: string;
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
        default?: { url: string; width: number; height: number };
        medium?: { url: string; width: number; height: number };
        high?: { url: string; width: number; height: number };
        standard?: { url: string; width: number; height: number };
        maxres?: { url: string; width: number; height: number };
    };
    duration: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    tags?: string[];
    categoryId: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    liveBroadcastContent: 'none' | 'upcoming' | 'live';
}

export interface YouTubePlaylist {
    id: string;
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
        default?: { url: string; width: number; height: number };
        medium?: { url: string; width: number; height: number };
        high?: { url: string; width: number; height: number };
    };
    itemCount: number;
    privacy: 'public' | 'unlisted' | 'private';
}

export interface YouTubeComment {
    id: string;
    textDisplay: string;
    textOriginal: string;
    authorDisplayName: string;
    authorProfileImageUrl: string;
    authorChannelUrl: string;
    authorChannelId: string;
    canRate: boolean;
    totalReplyCount: number;
    likeCount: number;
    publishedAt: string;
    updatedAt: string;
}

export interface YouTubeSearchResult {
    videos: YouTubeVideo[];
    channels: YouTubeChannel[];
    playlists: YouTubePlaylist[];
    nextPageToken?: string;
    totalResults: number;
    resultsPerPage: number;
}

export class YouTubeAPI {
    private apiKey: string;
    private baseUrl = 'https://www.googleapis.com/youtube/v3';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async makeRequest(endpoint: string, params: Record<string, string> = {}, retryCount = 0): Promise<any> {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        url.searchParams.append('key', this.apiKey);
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        console.log(`📡 YouTube API request: ${endpoint} (attempt ${retryCount + 1})`, params);

        const response = await fetch(url.toString());

        console.log(`📡 YouTube API response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ YouTube API error:', {
                endpoint,
                status: response.status,
                statusText: response.statusText,
                body: errorText,
                url: url.toString(),
                headers: Object.fromEntries(response.headers.entries()),
                attempt: retryCount + 1
            });

            // Handle rate limiting with exponential backoff
            if (response.status === 429 && retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
                console.warn(`🚨 RATE LIMIT HIT: YouTube API returned 429. Retrying in ${delay/1000}s... (attempt ${retryCount + 1}/3)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRequest(endpoint, params, retryCount + 1);
            }

            // Provide more specific error messages based on status codes
            let errorMessage = `YouTube API error: ${response.status} ${response.statusText}`;
            if (response.status === 401) {
                errorMessage = 'YouTube API authentication failed. Please check your API key.';
            } else if (response.status === 403) {
                errorMessage = 'YouTube API quota exceeded or access denied. Please check your API key and quota limits.';
            } else if (response.status === 404) {
                errorMessage = 'YouTube resource not found.';
            } else if (response.status === 429) {
                errorMessage = 'YouTube API rate limit exceeded. Too many requests - please try again later.';
            } else if (response.status >= 500) {
                errorMessage = 'YouTube API server error. Please try again later.';
            }

            throw new Error(errorMessage);
        }

         
        return response.json();
    }

    // Get channel information by username or channel ID
    async getChannel(identifier: string): Promise<YouTubeChannel | null> {
        let data;
        
        // Clean the identifier - remove @ if present and any URL parts
        let cleanIdentifier = identifier;
        if (cleanIdentifier.startsWith('@')) {
            cleanIdentifier = cleanIdentifier.substring(1);
        }
        // Handle full URLs like https://www.youtube.com/@touchgrassdaily
        if (cleanIdentifier.includes('youtube.com/@')) {
            const match = cleanIdentifier.match(/youtube\.com\/@([^\/?\s]+)/);
            if (match) {
                cleanIdentifier = match[1];
            }
        }
        
        // Try by handle first (modern approach)
        if (!identifier.startsWith('UC') || identifier.length !== 24) {
            try {
                data = await this.makeRequest('channels', {
                    part: 'snippet,statistics',
                    forHandle: `@${cleanIdentifier}`
                });
                
                if (data?.items && data.items.length > 0) {
                    // Found via handle, proceed to return
                } else {
                    // Try legacy username lookup
                    try {
                        data = await this.makeRequest('channels', {
                            part: 'snippet,statistics',
                            forUsername: cleanIdentifier
                        });
                    } catch {
                        // If username fails, try search
                        const searchData = await this.makeRequest('search', {
                            part: 'snippet',
                            q: cleanIdentifier,
                            type: 'channel',
                            maxResults: '1'
                        });
                        
                        if (searchData.items && searchData.items.length > 0) {
                            const channelId = searchData.items[0].snippet.channelId;
                            data = await this.makeRequest('channels', {
                                part: 'snippet,statistics',
                                id: channelId
                            });
                        }
                    }
                }
            } catch {
                // If handle fails, try username
                try {
                    data = await this.makeRequest('channels', {
                        part: 'snippet,statistics',
                        forUsername: cleanIdentifier
                    });
                } catch {
                    // If username fails, try search
                    const searchData = await this.makeRequest('search', {
                        part: 'snippet',
                        q: cleanIdentifier,
                        type: 'channel',
                        maxResults: '1'
                    });
                    
                    if (searchData.items && searchData.items.length > 0) {
                        const channelId = searchData.items[0].snippet.channelId;
                        data = await this.makeRequest('channels', {
                            part: 'snippet,statistics',
                            id: channelId
                        });
                    }
                }
            }
        } else {
            // Direct channel ID lookup
            data = await this.makeRequest('channels', {
                part: 'snippet,statistics',
                id: identifier
            });
        }

        if (!data?.items || data.items.length === 0) {
            return null;
        }

        const channel = data.items[0];
        const snippet = channel.snippet;
        const statistics = channel.statistics;

        return {
            id: channel.id,
            title: snippet.title,
            description: snippet.description,
            customUrl: snippet.customUrl,
            publishedAt: snippet.publishedAt,
            thumbnails: snippet.thumbnails,
            subscriberCount: parseInt(statistics.subscriberCount || '0'),
            videoCount: parseInt(statistics.videoCount || '0'),
            viewCount: parseInt(statistics.viewCount || '0'),
            hiddenSubscriberCount: statistics.hiddenSubscriberCount || false,
            country: snippet.country,
            keywords: snippet.keywords
        };
    }

    // Get recent videos from a channel
    async getChannelVideos(
        channelId: string, 
        maxResults: number = 50, 
        pageToken?: string
    ): Promise<{
        videos: YouTubeVideo[];
        nextPageToken?: string;
        totalResults: number;
    }> {
        const params: Record<string, string> = {
            part: 'snippet',
            channelId,
            order: 'date',
            type: 'video',
            maxResults: maxResults.toString()
        };

        if (pageToken) {
            params.pageToken = pageToken;
        }

        const searchData = await this.makeRequest('search', params);

        if (!searchData.items || searchData.items.length === 0) {
            return { videos: [], totalResults: 0 };
        }

        // Get video IDs to fetch detailed statistics
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
        
        const videosData = await this.makeRequest('videos', {
            part: 'snippet,statistics,contentDetails',
            id: videoIds
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videos: YouTubeVideo[] = videosData.items.map((video: any) => ({
            id: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            publishedAt: video.snippet.publishedAt,
            thumbnails: video.snippet.thumbnails,
            duration: video.contentDetails.duration,
            viewCount: parseInt(video.statistics.viewCount || '0'),
            likeCount: parseInt(video.statistics.likeCount || '0'),
            commentCount: parseInt(video.statistics.commentCount || '0'),
            tags: video.snippet.tags,
            categoryId: video.snippet.categoryId,
            defaultLanguage: video.snippet.defaultLanguage,
            defaultAudioLanguage: video.snippet.defaultAudioLanguage,
            liveBroadcastContent: video.snippet.liveBroadcastContent
        }));

        return {
            videos,
            nextPageToken: searchData.nextPageToken,
            totalResults: searchData.pageInfo.totalResults
        };
    }

    // Get video details by ID
    async getVideo(videoId: string): Promise<YouTubeVideo | null> {
        const data = await this.makeRequest('videos', {
            part: 'snippet,statistics,contentDetails',
            id: videoId
        });

        if (!data.items || data.items.length === 0) {
            return null;
        }

        const video = data.items[0];
        
        return {
            id: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            publishedAt: video.snippet.publishedAt,
            thumbnails: video.snippet.thumbnails,
            duration: video.contentDetails.duration,
            viewCount: parseInt(video.statistics.viewCount || '0'),
            likeCount: parseInt(video.statistics.likeCount || '0'),
            commentCount: parseInt(video.statistics.commentCount || '0'),
            tags: video.snippet.tags,
            categoryId: video.snippet.categoryId,
            defaultLanguage: video.snippet.defaultLanguage,
            defaultAudioLanguage: video.snippet.defaultAudioLanguage,
            liveBroadcastContent: video.snippet.liveBroadcastContent
        };
    }

    // Get video comments
    async getVideoComments(
        videoId: string,
        maxResults: number = 100,
        pageToken?: string
    ): Promise<{
        comments: YouTubeComment[];
        nextPageToken?: string;
        totalResults: number;
    }> {
        const params: Record<string, string> = {
            part: 'snippet',
            videoId,
            maxResults: maxResults.toString(),
            order: 'time'
        };

        if (pageToken) {
            params.pageToken = pageToken;
        }

        try {
            const data = await this.makeRequest('commentThreads', params);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const comments: YouTubeComment[] = data.items.map((item: any) => {
                const comment = item.snippet.topLevelComment.snippet;
                return {
                    id: item.snippet.topLevelComment.id,
                    textDisplay: comment.textDisplay,
                    textOriginal: comment.textOriginal,
                    authorDisplayName: comment.authorDisplayName,
                    authorProfileImageUrl: comment.authorProfileImageUrl,
                    authorChannelUrl: comment.authorChannelUrl,
                    authorChannelId: comment.authorChannelId?.value || '',
                    canRate: comment.canRate,
                    totalReplyCount: item.snippet.totalReplyCount,
                    likeCount: comment.likeCount,
                    publishedAt: comment.publishedAt,
                    updatedAt: comment.updatedAt
                };
            });

            return {
                comments,
                nextPageToken: data.nextPageToken,
                totalResults: data.pageInfo.totalResults
            };
        } catch (error) {
            // Comments might be disabled
            console.warn(`Comments not available for video ${videoId}:`, error);
            return { comments: [], totalResults: 0 };
        }
    }

    // Search for videos, channels, and playlists
    async search(
        query: string,
        type: 'video' | 'channel' | 'playlist' | 'all' = 'all',
        maxResults: number = 25,
        pageToken?: string
    ): Promise<YouTubeSearchResult> {
        const params: Record<string, string> = {
            part: 'snippet',
            q: query,
            maxResults: maxResults.toString(),
            order: 'relevance'
        };

        if (type !== 'all') {
            params.type = type;
        }

        if (pageToken) {
            params.pageToken = pageToken;
        }

        const data = await this.makeRequest('search', params);

        const result: YouTubeSearchResult = {
            videos: [],
            channels: [],
            playlists: [],
            nextPageToken: data.nextPageToken,
            totalResults: data.pageInfo.totalResults,
            resultsPerPage: data.pageInfo.resultsPerPage
        };

        // Process search results by type
        for (const item of data.items) {
            const snippet = item.snippet;

            if (item.id.kind === 'youtube#video') {
                result.videos.push({
                    id: item.id.videoId,
                    title: snippet.title,
                    description: snippet.description,
                    channelId: snippet.channelId,
                    channelTitle: snippet.channelTitle,
                    publishedAt: snippet.publishedAt,
                    thumbnails: snippet.thumbnails,
                    duration: '',
                    viewCount: 0,
                    likeCount: 0,
                    commentCount: 0,
                    categoryId: '',
                    liveBroadcastContent: snippet.liveBroadcastContent || 'none'
                });
            } else if (item.id.kind === 'youtube#channel') {
                result.channels.push({
                    id: item.id.channelId,
                    title: snippet.title,
                    description: snippet.description,
                    publishedAt: snippet.publishedAt,
                    thumbnails: snippet.thumbnails,
                    subscriberCount: 0,
                    videoCount: 0,
                    viewCount: 0,
                    hiddenSubscriberCount: false
                });
            } else if (item.id.kind === 'youtube#playlist') {
                result.playlists.push({
                    id: item.id.playlistId,
                    title: snippet.title,
                    description: snippet.description,
                    channelId: snippet.channelId,
                    channelTitle: snippet.channelTitle,
                    publishedAt: snippet.publishedAt,
                    thumbnails: snippet.thumbnails,
                    itemCount: 0,
                    privacy: 'public'
                });
            }
        }

        return result;
    }

    // Get trending videos
    async getTrendingVideos(
        regionCode: string = 'US',
        categoryId?: string,
        maxResults: number = 50
    ): Promise<YouTubeVideo[]> {
        const params: Record<string, string> = {
            part: 'snippet,statistics,contentDetails',
            chart: 'mostPopular',
            regionCode,
            maxResults: maxResults.toString()
        };

        if (categoryId) {
            params.videoCategoryId = categoryId;
        }

        const data = await this.makeRequest('videos', params);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.items.map((video: any) => ({
            id: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            publishedAt: video.snippet.publishedAt,
            thumbnails: video.snippet.thumbnails,
            duration: video.contentDetails.duration,
            viewCount: parseInt(video.statistics.viewCount || '0'),
            likeCount: parseInt(video.statistics.likeCount || '0'),
            commentCount: parseInt(video.statistics.commentCount || '0'),
            tags: video.snippet.tags,
            categoryId: video.snippet.categoryId,
            defaultLanguage: video.snippet.defaultLanguage,
            defaultAudioLanguage: video.snippet.defaultAudioLanguage,
            liveBroadcastContent: video.snippet.liveBroadcastContent
        }));
    }

    // Get channel playlists
    async getChannelPlaylists(
        channelId: string,
        maxResults: number = 50,
        pageToken?: string
    ): Promise<{
        playlists: YouTubePlaylist[];
        nextPageToken?: string;
        totalResults: number;
    }> {
        const params: Record<string, string> = {
            part: 'snippet,contentDetails',
            channelId,
            maxResults: maxResults.toString()
        };

        if (pageToken) {
            params.pageToken = pageToken;
        }

        const data = await this.makeRequest('playlists', params);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playlists: YouTubePlaylist[] = data.items.map((playlist: any) => ({
            id: playlist.id,
            title: playlist.snippet.title,
            description: playlist.snippet.description,
            channelId: playlist.snippet.channelId,
            channelTitle: playlist.snippet.channelTitle,
            publishedAt: playlist.snippet.publishedAt,
            thumbnails: playlist.snippet.thumbnails,
            itemCount: playlist.contentDetails.itemCount,
            privacy: playlist.status?.privacyStatus || 'public'
        }));

        return {
            playlists,
            nextPageToken: data.nextPageToken,
            totalResults: data.pageInfo.totalResults
        };
    }

    // Helper method to parse ISO 8601 duration to seconds
    parseDuration(duration: string): number {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        
        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');
        
        return hours * 3600 + minutes * 60 + seconds;
    }

    // Helper method to format duration from seconds
    formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
} 