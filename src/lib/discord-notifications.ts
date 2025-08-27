import { TikTokVideoData, InstagramPostData, YouTubeVideoData } from './tikhub';

// Union type for all possible media data
type MediaData = TikTokVideoData | InstagramPostData | YouTubeVideoData;

// Helper to safely get description from any media type
function getDescription(data: MediaData): string {
  // All media types (TikTok, Instagram, YouTube) have description property
  return data.description || '';
}

// Helper to get views from any media type
function getViews(data: MediaData): number {
  if ('views' in data) {
    return data.views || 0;
  }
  return 0;
}

// Helper to format numbers with commas
function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Helper to get platform emoji
function getPlatformEmoji(platform: string): string {
  switch (platform) {
    case 'tiktok': return '🎵';
    case 'instagram': return '📷';
    case 'youtube': return '🎬';
    default: return '📹';
  }
}

export interface DiscordNotificationData {
  type: 'new_video' | 'viral_video';
  username: string;
  platform: string;
  url: string;
  description: string;
  views: number;
  likes: number;
  comments?: number;
  shares?: number;
  threshold?: number; // For viral videos, what threshold was crossed
}

export async function sendDiscordNotification(data: DiscordNotificationData): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('⚠️ Discord webhook URL not configured, skipping notification');
    return false;
  }

  try {
    const platformEmoji = getPlatformEmoji(data.platform);
    const platformName = data.platform.charAt(0).toUpperCase() + data.platform.slice(1);
    
    let embed;
    
    if (data.type === 'new_video') {
      // New video notification
      embed = {
        title: `${platformEmoji} New ${platformName} Video Detected!`,
        description: `**@${data.username}** just posted a new video`,
        color: 0x00ff00, // Green
        fields: [
          {
            name: "📝 Description",
            value: data.description.length > 200 ? data.description.substring(0, 200) + "..." : data.description,
            inline: false
          },
          {
            name: "📊 Initial Stats",
            value: `👀 ${formatNumber(data.views)} views\n❤️ ${formatNumber(data.likes)} likes`,
            inline: true
          },
          {
            name: "🔗 Link",
            value: `[Watch Video](${data.url})`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `TikTok Analytics Dashboard • New ${platformName} Video`
        }
      };
    } else {
      // Viral video notification
      embed = {
        title: `🔥 Viral ${platformName} Video Alert!`,
        description: `**@${data.username}**'s video is going viral!`,
        color: 0xff6600, // Orange
        fields: [
          {
            name: "📝 Description",
            value: data.description.length > 200 ? data.description.substring(0, 200) + "..." : data.description,
            inline: false
          },
          {
            name: "🚀 Viral Stats",
            value: `👀 ${formatNumber(data.views)} views\n❤️ ${formatNumber(data.likes)} likes`,
            inline: true
          },
          {
            name: "📈 Threshold",
            value: `Crossed ${formatNumber(data.threshold || 0)} views!`,
            inline: true
          },
          {
            name: "🔗 Link",
            value: `[Watch Video](${data.url})`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `TikTok Analytics Dashboard • Viral ${platformName} Alert`
        }
      };
    }

    const payload = {
      embeds: [embed]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✅ Discord notification sent successfully: ${data.type} for @${data.username}`);
      return true;
    } else {
      console.error(`❌ Failed to send Discord notification: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error('💥 Error sending Discord notification:', error);
    return false;
  }
}

// Notification for new videos from tracked accounts
export async function notifyNewVideo(
  username: string,
  platform: string,
  url: string,
  mediaData: MediaData
): Promise<void> {
  const notificationData: DiscordNotificationData = {
    type: 'new_video',
    username,
    platform,
    url,
    description: getDescription(mediaData),
    views: getViews(mediaData),
    likes: mediaData.likes || 0,
    comments: mediaData.comments || 0,
    shares: 'shares' in mediaData ? mediaData.shares || 0 : 0
  };

  await sendDiscordNotification(notificationData);
}

// Notification for viral videos (when views cross certain thresholds)
export async function notifyViralVideo(
  username: string,
  platform: string,
  url: string,
  description: string,
  currentViews: number,
  currentLikes: number,
  threshold: number
): Promise<void> {
  const notificationData: DiscordNotificationData = {
    type: 'viral_video',
    username,
    platform,
    url,
    description,
    views: currentViews,
    likes: currentLikes,
    threshold
  };

  await sendDiscordNotification(notificationData);
}

// Check if a video has crossed viral thresholds
export function checkViralThresholds(previousViews: number, currentViews: number): number | null {
  const thresholds = [10000, 50000, 100000, 500000, 1000000, 5000000, 10000000];
  
  for (const threshold of thresholds) {
    if (previousViews < threshold && currentViews >= threshold) {
      return threshold;
    }
  }
  
  return null;
}
