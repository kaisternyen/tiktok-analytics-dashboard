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
    url?: string;
    video_url?: string;
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
    }>;
    music?: {
        title?: string;
        author?: string;
    };
    video?: {
        cover?: string;
        origin_cover?: string;
    };
}

interface TikHubApiResponse {
    code?: number;
    msg?: string;
    data?: TikHubVideoData;
    message?: string;
}

// Extract video ID from TikTok URL
export function extractVideoId(url: string): string | null {
    console.log('🔍 Extracting video ID from URL:', url);

    // Handle different TikTok URL formats
    const patterns = [
        /tiktok\.com\/@[^\/]+\/video\/(\d+)/,
        /vm\.tiktok\.com\/([A-Za-z0-9]+)/,
        /tiktok\.com\/t\/([A-Za-z0-9]+)/,
        /tiktok\.com\/.*\/(\d+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            console.log('✅ Video ID extracted:', match[1]);
            return match[1];
        }
    }

    console.log('❌ Could not extract video ID from URL');
    return null;
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

        // Prepare TikHub API request
        const tikHubUrl = 'https://api.tikhub.io/api/v1/tiktok/web/fetch_video';
        const requestBody = {
            url: cleanUrl
        };

        console.log('📋 TikHub API request prepared:', JSON.stringify(requestBody, null, 2));

        // Make request to TikHub API
        console.log('🎬 Calling TikHub API...');
        const response = await fetch(tikHubUrl, {
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
            console.error('❌ TikHub API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`TikHub API error: ${response.status} ${response.statusText}`);
        }

        const apiResponse: TikHubApiResponse = await response.json();
        console.log('📦 Raw TikHub API response:', JSON.stringify(apiResponse, null, 2));

        // Check API response status
        if (apiResponse.code && apiResponse.code !== 0) {
            console.error('❌ TikHub API returned error code:', apiResponse.code, apiResponse.msg);
            return {
                success: false,
                error: `TikHub API error: ${apiResponse.msg || 'Unknown error'}`,
                debugInfo: { apiResponse, url: cleanUrl }
            };
        }

        if (!apiResponse.data) {
            console.log('❌ No data returned from TikHub API');
            return {
                success: false,
                error: 'No data returned from TikHub API',
                debugInfo: { apiResponse, url: cleanUrl }
            };
        }

        const rawData = apiResponse.data;
        console.log('🔍 Processing TikHub raw data:', JSON.stringify(rawData, null, 2));

        // Transform TikHub data to our standard format
        const transformedData: TikTokVideoData = {
            id: rawData.id || rawData.aweme_id || videoId || 'unknown',
            url: rawData.url || rawData.video_url || cleanUrl,
            username: rawData.author?.unique_id || rawData.author?.nickname || 'unknown',
            description: rawData.desc || rawData.content || '',
            views: rawData.statistics?.play_count || rawData.stats?.play_count || 0,
            likes: rawData.statistics?.digg_count || rawData.stats?.digg_count || 0,
            comments: rawData.statistics?.comment_count || rawData.stats?.comment_count || 0,
            shares: rawData.statistics?.share_count || rawData.stats?.share_count || 0,
            timestamp: rawData.create_time
                ? new Date(rawData.create_time * 1000).toISOString()
                : rawData.created_at
                    ? new Date(rawData.created_at * 1000).toISOString()
                    : new Date().toISOString(),
            hashtags: Array.isArray(rawData.text_extra)
                ? rawData.text_extra
                    .map((item: { hashtag_name?: string }) => item.hashtag_name || '')
                    .filter((tag: string) => tag && tag.trim() !== '')
                : [],
            music: rawData.music ? {
                name: rawData.music.title || 'Unknown',
                author: rawData.music.author || 'Unknown'
            } : undefined,
            thumbnailUrl: rawData.video?.cover || rawData.video?.origin_cover || undefined
        };

        console.log('✨ Transformed data:', JSON.stringify(transformedData, null, 2));

        // Validate that we got the right video
        const scrapedUrl = transformedData.url;
        const originalVideoId = extractVideoId(cleanUrl);
        const scrapedVideoId = extractVideoId(scrapedUrl);

        console.log('🔍 URL validation:', {
            originalUrl: cleanUrl,
            scrapedUrl: scrapedUrl,
            originalVideoId: originalVideoId,
            scrapedVideoId: scrapedVideoId,
            urlsMatch: originalVideoId === scrapedVideoId
        });

        if (originalVideoId && scrapedVideoId && originalVideoId !== scrapedVideoId) {
            console.log('⚠️ WARNING: Video ID mismatch detected!');
            return {
                success: false,
                error: `Video ID mismatch: requested ${originalVideoId}, got ${scrapedVideoId}`,
                debugInfo: {
                    originalUrl: cleanUrl,
                    scrapedUrl: scrapedUrl,
                    rawData: rawData,
                    transformedData: transformedData
                }
            };
        }

        return {
            success: true,
            data: transformedData,
            debugInfo: {
                rawData: rawData,
                urlValidation: {
                    originalUrl: cleanUrl,
                    scrapedUrl: scrapedUrl,
                    originalVideoId: originalVideoId,
                    scrapedVideoId: scrapedVideoId
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