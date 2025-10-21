export interface TikTokVideoData {
    id: string;
    url: string;
    username: string;
    description: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    timestamp: string;
    hashtags: string[];
    thumbnailUrl?: string;
    music?: {
        name: string;
        author: string;
    };
}

// Instagram interfaces - Updated to match TikHub API response
export interface InstagramPostData {
    id: string;
    url: string;
    username: string;
    fullName: string;
    description: string;
    views?: number;
    plays?: number;
    likes: number;
    comments: number;
    timestamp: string;
    hashtags: string[];
    thumbnailUrl?: string;
    displayUrl?: string;
    videoUrl?: string;
    type: 'photo' | 'video' | 'carousel' | 'clips';
    isVideo: boolean;
    hasAudio?: boolean;
    duration?: number;
    dimensions?: {
        width: number;
        height: number;
    };
    owner: {
        username: string;
        fullName: string;
        followers: number;
        following?: number;
        totalPosts: number;
        isVerified: boolean;
        isPrivate: boolean;
        profilePicUrl?: string;
    };
    music?: {
        artistName: string;
        songName: string;
        usesOriginalAudio: boolean;
        audioId?: string;
    };
    recentComments?: Array<{
        username: string;
        text: string;
        likes: number;
        createdAt: number;
    }>;
}

export interface ScrapedInstagramResult {
    success: boolean;
    data?: InstagramPostData;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debugInfo?: any;
}

export interface ScrapedVideoResult {
    success: boolean;
    data?: TikTokVideoData;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debugInfo?: any;
}

// Type for TikHub API response data
interface TikHubVideoData {
    id?: string;
    aweme_id?: string;
    group_id?: string;
    url?: string;
    video_url?: string;
    share_url?: string;
    author?: {
        unique_id?: string;
        nickname?: string;
    };
    desc?: string;
    content?: string;
    statistics?: {
        play_count?: number;
        digg_count?: number;
        comment_count?: number;
        share_count?: number;
    };
    stats?: {
        play_count?: number;
        digg_count?: number;
        comment_count?: number;
        share_count?: number;
    };
    // Direct field access (for cases where stats are at root level)
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    create_time?: number;
    created_at?: number;
    text_extra?: Array<{
        hashtag_name?: string;
        type?: number;
    }>;
    music?: {
        title?: string;
        author?: string;
        owner_nickname?: string;
    };
    video?: {
        cover?: {
            url_list?: string[];
        };
        origin_cover?: {
            url_list?: string[];
        };
        dynamic_cover?: {
            url_list?: string[];
        };
        animated_cover?: {
            url_list?: string[];
        };
    };
}

interface TikHubApiResponse {
    code?: number;
    msg?: string;
    data?: {
        aweme_details?: TikHubVideoData[];
        aweme_list?: TikHubVideoData[];
        aweme_status?: TikHubVideoData[];
        aweme_detail?: TikHubVideoData;
    } & TikHubVideoData;
    message?: string;
}

// Centralized TikHub data extraction function
export function extractTikTokStatsFromTikHubData(videoData: unknown, originalUrl?: string): {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    username: string;
    description: string;
    videoId: string;
    timestamp: string;
    hashtags: string[];
    music?: { name: string; author: string };
    thumbnailUrl?: string;
} {
    console.log('🔍 CENTRALIZED TIKHUB DATA EXTRACTION:');
    console.log('📊 Input videoData keys:', Object.keys((videoData as Record<string, unknown>) || {}));
    console.log('📊 videoData.statistics:', (videoData as Record<string, unknown>)?.statistics);
    console.log('📊 videoData.stats:', (videoData as Record<string, unknown>)?.stats);
    console.log('📊 videoData.aweme_status:', (videoData as Record<string, unknown>)?.aweme_status);
    console.log('📊 videoData.aweme_detail:', (videoData as Record<string, unknown>)?.aweme_detail);
    console.log('📊 videoData.extra:', (videoData as Record<string, unknown>)?.extra);
    console.log('📊 FULL INPUT DATA:', JSON.stringify(videoData, null, 2));
    
    // Debug aweme_detail if it exists (this is where the actual video data is!)
    const awemeDetail = (videoData as Record<string, unknown>)?.aweme_detail as Record<string, unknown>;
    if (awemeDetail) {
        console.log('📊 aweme_detail keys:', Object.keys(awemeDetail));
        console.log('📊 aweme_detail.statistics:', awemeDetail.statistics);
        console.log('📊 FULL statistics object:', JSON.stringify(awemeDetail.statistics, null, 2));
        console.log('📊 aweme_detail.stats:', awemeDetail.stats);
        console.log('📊 aweme_detail.author:', awemeDetail.author);
        console.log('📊 aweme_detail.desc:', awemeDetail.desc);
    }
    
    // Debug aweme_status array if it exists
    const awemeStatus = (videoData as Record<string, unknown>)?.aweme_status as unknown[];
    if (awemeStatus && Array.isArray(awemeStatus) && awemeStatus.length > 0) {
        console.log('📊 aweme_status[0] keys:', Object.keys((awemeStatus[0] as Record<string, unknown>) || {}));
        console.log('📊 aweme_status[0] statistics:', (awemeStatus[0] as Record<string, unknown>)?.statistics);
        console.log('📊 aweme_status[0] stats:', (awemeStatus[0] as Record<string, unknown>)?.stats);
    }
    
    const data = videoData as Record<string, unknown>;
    
    // Check if we have aweme_detail (the actual video data) - use existing awemeDetail variable
    const videoDataToUse = awemeDetail || data;
    
    console.log('📊 Using video data from:', awemeDetail ? 'aweme_detail' : 'top level');
    
    // Extract statistics using correct TikHub field names
    const views = (videoDataToUse?.statistics as Record<string, unknown>)?.play_count as number || 0;
    const likes = (videoDataToUse?.statistics as Record<string, unknown>)?.digg_count as number || 0;
    const comments = (videoDataToUse?.statistics as Record<string, unknown>)?.comment_count as number || 0;
    const shares = (videoDataToUse?.statistics as Record<string, unknown>)?.share_count as number || 0;
    
    console.log('📊 EXTRACTED VALUES:', { views, likes, comments, shares });
    
    // Extract other data
    let username = (videoDataToUse?.author as Record<string, unknown>)?.unique_id as string || 
                   (videoDataToUse?.author as Record<string, unknown>)?.nickname as string || 
                   (videoDataToUse?.author as Record<string, unknown>)?.username as string;
    
    // If username is not found in API response, try to extract from URL
    if (!username || username === 'N/A') {
        if (originalUrl) {
            const urlMatch = originalUrl.match(/@([^\/]+)/);
            if (urlMatch && urlMatch[1]) {
                username = urlMatch[1];
                console.log('🔗 Extracted username from URL:', username);
            }
        }
    }
    
    // Final fallback
    if (!username) {
        username = 'N/A';
    }
                     
    const description = data?.desc as string || 
                        data?.content as string || 
                        data?.description as string || 
                        'N/A';
                        
    const videoId = data?.aweme_id as string || 
                    data?.group_id as string || 
                    data?.id as string || 
                    'unknown';
                    
    const timestamp = data?.timestamp 
        ? data.timestamp as string  // Already in ISO format
        : data?.create_time 
        ? new Date((data.create_time as number) * 1000).toISOString()
        : data?.created_at 
        ? new Date((data.created_at as number) * 1000).toISOString()
        : new Date().toISOString();
        
    const hashtags = Array.isArray(data?.text_extra)
        ? (data.text_extra as Array<{ hashtag_name?: string }>)
            .map((item: { hashtag_name?: string }) => item.hashtag_name || '')
            .filter((tag: string) => tag && tag.trim() !== '')
        : [];
        
    const music = data?.music ? {
        name: ((data.music as Record<string, unknown>)?.title as string) || 
              ((data.music as Record<string, unknown>)?.name as string) || 'Unknown',
        author: ((data.music as Record<string, unknown>)?.author as string) || 
                ((data.music as Record<string, unknown>)?.owner_nickname as string) || 'Unknown'
    } : undefined;
    
    const videoInfo = data?.video as Record<string, unknown>;
    const coverUrls = (videoInfo?.cover as Record<string, unknown>)?.url_list as string[];
    const originCoverUrls = (videoInfo?.origin_cover as Record<string, unknown>)?.url_list as string[];
    const dynamicCoverUrls = (videoInfo?.dynamic_cover as Record<string, unknown>)?.url_list as string[];
    
    const thumbnailUrl = coverUrls?.[0] ||
                        originCoverUrls?.[0] ||
                        dynamicCoverUrls?.[0] ||
                        (data?.cover_url as string) ||
                        undefined;
    
    console.log('📊 EXTRACTED VALUES:', { views, likes, comments, shares, username });
    console.log('🖼️ THUMBNAIL DEBUG:', {
        videoInfo: !!videoInfo,
        coverUrls: coverUrls?.length || 0,
        originCoverUrls: originCoverUrls?.length || 0,
        dynamicCoverUrls: dynamicCoverUrls?.length || 0,
        cover_url: !!data?.cover_url,
        finalThumbnailUrl: thumbnailUrl
    });
    
    return {
        views,
        likes,
        comments,
        shares,
        username,
        description,
        videoId,
        timestamp,
        hashtags,
        music,
        thumbnailUrl
    };
}

// Extract video ID from TikTok URL
export function extractVideoId(url: string): string | null {
    console.log('🔍 Extracting video ID from URL:', url);

    try {
        // Clean the URL first
        const cleanUrl = url.trim();

        // Handle different TikTok URL formats
        const patterns = [
            // Standard video URLs
            /tiktok\.com\/@[^\/]+\/video\/(\d+)/,
            // Short URLs (vm.tiktok.com)
            /vm\.tiktok\.com\/([A-Za-z0-9]+)/,
            // TikTok short links (tiktok.com/t/)
            /tiktok\.com\/t\/([A-Za-z0-9]+)/,
            // Mobile URLs
            /m\.tiktok\.com\/v\/(\d+)/,
            // Share URLs with video ID
            /tiktok\.com\/.*[?&]video_id=(\d+)/,
            // Any remaining pattern with digits
            /tiktok\.com\/.*\/(\d+)/,
            // Alternative patterns for edge cases
            /tiktok\.com.*\/(\d{19})/,  // 19-digit video IDs
            /(\d{19})/, // Last resort: extract any 19-digit number
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = cleanUrl.match(pattern);
            if (match && match[1]) {
                const videoId = match[1];
                console.log(`✅ Video ID extracted using pattern ${i + 1}:`, videoId);
                return videoId;
            }
        }

        // If no pattern matched, try to extract from query parameters
        try {
            const urlObj = new URL(cleanUrl);
            const videoId = urlObj.searchParams.get('video_id') ||
                urlObj.searchParams.get('aweme_id') ||
                urlObj.searchParams.get('id');
            if (videoId) {
                console.log('✅ Video ID extracted from query params:', videoId);
                return videoId;
            }
        } catch (urlError) {
            console.log('⚠️ URL parsing failed:', urlError);
        }

        console.log('❌ Could not extract video ID from URL');
        return null;
    } catch (error) {
        console.error('💥 Error in extractVideoId:', error);
        return null;
    }
}

// Scrape a single TikTok video using TikHub API
export async function scrapeTikTokVideo(url: string): Promise<ScrapedVideoResult> {
    console.log('🚀 Starting TikTok video scrape for URL:', url);
    console.log('🌍 Environment check at start:', {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.TIKHUB_API_KEY,
        apiKeyLength: process.env.TIKHUB_API_KEY?.length,
        apiKeyStart: process.env.TIKHUB_API_KEY?.substring(0, 10) + '...'
    });

    try {
        // Validate URL
        if (!url || typeof url !== 'string') {
            console.error('❌ INVALID URL:', { url, type: typeof url });
            throw new Error('Invalid URL provided');
        }

        // Clean and validate the URL
        const cleanUrl = url.trim();
        console.log('🧹 URL cleaning:', { original: url, cleaned: cleanUrl });

        if (!cleanUrl.includes('tiktok.com')) {
            console.error('❌ NOT A TIKTOK URL:', cleanUrl);
            throw new Error('URL must be a valid TikTok URL');
        }

        console.log('📝 Cleaned URL:', cleanUrl);

        // Check if TikHub API key is configured
        const apiKey = process.env.TIKHUB_API_KEY;
        if (!apiKey) {
            console.error('❌ NO API KEY FOUND');
            console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('TIK')));
            throw new Error('TIKHUB_API_KEY environment variable is not configured');
        }

        console.log('🔑 API Key found:', apiKey.substring(0, 10) + '...');
        console.log('🔑 API Key length:', apiKey.length);
        console.log('🔑 API Key starts with:', apiKey.substring(0, 20));

        // Extract video ID for validation
        console.log('🔍 Starting video ID extraction...');
        const videoId = extractVideoId(cleanUrl);
        if (!videoId) {
            console.error('❌ VIDEO ID EXTRACTION FAILED');
            console.error('URL patterns tested against:', cleanUrl);
            console.error('🔍 URL analysis:', {
                originalUrl: url,
                cleanUrl: cleanUrl,
                urlLength: cleanUrl.length,
                containsTikTok: cleanUrl.includes('tiktok.com')
            });
            throw new Error('Could not extract video ID from URL');
        }

        console.log('✅ Video ID extracted:', videoId);
        console.log('✅ Video ID length:', videoId.length);
        console.log('✅ Video ID type:', typeof videoId);

        // Prepare TikHub API request - Using original working endpoint
        const tikHubUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${videoId}`;

        console.log('📋 TikHub API request prepared for URL:', tikHubUrl);
        console.log('🌐 Making API request...');
        console.log('📋 Request headers:', {
            'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
            'Accept': 'application/json',
            'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
        });

        // Make request to TikHub API
        console.log('🎬 Calling TikHub API...');
        const response = await fetch(tikHubUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
            }
        });

        console.log('📞 TikHub API response status:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ ===== TIKHUB API ERROR =====');
            console.error('📊 Response details:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                url: tikHubUrl,
                videoId: videoId,
                apiKeyLength: apiKey.length,
                apiKeyStart: apiKey.substring(0, 10)
            });
            console.error('📋 Response headers:', Object.fromEntries(response.headers.entries()));
            console.error('📄 Response body:', errorText);
            console.error('🔍 Request details:', {
                method: 'GET',
                url: tikHubUrl,
                headers: {
                    'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
                    'Accept': 'application/json',
                    'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
                }
            });

            // Provide more specific error messages based on status codes
            let errorMessage = `TikHub API error: ${response.status} ${response.statusText}`;
            if (response.status === 401) {
                errorMessage = `TikHub API authentication failed. API Key: ${apiKey.substring(0, 10)}... (length: ${apiKey.length})`;
            } else if (response.status === 404) {
                errorMessage = `Video not found. URL: ${tikHubUrl}, Video ID: ${videoId}`;
            } else if (response.status === 429) {
                errorMessage = 'TikHub API rate limit exceeded. Please try again later.';
            } else if (response.status >= 500) {
                errorMessage = `TikHub API server error. Response: ${errorText.substring(0, 200)}...`;
            }

            // Return detailed error information instead of throwing
            return {
                success: false,
                error: errorMessage,
                debugInfo: {
                    tikHubResponse: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers.entries()),
                        body: errorText,
                        url: tikHubUrl,
                        videoId: videoId,
                        apiKeyLength: apiKey.length
                    },
                    request: {
                        method: 'GET',
                        url: tikHubUrl,
                        headers: {
                            'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
                            'Accept': 'application/json',
                            'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
                        }
                    }
                }
            };
        }

        console.log('🎉 API response successful, parsing JSON...');
        let apiResponse: TikHubApiResponse;
        try {
            apiResponse = await response.json();
        } catch (jsonError) {
            console.error('❌ TikHub API JSON parsing failed:', jsonError);
            return {
                success: false,
                error: 'TikHub API returned invalid JSON response',
                debugInfo: {
                    jsonError: jsonError instanceof Error ? jsonError.message : 'Unknown JSON error',
                    responseStatus: response.status,
                    responseHeaders: Object.fromEntries(response.headers.entries()),
                    tikHubUrl: tikHubUrl,
                    videoId: videoId
                }
            };
        }

        console.log('📦 Raw TikHub API response structure:', {
            hasData: !!apiResponse.data,
            hasAwemeStatus: !!apiResponse.data?.aweme_status,
            awemeStatusLength: apiResponse.data?.aweme_status?.length || 0,
            code: apiResponse.code,
            message: apiResponse.msg || apiResponse.message,
            dataKeys: apiResponse.data ? Object.keys(apiResponse.data) : []
        });

        console.log('🔍 FULL TIKHUB API RESPONSE:');
        console.log(JSON.stringify(apiResponse, null, 2));
        
        // COMPREHENSIVE LOGGING FOR DEBUGGING
        console.log('🔍 COMPREHENSIVE API RESPONSE ANALYSIS:');
        console.log('📊 Top level keys:', Object.keys(apiResponse));
        console.log('📊 apiResponse.data keys:', apiResponse.data ? Object.keys(apiResponse.data) : 'No data');
        
        if (apiResponse.data?.aweme_detail) {
            console.log('📊 aweme_detail keys:', Object.keys(apiResponse.data.aweme_detail));
            console.log('📊 aweme_detail statistics:', apiResponse.data.aweme_detail.statistics);
            console.log('📊 aweme_detail author:', apiResponse.data.aweme_detail.author?.unique_id);
        }
        
        if (apiResponse.data?.aweme_status) {
            console.log('📊 aweme_status length:', apiResponse.data.aweme_status.length);
            if (apiResponse.data.aweme_status[0]) {
                console.log('📊 aweme_status[0] keys:', Object.keys(apiResponse.data.aweme_status[0]));
                console.log('📊 aweme_status[0] statistics:', apiResponse.data.aweme_status[0].statistics);
                console.log('📊 aweme_status[0] FULL DATA:');
                console.log(JSON.stringify(apiResponse.data.aweme_status[0], null, 2));
            }
        }
        
        // Check if data is directly in apiResponse.data (not in aweme_status)
        if (apiResponse.data && !apiResponse.data.aweme_status) {
            console.log('📊 Data is directly in apiResponse.data, checking for statistics...');
            console.log('📊 Direct data statistics:', apiResponse.data.statistics);
            console.log('📊 Direct data keys:', Object.keys(apiResponse.data));
            console.log('📊 Direct data FULL:');
            console.log(JSON.stringify(apiResponse.data, null, 2));
        }

        // Check API response status (TikHub returns 200 for success)
        if (apiResponse.code && apiResponse.code !== 200) {
            console.error('❌ TikHub API returned error code:', apiResponse.code, apiResponse.msg);
            return {
                success: false,
                error: `TikHub API error: ${apiResponse.msg || 'Unknown error'}`,
                debugInfo: {
                    apiResponse,
                    url: cleanUrl,
                    videoId: videoId,
                    tikHubUrl: tikHubUrl
                }
            };
        }

        // Check if we have data (TikHub can return data in aweme_status[0] or directly in data)
        const videoData = apiResponse.data?.aweme_detail || apiResponse.data?.aweme_status?.[0] || apiResponse.data;

        if (!videoData) {
            console.log('❌ No video data returned from TikHub API');
            console.log('📊 API Response debugging info:', {
                hasData: !!apiResponse.data,
                dataKeys: apiResponse.data ? Object.keys(apiResponse.data) : [],
                fullResponse: JSON.stringify(apiResponse, null, 2)
            });

            return {
                success: false,
                error: 'No video data returned from TikHub API. The video may be private, deleted, or the URL format is not supported.',
                debugInfo: {
                    apiResponse,
                    url: cleanUrl,
                    videoId: videoId,
                    tikHubUrl: tikHubUrl
                }
            };
        }

        console.log('🔍 Processing TikHub video data...');
        console.log('📊 Video data keys:', Object.keys(videoData));
        console.log('📊 Video stats preview:', {
            aweme_id: videoData.aweme_id,
            author: videoData.author?.unique_id,
            views: videoData.statistics?.play_count,
            likes: videoData.statistics?.digg_count
        });
        
        // DETAILED LOGGING FOR VIEWS EXTRACTION
        console.log('🔍 DETAILED VIEWS EXTRACTION DEBUG:');
        console.log('📊 videoData.statistics:', videoData.statistics);
        console.log('📊 videoData.stats:', videoData.stats);
        console.log('📊 videoData.statistics?.play_count:', videoData.statistics?.play_count);
        console.log('📊 videoData.stats?.play_count:', videoData.stats?.play_count);
        console.log('📊 videoData.statistics keys:', videoData.statistics ? Object.keys(videoData.statistics) : 'N/A');
        console.log('📊 videoData.stats keys:', videoData.stats ? Object.keys(videoData.stats) : 'N/A');
        
        // Check all possible view count fields
        const possibleViewFields = [
            'play_count', 'view_count', 'views', 'playCount', 'viewCount',
            'video_play_count', 'video_view_count', 'aweme_statistics'
        ];
        
        console.log('🔍 CHECKING ALL POSSIBLE VIEW FIELDS:');
        possibleViewFields.forEach(field => {
            const statsValue = videoData.statistics?.[field as keyof typeof videoData.statistics];
            const dataValue = (videoData as Record<string, unknown>)[field];
            console.log(`📊 statistics.${field}:`, statsValue);
            console.log(`📊 data.${field}:`, dataValue);
        });

        // Use centralized TikHub data extraction function
        const extractedData = extractTikTokStatsFromTikHubData(videoData, cleanUrl);
        
        const transformedData: TikTokVideoData = {
            id: extractedData.videoId,
            username: extractedData.username,
            description: extractedData.description,
            views: extractedData.views,
            likes: extractedData.likes,
            comments: extractedData.comments,
            shares: extractedData.shares,
            timestamp: extractedData.timestamp,
            hashtags: extractedData.hashtags,
            music: extractedData.music,
            thumbnailUrl: (() => {
                // Collect all available thumbnail URLs from different sources
                const allSources = [
                    ...(videoData.video?.cover?.url_list || []),
                    ...(videoData.video?.origin_cover?.url_list || []),
                    ...(videoData.video?.dynamic_cover?.url_list || []),
                    ...(videoData.video?.animated_cover?.url_list || [])
                ];
                
                // Filter out invalid URLs
                const validUrls = allSources.filter(url => 
                    url && typeof url === 'string' && url.trim() !== ''
                );
                
                if (validUrls.length === 0) {
                    console.log('⚠️ No thumbnail URLs found in video data');
                    return undefined;
                }
                
                console.log(`🖼️ Found ${validUrls.length} potential thumbnail URLs`);
                
                // Prefer browser-compatible formats (JPEG, PNG, WebP) over HEIC
                const compatibleFormats = ['.jpeg', '.jpg', '.png', '.webp'];
                const heicFormat = ['.heic'];
                
                // First, try to find URLs with browser-compatible formats
                for (const format of compatibleFormats) {
                    const compatibleUrl = validUrls.find(url => url.toLowerCase().includes(format));
                    if (compatibleUrl) {
                        console.log(`✅ Selected browser-compatible thumbnail (${format}):`, compatibleUrl);
                        return compatibleUrl;
                    }
                }
                
                // If no compatible format found, use the first HEIC URL (will be handled by image proxy)
                const heicUrl = validUrls.find(url => 
                    heicFormat.some(format => url.toLowerCase().includes(format))
                );
                if (heicUrl) {
                    console.log('⚠️ Using HEIC format thumbnail (will convert via proxy):', heicUrl);
                    return heicUrl;
                }
                
                // Last resort: use the first available URL
                const fallbackUrl = validUrls[0];
                console.log('📷 Using fallback thumbnail URL:', fallbackUrl);
                return fallbackUrl;
            })(),
            url: cleanUrl // Always use the original cleaned URL
        };

        console.log('✨ Transformed data:', JSON.stringify(transformedData, null, 2));

        // Validate that we got meaningful data
        console.log('🔍 Data validation:', {
            hasVideoId: !!transformedData.id,
            hasUsername: transformedData.username !== 'N/A',
            hasViews: transformedData.views > 0,
            originalVideoId: videoId,
            extractedVideoId: transformedData.id
        });

        // Basic validation - ensure we have essential data
        if (!transformedData.id || transformedData.id === 'N/A') {
            console.log('⚠️ WARNING: No video ID found in response');
            return {
                success: false,
                error: 'No valid video ID found in API response',
                debugInfo: {
                    originalUrl: cleanUrl,
                    rawData: videoData,
                    transformedData: transformedData
                }
            };
        }

        console.log('🎉 FINAL SUCCESS RESULT:');
        console.log('📊 Final transformed data:', {
            id: transformedData.id,
            username: transformedData.username,
            views: transformedData.views,
            likes: transformedData.likes,
            comments: transformedData.comments,
            shares: transformedData.shares,
            url: transformedData.url
        });
        
        return {
            success: true,
            data: transformedData,
            debugInfo: {
                rawData: videoData,
                tikHubRawResponse: apiResponse,
                urlValidation: {
                    originalUrl: cleanUrl,
                    extractedVideoId: videoId,
                    responseVideoId: transformedData.id
                }
            }
        };

    } catch (error) {
        console.error('💥 Error scraping TikTok video:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            debugInfo: { error: error, url: url }
        };
    }
}

// Scrape multiple TikTok videos using batch API for better performance
export async function scrapeTikTokVideos(urls: string[]): Promise<ScrapedVideoResult[]> {
    console.log('🚀 Starting batch TikTok video scrape for URLs:', urls);

    // For batch processing, we can use TikHub's multi-video endpoint for better efficiency
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        console.error('❌ TIKHUB_API_KEY not configured');
        return urls.map(url => ({
            success: false,
            error: 'TIKHUB_API_KEY environment variable is not configured',
            debugInfo: { url }
        }));
    }

    // Try batch API first for better efficiency
    if (urls.length > 1) {
        try {
            const batchResult = await scrapeTikTokVideosBatch(urls);
            if (batchResult.length > 0) {
                return batchResult;
            }
        } catch (error) {
            console.log('⚠️ Batch API failed, falling back to individual requests:', error);
        }
    }

    // Fallback to individual requests
    const results: ScrapedVideoResult[] = [];

    for (const url of urls) {
        const result = await scrapeTikTokVideo(url);
        results.push(result);

        // Add a small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ Batch scrape completed:', {
        totalUrls: urls.length,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length
    });

    return results;
}

// Use TikHub's batch API for multiple videos
async function scrapeTikTokVideosBatch(urls: string[]): Promise<ScrapedVideoResult[]> {
    console.log('🚀 Using TikHub batch API for', urls.length, 'URLs');

    const apiKey = process.env.TIKHUB_API_KEY;
    const tikHubBatchUrl = 'https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_multi_video';

    const requestBody = {
        urls: urls
    };

    console.log('📋 TikHub batch API request prepared:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(tikHubBatchUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ TikHub batch API error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
        });
        throw new Error(`TikHub batch API error: ${response.status} ${response.statusText}`);
    }

    const apiResponse = await response.json();
    console.log('📦 Raw TikHub batch API response:', JSON.stringify(apiResponse, null, 2));

    // Process batch response
    const results: ScrapedVideoResult[] = [];

    if (apiResponse.data && Array.isArray(apiResponse.data)) {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const rawData = apiResponse.data[i];

            if (rawData && rawData.code === 0) {
                // Use centralized TikHub data extraction function
                const extractedData = extractTikTokStatsFromTikHubData(rawData.data, url);
                
                const transformedData: TikTokVideoData = {
                    id: extractedData.videoId,
                    url: rawData.data?.url || rawData.data?.video_url || url,
                    username: extractedData.username,
                    description: extractedData.description,
                    views: extractedData.views,
                    likes: extractedData.likes,
                    comments: extractedData.comments,
                    shares: extractedData.shares,
                    timestamp: extractedData.timestamp,
                    hashtags: extractedData.hashtags,
                    music: extractedData.music,
                    thumbnailUrl: (() => {
                        // Collect all available thumbnail URLs from different sources
                        const allSources = [
                            ...(rawData.data?.video?.cover?.url_list || []),
                            ...(rawData.data?.video?.origin_cover?.url_list || []),
                            ...(rawData.data?.video?.dynamic_cover?.url_list || []),
                            ...(rawData.data?.video?.animated_cover?.url_list || [])
                        ];
                        
                        // Filter out invalid URLs
                        const validUrls = allSources.filter(url => 
                            url && typeof url === 'string' && url.trim() !== ''
                        );
                        
                        if (validUrls.length === 0) {
                            console.log('⚠️ No thumbnail URLs found in video data');
                            return undefined;
                        }
                        
                        console.log(`🖼️ Found ${validUrls.length} potential thumbnail URLs`);
                        
                        // Prefer browser-compatible formats (JPEG, PNG, WebP) over HEIC
                        const compatibleFormats = ['.jpeg', '.jpg', '.png', '.webp'];
                        const heicFormat = ['.heic'];
                        
                        // First, try to find URLs with browser-compatible formats
                        for (const format of compatibleFormats) {
                            const compatibleUrl = validUrls.find(url => url.toLowerCase().includes(format));
                            if (compatibleUrl) {
                                console.log(`✅ Selected browser-compatible thumbnail (${format}):`, compatibleUrl);
                                return compatibleUrl;
                            }
                        }
                        
                        // If no compatible format found, use the first HEIC URL (will be handled by image proxy)
                        const heicUrl = validUrls.find(url => 
                            heicFormat.some(format => url.toLowerCase().includes(format))
                        );
                        if (heicUrl) {
                            console.log('⚠️ Using HEIC format thumbnail (will convert via proxy):', heicUrl);
                            return heicUrl;
                        }
                        
                        // Last resort: use the first available URL
                        const fallbackUrl = validUrls[0];
                        console.log('📷 Using fallback thumbnail URL:', fallbackUrl);
                        return fallbackUrl;
                    })()
                };

                results.push({
                    success: true,
                    data: transformedData,
                    debugInfo: { rawData, url }
                });
            } else {
                results.push({
                    success: false,
                    error: rawData?.msg || 'Unknown batch processing error',
                    debugInfo: { rawData, url }
                });
            }
        }
    } else {
        // If batch response format is unexpected, return errors for all URLs
        urls.forEach(url => {
            results.push({
                success: false,
                error: 'Unexpected batch API response format',
                debugInfo: { apiResponse, url }
            });
        });
    }

    return results;
}

// Check if TikHub is properly configured
export function isTikHubConfigured(): boolean {
    return !!process.env.TIKHUB_API_KEY;
}

// Instagram-specific functions

// Extract Instagram post ID from URL
export function extractInstagramPostId(url: string): string | null {
    console.log('🔍 Extracting Instagram post ID from URL:', url);

    try {
        const cleanUrl = url.trim();

        // Instagram URL patterns
        const patterns = [
            // Standard post URLs
            /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
            // Reel URLs  
            /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
            // TV URLs
            /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
            // Share URLs
            /instagram\.com\/.*\/p\/([A-Za-z0-9_-]+)/,
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = cleanUrl.match(pattern);
            if (match && match[1]) {
                const postId = match[1];
                console.log(`✅ Post ID extracted using pattern ${i + 1}:`, postId);
                return postId;
            }
        }

        console.log('❌ Could not extract post ID from URL');
        return null;
    } catch (error) {
        console.error('💥 Error in extractInstagramPostId:', error);
        return null;
    }
}

// Scrape Instagram post using TikHub API
export async function scrapeInstagramPost(url: string): Promise<ScrapedInstagramResult> {
    console.log('🚀 Starting Instagram post scrape for URL:', url);
    console.log('🌍 Environment check at start:', {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.TIKHUB_API_KEY,
        apiKeyLength: process.env.TIKHUB_API_KEY?.length,
        apiKeyStart: process.env.TIKHUB_API_KEY?.substring(0, 10) + '...'
    });

    try {
        // Validate URL
        if (!url || typeof url !== 'string') {
            console.error('❌ INVALID URL:', { url, type: typeof url });
            throw new Error('Invalid URL provided');
        }

        const cleanUrl = url.trim();
        console.log('🧹 URL cleaning:', { original: url, cleaned: cleanUrl });

        if (!cleanUrl.includes('instagram.com')) {
            console.error('❌ NOT AN INSTAGRAM URL:', cleanUrl);
            throw new Error('URL must be a valid Instagram URL');
        }

        // Check if TikHub API key is configured
        const apiKey = process.env.TIKHUB_API_KEY;
        if (!apiKey) {
            console.error('❌ NO API KEY FOUND');
            throw new Error('TIKHUB_API_KEY environment variable is not configured');
        }

        console.log('🔑 API Key configured:', `${apiKey.substring(0, 10)}...`);

        // Use the working TikHub Instagram endpoint
        const endpoint = 'https://api.tikhub.io/api/v1/instagram/web_app/fetch_post_info_by_url';
        const fullUrl = `${endpoint}?url=${encodeURIComponent(cleanUrl)}`;

        console.log('📡 Making request to TikHub Instagram API...');
        console.log('🎯 Endpoint:', endpoint);

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'TikHub-Analytics-Dashboard/1.0'
            }
        });

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
            console.error('❌ API request failed:', {
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`TikHub API request failed: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        console.log('📄 Response length:', responseText.length);

        let apiResponse;
        try {
            apiResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Failed to parse API response as JSON:', parseError);
            throw new Error('Invalid JSON response from TikHub API');
        }

        console.log('✅ Parsed API response successfully');
        console.log('📊 Response code:', apiResponse.code);

        // Check if API response indicates success
        if (apiResponse.code !== 200) {
            console.error('❌ TikHub API returned error:', {
                code: apiResponse.code,
                message: apiResponse.message,
                router: apiResponse.router
            });
            throw new Error(`TikHub API error: ${apiResponse.message || 'Unknown error'}`);
        }

        const postData = apiResponse.data;
        if (!postData) {
            console.error('❌ No data in API response');
            throw new Error('No Instagram post data found');
        }

        console.log('🎯 Found Instagram post data');
        console.log('📊 Post info:', {
            id: postData.id,
            shortcode: postData.shortcode,
            owner: postData.owner?.username,
            type: postData.product_type,
            isVideo: postData.is_video
        });

        // Extract caption and hashtags
        const caption = postData.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const hashtags = extractHashtagsFromCaption(caption);
        
        // DETAILED LOGGING FOR INSTAGRAM DATA EXTRACTION
        console.log('🔍 INSTAGRAM DATA EXTRACTION DEBUG:');
        console.log('📊 Raw postData keys:', Object.keys(postData));
        console.log('📊 Available stats fields:', {
            video_view_count: postData.video_view_count,
            video_play_count: postData.video_play_count,
            views: postData.views,
            plays: postData.plays,
            likes: postData.likes,
            comments: postData.comments,
            edge_media_preview_like_count: postData.edge_media_preview_like?.count,
            edge_media_to_parent_comment_count: postData.edge_media_to_parent_comment?.count
        });
        
        // Map TikHub Instagram response to our interface
        const instagramData: InstagramPostData = {
            id: postData.id || postData.shortcode || 'unknown',
            url: cleanUrl,
            username: postData.owner?.username || 'unknown',
            fullName: postData.owner?.full_name || '',
            description: caption,
            views: postData.video_view_count || postData.views || undefined,
            plays: postData.video_play_count || postData.plays || undefined,
            likes: postData.edge_media_preview_like?.count || postData.likes || 0,
            comments: postData.edge_media_to_parent_comment?.count || postData.comments || 0,
            timestamp: (() => {
                // Try multiple possible timestamp fields from TikHub Instagram response
                const timestampFields = [
                    postData.taken_at_timestamp,
                    postData.taken_at,
                    postData.created_time,
                    postData.timestamp
                ];
                
                for (const field of timestampFields) {
                    if (field && typeof field === 'number') {
                        // Convert Unix timestamp to ISO string
                        return new Date(field * 1000).toISOString();
                    }
                }
                
                // Fallback to current time if no valid timestamp found
                return new Date().toISOString();
            })(),
            hashtags,
            thumbnailUrl: postData.thumbnail_src || postData.display_url,
            displayUrl: postData.display_url,
            videoUrl: postData.is_video ? postData.video_url : undefined,
            type: postData.product_type === 'clips' ? 'clips' :
                  postData.is_video ? 'video' : 'photo',
            isVideo: postData.is_video || false,
            hasAudio: postData.has_audio || false,
            duration: postData.video_duration || undefined,
            dimensions: {
                width: postData.dimensions?.width || 0,
                height: postData.dimensions?.height || 0
            },
            owner: {
                username: postData.owner?.username || 'unknown',
                fullName: postData.owner?.full_name || '',
                followers: postData.owner?.edge_followed_by?.count || 0,
                following: postData.owner?.edge_follow?.count || 0,
                totalPosts: postData.owner?.edge_owner_to_timeline_media?.count || 0,
                isVerified: postData.owner?.is_verified || false,
                isPrivate: postData.owner?.is_private || false,
                profilePicUrl: postData.owner?.profile_pic_url
            },
            music: postData.clips_music_attribution_info ? {
                artistName: postData.clips_music_attribution_info.artist_name || 'Unknown',
                songName: postData.clips_music_attribution_info.song_name || 'Unknown',
                usesOriginalAudio: postData.clips_music_attribution_info.uses_original_audio || false,
                audioId: postData.clips_music_attribution_info.audio_id
            } : undefined,
            recentComments: postData.edge_media_to_parent_comment?.edges?.slice(0, 5).map((edge: {
                node: {
                    owner: { username: string };
                    text: string;
                    edge_liked_by?: { count: number };
                    created_at: number;
                };
            }) => ({
                username: edge.node.owner.username || 'unknown',
                text: edge.node.text || '',
                likes: edge.node.edge_liked_by?.count || 0,
                createdAt: edge.node.created_at || 0
            })) || []
        };

        console.log('✅ Successfully parsed Instagram post data');
        console.log('📊 Final Instagram data summary:', {
            username: instagramData.username,
            views: instagramData.views,
            plays: instagramData.plays,
            likes: instagramData.likes,
            comments: instagramData.comments,
            hasVideo: instagramData.isVideo,
            hasThumbnail: !!instagramData.thumbnailUrl
        });
        
        console.log('🔍 EXTRACTED VALUES FOR INSTAGRAM:');
        console.log('📊 Final views:', instagramData.views, '(type:', typeof instagramData.views, ')');
        console.log('📊 Final plays:', instagramData.plays, '(type:', typeof instagramData.plays, ')');
        console.log('📊 Final likes:', instagramData.likes, '(type:', typeof instagramData.likes, ')');
        console.log('📊 Final comments:', instagramData.comments, '(type:', typeof instagramData.comments, ')');

        return {
            success: true,
            data: instagramData
        };

    } catch (error) {
        console.error('💥 Instagram scraping failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            debugInfo: {
                url,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            }
        };
    }
}

// Helper function to extract hashtags from Instagram caption
function extractHashtagsFromCaption(caption: string): string[] {
    if (!caption) return [];
    
    const hashtagRegex = /#([A-Za-z0-9_]+)/g;
    const hashtags: string[] = [];
    let match;
    
    while ((match = hashtagRegex.exec(caption)) !== null) {
        hashtags.push(match[1]);
    }
    
    return hashtags;
}

// Generic function to scrape any media post (TikTok, Instagram, or YouTube)
export async function scrapeMediaPost(url: string): Promise<ScrapedVideoResult | ScrapedInstagramResult | ScrapedYouTubeResult> {
    console.log('🔗 Detected platform, using appropriate scraper for:', url);
    
    const cleanUrl = url.trim().toLowerCase();
    
    if (cleanUrl.includes('instagram.com')) {
        console.log('📸 Detected Instagram URL, using Instagram scraper');
        return await scrapeInstagramPost(url);
    } else if (cleanUrl.includes('tiktok.com')) {
        console.log('🎵 Detected TikTok URL, using TikTok scraper');
        return await scrapeTikTokVideo(url);
    } else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        console.log('🎬 Detected YouTube URL, using YouTube scraper');
        return await scrapeYouTubeVideo(url);
    } else {
        console.error('❌ Unsupported platform URL:', url);
        return {
            success: false,
            error: 'Unsupported platform. Please provide a TikTok, Instagram, or YouTube URL.'
        };
    }
}

// Batch process both TikTok and Instagram URLs
export async function scrapeMediaPosts(urls: string[]): Promise<(ScrapedVideoResult | ScrapedInstagramResult)[]> {
    console.log('🚀 Starting batch scraping for', urls.length, 'URLs');
    
    if (!urls || urls.length === 0) {
        console.log('⚠️ No URLs provided for batch scraping');
        return [];
    }

    if (urls.length > 50) {
        console.log('⚠️ Too many URLs provided (max 50), limiting to first 50');
        urls = urls.slice(0, 50);
    }

    // Group URLs by platform for more efficient processing
    const tikTokUrls: string[] = [];
    const instagramUrls: string[] = [];
    const urlIndexMap: { [index: number]: { platform: 'tiktok' | 'instagram', originalIndex: number } } = {};

    urls.forEach((url, index) => {
        const cleanUrl = url.trim();
        if (cleanUrl.includes('instagram.com')) {
            urlIndexMap[instagramUrls.length] = { platform: 'instagram', originalIndex: index };
            instagramUrls.push(cleanUrl);
        } else if (cleanUrl.includes('tiktok.com')) {
            urlIndexMap[tikTokUrls.length] = { platform: 'tiktok', originalIndex: index };
            tikTokUrls.push(cleanUrl);
        }
    });

    console.log(`📊 Batch processing: ${tikTokUrls.length} TikTok URLs, ${instagramUrls.length} Instagram URLs`);

    // Process each platform in parallel
    const [tikTokResults, instagramResults] = await Promise.all([
        tikTokUrls.length > 0 ? scrapeTikTokVideos(tikTokUrls) : Promise.resolve([]),
        instagramUrls.length > 0 ? scrapeInstagramPosts(instagramUrls) : Promise.resolve([])
    ]);

    // Reconstruct results in original order
    const results: (ScrapedVideoResult | ScrapedInstagramResult)[] = new Array(urls.length);
    
    // Fill TikTok results
    tikTokResults.forEach((result, index) => {
        const mapping = Object.entries(urlIndexMap).find(([key, value]) => 
            value.platform === 'tiktok' && parseInt(key) === index
        );
        if (mapping) {
            results[mapping[1].originalIndex] = result;
        }
    });

    // Fill Instagram results
    instagramResults.forEach((result, index) => {
        const mapping = Object.entries(urlIndexMap).find(([key, value]) => 
            value.platform === 'instagram' && parseInt(key) === index
        );
        if (mapping) {
            results[mapping[1].originalIndex] = result;
        }
    });

    // Fill any remaining slots with error results
    results.forEach((result, index) => {
        if (!result) {
            results[index] = {
                success: false,
                error: `Unable to process URL: ${urls[index]}`
            };
        }
    });

    console.log('✅ Batch processing completed');
    return results;
}

// Batch process Instagram posts specifically
export async function scrapeInstagramPosts(urls: string[]): Promise<ScrapedInstagramResult[]> {
    console.log('🚀 Starting Instagram batch scraping for', urls.length, 'URLs');
    
    if (!urls || urls.length === 0) {
        console.log('⚠️ No URLs provided for Instagram batch scraping');
        return [];
    }

    // Rate limiting: process in smaller batches to avoid overwhelming the API
    const batchSize = 5;
    const results: ScrapedInstagramResult[] = [];

    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        console.log(`📦 Processing Instagram batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)}`);

        const batchPromises = batch.map(url => scrapeInstagramPost(url));
        const batchResults = await Promise.allSettled(batchPromises);

        const processedResults = batchResults.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                console.error(`❌ Failed to process Instagram URL ${batch[index]}:`, result.reason);
                return {
                    success: false,
                    error: `Failed to process: ${result.reason?.message || 'Unknown error'}`
                };
            }
        });

        results.push(...processedResults);

        // Small delay between batches to be respectful to the API
        if (i + batchSize < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('✅ Instagram batch processing completed');
    return results;
}

// YouTube interfaces
export interface YouTubeVideoData {
    id: string;
    url: string;
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    views: number;
    likes: number;
    comments: number;
    shares: number; // Note: YouTube API doesn't provide share count directly
    duration: string;
    publishedAt: string;
    thumbnails: {
        default?: { url: string; width: number; height: number };
        medium?: { url: string; width: number; height: number };
        high?: { url: string; width: number; height: number };
        standard?: { url: string; width: number; height: number };
        maxres?: { url: string; width: number; height: number };
    };
    tags?: string[];
    categoryId: string;
    defaultLanguage?: string;
    statistics: {
        viewCount: string;
        likeCount?: string;
        commentCount?: string;
    };
}

interface YouTubeDebugInfo {
    url: string;
    timestamp: string;
    error?: unknown;
}

export interface ScrapedYouTubeResult {
    success: boolean;
    data?: YouTubeVideoData;
    error?: string;
    debugInfo?: YouTubeDebugInfo;
}

// Extract YouTube video ID from URL
export function extractYouTubeVideoId(url: string): string | null {
    console.log('🔍 Extracting YouTube video ID from URL:', url);

    try {
        const cleanUrl = url.trim();

        // YouTube URL patterns
        const patterns = [
            // Standard video URLs
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            // YouTube Shorts
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            // Embedded URLs
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            // Mobile URLs
            /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = cleanUrl.match(pattern);
            if (match && match[1]) {
                const videoId = match[1];
                console.log(`✅ Video ID extracted using pattern ${i + 1}:`, videoId);
                return videoId;
            }
        }

        console.log('❌ Could not extract video ID from URL');
        return null;
    } catch (error) {
        console.error('💥 Error in extractYouTubeVideoId:', error);
        return null;
    }
}

// Scrape YouTube video using YouTube Data API v3
export async function scrapeYouTubeVideo(url: string): Promise<ScrapedYouTubeResult> {
    console.log('🚀 Starting YouTube video scrape for URL:', url);

    try {
        // Validate URL
        if (!url || typeof url !== 'string') {
            console.error('❌ INVALID URL:', { url, type: typeof url });
            throw new Error('Invalid URL provided');
        }

        const cleanUrl = url.trim();
        console.log('🧹 URL cleaning:', { original: url, cleaned: cleanUrl });

        if (!cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be')) {
            console.error('❌ NOT A YOUTUBE URL:', cleanUrl);
            throw new Error('URL must be a valid YouTube URL');
        }

        // Extract video ID
        const videoId = extractYouTubeVideoId(cleanUrl);
        if (!videoId) {
            throw new Error('Could not extract video ID from YouTube URL');
        }

        console.log('🎯 Extracted video ID:', videoId);

        // Check if YouTube API key is configured
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            console.error('❌ NO YOUTUBE API KEY FOUND');
            throw new Error('YOUTUBE_API_KEY environment variable is not configured');
        }

        console.log('🔑 YouTube API Key configured:', `${apiKey.substring(0, 10)}...`);

        // YouTube Data API v3 endpoint
        const endpoint = 'https://www.googleapis.com/youtube/v3/videos';
        const params = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: videoId,
            key: apiKey
        });
        const fullUrl = `${endpoint}?${params.toString()}`;

        console.log('📡 Making request to YouTube Data API v3...');
        console.log('🎯 Video ID:', videoId);

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
            }
        });

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
            console.error('❌ YouTube API request failed:', {
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`YouTube API request failed: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        console.log('📄 Response length:', responseText.length);

        let apiResponse;
        try {
            apiResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Failed to parse YouTube API response as JSON:', parseError);
            throw new Error('Invalid JSON response from YouTube API');
        }

        console.log('✅ Parsed YouTube API response successfully');

        // Check if we got video data
        if (!apiResponse.items || apiResponse.items.length === 0) {
            console.error('❌ No video data found in YouTube API response');
            throw new Error('Video not found or is private/unavailable');
        }

        const videoData = apiResponse.items[0];
        console.log('🎯 Found YouTube video data');
        console.log('📊 Video info:', {
            id: videoData.id,
            title: videoData.snippet?.title?.substring(0, 50) + '...',
            channel: videoData.snippet?.channelTitle,
            views: videoData.statistics?.viewCount
        });

        // Parse duration (PT format to seconds)
        const duration = videoData.contentDetails?.duration || 'PT0S';
        
        // Map YouTube API response to our interface
        const youtubeData: YouTubeVideoData = {
            id: videoData.id,
            url: cleanUrl,
            title: videoData.snippet?.title || 'Unknown Title',
            description: videoData.snippet?.description || '',
            channelTitle: videoData.snippet?.channelTitle || 'Unknown Channel',
            channelId: videoData.snippet?.channelId || '',
            views: parseInt(videoData.statistics?.viewCount || '0'),
            likes: parseInt(videoData.statistics?.likeCount || '0'),
            comments: parseInt(videoData.statistics?.commentCount || '0'),
            shares: 0, // YouTube API doesn't provide share count
            duration: duration,
            publishedAt: videoData.snippet?.publishedAt || new Date().toISOString(),
            thumbnails: videoData.snippet?.thumbnails || {},
            tags: videoData.snippet?.tags || [],
            categoryId: videoData.snippet?.categoryId || '',
            defaultLanguage: videoData.snippet?.defaultLanguage,
            statistics: {
                viewCount: videoData.statistics?.viewCount || '0',
                likeCount: videoData.statistics?.likeCount || '0',
                commentCount: videoData.statistics?.commentCount || '0'
            }
        };

        console.log('✅ Successfully parsed YouTube video data');
        console.log('📊 Final data summary:', {
            title: youtubeData.title.substring(0, 50) + '...',
            channel: youtubeData.channelTitle,
            views: youtubeData.views.toLocaleString(),
            likes: youtubeData.likes.toLocaleString(),
            comments: youtubeData.comments.toLocaleString(),
            duration: youtubeData.duration
        });

        return {
            success: true,
            data: youtubeData
        };

    } catch (error) {
        console.error('💥 YouTube scraping failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            debugInfo: {
                url,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            }
        };
    }
} 