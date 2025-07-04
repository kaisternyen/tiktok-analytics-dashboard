"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractVideoId = extractVideoId;
exports.scrapeTikTokVideo = scrapeTikTokVideo;
exports.scrapeTikTokVideos = scrapeTikTokVideos;
exports.isTikHubConfigured = isTikHubConfigured;
exports.extractInstagramPostId = extractInstagramPostId;
exports.scrapeInstagramPost = scrapeInstagramPost;
exports.scrapeMediaPost = scrapeMediaPost;
exports.scrapeMediaPosts = scrapeMediaPosts;
exports.scrapeInstagramPosts = scrapeInstagramPosts;
exports.extractYouTubeVideoId = extractYouTubeVideoId;
exports.scrapeYouTubeVideo = scrapeYouTubeVideo;
// Extract video ID from TikTok URL
function extractVideoId(url) {
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
            /tiktok\.com.*\/(\d{19})/, // 19-digit video IDs
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
        }
        catch (urlError) {
            console.log('⚠️ URL parsing failed:', urlError);
        }
        console.log('❌ Could not extract video ID from URL');
        return null;
    }
    catch (error) {
        console.error('💥 Error in extractVideoId:', error);
        return null;
    }
}
// Scrape a single TikTok video using TikHub API
async function scrapeTikTokVideo(url) {
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
        // Extract video ID for validation
        console.log('🔍 Starting video ID extraction...');
        const videoId = extractVideoId(cleanUrl);
        if (!videoId) {
            console.error('❌ VIDEO ID EXTRACTION FAILED');
            console.error('URL patterns tested against:', cleanUrl);
            throw new Error('Could not extract video ID from URL');
        }
        console.log('✅ Video ID extracted:', videoId);
        // Prepare TikHub API request - Updated to use correct V3 endpoint with aweme_id
        const tikHubUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${videoId}`;
        console.log('📋 TikHub API request prepared for URL:', tikHubUrl);
        console.log('🌐 Making API request...');
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
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ TikHub API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
                url: tikHubUrl,
                headers: Object.fromEntries(response.headers.entries())
            });
            // Provide more specific error messages based on status codes
            let errorMessage = `TikHub API error: ${response.status} ${response.statusText}`;
            if (response.status === 401) {
                errorMessage = 'TikHub API authentication failed. Please check your API key.';
            }
            else if (response.status === 404) {
                errorMessage = 'Video not found or URL is invalid. Please check the TikTok URL.';
            }
            else if (response.status === 429) {
                errorMessage = 'TikHub API rate limit exceeded. Please try again later.';
            }
            else if (response.status >= 500) {
                errorMessage = 'TikHub API server error. Please try again later.';
            }
            throw new Error(errorMessage);
        }
        console.log('🎉 API response successful, parsing JSON...');
        const apiResponse = await response.json();
        console.log('📦 Raw TikHub API response structure:', {
            hasData: !!apiResponse.data,
            hasAwemeDetails: !!apiResponse.data?.aweme_details,
            awemeDetailsLength: apiResponse.data?.aweme_details?.length || 0,
            code: apiResponse.code,
            message: apiResponse.msg || apiResponse.message,
            dataKeys: apiResponse.data ? Object.keys(apiResponse.data) : []
        });
        console.log('🔍 Full API response preview:', JSON.stringify(apiResponse, null, 2).substring(0, 1000) + '...');
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
        console.log('🔍 Processing TikHub video data...');
        console.log('📊 Video data keys:', Object.keys(videoData));
        console.log('📊 Video stats preview:', {
            aweme_id: videoData.aweme_id,
            author: videoData.author?.unique_id,
            views: videoData.statistics?.play_count,
            likes: videoData.statistics?.digg_count
        });
        // Transform TikHub data to our standard format
        const transformedData = {
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
                    .filter((item) => item.type === 1 && item.hashtag_name)
                    .map((item) => item.hashtag_name || '')
                    .filter(tag => tag.trim() !== '')
                : [],
            music: videoData.music ? {
                name: videoData.music.title || videoData.music.owner_nickname || 'N/A',
                author: videoData.music.author || videoData.music.owner_nickname || 'N/A'
            } : undefined,
            thumbnailUrl: (() => {
                // Collect all available thumbnail URLs from different sources
                const allSources = [
                    ...(videoData.video?.cover?.url_list || []),
                    ...(videoData.video?.origin_cover?.url_list || []),
                    ...(videoData.video?.dynamic_cover?.url_list || []),
                    ...(videoData.video?.animated_cover?.url_list || [])
                ];
                // Filter out invalid URLs
                const validUrls = allSources.filter(url => url && typeof url === 'string' && url.trim() !== '');
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
                const heicUrl = validUrls.find(url => heicFormat.some(format => url.toLowerCase().includes(format)));
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
    }
    catch (error) {
        console.error('💥 Error scraping TikTok video:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            debugInfo: { error: error, url: url }
        };
    }
}
// Scrape multiple TikTok videos using batch API for better performance
async function scrapeTikTokVideos(urls) {
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
        }
        catch (error) {
            console.log('⚠️ Batch API failed, falling back to individual requests:', error);
        }
    }
    // Fallback to individual requests
    const results = [];
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
async function scrapeTikTokVideosBatch(urls) {
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
    const results = [];
    if (apiResponse.data && Array.isArray(apiResponse.data)) {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const rawData = apiResponse.data[i];
            if (rawData && rawData.code === 0) {
                // Transform the data similar to single video scraping
                const videoId = extractVideoId(url);
                const transformedData = {
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
                            .map((item) => item.hashtag_name || '')
                            .filter((tag) => tag && tag.trim() !== '')
                        : [],
                    music: rawData.data?.music ? {
                        name: rawData.data.music.title || 'Unknown',
                        author: rawData.data.music.author || 'Unknown'
                    } : undefined,
                    thumbnailUrl: (() => {
                        // Collect all available thumbnail URLs from different sources
                        const allSources = [
                            ...(rawData.data?.video?.cover?.url_list || []),
                            ...(rawData.data?.video?.origin_cover?.url_list || []),
                            ...(rawData.data?.video?.dynamic_cover?.url_list || []),
                            ...(rawData.data?.video?.animated_cover?.url_list || [])
                        ];
                        // Filter out invalid URLs
                        const validUrls = allSources.filter(url => url && typeof url === 'string' && url.trim() !== '');
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
                        const heicUrl = validUrls.find(url => heicFormat.some(format => url.toLowerCase().includes(format)));
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
            }
            else {
                results.push({
                    success: false,
                    error: rawData?.msg || 'Unknown batch processing error',
                    debugInfo: { rawData, url }
                });
            }
        }
    }
    else {
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
function isTikHubConfigured() {
    return !!process.env.TIKHUB_API_KEY;
}
// Instagram-specific functions
// Extract Instagram post ID from URL
function extractInstagramPostId(url) {
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
    }
    catch (error) {
        console.error('💥 Error in extractInstagramPostId:', error);
        return null;
    }
}
// Scrape Instagram post using TikHub API
async function scrapeInstagramPost(url) {
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
        }
        catch (parseError) {
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
        // Map TikHub Instagram response to our interface
        const instagramData = {
            id: postData.id || postData.shortcode || 'unknown',
            url: cleanUrl,
            username: postData.owner?.username || 'unknown',
            fullName: postData.owner?.full_name || '',
            description: caption,
            views: postData.video_view_count || undefined,
            plays: postData.video_play_count || undefined,
            likes: postData.edge_media_preview_like?.count || 0,
            comments: postData.edge_media_to_parent_comment?.count || 0,
            timestamp: postData.taken_at_timestamp
                ? new Date(postData.taken_at_timestamp * 1000).toISOString()
                : new Date().toISOString(),
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
            recentComments: postData.edge_media_to_parent_comment?.edges?.slice(0, 5).map((edge) => ({
                username: edge.node.owner.username || 'unknown',
                text: edge.node.text || '',
                likes: edge.node.edge_liked_by?.count || 0,
                createdAt: edge.node.created_at || 0
            })) || []
        };
        console.log('✅ Successfully parsed Instagram post data');
        console.log('📊 Final data summary:', {
            username: instagramData.username,
            likes: instagramData.likes,
            comments: instagramData.comments,
            plays: instagramData.plays,
            hasVideo: instagramData.isVideo,
            hasThumbnail: !!instagramData.thumbnailUrl
        });
        return {
            success: true,
            data: instagramData
        };
    }
    catch (error) {
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
function extractHashtagsFromCaption(caption) {
    if (!caption)
        return [];
    const hashtagRegex = /#([A-Za-z0-9_]+)/g;
    const hashtags = [];
    let match;
    while ((match = hashtagRegex.exec(caption)) !== null) {
        hashtags.push(match[1]);
    }
    return hashtags;
}
// Generic function to scrape any media post (TikTok, Instagram, or YouTube)
async function scrapeMediaPost(url) {
    console.log('🔗 Detected platform, using appropriate scraper for:', url);
    const cleanUrl = url.trim().toLowerCase();
    if (cleanUrl.includes('instagram.com')) {
        console.log('📸 Detected Instagram URL, using Instagram scraper');
        return await scrapeInstagramPost(url);
    }
    else if (cleanUrl.includes('tiktok.com')) {
        console.log('🎵 Detected TikTok URL, using TikTok scraper');
        return await scrapeTikTokVideo(url);
    }
    else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        console.log('🎬 Detected YouTube URL, using YouTube scraper');
        return await scrapeYouTubeVideo(url);
    }
    else {
        console.error('❌ Unsupported platform URL:', url);
        return {
            success: false,
            error: 'Unsupported platform. Please provide a TikTok, Instagram, or YouTube URL.'
        };
    }
}
// Batch process both TikTok and Instagram URLs
async function scrapeMediaPosts(urls) {
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
    const tikTokUrls = [];
    const instagramUrls = [];
    const urlIndexMap = {};
    urls.forEach((url, index) => {
        const cleanUrl = url.trim();
        if (cleanUrl.includes('instagram.com')) {
            urlIndexMap[instagramUrls.length] = { platform: 'instagram', originalIndex: index };
            instagramUrls.push(cleanUrl);
        }
        else if (cleanUrl.includes('tiktok.com')) {
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
    const results = new Array(urls.length);
    // Fill TikTok results
    tikTokResults.forEach((result, index) => {
        const mapping = Object.entries(urlIndexMap).find(([key, value]) => value.platform === 'tiktok' && parseInt(key) === index);
        if (mapping) {
            results[mapping[1].originalIndex] = result;
        }
    });
    // Fill Instagram results
    instagramResults.forEach((result, index) => {
        const mapping = Object.entries(urlIndexMap).find(([key, value]) => value.platform === 'instagram' && parseInt(key) === index);
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
async function scrapeInstagramPosts(urls) {
    console.log('🚀 Starting Instagram batch scraping for', urls.length, 'URLs');
    if (!urls || urls.length === 0) {
        console.log('⚠️ No URLs provided for Instagram batch scraping');
        return [];
    }
    // Rate limiting: process in smaller batches to avoid overwhelming the API
    const batchSize = 5;
    const results = [];
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        console.log(`📦 Processing Instagram batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)}`);
        const batchPromises = batch.map(url => scrapeInstagramPost(url));
        const batchResults = await Promise.allSettled(batchPromises);
        const processedResults = batchResults.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            else {
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
// Extract YouTube video ID from URL
function extractYouTubeVideoId(url) {
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
    }
    catch (error) {
        console.error('💥 Error in extractYouTubeVideoId:', error);
        return null;
    }
}
// Scrape YouTube video using YouTube Data API v3
async function scrapeYouTubeVideo(url) {
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
        }
        catch (parseError) {
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
        const youtubeData = {
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
    }
    catch (error) {
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
