import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from './tikhub';
import { prisma } from './prisma';
import { getCurrentNormalizedTimestamp } from './timestamp-utils';
import { uploadToS3 } from './s3';
import { InstagramAPI } from './instagram-enhanced';

export interface AccountContent {
    id: string;
    url: string;
    username: string;
    description: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
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

export interface InstagramContent {
    profile: {
        id: string;
        username: string;
        displayName: string;
        bio: string;
        profilePicture: string;
        followersCount: number;
        followingCount: number;
        postsCount: number;
        isVerified: boolean;
        isPrivate: boolean;
        isBusiness: boolean;
        externalUrl?: string;
    };
    posts: Array<{
        id: string;
        url: string;
        caption: string;
        mediaUrl: string;
        thumbnailUrl: string;
        likeCount: number;
        commentCount: number;
        timestamp: string;
        mediaType: 'photo' | 'video' | 'carousel';
        hashtags: string[];
        mentions: string[];
        location?: {
            id: string;
            name: string;
        };
    }>;
    stories: Array<{
        id: string;
        mediaUrl: string;
        mediaType: 'photo' | 'video';
        timestamp: string;
        expiresAt: string;
    }>;
    highlights: Array<{
        id: string;
        title: string;
        coverUrl: string;
        mediaCount: number;
    }>;
    metadata: {
        totalPosts: number;
        hasMorePosts: boolean;
        nextCursor?: string;
        lastUpdated: string;
        storiesCount: number;
        highlightsCount: number;
    };
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
async function fetchTikTokAccountContent(username: string, lastVideoId?: string): Promise<AccountContent[]> {
    console.log(`🔍 Fetching TikTok content for @${username}...`);
    
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        console.error('❌ TIKHUB_API_KEY not found in environment');
        return [];
    }
    
    try {
        const allVideos: unknown[] = [];
        let hasMore = true;
        let maxCursor: string | undefined;
        let pageCount = 0;
        const maxPages = 3; // Limit to prevent infinite loops
        
        while (hasMore && pageCount < maxPages) {
            pageCount++;
            
            // Build URL with pagination
            let url = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_user_post_videos?unique_id=${username}`;
            if (maxCursor) {
                url += `&max_cursor=${maxCursor}`;
            }
            
            console.log(`📡 Fetching page ${pageCount}${maxCursor ? ` (cursor: ${maxCursor})` : ''}...`);
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            
            if (!response.ok) {
                console.error(`❌ TikHub API error: ${response.status} ${response.statusText}`);
                break;
            }
            
            const data = await response.json();
            
            if (!data.data || !data.data.aweme_list || !Array.isArray(data.data.aweme_list)) {
                console.log(`⚠️ No videos found in page ${pageCount} for @${username}`);
                break;
            }
            
            const pageVideos = data.data.aweme_list;
            allVideos.push(...pageVideos);
            console.log(`📊 Page ${pageCount}: Found ${pageVideos.length} videos (total: ${allVideos.length})`);
            
            // Check pagination
            hasMore = data.data.has_more === 1 || data.data.has_more === true;
            maxCursor = data.data.max_cursor;
            
            if (!hasMore || !maxCursor) {
                console.log(`✅ Reached end of content (has_more: ${hasMore}, cursor: ${maxCursor})`);
                break;
            }
        }
        
        console.log(`✅ Total videos fetched for @${username}: ${allVideos.length} across ${pageCount} pages`);
        
        // Convert TikHub video data to AccountContent format
        const allContent: AccountContent[] = allVideos.map((video: unknown) => {
            // Type assertion since we know the structure from TikHub API
            const videoData = video as {
                aweme_id?: string;
                id?: string;
                share_url?: string;
                desc?: string;
                description?: string;
                create_time?: number;
                createTime?: number;
            };
            
            const videoId = videoData.aweme_id || videoData.id || '';
            const shareUrl = videoData.share_url || `https://www.tiktok.com/@${username}/video/${videoId}`;
            const description = videoData.desc || videoData.description || '';
            const createTime = videoData.create_time || videoData.createTime;
            
            return {
                id: videoId,
                url: shareUrl,
                username: username,
                description: description,
                platform: 'tiktok',
                timestamp: createTime ? new Date(createTime * 1000).toISOString() : new Date().toISOString()
            };
        });
        
        // Filter out videos we've already processed
        let newContent = allContent;
        if (lastVideoId) {
            console.log(`🔍 Filtering videos newer than last tracked video: ${lastVideoId}`);
            const lastVideoIndex = allContent.findIndex(video => video.id === lastVideoId);
            if (lastVideoIndex >= 0) {
                // Only take videos that come before the lastVideoId (newer videos)
                newContent = allContent.slice(0, lastVideoIndex);
                console.log(`📝 Filtered to ${newContent.length} new videos (out of ${allContent.length} total)`);
            } else {
                console.log(`📝 Last video ID not found in current batch, considering all ${allContent.length} videos as potentially new`);
            }
        }
        
        console.log(`🎬 Returning ${newContent.length} videos for tracking consideration`);
        
        // Log first video for debugging
        if (newContent.length > 0) {
            const firstVideo = newContent[0];
            console.log(`📹 Latest new video: ${firstVideo.description.substring(0, 50)}... (${firstVideo.id})`);
        }
        
        return newContent;
        
    } catch (error) {
        console.error(`💥 Error fetching TikTok content for @${username}:`, error);
        return [];
    }
}

// Instagram account content fetching
async function fetchInstagramAccountContent(username: string, lastVideoId?: string): Promise<AccountContent[]> {
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        throw new Error('TikHub API key not configured');
    }

    try {
        const instagramAPI = new InstagramAPI(apiKey);
        
        // Get comprehensive profile data
        const profile = await instagramAPI.getUserProfile(username);
        
        // Get posts and reels
        const postsData = await instagramAPI.getUserPosts(username, undefined, 20);
        
        // Transform posts to AccountContent format for compatibility
        const allContent: AccountContent[] = postsData.posts.map(post => ({
            id: post.id,
            url: post.url,
            username: username,
            description: post.caption,
            platform: 'instagram' as const,
            timestamp: post.timestamp
        }));

        // Filter out posts we've already processed if we have a lastVideoId
        let newContent = allContent;
        if (lastVideoId) {
            const lastIndex = allContent.findIndex(content => content.id === lastVideoId);
            if (lastIndex !== -1) {
                newContent = allContent.slice(0, lastIndex);
                console.log(`📋 Found ${newContent.length} new Instagram posts since last check (videoId: ${lastVideoId})`);
            }
        }

        console.log(`✅ Total Instagram posts fetched for @${username}: ${newContent.length}`);
        return newContent;

    } catch (error) {
        console.error('Instagram API Error:', error);
        throw new Error(`Failed to fetch Instagram content for @${username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Enhanced Instagram API function for detailed data
export async function fetchInstagramAccountDetails(username: string): Promise<InstagramContent> {
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        throw new Error('TikHub API key not configured');
    }

    try {
        const instagramAPI = new InstagramAPI(apiKey);
        
        // Get comprehensive profile data
        const profile = await instagramAPI.getUserProfile(username);
        
        // Get posts and reels
        const postsData = await instagramAPI.getUserPosts(username, undefined, 20);
        
        // Get additional content types
        const [stories, highlights] = await Promise.all([
            instagramAPI.getUserStories(username).catch(() => []),
            instagramAPI.getUserHighlights(username).catch(() => [])
        ]);

        // Transform posts to match interface
        const posts = postsData.posts.map(post => ({
            id: post.id,
            url: post.url,
            caption: post.caption,
            mediaUrl: post.media_url,
            thumbnailUrl: post.thumbnail_url || post.media_url,
            likeCount: post.like_count,
            commentCount: post.comment_count,
            timestamp: post.timestamp,
            mediaType: post.media_type,
            hashtags: post.hashtags,
            mentions: post.mentions,
            location: post.location
        }));

        return {
            profile: {
                id: profile.id,
                username: profile.username,
                displayName: profile.full_name,
                bio: profile.biography,
                profilePicture: profile.profile_pic_url,
                followersCount: profile.follower_count,
                followingCount: profile.following_count,
                postsCount: profile.post_count,
                isVerified: profile.is_verified,
                isPrivate: profile.is_private,
                isBusiness: profile.is_business_account,
                externalUrl: profile.external_url
            },
            posts,
            stories: stories.map(story => ({
                id: story.id,
                mediaUrl: story.media_url,
                mediaType: story.media_type,
                timestamp: story.timestamp,
                expiresAt: story.expires_at
            })),
            highlights: highlights.map(highlight => ({
                id: highlight.id,
                title: highlight.title,
                coverUrl: highlight.cover_media_url,
                mediaCount: highlight.media_count
            })),
            metadata: {
                totalPosts: profile.post_count,
                hasMorePosts: postsData.has_more,
                nextCursor: postsData.next_cursor,
                lastUpdated: new Date().toISOString(),
                storiesCount: stories.length,
                highlightsCount: highlights.length
            }
        };
    } catch (error) {
        console.error('Instagram API Error:', error);
        throw new Error(`Failed to fetch Instagram content for @${username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
        // Extract platform-specific video ID from content
        const videoId = content.id;
        
        // Check for duplicates using multiple methods
        let existingVideo = null;
        
        // First check by URL (existing method)
        existingVideo = await prisma.video.findUnique({
            where: { url: content.url }
        });

        // If not found by URL and we have a videoId, check by videoId + platform
        if (!existingVideo && videoId) {
            existingVideo = await prisma.video.findFirst({
                where: { 
                    videoId: videoId,
                    platform: content.platform 
                }
            });
        }

        if (existingVideo) {
            console.log(`⚠️ Video already tracked (${existingVideo.videoId ? 'by videoId' : 'by URL'}): ${content.url}`);
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

        // Create video record with enhanced duplicate prevention
        const newVideo = await prisma.video.create({
            data: {
                url: content.url,
                videoId: videoId, // Store platform-specific video ID
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

        console.log(`✅ Added new video to tracking: @${getUsername(mediaData)} - ${getDescription(mediaData).substring(0, 50)}... (videoId: ${videoId})`);
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

        // Get the tracked account record to access lastVideoId
        const trackedAccount = await prisma.trackedAccount.findUnique({
            where: { id: account.id }
        });

        const lastVideoId = trackedAccount?.lastVideoId;
        console.log(`📋 Last tracked video ID for @${account.username}: ${lastVideoId || 'none'}`);

        // Fetch recent content based on platform
        let recentContent: AccountContent[] = [];
        
        switch (account.platform) {
            case 'tiktok':
                recentContent = await fetchTikTokAccountContent(account.username, lastVideoId || undefined);
                break;
            case 'instagram':
                recentContent = await fetchInstagramAccountContent(account.username, lastVideoId || undefined);
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

            // Update lastVideoId and lastPostAdded if we found new content
            if (recentContent.length > 0) {
                const updateData: {
                    lastVideoId: string;
                    lastChecked: Date;
                    lastPostAdded?: Date;
                } = { 
                    lastVideoId: recentContent[0].id,
                    lastChecked: new Date()
                };
                
                // Only update lastPostAdded if we actually added new videos
                if (addedCount > 0) {
                    updateData.lastPostAdded = new Date();
                }
                
                await prisma.trackedAccount.update({
                    where: { id: account.id },
                    data: updateData
                });
            }
        }

        // Update lastChecked timestamp (always update this)
        await prisma.trackedAccount.update({
            where: { id: account.id },
            data: { lastChecked: new Date() }
        });

    } catch (error) {
        console.error(`❌ Error checking account @${account.username}:`, error);
        result.status = 'failed';
        
        // Provide better error messages for Instagram
        if (account.platform === 'instagram' && error instanceof Error && error.message.includes('404')) {
            result.error = `Instagram account @${account.username} not found. The account may not exist on Instagram, or Instagram API access may be limited.`;
        } else {
            result.error = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return result;
} 