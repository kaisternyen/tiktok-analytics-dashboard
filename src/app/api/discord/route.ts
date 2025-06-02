import { NextRequest, NextResponse } from 'next/server';

// Discord signature verification dependencies
import nacl from 'tweetnacl';
import { scrapeMediaPost } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp } from '@/lib/timestamp-utils';

// Helper to verify Discord signature
function verifyDiscordRequest(req: NextRequest, body: Buffer) {
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !PUBLIC_KEY) return false;
  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body.toString()),
    Buffer.from(signature, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex')
  );
}

export async function POST(req: NextRequest) {
  // Discord sends raw body, so we need to buffer it
  const body = await req.arrayBuffer();
  const buf = Buffer.from(body);

  // Verify signature
  if (!verifyDiscordRequest(req, buf)) {
    return new NextResponse('Invalid request signature', { status: 401 });
  }

  // Parse interaction
  const json = JSON.parse(buf.toString());

  // Discord PING check
  if (json.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Handle /submit command
  if (json.data && json.data.name === 'submit') {
    const urlOption = json.data.options?.find((opt: { name: string; value: string }) => opt.name === 'url');
    const url = urlOption?.value;
    
    if (!url) {
      return NextResponse.json({
        type: 4,
        data: { content: '❌ Please provide a video URL.' }
      });
    }

    try {
      // Validate URL format
      if (!url.includes('tiktok.com') && !url.includes('instagram.com') && !url.includes('youtube.com')) {
        return NextResponse.json({
          type: 4,
          data: { content: '❌ Please provide a valid TikTok, Instagram, or YouTube URL.' }
        });
      }

      // Check if video already exists
      const existingVideo = await prisma.video.findUnique({
        where: { url: url }
      });

      if (existingVideo) {
        return NextResponse.json({
          type: 4,
          data: { content: `⚠️ Video by @${existingVideo.username} is already being tracked.` }
        });
      }

      // Scrape the video
      const scrapingResult = await scrapeMediaPost(url);
      
      if (!scrapingResult.success || !scrapingResult.data) {
        return NextResponse.json({
          type: 4,
          data: { content: `❌ Failed to scrape video: ${scrapingResult.error || 'Unknown error'}` }
        });
      }

      const mediaData = scrapingResult.data;
      
      // Determine platform and extract data
      let platform = 'tiktok';
      let platformName = 'TikTok';
      let views = 0;
      let shares = 0;
      
      if (url.includes('instagram.com')) {
        platform = 'instagram';
        platformName = 'Instagram';
        const instaData = mediaData as any;
        views = instaData.plays || instaData.views || 0;
        shares = 0; // Instagram doesn't track shares
      } else if (url.includes('youtube.com')) {
        platform = 'youtube';
        platformName = 'YouTube';
        const youtubeData = mediaData as any;
        views = youtubeData.views || 0;
        shares = 0; // YouTube doesn't track shares in our API
      } else {
        platformName = 'TikTok';
        const tiktokData = mediaData as any;
        views = tiktokData.views || 0;
        shares = tiktokData.shares || 0;
      }

      // Create video record
      const newVideo = await prisma.video.create({
        data: {
          url: url,
          username: (mediaData as any).username || 'unknown',
          description: (mediaData as any).description || 'Submitted via Discord',
          thumbnailUrl: (mediaData as any).thumbnail_url || (mediaData as any).thumbnailUrl || null,
          platform: platform,
          currentViews: views,
          currentLikes: mediaData.likes,
          currentComments: mediaData.comments,
          currentShares: shares,
          scrapingCadence: 'hourly', // Default for new videos
          lastScrapedAt: new Date(),
          hashtags: JSON.stringify((mediaData as any).hashtags || []),
          music: JSON.stringify((mediaData as any).music || null),
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

      // Success response
      return NextResponse.json({
        type: 4,
        data: { 
          content: `✅ Successfully submitted video by @${(mediaData as any).username || 'unknown'} on ${platformName}!\n📊 ${views.toLocaleString()} views, ${mediaData.likes.toLocaleString()} likes\n🔄 Set to hourly tracking` 
        }
      });

    } catch (error) {
      console.error('Discord submission error:', error);
      return NextResponse.json({
        type: 4,
        data: { content: `❌ Error processing video: ${error instanceof Error ? error.message : 'Unknown error'}` }
      });
    }
  }

  return NextResponse.json({ type: 4, data: { content: '❓ Unknown command.' } });
} 