# 🎯 Discord Video Submission Setup

Automatically add videos to your analytics dashboard when users paste links in Discord!

## 🚀 **How It Works**
1. Users paste video URLs in your Discord channel
2. Discord webhook triggers our API endpoint
3. Videos are automatically scraped and added to tracking
4. Users get instant feedback in Discord

## 📋 **Setup Steps**

### **Step 1: Create Discord Server**
1. Create a new Discord server or use existing one
2. Create a dedicated channel (e.g., `#video-submissions`)
3. Set channel permissions appropriately

### **Step 2: Create Webhook**
1. **Right-click** on your `#video-submissions` channel
2. Select **"Edit Channel"**
3. Go to **"Integrations"** tab
4. Click **"Create Webhook"**
5. **Copy the webhook URL** (you'll need this)

### **Step 3: Configure Webhook**
Set the webhook URL to point to your deployed endpoint:
```
https://your-domain.com/api/discord-webhook
```

**⚠️ Important**: Replace `your-domain.com` with your actual Vercel domain.

### **Step 4: Test the System**
1. Paste a TikTok, Instagram, or YouTube URL in the channel
2. Check your dashboard to see if the video was added
3. Monitor server logs for webhook activity

## 🎨 **Supported URL Formats**

### **TikTok**
- `https://www.tiktok.com/@username/video/1234567890`
- `https://vm.tiktok.com/ABCD1234/`
- `tiktok.com/@username/video/1234567890` (auto-adds https)

### **Instagram**
- `https://www.instagram.com/p/ABC123/`
- `https://www.instagram.com/reel/XYZ789/`
- `instagram.com/p/ABC123/` (auto-adds https)

### **YouTube**
- `https://www.youtube.com/watch?v=ABC123`
- `https://youtube.com/shorts/XYZ789`
- `https://youtu.be/ABC123`

## 📊 **Features**

### **Smart Processing**
- ✅ **Duplicate detection** - won't add videos already being tracked
- ✅ **Multi-URL support** - processes multiple URLs in one message
- ✅ **Platform detection** - automatically detects TikTok/Instagram/YouTube
- ✅ **Error handling** - graceful failures with helpful messages

### **Automatic Tracking**
- ✅ **Hourly cadence** - new submissions start with hourly tracking
- ✅ **Full metrics** - views, likes, comments, shares (where available)
- ✅ **Metadata** - thumbnails, hashtags, music (where available)
- ✅ **Platform-specific** - handles Instagram/YouTube limitations (no shares)

## 🔧 **Advanced Configuration**

### **Channel Permissions**
Recommended permissions for submission channel:
- ✅ View Channel
- ✅ Send Messages
- ✅ Read Message History
- ❌ Manage Messages (optional - for moderation)

### **Webhook Security**
- Use Discord's built-in webhook authentication
- Monitor webhook logs for suspicious activity
- Consider rate limiting if needed

### **Response Format**
The webhook returns detailed status:
```json
{
  "status": "processed",
  "results": {
    "total": 2,
    "successful": 1,
    "failed": 1,
    "details": [
      {
        "url": "https://tiktok.com/@user/video/123",
        "success": true,
        "message": "Successfully added @user to tracking",
        "data": {
          "username": "user",
          "platform": "tiktok",
          "views": 50000,
          "likes": 1200
        }
      }
    ]
  },
  "submittedBy": "discord_username",
  "timestamp": "2025-06-02T06:45:00.000Z"
}
```

## 🎯 **Usage Examples**

### **Simple Submission**
User posts:
```
Check out this viral TikTok! https://tiktok.com/@creator/video/123456
```

### **Multiple Videos**
User posts:
```
Here are some great videos:
https://tiktok.com/@user1/video/123
https://instagram.com/p/ABC123/
https://youtube.com/shorts/XYZ789
```

### **Mixed Content**
User posts:
```
This TikTok is amazing: https://tiktok.com/@viral/video/456
Also check out my Instagram: https://instagram.com/p/DEF456/
What do you think about the analytics? The growth is incredible!
```

## 🚨 **Troubleshooting**

### **Videos Not Being Added**
1. Check webhook URL is correct
2. Verify Discord webhook is active
3. Check server logs for errors
4. Ensure URLs are valid and accessible

### **Duplicate Videos**
- System automatically prevents duplicates
- Check if video was already tracked under different URL format

### **Platform Issues**
- **Instagram**: May require public posts
- **YouTube**: Shorts vs regular videos work differently
- **TikTok**: Some regions may have API limitations

## 📈 **Benefits**

### **For Users**
- 🎯 **Simple** - just paste links in Discord
- ⚡ **Fast** - instant processing and feedback
- 🤝 **Community** - see what others are submitting
- 📱 **Mobile-friendly** - works perfectly on Discord mobile

### **For You**
- 🔄 **Automated** - no manual video addition needed
- 📊 **Scalable** - handle many submissions easily
- 👥 **Community-driven** - users contribute content
- 🔍 **Trackable** - see who submitted what

## 🎉 **Ready to Launch!**

Once configured, your Discord channel becomes a powerful video submission system:
1. **Share your Discord server** with your community
2. **Pin instructions** in the submission channel
3. **Monitor your dashboard** for new videos
4. **Engage with submitters** about their analytics

Your analytics dashboard will automatically populate with community-submitted content! 🚀 