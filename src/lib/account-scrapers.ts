import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from './tikhub';
import { prisma } from './prisma';
import { getCurrentNormalizedTimestamp } from './timestamp-utils';
import { uploadToS3 } from './s3';

export interface AccountContent {
    id: string;
    url: string;
    username: string;
    description: string;
    platform: string;
    timestamp: string;
}

export interface AccountCheckResult {
    accountId: string;
    username: string;
    platform: string;
    status: 'success' | 'failed' | 'no_new_content';
    newVideos: number;
    error?: string;
    addedVideos?: AccountContent[];
}

// Helper function to check if content matches keyword(s)
export function matchesKeyword(content: string, keyword: string): boolean {
    const contentLower = content.toLowerCase();
    // Split keywords by comma, trim, and filter out empty
    const keywords = keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    // Check if any keyword matches (as substring, hashtag, or mention)
    return keywords.some(kw => {
        if (!kw) return false;
        if (contentLower.includes(kw)) return true;
        if (contentLower.includes(`#${kw}`)) return true;
        if (contentLower.includes(`@${kw}`)) return true;
        return false;
    });
}

// Helper function to get thumbnail URL from media data
function getThumbnailUrl(mediaData: TikTokVideoData | InstagramPostData | YouTubeVideoData): string | undefined {
    if ('thumbnailUrl' in mediaData) {
        return mediaData.thumbnailUrl;
    } else if ('displayUrl' in mediaData) {
        return mediaData.displayUrl;
    } else if ('thumbnails' in mediaData) {
        return mediaData.thumbnails?.medium?.url || mediaData.thumbnails?.high?.url;
    }
    return undefined;
}

// Helper function to get username from media data
function getUsername(mediaData: TikTokVideoData | InstagramPostData | YouTubeVideoData): string {
    if ('username' in mediaData) {
        return mediaData.username;
    } else if ('channelTitle' in mediaData) {
        return mediaData.channelTitle;
    }
    return 'unknown';
}

// Helper function to get description from media data
function getDescription(mediaData: TikTokVideoData | InstagramPostData | YouTubeVideoData): string {
    if ('description' in mediaData) {
        return mediaData.description;
    } else if ('title' in mediaData) {
        // This is specifically for YouTubeVideoData which has a title property
        return (mediaData as YouTubeVideoData).title;
    }
    return '';
}

// Helper function to get hashtags from media data
function getHashtags(mediaData: TikTokVideoData | InstagramPostData | YouTubeVideoData): string[] {
    if ('hashtags' in mediaData && Array.isArray(mediaData.hashtags)) {
        return mediaData.hashtags;
    }
    return [];
}

// Helper function to get music from media data
function getMusic(mediaData: TikTokVideoData | InstagramPostData | YouTubeVideoData): { name: string; author: string } | null {
    if ('music' in mediaData && mediaData.music) {
        // Handle different music formats
        if ('name' in mediaData.music && 'author' in mediaData.music) {
            return mediaData.music as { name: string; author: string };
        } else if ('songName' in mediaData.music && 'artistName' in mediaData.music) {
            const musicData = mediaData.music as { songName: string; artistName: string };
            return {
                name: musicData.songName,
                author: musicData.artistName
            };
        }
    }
    return null;
}

// TikTok account content fetching
async function fetchTikTokAccountContent(username: string): Promise<AccountContent[]> {
    console.log(`🔍 Fetching TikTok content for @${username}...`);
    
    // For now, this is a placeholder implementation
    // In a real implementation, you would:
    // 1. Use TikHub's user videos endpoint to fetch recent videos
    // 2. Compare with lastVideoId to find new content
    // 3. Return new videos
    
    // Placeholder: simulate finding new content
    const mockVideos: AccountContent[] = [];
    
    // Example TikHub API call (you'll need to implement this):
    // const apiKey = process.env.TIKHUB_API_KEY;
    // const response = await fetch(`https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_user_videos?unique_id=${username}`, {
    //     headers: { 'Authorization': `Bearer ${apiKey}` }
    // });
    
    console.log(`⚠️ TikTok content fetching not yet implemented for @${username}`);
    return mockVideos;
}

// Instagram account content fetching
async function fetchInstagramAccountContent(username: string): Promise<AccountContent[]> {
    console.log(`🔍 Fetching Instagram content for @${username}...`);
    
    // For now, this is a placeholder implementation
    // In a real implementation, you would:
    // 1. Use TikHub's Instagram user posts endpoint
    // 2. Compare with lastVideoId to find new content
    // 3. Return new posts
    
    const mockPosts: AccountContent[] = [];
    
    // Example TikHub API call (you'll need to implement this):
    // const apiKey = process.env.TIKHUB_API_KEY;
    // const response = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${username}`, {
    //     headers: { 'Authorization': `Bearer ${apiKey}` }
    // });
    
    console.log(`⚠️ Instagram content fetching not yet implemented for @${username}`);
    return mockPosts;
}

// YouTube account content fetching
async function fetchYouTubeAccountContent(channelId: string): Promise<AccountContent[]> {
    console.log(`🔍 Fetching YouTube content for channel ${channelId}...`);
    
    // For now, this is a placeholder implementation
    // In a real implementation, you would:
    // 1. Use YouTube Data API v3 to fetch recent videos
    // 2. Compare with lastVideoId to find new content
    // 3. Return new videos
    
    const mockVideos: AccountContent[] = [];
    
    // Example YouTube API call (you'll need to implement this):
    // const apiKey = process.env.YOUTUBE_API_KEY;
    // const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=50&key=${apiKey}`);
    
    console.log(`⚠️ YouTube content fetching not yet implemented for channel ${channelId}`);
    return mockVideos;
}

// Add video to tracking system
async function addVideoToTracking(content: AccountContent, accountType: 'all' | 'keyword', keyword?: string): Promise<boolean> {
    try {
        // Check if video already exists
        const existingVideo = await prisma.video.findUnique({
            where: { url: content.url }
        });

        if (existingVideo) {
            console.log(`⚠️ Video already tracked: ${content.url}`);
            return false;
        }

        // For keyword accounts, check if content matches keyword
        if (accountType === 'keyword' && keyword) {
            const matches = matchesKeyword(content.description, keyword);
            if (!matches) {
                console.log(`❌ Content doesn't match keyword "${keyword}": ${content.description.substring(0, 100)}...`);
                return false;
            }
        }

        // Scrape the video to get full data
        const scrapingResult = await scrapeMediaPost(content.url);
        
        if (!scrapingResult.success || !scrapingResult.data) {
            console.error(`❌ Failed to scrape video: ${scrapingResult.error}`);
            return false;
        }

        const mediaData = scrapingResult.data as TikTokVideoData | InstagramPostData | YouTubeVideoData;
        
        // Determine platform and extract data
        let platform = 'tiktok';
        let views = 0;
        let shares = 0;
        let thumbnailUrl = getThumbnailUrl(mediaData);
        
        if (content.url.includes('instagram.com')) {
            platform = 'instagram';
            const instaData = mediaData as InstagramPostData;
            views = instaData.plays || instaData.views || 0;
            shares = 0; // Instagram doesn't track shares
        } else if (content.url.includes('youtube.com')) {
            platform = 'youtube';
            const youtubeData = mediaData as YouTubeVideoData;
            views = youtubeData.views || 0;
            shares = 0; // YouTube doesn't track shares in our API
        } else {
            const tiktokData = mediaData as TikTokVideoData;
            views = tiktokData.views || 0;
            shares = tiktokData.shares || 0;
        }

        // Upload thumbnail to S3 if present
        if (thumbnailUrl) {
            try {
                const res = await fetch(thumbnailUrl);
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const key = `thumbnails/${mediaData.id}.jpg`;
                    const s3Url = await uploadToS3(buffer, key, 'image/jpeg');
                    thumbnailUrl = s3Url;
                    console.log('✅ Thumbnail uploaded to S3:', s3Url);
                }
            } catch (err) {
                console.error('Failed to upload thumbnail to S3:', err);
            }
        }

        // Create video record
        const newVideo = await prisma.video.create({
            data: {
                url: content.url,
                username: getUsername(mediaData),
                description: getDescription(mediaData),
                thumbnailUrl: thumbnailUrl,
                platform: platform,
                currentViews: views,
                currentLikes: mediaData.likes,
                currentComments: mediaData.comments,
                currentShares: shares,
                scrapingCadence: 'hourly', // Default for new videos
                lastScrapedAt: new Date(),
                hashtags: JSON.stringify(getHashtags(mediaData)),
                music: JSON.stringify(getMusic(mediaData)),
                isActive: true,
            }
        });

        // Add initial metrics history entry
        const normalizedTimestamp = getCurrentNormalizedTimestamp('60min');
        await prisma.metricsHistory.create({
            data: {
                videoId: newVideo.id,
                views: views,
                likes: mediaData.likes,
                comments: mediaData.comments,
                shares: shares,
                timestamp: new Date(normalizedTimestamp)
            }
        });

        console.log(`✅ Added new video to tracking: @${getUsername(mediaData)} - ${getDescription(mediaData).substring(0, 50)}...`);
        return true;

    } catch (error) {
        console.error('❌ Error adding video to tracking:', error);
        return false;
    }
}

// Main function to check a single tracked account
export async function checkTrackedAccount(account: { id: string; username: string; platform: string; accountType: 'all' | 'keyword'; keyword?: string }): Promise<AccountCheckResult> {
    const result: AccountCheckResult = {
        accountId: account.id,
        username: account.username,
        platform: account.platform,
        status: 'success',
        newVideos: 0,
        addedVideos: []
    };

    try {
        console.log(`🔍 Checking account @${account.username} on ${account.platform}...`);

        // Fetch recent content based on platform
        let recentContent: AccountContent[] = [];
        
        switch (account.platform) {
            case 'tiktok':
                recentContent = await fetchTikTokAccountContent(account.username);
                break;
            case 'instagram':
                recentContent = await fetchInstagramAccountContent(account.username);
                break;
            case 'youtube':
                // For YouTube, we might need to store channel ID instead of username
                recentContent = await fetchYouTubeAccountContent(account.username);
                break;
            default:
                throw new Error(`Unsupported platform: ${account.platform}`);
        }

        if (recentContent.length === 0) {
            result.status = 'no_new_content';
            result.newVideos = 0;
        } else {
            // Add videos to tracking system
            let addedCount = 0;
            const addedVideos: AccountContent[] = [];
            
            for (const content of recentContent) {
                const added = await addVideoToTracking(content, account.accountType, account.keyword);
                if (added) {
                    addedCount++;
                    addedVideos.push(content);
                }
            }

            result.newVideos = addedCount;
            result.addedVideos = addedVideos;

            // Update lastVideoId if we found new content
            if (recentContent.length > 0) {
                await prisma.trackedAccount.update({
                    where: { id: account.id },
                    data: { 
                        lastVideoId: recentContent[0].id,
                        lastChecked: new Date()
                    }
                });
            }
        }

        // Update lastChecked timestamp
        await prisma.trackedAccount.update({
            where: { id: account.id },
            data: { lastChecked: new Date() }
        });

    } catch (error) {
        console.error(`❌ Error checking account @${account.username}:`, error);
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
} 