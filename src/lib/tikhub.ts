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
    };
}

interface TikHubApiResponse {
    code?: number;
    msg?: string;
    data?: {
        aweme_details?: TikHubVideoData[];
        aweme_list?: TikHubVideoData[];
    } & TikHubVideoData;
    message?: string;
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

    try {
        // Validate URL
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // Clean and validate the URL
        const cleanUrl = url.trim();
        if (!cleanUrl.includes('tiktok.com')) {
            throw new Error('URL must be a valid TikTok URL');
        }

        console.log('📝 Cleaned URL:', cleanUrl);

        // Check if TikHub API key is configured
        const apiKey = process.env.TIKHUB_API_KEY;
        if (!apiKey) {
            throw new Error('TIKHUB_API_KEY environment variable is not configured');
        }

        // Extract video ID for validation
        const videoId = extractVideoId(cleanUrl);
        if (!videoId) {
            throw new Error('Could not extract video ID from URL');
        }

        // Prepare TikHub API request - Updated to use correct V3 endpoint with aweme_id
        const tikHubUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${videoId}`;

        console.log('📋 TikHub API request prepared for URL:', tikHubUrl);

        // Make request to TikHub API
        console.log('🎬 Calling TikHub API...');
        const response = await fetch(tikHubUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
            }
        });

        console.log('📞 TikHub API response status:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ TikHub API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
                url: tikHubUrl
            });

            // Provide more specific error messages based on status codes
            let errorMessage = `TikHub API error: ${response.status} ${response.statusText}`;
            if (response.status === 401) {
                errorMessage = 'TikHub API authentication failed. Please check your API key.';
            } else if (response.status === 404) {
                errorMessage = 'Video not found or URL is invalid. Please check the TikTok URL.';
            } else if (response.status === 429) {
                errorMessage = 'TikHub API rate limit exceeded. Please try again later.';
            } else if (response.status >= 500) {
                errorMessage = 'TikHub API server error. Please try again later.';
            }

            throw new Error(errorMessage);
        }

        const apiResponse: TikHubApiResponse = await response.json();
        console.log('📦 Raw TikHub API response structure:', {
            hasData: !!apiResponse.data,
            hasAwemeDetails: !!apiResponse.data?.aweme_details,
            awemeDetailsLength: apiResponse.data?.aweme_details?.length || 0,
            code: apiResponse.code,
            message: apiResponse.msg || apiResponse.message
        });

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

        // Check if we have data (TikHub returns nested structure: data.aweme_details[0])
        const videoData = apiResponse.data?.aweme_details?.[0];

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

        console.log('🔍 Processing TikHub video data:', JSON.stringify(videoData, null, 2));

        // Transform TikHub data to our standard format
        const transformedData: TikTokVideoData = {
            id: videoData.aweme_id || videoData.group_id || videoId,
            username: videoData.author?.unique_id || videoData.author?.nickname || 'N/A',
            description: videoData.desc || videoData.content || 'N/A',
            views: videoData.statistics?.play_count || videoData.stats?.play_count || 0,
            likes: videoData.statistics?.digg_count || videoData.stats?.digg_count || 0,
            comments: videoData.statistics?.comment_count || videoData.stats?.comment_count || 0,
            shares: videoData.statistics?.share_count || videoData.stats?.share_count || 0,
            timestamp: videoData.create_time ? new Date(videoData.create_time * 1000).toISOString() :
                videoData.created_at ? new Date(videoData.created_at * 1000).toISOString() :
                    new Date().toISOString(),
            hashtags: Array.isArray(videoData.text_extra)
                ? videoData.text_extra
                    .filter((item: { type?: number; hashtag_name?: string }) => item.type === 1 && item.hashtag_name)
                    .map((item: { hashtag_name?: string }) => item.hashtag_name || '')
                    .filter(tag => tag.trim() !== '')
                : [],
            music: videoData.music ? {
                name: videoData.music.title || videoData.music.owner_nickname || 'N/A',
                author: videoData.music.author || videoData.music.owner_nickname || 'N/A'
            } : undefined,
            thumbnailUrl: videoData.video?.cover?.url_list?.[0] ||
                videoData.video?.origin_cover?.url_list?.[0] ||
                undefined,
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

        return {
            success: true,
            data: transformedData,
            debugInfo: {
                rawData: videoData,
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
                // Transform the data similar to single video scraping
                const videoId = extractVideoId(url);
                const transformedData: TikTokVideoData = {
                    id: rawData.data?.id || rawData.data?.aweme_id || videoId || 'unknown',
                    url: rawData.data?.url || rawData.data?.video_url || url,
                    username: rawData.data?.author?.unique_id || rawData.data?.author?.nickname || 'unknown',
                    description: rawData.data?.desc || rawData.data?.content || '',
                    views: rawData.data?.statistics?.play_count || rawData.data?.stats?.play_count || 0,
                    likes: rawData.data?.statistics?.digg_count || rawData.data?.stats?.digg_count || 0,
                    comments: rawData.data?.statistics?.comment_count || rawData.data?.stats?.comment_count || 0,
                    shares: rawData.data?.statistics?.share_count || rawData.data?.stats?.share_count || 0,
                    timestamp: rawData.data?.create_time
                        ? new Date(rawData.data.create_time * 1000).toISOString()
                        : new Date().toISOString(),
                    hashtags: Array.isArray(rawData.data?.text_extra)
                        ? rawData.data.text_extra
                            .map((item: { hashtag_name?: string }) => item.hashtag_name || '')
                            .filter((tag: string) => tag && tag.trim() !== '')
                        : [],
                    music: rawData.data?.music ? {
                        name: rawData.data.music.title || 'Unknown',
                        author: rawData.data.music.author || 'Unknown'
                    } : undefined,
                    thumbnailUrl: rawData.data?.video?.cover || rawData.data?.video?.origin_cover || undefined
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