import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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
                        const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${account.username}`, {
                            headers: { 'Authorization': `Bearer ${apiKey}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data.data && typeof data.data.total === 'number') {
                                totalPosts = data.data.total;
                            } else if (Array.isArray(data.data?.items)) {
                                totalPosts = data.data.items.length;
                            }
                            if (data.data && data.data.user && data.data.user.avatar_url) {
                                pfpUrl = data.data.user.avatar_url;
                            }
                            apiStatus = data.status;
                            apiError = data.error;
                            if (data.data && data.data.user && data.data.user.username) {
                                displayName = data.data.user.username;
                            }
                            if (data.data && data.data.user && data.data.user.follower_count) {
                                followers = data.data.user.follower_count;
                            }
                            if (data.data && data.data.user && data.data.user.profile_url) {
                                profileUrl = data.data.user.profile_url;
                            }
                            lookedUpUsername = account.username;
                        }
                    }
                } else if (account.platform === 'youtube') {
                    const apiKey = process.env.YOUTUBE_API_KEY;
                    if (apiKey) {
                        let channelId = account.username;
                        if (!account.username.startsWith('UC')) {
                            const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${account.username}&key=${apiKey}`);
                            if (res.ok) {
                                const data = await res.json();
                                if (data.items && data.items.length > 0) {
                                    channelId = data.items[0].id;
                                }
                            }
                        }
                        const res2 = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`);
                        if (res2.ok) {
                            const data2 = await res2.json();
                            if (data2.items && data2.items.length > 0) {
                                totalPosts = parseInt(data2.items[0].statistics?.videoCount || '0', 10);
                                if (data2.items[0].snippet && data2.items[0].snippet.thumbnails && data2.items[0].snippet.thumbnails.default) {
                                    pfpUrl = data2.items[0].snippet.thumbnails.default.url;
                                }
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
        const { username, platform, accountType, keyword } = body;

        console.log('➕ Creating new tracked account:', { username, platform, accountType, keyword });

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
        let profileData = null;
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
                        profileData = {
                            nickname: data.data.userInfo.user.nickname,
                            avatarUrl: data.data.userInfo.user.avatarLarger || data.data.userInfo.user.avatarMedium || data.data.userInfo.user.avatarThumb,
                            followerCount: data.data.userInfo.stats?.followerCount || data.data.userInfo.statsV2?.followerCount,
                            verified: data.data.userInfo.user.verified || false,
                            signature: data.data.userInfo.user.signature || ''
                        };
                    }
                }
            }
        } else if (platform === 'instagram') {
            const apiKey = process.env.TIKHUB_API_KEY;
            if (apiKey) {
                const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${username}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.user && data.data.user.username) {
                        accountExists = true;
                    }
                }
            }
        } else if (platform === 'youtube') {
            const apiKey = process.env.YOUTUBE_API_KEY;
            if (apiKey) {
                let channelId = username;
                if (!username.startsWith('UC')) {
                    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${apiKey}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.items && data.items.length > 0) {
                            channelId = data.items[0].id;
                            accountExists = true;
                        }
                    }
                } else {
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
                    username: username.toLowerCase(),
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
                username: username.toLowerCase(),
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
        let apiError = null;
        let displayName = null;
        let followers = null;
        let profileUrl = null;
        const apiErrorMessage = null;
        let lookedUpUsername = null;
        try {
            // Count tracked posts in DB
            trackedPosts = await prisma.video.count({
                where: {
                    username: username.toLowerCase(),
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
                    const res = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${username}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        // Try to get total post count from response
                        if (data.data && typeof data.data.total === 'number') {
                            totalPosts = data.data.total;
                        } else if (Array.isArray(data.data?.items)) {
                            totalPosts = data.data.items.length;
                        }
                        if (data.data && data.data.user && data.data.user.avatar_url) {
                            pfpUrl = data.data.user.avatar_url;
                        }
                        apiStatus = data.status;
                        apiError = data.error;
                        if (data.data && data.data.user && data.data.user.username) {
                            displayName = data.data.user.username;
                        }
                        if (data.data && data.data.user && data.data.user.follower_count) {
                            followers = data.data.user.follower_count;
                        }
                        if (data.data && data.data.user && data.data.user.profile_url) {
                            profileUrl = data.data.user.profile_url;
                        }
                        lookedUpUsername = username;
                    }
                }
            } else if (platform === 'youtube') {
                // YouTube: Use YouTube Data API
                const apiKey = process.env.YOUTUBE_API_KEY;
                if (apiKey) {
                    // First, get channel ID from username if needed
                    let channelId = username;
                    if (!username.startsWith('UC')) {
                        // If not a channel ID, resolve to channel ID
                        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${apiKey}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.items && data.items.length > 0) {
                                channelId = data.items[0].id;
                            }
                        }
                    }
                    // Now get channel statistics
                    const res2 = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`);
                    if (res2.ok) {
                        const data2 = await res2.json();
                        if (data2.items && data2.items.length > 0) {
                            totalPosts = parseInt(data2.items[0].statistics?.videoCount || '0', 10);
                            if (data2.items[0].snippet && data2.items[0].snippet.thumbnails && data2.items[0].snippet.thumbnails.default) {
                                pfpUrl = data2.items[0].snippet.thumbnails.default.url;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching total/tracked posts:', err);
        }

        return NextResponse.json({
            success: true,
            message: `Started tracking @${username} on ${platform}`,
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