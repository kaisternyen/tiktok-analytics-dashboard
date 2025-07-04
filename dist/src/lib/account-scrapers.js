"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesKeyword = matchesKeyword;
exports.checkTrackedAccount = checkTrackedAccount;
const tikhub_1 = require("./tikhub");
const prisma_1 = require("./prisma");
const timestamp_utils_1 = require("./timestamp-utils");
const s3_1 = require("./s3");
// Helper function to check if content matches keyword(s)
function matchesKeyword(content, keyword) {
    const contentLower = content.toLowerCase();
    // Split keywords by comma, trim, and filter out empty
    const keywords = keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    // Check if any keyword matches (as substring, hashtag, or mention)
    return keywords.some(kw => {
        if (!kw)
            return false;
        if (contentLower.includes(kw))
            return true;
        if (contentLower.includes(`#${kw}`))
            return true;
        if (contentLower.includes(`@${kw}`))
            return true;
        return false;
    });
}
// Helper function to get thumbnail URL from media data
function getThumbnailUrl(mediaData) {
    if ('thumbnailUrl' in mediaData) {
        return mediaData.thumbnailUrl;
    }
    else if ('displayUrl' in mediaData) {
        return mediaData.displayUrl;
    }
    else if ('thumbnails' in mediaData) {
        return mediaData.thumbnails?.medium?.url || mediaData.thumbnails?.high?.url;
    }
    return undefined;
}
// Helper function to get username from media data
function getUsername(mediaData) {
    if ('username' in mediaData) {
        return mediaData.username;
    }
    else if ('channelTitle' in mediaData) {
        return mediaData.channelTitle;
    }
    return 'unknown';
}
// Helper function to get description from media data
function getDescription(mediaData) {
    if ('description' in mediaData) {
        return mediaData.description;
    }
    else if ('title' in mediaData) {
        // This is specifically for YouTubeVideoData which has a title property
        return mediaData.title;
    }
    return '';
}
// Helper function to get hashtags from media data
function getHashtags(mediaData) {
    if ('hashtags' in mediaData && Array.isArray(mediaData.hashtags)) {
        return mediaData.hashtags;
    }
    return [];
}
// Helper function to get music from media data
function getMusic(mediaData) {
    if ('music' in mediaData && mediaData.music) {
        // Handle different music formats
        if ('name' in mediaData.music && 'author' in mediaData.music) {
            return mediaData.music;
        }
        else if ('songName' in mediaData.music && 'artistName' in mediaData.music) {
            const musicData = mediaData.music;
            return {
                name: musicData.songName,
                author: musicData.artistName
            };
        }
    }
    return null;
}
// TikTok account content fetching
async function fetchTikTokAccountContent(username, lastVideoId) {
    console.log(`🔍 Fetching TikTok content for @${username}...`);
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        console.error('❌ TIKHUB_API_KEY not found in environment');
        return [];
    }
    try {
        const allVideos = [];
        let hasMore = true;
        let maxCursor;
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
        const allContent = allVideos.map((video) => {
            // Type assertion since we know the structure from TikHub API
            const videoData = video;
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
            }
            else {
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
    }
    catch (error) {
        console.error(`💥 Error fetching TikTok content for @${username}:`, error);
        return [];
    }
}
// Instagram account content fetching
async function fetchInstagramAccountContent(username, lastVideoId) {
    console.log(`🔍 Fetching Instagram content for @${username}...`);
    const apiKey = process.env.TIKHUB_API_KEY;
    if (!apiKey) {
        console.error('❌ TIKHUB_API_KEY environment variable is required');
        return [];
    }
    try {
        const allContent = [];
        let maxCursor = undefined;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 5; // Limit to prevent infinite loops
        while (hasMore && pageCount < maxPages) {
            pageCount++;
            // Construct API URL for Instagram user posts
            let apiUrl = `https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${username}`;
            if (maxCursor) {
                apiUrl += `&cursor=${maxCursor}`;
            }
            console.log(`📄 Fetching Instagram page ${pageCount} for @${username}${maxCursor ? ` (cursor: ${maxCursor.substring(0, 20)}...)` : ''}`);
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                console.error(`❌ TikHub API error: ${response.status} ${response.statusText}`);
                break;
            }
            const data = await response.json();
            if (!data.data || !Array.isArray(data.data.items)) {
                console.warn(`⚠️ No items found in response for @${username}`);
                break;
            }
            const posts = data.data.items;
            console.log(`✅ Found ${posts.length} Instagram posts on page ${pageCount} for @${username}`);
            // Process posts and convert to AccountContent format
            for (const post of posts) {
                // Stop if we've reached the last processed video
                if (lastVideoId && post.id === lastVideoId) {
                    console.log(`🛑 Reached last processed video ${lastVideoId} for @${username}`);
                    hasMore = false;
                    break;
                }
                // Extract post data
                const postId = post.id || post.pk || '';
                const postUrl = post.permalink || `https://www.instagram.com/p/${post.code}/`;
                const caption = post.caption?.text || '';
                const timestamp = post.taken_at ? new Date(post.taken_at * 1000).toISOString() : new Date().toISOString();
                allContent.push({
                    id: postId,
                    url: postUrl,
                    username: username,
                    description: caption,
                    platform: 'instagram',
                    timestamp: timestamp
                });
            }
            // Check for pagination
            hasMore = data.data.more_available || false;
            maxCursor = data.data.next_max_id;
            if (!hasMore || !maxCursor) {
                console.log(`✅ Reached end of content for @${username} (has_more: ${hasMore}, cursor: ${maxCursor})`);
                break;
            }
            // Add a small delay between requests to be respectful
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.log(`✅ Total Instagram posts fetched for @${username}: ${allContent.length} across ${pageCount} pages`);
        // Filter out posts we've already processed if we have a lastVideoId
        let newContent = allContent;
        if (lastVideoId) {
            const lastIndex = allContent.findIndex(content => content.id === lastVideoId);
            if (lastIndex !== -1) {
                newContent = allContent.slice(0, lastIndex);
                console.log(`📋 Found ${newContent.length} new posts since last check (videoId: ${lastVideoId})`);
            }
        }
        return newContent;
    }
    catch (error) {
        console.error(`❌ Error fetching Instagram content for @${username}:`, error);
        return [];
    }
}
// YouTube account content fetching
async function fetchYouTubeAccountContent(channelId) {
    console.log(`🔍 Fetching YouTube content for channel ${channelId}...`);
    // For now, this is a placeholder implementation
    // In a real implementation, you would:
    // 1. Use YouTube Data API v3 to fetch recent videos
    // 2. Compare with lastVideoId to find new content
    // 3. Return new videos
    const mockVideos = [];
    // Example YouTube API call (you'll need to implement this):
    // const apiKey = process.env.YOUTUBE_API_KEY;
    // const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=50&key=${apiKey}`);
    console.log(`⚠️ YouTube content fetching not yet implemented for channel ${channelId}`);
    return mockVideos;
}
// Add video to tracking system
async function addVideoToTracking(content, accountType, keyword) {
    try {
        // Extract platform-specific video ID from content
        const videoId = content.id;
        // Check for duplicates using multiple methods
        let existingVideo = null;
        // First check by URL (existing method)
        existingVideo = await prisma_1.prisma.video.findUnique({
            where: { url: content.url }
        });
        // If not found by URL and we have a videoId, check by videoId + platform
        if (!existingVideo && videoId) {
            existingVideo = await prisma_1.prisma.video.findFirst({
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
        const scrapingResult = await (0, tikhub_1.scrapeMediaPost)(content.url);
        if (!scrapingResult.success || !scrapingResult.data) {
            console.error(`❌ Failed to scrape video: ${scrapingResult.error}`);
            return false;
        }
        const mediaData = scrapingResult.data;
        // Determine platform and extract data
        let platform = 'tiktok';
        let views = 0;
        let shares = 0;
        let thumbnailUrl = getThumbnailUrl(mediaData);
        if (content.url.includes('instagram.com')) {
            platform = 'instagram';
            const instaData = mediaData;
            views = instaData.plays || instaData.views || 0;
            shares = 0; // Instagram doesn't track shares
        }
        else if (content.url.includes('youtube.com')) {
            platform = 'youtube';
            const youtubeData = mediaData;
            views = youtubeData.views || 0;
            shares = 0; // YouTube doesn't track shares in our API
        }
        else {
            const tiktokData = mediaData;
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
                    const s3Url = await (0, s3_1.uploadToS3)(buffer, key, 'image/jpeg');
                    thumbnailUrl = s3Url;
                    console.log('✅ Thumbnail uploaded to S3:', s3Url);
                }
            }
            catch (err) {
                console.error('Failed to upload thumbnail to S3:', err);
            }
        }
        // Create video record with enhanced duplicate prevention
        const newVideo = await prisma_1.prisma.video.create({
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
        const normalizedTimestamp = (0, timestamp_utils_1.getCurrentNormalizedTimestamp)('60min');
        await prisma_1.prisma.metricsHistory.create({
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
    }
    catch (error) {
        console.error('❌ Error adding video to tracking:', error);
        return false;
    }
}
// Main function to check a single tracked account
async function checkTrackedAccount(account) {
    const result = {
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
        const trackedAccount = await prisma_1.prisma.trackedAccount.findUnique({
            where: { id: account.id }
        });
        const lastVideoId = trackedAccount?.lastVideoId;
        console.log(`📋 Last tracked video ID for @${account.username}: ${lastVideoId || 'none'}`);
        // Fetch recent content based on platform
        let recentContent = [];
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
        }
        else {
            // Add videos to tracking system
            let addedCount = 0;
            const addedVideos = [];
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
                // Set the lastVideoId to the most recent video so future checks
                // will only pick up content newer than this
                await prisma_1.prisma.trackedAccount.update({
                    where: { id: account.id },
                    data: {
                        lastVideoId: recentContent[0].id,
                        lastChecked: new Date()
                    }
                });
            }
        }
        // Update lastChecked timestamp
        await prisma_1.prisma.trackedAccount.update({
            where: { id: account.id },
            data: { lastChecked: new Date() }
        });
    }
    catch (error) {
        console.error(`❌ Error checking account @${account.username}:`, error);
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
}
