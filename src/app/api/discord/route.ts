import { NextRequest, NextResponse } from 'next/server';

// Discord signature verification dependencies
import nacl from 'tweetnacl';
import { scrapeMediaPost, TikTokVideoData, InstagramPostData, YouTubeVideoData } from '@/lib/tikhub';
import { prisma } from '@/lib/prisma';
import { getCurrentNormalizedTimestamp } from '@/lib/timestamp-utils';
import { uploadToS3 } from '@/lib/s3';

// Union type for all possible media data
type MediaData = TikTokVideoData | InstagramPostData | YouTubeVideoData;

// Helper to safely get username from any media type
function getUsername(data: MediaData): string {
  if ('username' in data) {
    return data.username || 'unknown';
  }
  if ('channelTitle' in data) {
    return data.channelTitle || 'unknown';
  }
  return 'unknown';
}

// Helper to safely get description from any media type
function getDescription(data: MediaData): string {
  if ('description' in data && data.description) {
    return data.description;
  }
  if ('title' in data && data.title) {
    return data.title;
  }
  return 'Submitted via Discord';
}

// Helper to safely get thumbnail URL from any media type
function getThumbnailUrl(data: MediaData): string | null {
  if ('thumbnailUrl' in data) {
    return data.thumbnailUrl || null;
  }
  if ('thumbnails' in data && data.thumbnails.medium) {
    return data.thumbnails.medium.url || null;
  }
  return null;
}

// Helper to safely get hashtags from any media type
function getHashtags(data: MediaData): string[] {
  if ('hashtags' in data) {
    return data.hashtags || [];
  }
  if ('tags' in data) {
    return data.tags || [];
  }
  return [];
}

// Helper to safely get music from any media type
function getMusic(data: MediaData): Record<string, unknown> | null {
  if ('music' in data) {
    return data.music || null;
  }
  return null;
}

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

      // Determine platform first for duplicate detection
      let platform = 'tiktok';
      if (url.includes('instagram.com')) {
        platform = 'instagram';
      } else if (url.includes('youtube.com')) {
        platform = 'youtube';
      }

      // Check for existing video by URL first
      const existingVideoByUrl = await prisma.video.findFirst({
        where: { url: url }
      });

      // Extract platform-specific video ID
      let platformVideoId: string | undefined;
      if (url.includes('tiktok.com')) {
        const videoIdMatch = url.match(/\/video\/(\d+)/);
        platformVideoId = videoIdMatch ? videoIdMatch[1] : undefined;
      } else if (url.includes('instagram.com')) {
        // Instagram video ID extraction would be more complex
        platformVideoId = undefined;
      } else if (url.includes('youtube.com')) {
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        platformVideoId = videoIdMatch ? videoIdMatch[1] : undefined;
      }

      // Check for existing video by platform video ID
      let existingVideoById = null;
      if (platformVideoId) {
        existingVideoById = await prisma.video.findFirst({
          where: { 
            videoId: platformVideoId,
            platform: platform 
          }
        });
      }

      const existingVideo = existingVideoByUrl || existingVideoById;

      if (existingVideo) {
        const duplicateMethod = existingVideoByUrl ? 'URL' : 'videoId';
        return NextResponse.json({
          type: 4,
          data: {
            content: `❌ Video already being tracked (detected by ${duplicateMethod}): ${url}`
          }
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

      const mediaData = scrapingResult.data as MediaData;
      
      // Determine platform and extract data
      let platformName = 'TikTok';
      let views = 0;
      let shares = 0;
      let thumbnailUrl = getThumbnailUrl(mediaData);
      
      if (url.includes('instagram.com')) {
        platformName = 'Instagram';
        const instaData = mediaData as InstagramPostData;
        views = instaData.plays || instaData.views || 0;
        shares = 0; // Instagram doesn't track shares
      } else if (url.includes('youtube.com')) {
        platformName = 'YouTube';
        const youtubeData = mediaData as YouTubeVideoData;
        views = youtubeData.views || 0;
        shares = 0; // YouTube doesn't track shares in our API
      } else {
        platformName = 'TikTok';
        const tiktokData = mediaData as TikTokVideoData;
        views = tiktokData.views || 0;
        shares = tiktokData.shares || 0;
      }

      // Always upload thumbnail to S3 if present
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
          url: url,
          videoId: platformVideoId, // Store platform-specific video ID
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
          isActive: true, // This is required for videos to show up in dashboard
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
          content: `✅ Successfully submitted video by @${getUsername(mediaData)} on ${platformName}!\n📊 ${views.toLocaleString()} views, ${mediaData.likes.toLocaleString()} likes\n🔄 Set to hourly tracking` 
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