import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Background processing function for existing content
async function processExistingContentInBackground(
    accountId: string, 
    username: string, 
    platform: string, 
    accountType: 'all' | 'keyword', 
    keyword?: string
) {
    console.log(`🚀 Starting background content processing for @${username} on ${platform}`);
    
    try {
        // Import the account checking functionality
        const { checkTrackedAccount } = await import('../../../lib/account-scrapers');
        
        // Process in chunks with delays to avoid overwhelming the system
        const result = await checkTrackedAccount({
            id: accountId,
            username: username,
            platform: platform,
            accountType: accountType,
            keyword: keyword
        });
        
        if (result.status === 'success' && result.newVideos > 0) {
            console.log(`✅ Background processing completed for @${username}: Added ${result.newVideos} existing videos`);
            
            // Update the account's lastPostAdded timestamp to indicate processing is complete
            await prisma.trackedAccount.update({
                where: { id: accountId },
                data: { lastPostAdded: new Date() }
            });
        } else {
            console.log(`ℹ️ Background processing completed for @${username}: ${result.status}`);
        }
    } catch (error) {
        console.error(`💥 Background processing failed for @${username}:`, error);
        
        // You could also update a status field in the database to indicate failure
        // For now, we'll just log the error
    }
}

// Standardize username to prevent duplicate tracking
function standardizeUsername(username: string, platform: string): string {
    let standardized = username.toLowerCase().trim();
    
    // Remove @ prefix if present
    if (standardized.startsWith('@')) {
        standardized = standardized.substring(1);
    }
    
    // Extract username from full URLs
    if (platform === 'tiktok' && standardized.includes('tiktok.com')) {
        const match = standardized.match(/tiktok\.com\/@([^\/?\s]+)/);
        if (match) {
            standardized = match[1];
        }
    } else if (platform === 'instagram' && standardized.includes('instagram.com')) {
        const match = standardized.match(/instagram\.com\/([^\/?\s]+)/);
        if (match) {
            standardized = match[1];
        }
    } else if (platform === 'youtube' && standardized.includes('youtube.com/@')) {
        const match = standardized.match(/youtube\.com\/@([^\/?\s]+)/);
        if (match) {
            standardized = match[1];
        }
    }
    
    return standardized;
}

// GET - List all tracked accounts
export async function GET() {
    try {
        console.log('📋 Fetching tracked accounts...');
        
        const accounts = await prisma.trackedAccount.findMany({
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Found ${accounts.length} tracked accounts`);

        // For each account, fetch trackedPosts and totalPosts
        const accountsWithCounts = await Promise.all(accounts.map(async (account) => {
            let trackedPosts = 0;
            let totalPosts = null;
            let pfpUrl = null;
            let apiStatus = null;
            let apiError = null;
            let displayName = null;
            let followers = null;
            let profileUrl = null;
            const apiErrorMessage = null;
            let lookedUpUsername = null;
            try {
                trackedPosts = await prisma.video.count({
                    where: {
                        username: account.username,
                        platform: account.platform
                    }
                });
                if (account.platform === 'tiktok') {
                    const apiKey = process.env.TIKHUB_API_KEY;
                    if (apiKey) {
                        const res = await fetch(`https://api.tikhub.io/api/v1/tiktok/web/fetch_user_profile?uniqueId=${account.username}`, {
                            headers: { 'Authorization': `Bearer ${apiKey}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            console.log('🐛 TikHub Web Profile API response for', account.username, JSON.stringify(data, null, 2));
                            if (data.data && data.data.userInfo) {
                                const userInfo = data.data.userInfo;
                                if (userInfo.stats && typeof userInfo.stats.videoCount === 'number') {
                                    totalPosts = userInfo.stats.videoCount;
                                } else if (userInfo.statsV2 && userInfo.statsV2.videoCount) {
                                    totalPosts = parseInt(userInfo.statsV2.videoCount, 10);
                                }
                                if (userInfo.user && userInfo.user.avatarLarger) {
                                    pfpUrl = userInfo.user.avatarLarger;
                                } else if (userInfo.user && userInfo.user.avatarMedium) {
                                    pfpUrl = userInfo.user.avatarMedium;
                                } else if (userInfo.user && userInfo.user.avatarThumb) {
                                    pfpUrl = userInfo.user.avatarThumb;
                                }
                                
                                apiStatus = data.code;
                                if (userInfo.user && userInfo.user.nickname) {
                                    displayName = userInfo.user.nickname;
                                }
                                if (userInfo.stats && userInfo.stats.followerCount) {
                                    followers = userInfo.stats.followerCount;
                                } else if (userInfo.statsV2 && userInfo.statsV2.followerCount) {
                                    followers = parseInt(userInfo.statsV2.followerCount, 10);
                                }
                                profileUrl = `https://www.tiktok.com/@${account.username}`;
                            }
                            lookedUpUsername = account.username;
                        }
                    }
                } else if (account.platform === 'instagram') {
                    const apiKey = process.env.TIKHUB_API_KEY;
                    if (apiKey) {
                        const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_info_by_username?username=${account.username}`, {
                            headers: { 'Authorization': `Bearer ${apiKey}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data.data && data.data.edge_owner_to_timeline_media) {
                                totalPosts = data.data.edge_owner_to_timeline_media.count;
                            }
                            if (data.data && data.data.profile_pic_url_hd) {
                                pfpUrl = data.data.profile_pic_url_hd;
                            } else if (data.data && data.data.profile_pic_url) {
                                pfpUrl = data.data.profile_pic_url;
                            }
                            
                            apiStatus = data.code;
                            if (data.data && data.data.full_name) {
                                displayName = data.data.full_name;
                            }
                            if (data.data && data.data.edge_followed_by) {
                                followers = data.data.edge_followed_by.count;
                            }
                            profileUrl = `https://www.instagram.com/${account.username}/`;
                            lookedUpUsername = account.username;
                        } else {
                            apiError = `${res.status}: ${res.statusText}`;
                        }
                    }
                } else if (account.platform === 'youtube') {
                    const apiKey = process.env.YOUTUBE_API_KEY;
                    if (apiKey) {
                        // First, get channel ID from username if needed using enhanced logic
                        let channelId = account.username;
                        
                        if (!account.username.startsWith('UC') || account.username.length !== 24) {
                            // Clean the identifier - remove @ if present and any URL parts
                            let cleanIdentifier = account.username;
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
                            
                            // Try to get channel by handle first (modern approach)
                            const handleResponse = await fetch(
                                `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=@${cleanIdentifier}&key=${apiKey}`
                            );
                            
                            if (handleResponse.ok) {
                                const handleData = await handleResponse.json();
                                if (handleData.items && handleData.items.length > 0) {
                                    channelId = handleData.items[0].id;
                                } else {
                                    // Try legacy username lookup
                                    const usernameResponse = await fetch(
                                        `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${cleanIdentifier}&key=${apiKey}`
                                    );
                                    
                                    if (usernameResponse.ok) {
                                        const usernameData = await usernameResponse.json();
                                        if (usernameData.items && usernameData.items.length > 0) {
                                            channelId = usernameData.items[0].id;
                                        } else {
                                            // Try search as fallback
                                            const searchResponse = await fetch(
                                                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanIdentifier)}&type=channel&maxResults=1&key=${apiKey}`
                                            );
                                            
                                            if (searchResponse.ok) {
                                                const searchData = await searchResponse.json();
                                                if (searchData.items && searchData.items.length > 0) {
                                                    channelId = searchData.items[0].snippet.channelId;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Now get channel statistics using the resolved channel ID
                        const res2 = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`);
                        if (res2.ok) {
                            const data2 = await res2.json();
                            if (data2.items && data2.items.length > 0) {
                                totalPosts = parseInt(data2.items[0].statistics?.videoCount || '0', 10);
                                if (data2.items[0].snippet && data2.items[0].snippet.thumbnails && data2.items[0].snippet.thumbnails.default) {
                                    pfpUrl = data2.items[0].snippet.thumbnails.default.url;
                                }
                                if (data2.items[0].snippet && data2.items[0].snippet.title) {
                                    displayName = data2.items[0].snippet.title;
                                }
                                if (data2.items[0].statistics && data2.items[0].statistics.subscriberCount) {
                                    followers = parseInt(data2.items[0].statistics.subscriberCount || '0', 10);
                                }
                                profileUrl = `https://www.youtube.com/@${account.username}`;
                                lookedUpUsername = account.username;
                                apiStatus = 200;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching tracked/total posts for account', account.username, account.platform, err);
            }
            return {
                id: account.id,
                username: account.username,
                platform: account.platform,
                accountType: account.accountType,
                keyword: account.keyword,
                isActive: account.isActive,
                lastChecked: account.lastChecked.toISOString(),
                createdAt: account.createdAt.toISOString(),
                lastVideoId: account.lastVideoId,
                lastPostAdded: account.lastPostAdded?.toISOString(),
                trackedPosts,
                totalPosts,
                pfpUrl,
                apiStatus,
                apiError,
                displayName,
                followers,
                profileUrl,
                apiErrorMessage,
                lookedUpUsername
            };
        }));

        return NextResponse.json({
            success: true,
            accounts: accountsWithCounts
        });

    } catch (error) {
        console.error('💥 Error fetching tracked accounts:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch tracked accounts'
        }, { status: 500 });
    }
}

// POST - Create a new tracked account
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, platform, accountType, keyword, includeExistingContent = false } = body;

        console.log('➕ Creating new tracked account:', { username, platform, accountType, keyword, includeExistingContent });

        // Validate required fields
        if (!username || !platform) {
            return NextResponse.json({
                success: false,
                error: 'Username and platform are required'
            }, { status: 400 });
        }

        // Validate platform
        if (!['tiktok', 'instagram', 'youtube'].includes(platform)) {
            return NextResponse.json({
                success: false,
                error: 'Platform must be tiktok, instagram, or youtube'
            }, { status: 400 });
        }

        // Validate account type
        if (!['all', 'keyword'].includes(accountType)) {
            return NextResponse.json({
                success: false,
                error: 'Account type must be "all" or "keyword"'
            }, { status: 400 });
        }

        // Validate keyword for keyword type accounts
        if (accountType === 'keyword' && !keyword) {
            return NextResponse.json({
                success: false,
                error: 'Keyword is required for keyword type accounts'
            }, { status: 400 });
        }

        // Validate account exists before creating
        let accountExists = false;
        if (platform === 'tiktok') {
            const apiKey = process.env.TIKHUB_API_KEY;
            if (apiKey) {
                const res = await fetch(`https://api.tikhub.io/api/v1/tiktok/web/fetch_user_profile?uniqueId=${username}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    console.log('🐛 TikHub Web Profile API response for', username, JSON.stringify(data, null, 2));
                    if (data.data && data.data.userInfo && data.data.userInfo.user && data.data.userInfo.user.nickname) {
                        accountExists = true;
                    }
                }
            }
        } else if (platform === 'instagram') {
            const apiKey = process.env.TIKHUB_API_KEY;
            if (apiKey) {
                const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_info_by_username?username=${username}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.edge_owner_to_timeline_media) {
                        accountExists = true;
                    }
                }
            }
        } else if (platform === 'youtube') {
            const apiKey = process.env.YOUTUBE_API_KEY;
            if (apiKey) {
                let channelId = username;
                
                // If not a direct channel ID, try to resolve it using the enhanced logic
                if (!username.startsWith('UC') || username.length !== 24) {
                    // Clean the identifier - remove @ if present and any URL parts
                    let cleanIdentifier = username;
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
                    
                    // Try to get channel by handle first (modern approach)
                    const handleResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=@${cleanIdentifier}&key=${apiKey}`
                    );
                    
                    if (handleResponse.ok) {
                        const handleData = await handleResponse.json();
                        if (handleData.items && handleData.items.length > 0) {
                            channelId = handleData.items[0].id;
                            accountExists = true;
                        } else {
                            // Try legacy username lookup
                            const usernameResponse = await fetch(
                                `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${cleanIdentifier}&key=${apiKey}`
                            );
                            
                            if (usernameResponse.ok) {
                                const usernameData = await usernameResponse.json();
                                if (usernameData.items && usernameData.items.length > 0) {
                                    channelId = usernameData.items[0].id;
                                    accountExists = true;
                                } else {
                                    // Try search as fallback
                                    const searchResponse = await fetch(
                                        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanIdentifier)}&type=channel&maxResults=1&key=${apiKey}`
                                    );
                                    
                                    if (searchResponse.ok) {
                                        const searchData = await searchResponse.json();
                                        if (searchData.items && searchData.items.length > 0) {
                                            channelId = searchData.items[0].snippet.channelId;
                                            accountExists = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Direct channel ID lookup
                    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&id=${channelId}&key=${apiKey}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.items && data.items.length > 0) {
                            accountExists = true;
                        }
                    }
                }
            }
        }
        if (!accountExists) {
            return NextResponse.json({
                success: false,
                error: `Account @${username} on ${platform} does not exist or could not be found.`
            }, { status: 404 });
        }

        // Check if account already exists
        const existingAccount = await prisma.trackedAccount.findUnique({
            where: {
                username_platform: {
                    username: standardizeUsername(username, platform),
                    platform
                }
            }
        });

        if (existingAccount) {
            return NextResponse.json({
                success: false,
                error: `Account @${username} on ${platform} is already being tracked`
            }, { status: 409 });
        }

        // Create the tracked account
        const newAccount = await prisma.trackedAccount.create({
            data: {
                username: standardizeUsername(username, platform),
                platform,
                accountType,
                keyword: keyword ? keyword.toLowerCase() : null,
                isActive: true
            }
        });

        console.log('✅ Created tracked account:', newAccount.id);

        // --- Fetch total posts from platform API ---
        let totalPosts = null;
        let trackedPosts = 0;
        let pfpUrl = null;
        let apiStatus = null;
        const apiError = null;
        let displayName = null;
        let followers = null;
        let profileUrl = null;
        const apiErrorMessage = null;
        let lookedUpUsername = null;
        try {
            // Count tracked posts in DB
            trackedPosts = await prisma.video.count({
                where: {
                    username: standardizeUsername(username, platform),
                    platform: platform
                }
            });

            if (platform === 'tiktok') {
                // TikTok: Use TikHub API
                const apiKey = process.env.TIKHUB_API_KEY;
                if (apiKey) {
                    const res = await fetch(`https://api.tikhub.io/api/v1/tiktok/web/fetch_user_profile?uniqueId=${username}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        console.log('🐛 TikHub Web Profile API response for', username, JSON.stringify(data, null, 2));
                        if (data.data && data.data.userInfo) {
                            const userInfo = data.data.userInfo;
                            // Try to get total post count from response
                            if (userInfo.stats && typeof userInfo.stats.videoCount === 'number') {
                                totalPosts = userInfo.stats.videoCount;
                            } else if (userInfo.statsV2 && userInfo.statsV2.videoCount) {
                                totalPosts = parseInt(userInfo.statsV2.videoCount, 10);
                            }
                            if (userInfo.user && userInfo.user.avatarLarger) {
                                pfpUrl = userInfo.user.avatarLarger;
                            } else if (userInfo.user && userInfo.user.avatarMedium) {
                                pfpUrl = userInfo.user.avatarMedium;
                            } else if (userInfo.user && userInfo.user.avatarThumb) {
                                pfpUrl = userInfo.user.avatarThumb;
                            }
                            
                            apiStatus = data.code;
                            if (userInfo.user && userInfo.user.nickname) {
                                displayName = userInfo.user.nickname;
                            }
                            if (userInfo.stats && userInfo.stats.followerCount) {
                                followers = userInfo.stats.followerCount;
                            } else if (userInfo.statsV2 && userInfo.statsV2.followerCount) {
                                followers = parseInt(userInfo.statsV2.followerCount, 10);
                            }
                            profileUrl = `https://www.tiktok.com/@${username}`;
                        }
                        lookedUpUsername = username;
                    }
                }
            } else if (platform === 'instagram') {
                // Instagram: Use TikHub API
                const apiKey = process.env.TIKHUB_API_KEY;
                if (apiKey) {
                    const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_info_by_username?username=${username}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        // Try to get total post count from response
                        if (data.data && data.data.edge_owner_to_timeline_media) {
                            totalPosts = data.data.edge_owner_to_timeline_media.count;
                        }
                        if (data.data && data.data.profile_pic_url_hd) {
                            pfpUrl = data.data.profile_pic_url_hd;
                        } else if (data.data && data.data.profile_pic_url) {
                            pfpUrl = data.data.profile_pic_url;
                        }
                        
                        apiStatus = data.code;
                        if (data.data && data.data.full_name) {
                            displayName = data.data.full_name;
                        }
                        if (data.data && data.data.edge_followed_by) {
                            followers = data.data.edge_followed_by.count;
                        }
                        profileUrl = `https://www.instagram.com/${username}/`;
                        lookedUpUsername = username;
                    }
                }
            } else if (platform === 'youtube') {
                // YouTube: Use YouTube Data API
                const apiKey = process.env.YOUTUBE_API_KEY;
                if (apiKey) {
                    // First, get channel ID from username if needed using enhanced logic
                    let channelId = username;
                    
                    if (!username.startsWith('UC') || username.length !== 24) {
                        // Clean the identifier - remove @ if present and any URL parts
                        let cleanIdentifier = username;
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
                        
                        // Try to get channel by handle first (modern approach)
                        const handleResponse = await fetch(
                            `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=@${cleanIdentifier}&key=${apiKey}`
                        );
                        
                        if (handleResponse.ok) {
                            const handleData = await handleResponse.json();
                            if (handleData.items && handleData.items.length > 0) {
                                channelId = handleData.items[0].id;
                            } else {
                                // Try legacy username lookup
                                const usernameResponse = await fetch(
                                    `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${cleanIdentifier}&key=${apiKey}`
                                );
                                
                                if (usernameResponse.ok) {
                                    const usernameData = await usernameResponse.json();
                                    if (usernameData.items && usernameData.items.length > 0) {
                                        channelId = usernameData.items[0].id;
                                    } else {
                                        // Try search as fallback
                                        const searchResponse = await fetch(
                                            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanIdentifier)}&type=channel&maxResults=1&key=${apiKey}`
                                        );
                                        
                                        if (searchResponse.ok) {
                                            const searchData = await searchResponse.json();
                                            if (searchData.items && searchData.items.length > 0) {
                                                channelId = searchData.items[0].snippet.channelId;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Now get channel statistics using the resolved channel ID
                    const res2 = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`);
                    if (res2.ok) {
                        const data2 = await res2.json();
                        if (data2.items && data2.items.length > 0) {
                            totalPosts = parseInt(data2.items[0].statistics?.videoCount || '0', 10);
                            if (data2.items[0].snippet && data2.items[0].snippet.thumbnails && data2.items[0].snippet.thumbnails.default) {
                                pfpUrl = data2.items[0].snippet.thumbnails.default.url;
                            }
                            if (data2.items[0].snippet && data2.items[0].snippet.title) {
                                displayName = data2.items[0].snippet.title;
                            }
                            if (data2.items[0].statistics && data2.items[0].statistics.subscriberCount) {
                                followers = parseInt(data2.items[0].statistics.subscriberCount || '0', 10);
                            }
                            profileUrl = `https://www.youtube.com/@${username}`;
                            lookedUpUsername = username;
                            apiStatus = 200;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching total/tracked posts:', err);
        }

        // --- Schedule background content processing if requested ---
        if (includeExistingContent) {
            console.log(`🔄 Scheduling background content processing for @${username} (includeExistingContent: true)`);
            
            // Start background processing without waiting for it to complete
            processExistingContentInBackground(newAccount.id, username, platform, newAccount.accountType as 'all' | 'keyword', newAccount.keyword || undefined)
                .catch(error => {
                    console.error(`⚠️ Background content processing failed for @${username}:`, error);
                });
            
            console.log(`✅ Account @${username} created successfully - existing content will be processed in background`);
        } else {
            console.log(`⏭️ Skipping existing content for @${username} (includeExistingContent: false)`);
        }

        const message = includeExistingContent 
            ? `Started tracking @${username} on ${platform} - existing content processing in background`
            : `Started tracking @${username} on ${platform}`;

        return NextResponse.json({
            success: true,
            message: message,
            backgroundProcessing: includeExistingContent,
            account: {
                id: newAccount.id,
                username: newAccount.username,
                platform: newAccount.platform,
                accountType: newAccount.accountType,
                keyword: newAccount.keyword,
                isActive: newAccount.isActive,
                lastChecked: newAccount.lastChecked.toISOString(),
                createdAt: newAccount.createdAt.toISOString(),
                pfpUrl,
                apiStatus,
                apiError,
                displayName,
                followers,
                profileUrl,
                apiErrorMessage,
                lookedUpUsername
            },
            trackedPosts,
            totalPosts
        });

    } catch (error) {
        console.error('💥 Error creating tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to create tracked account'
        }, { status: 500 });
    }
}

// PUT - Update a tracked account
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, isActive, accountType, keyword } = body;

        console.log('✏️ Updating tracked account:', { id, isActive, accountType, keyword });

        if (!id) {
            return NextResponse.json({
                success: false,
                error: 'Account ID is required'
            }, { status: 400 });
        }

        // Validate account type if provided
        if (accountType && !['all', 'keyword'].includes(accountType)) {
            return NextResponse.json({
                success: false,
                error: 'Account type must be "all" or "keyword"'
            }, { status: 400 });
        }

        // Validate keyword for keyword type accounts
        if (accountType === 'keyword' && !keyword) {
            return NextResponse.json({
                success: false,
                error: 'Keyword is required for keyword type accounts'
            }, { status: 400 });
        }

        // Update the account
        const updatedAccount = await prisma.trackedAccount.update({
            where: { id },
            data: {
                ...(isActive !== undefined && { isActive }),
                ...(accountType && { accountType }),
                ...(keyword !== undefined && { keyword: keyword ? keyword.toLowerCase() : null })
            }
        });

        console.log('✅ Updated tracked account:', updatedAccount.id);

        return NextResponse.json({
            success: true,
            message: 'Account updated successfully',
            account: {
                id: updatedAccount.id,
                username: updatedAccount.username,
                platform: updatedAccount.platform,
                accountType: updatedAccount.accountType,
                keyword: updatedAccount.keyword,
                isActive: updatedAccount.isActive,
                lastChecked: updatedAccount.lastChecked.toISOString(),
                createdAt: updatedAccount.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('💥 Error updating tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to update tracked account'
        }, { status: 500 });
    }
}

// DELETE - Delete a tracked account
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({
                success: false,
                error: 'Account ID is required'
            }, { status: 400 });
        }

        console.log('🗑️ Deleting tracked account:', id);

        // Delete the account
        const deletedAccount = await prisma.trackedAccount.delete({
            where: { id }
        });

        console.log('✅ Deleted tracked account:', deletedAccount.username);

        return NextResponse.json({
            success: true,
            message: `Stopped tracking @${deletedAccount.username} on ${deletedAccount.platform}`
        });

    } catch (error) {
        console.error('💥 Error deleting tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to delete tracked account'
        }, { status: 500 });
    }
} 