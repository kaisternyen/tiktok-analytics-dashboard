import { ApifyClient } from 'apify-client';

// Initialize Apify client
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

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
    debugInfo?: any;
}

// Type for raw Apify data
interface ApifyRawData {
    id?: string;
    webVideoUrl?: string;
    'authorMeta.name'?: string;
    authorMeta?: {
        name?: string;
    };
    text?: string;
    description?: string;
    playCount?: number;
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    createTimeISO?: string;
    createTime?: string;
    hashtags?: Array<{ name?: string } | string>;
    videoMeta?: {
        coverUrl?: string;
        originalCoverUrl?: string;
        height?: number;
        width?: number;
        duration?: number;
    };
    musicMeta?: {
        musicName?: string;
        musicAuthor?: string;
    };
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

// Scrape a single TikTok video
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

        // Prepare input according to Apify documentation
        const input = {
            postURLs: [cleanUrl], // Array of URLs as per documentation
            shouldDownloadCovers: false,
            shouldDownloadSlideshowImages: false,
            shouldDownloadSubtitles: false,
            shouldDownloadVideos: false
        };

        console.log('📋 Apify input prepared:', JSON.stringify(input, null, 2));

        // Run the Apify actor
        console.log('🎬 Running Apify actor: clockworks/tiktok-video-scraper');
        const run = await client.actor('clockworks/tiktok-video-scraper').call(input);

        console.log('✅ Apify run completed:', {
            runId: run.id,
            status: run.status,
            defaultDatasetId: run.defaultDatasetId
        });

        // Get the results
        console.log('📊 Fetching results from dataset:', run.defaultDatasetId);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        console.log('📦 Raw items received:', {
            itemCount: items.length,
            items: JSON.stringify(items, null, 2)
        });

        if (!items || items.length === 0) {
            console.log('❌ No items returned from scraper');
            return {
                success: false,
                error: 'No data returned from scraper',
                debugInfo: { run, itemCount: 0 }
            };
        }

        // Process the first item
        const rawData = items[0] as ApifyRawData;
        console.log('🔍 Processing raw data:', JSON.stringify(rawData, null, 2));

        // Extract video ID for validation
        const videoId = extractVideoId(cleanUrl);

        // Transform the data according to the Apify documentation format
        const transformedData: TikTokVideoData = {
            id: rawData.id || videoId || 'unknown',
            url: rawData.webVideoUrl || cleanUrl,
            username: rawData['authorMeta.name'] || rawData.authorMeta?.name || 'unknown',
            description: rawData.text || rawData.description || '',
            views: rawData.playCount || 0,
            likes: rawData.diggCount || 0,
            comments: rawData.commentCount || 0,
            shares: rawData.shareCount || 0,
            timestamp: rawData.createTimeISO || rawData.createTime || new Date().toISOString(),
            hashtags: Array.isArray(rawData.hashtags)
                ? rawData.hashtags
                    .map((h: any) => typeof h === 'string' ? h : h?.name || '')
                    .filter((tag: string) => tag && tag.trim() !== '')
                : [],
            music: rawData.musicMeta ? {
                name: rawData.musicMeta.musicName || 'Unknown',
                author: rawData.musicMeta.musicAuthor || 'Unknown'
            } : undefined,
            thumbnailUrl: rawData.videoMeta?.coverUrl || rawData.videoMeta?.originalCoverUrl || undefined
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

// Scrape multiple TikTok videos
export async function scrapeTikTokVideos(urls: string[]): Promise<ScrapedVideoResult[]> {
    console.log('🚀 Starting batch TikTok video scrape for URLs:', urls);

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

// Check if Apify is properly configured
export function isApifyConfigured(): boolean {
    return !!process.env.APIFY_API_TOKEN;
} 