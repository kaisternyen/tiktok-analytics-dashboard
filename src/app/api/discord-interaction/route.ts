import { NextRequest, NextResponse } from 'next/server';
import { verifyKey } from 'discord-interactions';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp } from '@/lib/timestamp-utils';

// Force dynamic rendering for interactions
export const dynamic = 'force-dynamic';

// Discord interaction types
const InteractionType = {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
    APPLICATION_COMMAND_AUTOCOMPLETE: 4,
    MODAL_SUBMIT: 5,
};

const InteractionResponseType = {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
    DEFERRED_UPDATE_MESSAGE: 6,
    UPDATE_MESSAGE: 7,
};

// URL patterns for supported platforms
const URL_PATTERNS = {
    tiktok: /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/[^\s]+/gi,
    instagram: /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/[^\s]+/gi,
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[^\s]+/gi
};

function extractVideoUrls(text: string): string[] {
    const urls: string[] = [];
    
    Object.values(URL_PATTERNS).forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
            urls.push(...matches);
        }
    });
    
    return urls.map(url => {
        if (!url.startsWith('http')) {
            return 'https://' + url;
        }
        return url;
    });
}

function detectPlatform(url: string): 'tiktok' | 'instagram' | 'youtube' | null {
    if (URL_PATTERNS.tiktok.test(url)) return 'tiktok';
    if (URL_PATTERNS.instagram.test(url)) return 'instagram';  
    if (URL_PATTERNS.youtube.test(url)) return 'youtube';
    return null;
}

async function processVideoUrl(url: string, submittedBy: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
        console.log(`🎬 Processing Discord slash command: ${url} by ${submittedBy}`);
        
        // Check if video already exists
        const existingVideo = await prisma.video.findFirst({
            where: { url: url }
        });
        
        if (existingVideo) {
            return {
                success: false,
                message: `❌ Video by @${existingVideo.username} is already being tracked!`
            };
        }
        
        // Scrape video data
        const result = await scrapeMediaPost(url);
        
        if (!result.success || !result.data) {
            return {
                success: false,
                message: `❌ Failed to scrape video: ${result.error}`
            };
        }
        
        const platform = detectPlatform(url);
        if (!platform) {
            return {
                success: false,
                message: '❌ Unsupported platform. Please use TikTok, Instagram, or YouTube URLs.'
            };
        }
        
        // Extract data based on platform
        let views = 0;
        let shares = 0;
        let username = '';
        let thumbnailUrl = '';
        let hashtags: any[] = [];
        let music: any = null;
        
        if (platform === 'instagram') {
            const instaData = result.data as any;
            views = instaData.plays || instaData.views || 0;
            shares = 0;
            username = instaData.username || 'unknown';
            thumbnailUrl = instaData.thumbnail || null;
            hashtags = instaData.hashtags || [];
            music = instaData.music || null;
        } else if (platform === 'youtube') {
            const youtubeData = result.data as any;
            views = youtubeData.views || 0;
            shares = 0;
            username = youtubeData.author || youtubeData.username || 'unknown';
            thumbnailUrl = youtubeData.thumbnail || null;
            hashtags = [];
            music = null;
        } else {
            const tiktokData = result.data as any;
            views = tiktokData.views || 0;
            shares = tiktokData.shares || 0;
            username = tiktokData.username || 'unknown';
            thumbnailUrl = tiktokData.thumbnailUrl || tiktokData.thumbnail || null;
            hashtags = tiktokData.hashtags || [];
            music = tiktokData.music || null;
        }
        
        // Create video in database
        const newVideo = await prisma.video.create({
            data: {
                url: url,
                username: username,
                description: result.data.description || '',
                thumbnailUrl: thumbnailUrl,
                platform: platform,
                currentViews: views,
                currentLikes: result.data.likes || 0,
                currentComments: result.data.comments || 0,
                currentShares: shares,
                lastScrapedAt: new Date(),
                scrapingCadence: 'hourly',
                hashtags: JSON.stringify(hashtags),
                music: JSON.stringify(music),
            }
        });
        
        // Create initial metrics history
        const normalizedTimestamp = getCurrentNormalizedTimestamp('60min');
        await prisma.metricsHistory.create({
            data: {
                videoId: newVideo.id,
                views: views,
                likes: result.data.likes || 0,
                comments: result.data.comments || 0,
                shares: shares,
                timestamp: new Date(normalizedTimestamp)
            }
        });
        
        console.log(`✅ Discord slash command added: @${newVideo.username} by ${submittedBy}`);
        
        return {
            success: true,
            message: `✅ Successfully added **@${username}** to tracking!\n📊 **${views.toLocaleString()}** views, **${result.data.likes?.toLocaleString() || 0}** likes\n🎯 Platform: **${platform.toUpperCase()}**\n⏰ Tracking: **Hourly**`,
            data: {
                username: username,
                platform: platform,
                views: views,
                likes: result.data.likes || 0
            }
        };
        
    } catch (error) {
        console.error(`💥 Error processing Discord slash command:`, error);
        return {
            success: false,
            message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        const signature = request.headers.get('x-signature-ed25519');
        const timestamp = request.headers.get('x-signature-timestamp');
        const body = await request.text();
        
        // Verify Discord signature (security)
        const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
        if (!PUBLIC_KEY) {
            console.error('❌ DISCORD_PUBLIC_KEY not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
        
        const isValid = verifyKey(body, signature!, timestamp!, PUBLIC_KEY);
        if (!isValid) {
            console.error('❌ Invalid Discord signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        
        const interaction = JSON.parse(body);
        console.log('🔗 Discord interaction received:', interaction.type);
        
        // Handle ping (Discord verification)
        if (interaction.type === InteractionType.PING) {
            return NextResponse.json({ type: InteractionResponseType.PONG });
        }
        
        // Handle slash command
        if (interaction.type === InteractionType.APPLICATION_COMMAND) {
            if (interaction.data.name === 's') {
                const url = interaction.data.options?.[0]?.value;
                const user = interaction.member?.user || interaction.user;
                
                if (!url) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: '❌ Please provide a video URL!',
                            flags: 64 // Ephemeral (only visible to user)
                        }
                    });
                }
                
                // Extract URLs from the input
                const videoUrls = extractVideoUrls(url);
                
                if (videoUrls.length === 0) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: '❌ No valid video URLs found. Please provide a TikTok, Instagram, or YouTube URL.',
                            flags: 64
                        }
                    });
                }
                
                // Defer response for processing time
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Process the first URL (can be extended for multiple)
                const result = await processVideoUrl(videoUrls[0], user.username);
                
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: result.message,
                        flags: result.success ? 0 : 64 // Public if success, ephemeral if error
                    }
                });
            }
        }
        
        return NextResponse.json({ error: 'Unknown interaction' }, { status: 400 });
        
    } catch (error) {
        console.error('💥 Discord interaction error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 