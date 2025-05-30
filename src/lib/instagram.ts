export interface InstagramVideoData {
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
    isReel: boolean;
    location?: string;
}

export interface ScrapedInstagramResult {
    success: boolean;
    data?: InstagramVideoData;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debugInfo?: any;
}

// Type for TikHub Instagram API response data
interface TikHubInstagramData {
    id?: string;
    shortcode?: string;
    url?: string;
    permalink?: string;
    owner?: {
        username?: string;
        full_name?: string;
    };
    caption?: {
        text?: string;
    };
    edge_media_preview_like?: {
        count?: number;
    };
    edge_media_to_comment?: {
        count?: number;
    };
    video_view_count?: number;
    taken_at_timestamp?: number;
    hashtags?: string[];
    location?: {
        name?: string;
    };
    is_video?: boolean;
    thumbnail_src?: string;
    display_url?: string;
}

interface TikHubInstagramApiResponse {
    code?: number;
    msg?: string;
    data?: TikHubInstagramData;
    message?: string;
}

// Extract Instagram post ID from URL
export function extractInstagramId(url: string): string | null {
    console.log('🔍 Extracting Instagram ID from URL:', url);

    try {
        const cleanUrl = url.trim();

        // Handle different Instagram URL formats
        const patterns = [
            // Standard post URLs: https://www.instagram.com/p/ABC123/
            /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
            // Reel URLs: https://www.instagram.com/reel/ABC123/
            /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
            // Short URLs: https://instagr.am/p/ABC123/
            /instagr\.am\/p\/([A-Za-z0-9_-]+)/,
            // Mobile URLs
            /instagram\.com\/.*\/p\/([A-Za-z0-9_-]+)/,
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = cleanUrl.match(pattern);
            if (match && match[1]) {
                const postId = match[1];
                console.log(`✅ Instagram ID extracted using pattern ${i + 1}:`, postId);
                return postId;
            }
        }

        console.log('❌ Could not extract Instagram ID from URL');
        return null;
    } catch (error) {
        console.error('💥 Error in extractInstagramId:', error);
        return null;
    }
}

// Scrape a single Instagram post/reel using TikHub API
export async function scrapeInstagramVideo(url: string): Promise<ScrapedInstagramResult> {
    console.log('🚀 Starting Instagram video scrape for URL:', url);
    console.log('🔍 Initial environment check:', {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: !!process.env.TIKHUB_API_KEY,
        apiKeyLength: process.env.TIKHUB_API_KEY?.length
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

        if (!cleanUrl.includes('instagram.com') && !cleanUrl.includes('instagr.am')) {
            console.error('❌ NOT AN INSTAGRAM URL:', cleanUrl);
            throw new Error('URL must be a valid Instagram URL');
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

        // Extract post ID for validation
        console.log('🔍 Starting Instagram ID extraction...');
        const postId = extractInstagramId(cleanUrl);
        if (!postId) {
            console.error('❌ INSTAGRAM ID EXTRACTION FAILED');
            console.error('URL patterns tested against:', cleanUrl);
            throw new Error('Could not extract post ID from URL');
        }

        console.log('✅ Instagram ID extracted:', postId);

        // Prepare TikHub Instagram API request
        const tikHubUrl = `https://api.tikhub.io/api/v1/instagram/web/fetch_post_detail?url=${encodeURIComponent(cleanUrl)}`;

        console.log('📋 TikHub Instagram API request prepared for URL:', tikHubUrl);
        console.log('🌐 Making API request...');
        console.log('📊 Request parameters:', {
            method: 'GET',
            url: tikHubUrl,
            hasAuth: !!apiKey,
            authPreview: `Bearer ${apiKey.substring(0, 10)}...`,
            encodedUrl: encodeURIComponent(cleanUrl)
        });

        // Make request to TikHub API
        console.log('🎬 Calling TikHub Instagram API...');
        const response = await fetch(tikHubUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'Instagram-Analytics-Dashboard/1.0'
            }
        });

        console.log('📞 TikHub Instagram API response status:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ TikHub Instagram API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
                url: tikHubUrl,
                headers: Object.fromEntries(response.headers.entries())
            });

            // Try to parse error response as JSON for more details
            try {
                const errorJson = JSON.parse(errorText);
                console.error('📋 Parsed error response:', errorJson);
            } catch {
                console.log('⚠️ Could not parse error response as JSON');
            }

            // Provide more specific error messages based on status codes
            let errorMessage = `TikHub Instagram API error: ${response.status} ${response.statusText}`;
            if (response.status === 401) {
                errorMessage = 'TikHub API authentication failed. Please check your API key.';
            } else if (response.status === 404) {
                errorMessage = 'Instagram post not found or URL is invalid. Please check the Instagram URL.';
            } else if (response.status === 429) {
                errorMessage = 'TikHub API rate limit exceeded. Please try again later.';
            } else if (response.status >= 500) {
                errorMessage = 'TikHub API server error. Please try again later.';
            } else if (response.status === 400) {
                errorMessage = 'Bad request to TikHub API. The Instagram URL may be invalid or the post may be private.';
            }

            throw new Error(errorMessage);
        }

        console.log('🎉 API response successful, parsing JSON...');
        const apiResponse: TikHubInstagramApiResponse = await response.json();

        console.log('📦 Raw TikHub Instagram API response structure:', {
            hasData: !!apiResponse.data,
            code: apiResponse.code,
            message: apiResponse.msg || apiResponse.message,
            dataKeys: apiResponse.data ? Object.keys(apiResponse.data) : [],
            fullResponsePreview: JSON.stringify(apiResponse, null, 2).substring(0, 500) + '...'
        });

        // Check API response status
        if (apiResponse.code && apiResponse.code !== 200) {
            console.error('❌ TikHub Instagram API returned error code:', apiResponse.code, apiResponse.msg);
            return {
                success: false,
                error: `TikHub Instagram API error: ${apiResponse.msg || 'Unknown error'}`,
                debugInfo: {
                    apiResponse,
                    url: cleanUrl,
                    postId: postId,
                    tikHubUrl: tikHubUrl
                }
            };
        }

        // Check if we have data
        const videoData = apiResponse.data;

        if (!videoData) {
            console.log('❌ No Instagram data returned from TikHub API');
            return {
                success: false,
                error: 'No Instagram data returned from TikHub API. The post may be private, deleted, or the URL format is not supported.',
                debugInfo: {
                    apiResponse,
                    url: cleanUrl,
                    postId: postId,
                    tikHubUrl: tikHubUrl
                }
            };
        }

        console.log('🔍 Processing TikHub Instagram data...');
        console.log('📊 Instagram data keys:', Object.keys(videoData));
        console.log('📋 Instagram data sample:', {
            id: videoData.id,
            shortcode: videoData.shortcode,
            owner: videoData.owner?.username,
            hasCaption: !!videoData.caption?.text,
            hasLikes: !!videoData.edge_media_preview_like?.count,
            hasComments: !!videoData.edge_media_to_comment?.count,
            hasViews: !!videoData.video_view_count,
            isVideo: videoData.is_video
        });

        // Extract hashtags from caption
        const captionText = videoData.caption?.text || '';
        const hashtagMatches = captionText.match(/#[a-zA-Z0-9_]+/g) || [];
        const hashtags = hashtagMatches.map(tag => tag.substring(1)); // Remove the # symbol

        // Determine if it's a reel based on URL or video flag
        const isReel = cleanUrl.includes('/reel/') || videoData.is_video || false;

        // Transform TikHub Instagram data to our standard format
        const transformedData: InstagramVideoData = {
            id: videoData.id || videoData.shortcode || postId,
            username: videoData.owner?.username || videoData.owner?.full_name || 'N/A',
            description: captionText || 'N/A',
            views: videoData.video_view_count || 0,
            likes: videoData.edge_media_preview_like?.count || 0,
            comments: videoData.edge_media_to_comment?.count || 0,
            shares: 0, // Instagram doesn't provide share count via API
            timestamp: videoData.taken_at_timestamp ? new Date(videoData.taken_at_timestamp * 1000).toISOString() : new Date().toISOString(),
            hashtags: hashtags,
            thumbnailUrl: videoData.thumbnail_src || videoData.display_url || undefined,
            isReel: isReel,
            location: videoData.location?.name || undefined,
            url: cleanUrl
        };

        console.log('✨ Transformed Instagram data:', JSON.stringify(transformedData, null, 2));

        return {
            success: true,
            data: transformedData
        };

    } catch (error) {
        console.error('💥 Unexpected error in scrapeInstagramVideo:', error);
        console.error('Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            debugInfo: {
                url: url,
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                timestamp: new Date().toISOString()
            }
        };
    }
}

// Scrape multiple Instagram posts using batch processing
export async function scrapeInstagramVideos(urls: string[]): Promise<ScrapedInstagramResult[]> {
    console.log('🚀 Starting batch Instagram scrape for URLs:', urls);

    const results: ScrapedInstagramResult[] = [];

    for (const url of urls) {
        const result = await scrapeInstagramVideo(url);
        results.push(result);

        // Add a small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ Batch Instagram scrape completed:', {
        totalUrls: urls.length,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length
    });

    return results;
}

export function isTikHubInstagramConfigured(): boolean {
    return !!process.env.TIKHUB_API_KEY;
} 