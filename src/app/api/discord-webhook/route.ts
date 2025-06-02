import { NextRequest, NextResponse } from 'next/server';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp } from '@/lib/timestamp-utils';

// Force dynamic rendering for webhooks
export const dynamic = 'force-dynamic';

interface DiscordWebhookPayload {
    content: string;
    author: {
        username: string;
        id: string;
    };
    channel_id: string;
    guild_id?: string;
    timestamp: string;
}

// Type definitions
interface ScrapedData {
    description?: string;
    likes?: number;
    comments?: number;
    thumbnail?: string;
    thumbnailUrl?: string;
    views?: number;
    plays?: number;
    shares?: number;
    username?: string;
    author?: string;
    hashtags?: string[];
    music?: object;
}

// URL patterns for supported platforms
const URL_PATTERNS = {
    tiktok: /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/[^\s]+/gi,
    instagram: /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/[^\s]+/gi,
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[^\s]+/gi
};

function extractVideoUrls(text: string): string[] {
    const urls: string[] = [];
    
    // Extract all video URLs from the text
    Object.values(URL_PATTERNS).forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
            urls.push(...matches);
        }
    });
    
    return urls.map(url => {
        // Ensure URLs have protocol
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

async function processVideoUrl(url: string, submittedBy: string): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
    try {
        console.log(`🎬 Processing Discord submission: ${url} by @${submittedBy}`);
        
        // Check if video already exists
        const existingVideo = await prisma.video.findFirst({
            where: { url: url }
        });
        
        if (existingVideo) {
            console.log(`⚠️ Video already tracked: @${existingVideo.username}`);
            return {
                success: false,
                message: `Video by @${existingVideo.username} is already being tracked`
            };
        }
        
        // Scrape video data
        const result = await scrapeMediaPost(url);
        
        if (!result.success || !result.data) {
            console.error(`❌ Failed to scrape: ${result.error}`);
            return {
                success: false,
                message: `Failed to scrape video: ${result.error}`
            };
        }
        
        const platform = detectPlatform(url);
        if (!platform) {
            return {
                success: false,
                message: 'Unsupported platform'
            };
        }
        
        // Extract data based on platform
        let views = 0;
        let shares = 0;
        let username = '';
        let thumbnailUrl = '';
        let hashtags: string[] = [];
        let music: object | null = null;
        
        if (platform === 'instagram') {
            const instaData = result.data as ScrapedData;
            views = instaData.plays || instaData.views || 0;
            shares = 0; // Instagram doesn't track shares
            username = instaData.username || 'unknown';
            thumbnailUrl = instaData.thumbnail || '';
            hashtags = instaData.hashtags || [];
            music = instaData.music || null;
        } else if (platform === 'youtube') {
            const youtubeData = result.data as ScrapedData;
            views = youtubeData.views || 0;
            shares = 0; // YouTube doesn't track shares in our API
            username = youtubeData.author || youtubeData.username || 'unknown';
            thumbnailUrl = youtubeData.thumbnail || '';
            hashtags = []; // YouTube doesn't have hashtags in our API
            music = null; // YouTube doesn't have music data in our API
        } else {
            const tiktokData = result.data as ScrapedData;
            views = tiktokData.views || 0;
            shares = tiktokData.shares || 0;
            username = tiktokData.username || 'unknown';
            thumbnailUrl = tiktokData.thumbnailUrl || tiktokData.thumbnail || '';
            hashtags = tiktokData.hashtags || [];
            music = tiktokData.music || null;
        }
        
        // Create video in database
        const newVideo = await prisma.video.create({
            data: {
                url: url,
                username: username,
                description: (result.data as ScrapedData).description || '',
                thumbnailUrl: thumbnailUrl,
                platform: platform,
                currentViews: views,
                currentLikes: (result.data as ScrapedData).likes || 0,
                currentComments: (result.data as ScrapedData).comments || 0,
                currentShares: shares,
                lastScrapedAt: new Date(),
                scrapingCadence: 'hourly', // New videos start with hourly tracking
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
                likes: (result.data as ScrapedData).likes || 0,
                comments: (result.data as ScrapedData).comments || 0,
                shares: shares,
                timestamp: new Date(normalizedTimestamp)
            }
        });
        
        console.log(`✅ Discord submission added: @${newVideo.username} by ${submittedBy}`);
        
        return {
            success: true,
            message: `Successfully added @${newVideo.username} to tracking`,
            data: {
                username: newVideo.username,
                platform: platform,
                views: views,
                likes: (result.data as ScrapedData).likes || 0
            }
        };
        
    } catch (error) {
        console.error(`💥 Error processing Discord submission:`, error);
        return {
            success: false,
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        console.log('🔗 Discord webhook received');
        
        const payload: DiscordWebhookPayload = await request.json();
        
        console.log('📋 Discord message:', {
            author: payload.author.username,
            content: payload.content.substring(0, 100) + '...',
            timestamp: payload.timestamp
        });
        
        // Skip bot messages and empty content
        if (!payload.content || payload.content.trim() === '') {
            return NextResponse.json({ status: 'ignored', reason: 'empty content' });
        }
        
        // Extract video URLs from message
        const videoUrls = extractVideoUrls(payload.content);
        
        if (videoUrls.length === 0) {
            console.log('⚠️ No video URLs found in Discord message');
            return NextResponse.json({ status: 'ignored', reason: 'no video URLs found' });
        }
        
        console.log(`🎯 Found ${videoUrls.length} video URL(s):`, videoUrls);
        
        // Process each video URL
        const results = [];
        for (const url of videoUrls) {
            const result = await processVideoUrl(url, payload.author.username);
            results.push({
                url: url,
                ...result
            });
        }
        
        // Count successes
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`📊 Discord processing complete: ${successful} successful, ${failed} failed`);
        
        return NextResponse.json({
            status: 'processed',
            results: {
                total: results.length,
                successful: successful,
                failed: failed,
                details: results
            },
            submittedBy: payload.author.username,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Discord webhook error:', error);
        return NextResponse.json(
            {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
} 