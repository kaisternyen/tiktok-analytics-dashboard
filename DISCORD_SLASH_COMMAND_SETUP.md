# ⚡ Discord Slash Command Setup (Vercel Compatible!)

Use your existing Vercel server for Discord video submissions with slash commands!

## 🎯 **Why Slash Commands > Bot?**
- ✅ **Works on Vercel** - no persistent connections needed
- ✅ **Professional UX** - users type `/track https://tiktok.com/@user/video/123`
- ✅ **Built-in validation** - Discord handles input validation
- ✅ **Secure** - Discord's built-in authentication
- ✅ **No hosting costs** - runs on your existing Vercel deployment

## 🚀 **How It Works**
1. User types `/track https://tiktok.com/@creator/video/123`
2. Discord sends webhook to your Vercel endpoint
3. Your server processes video and adds to tracking
4. User gets instant feedback with video details

## 📋 **Setup Steps**

### **Step 1: Create Discord Application**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it "Video Tracker" 
4. Click **"Create"**

### **Step 2: Get Keys**
1. Go to **"General Information"**
2. **Copy "Application ID"** 
3. **Copy "Public Key"** (we'll need this)

### **Step 3: Add Environment Variables**
Add to your `.env.local`:
```env
DISCORD_PUBLIC_KEY=your_public_key_here
DISCORD_APPLICATION_ID=your_application_id_here
```

### **Step 4: Configure Slash Command**
1. Go to **"General Information"** in Discord Developer Portal
2. Set **"Interactions Endpoint URL"** to:
   ```
   https://your-vercel-domain.com/api/discord-interaction
   ```
3. Discord will verify the endpoint (our code handles this)

### **Step 5: Register Slash Command**
Use this one-time setup script:

```bash
curl -X POST \
  "https://discord.com/api/v10/applications/YOUR_APPLICATION_ID/commands" \
  -H "Authorization: Bot YOUR_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "track",
    "description": "Add a video to analytics tracking",
    "options": [
      {
        "type": 3,
        "name": "url",
        "description": "TikTok, Instagram, or YouTube video URL",
        "required": true
      }
    ]
  }'
```

### **Step 6: Invite to Server**
1. Go to **"OAuth2"** → **"URL Generator"**
2. Select **"applications.commands"** scope
3. **Copy URL** and visit it
4. **Add to your Discord server**

## 🎨 **User Experience**

### **Command Usage:**
```
/track https://tiktok.com/@creator/video/123456789
```

### **Success Response:**
```
✅ Successfully added @creator to tracking!
📊 1.2M views, 45K likes
🎯 Platform: TIKTOK
⏰ Tracking: Hourly
```

### **Error Responses:**
```
❌ Video by @creator is already being tracked!
❌ No valid video URLs found. Please provide a TikTok, Instagram, or YouTube URL.
❌ Failed to scrape video: Video may be private or deleted.
```

## 🔧 **Features**

### **Smart Processing**
- ✅ **Auto URL detection** - works with or without https://
- ✅ **Platform detection** - TikTok, Instagram, YouTube
- ✅ **Duplicate prevention** - won't add videos twice
- ✅ **Error handling** - clear error messages

### **User Feedback**
- ✅ **Instant responses** - users get immediate confirmation
- ✅ **Rich formatting** - displays views, likes, platform
- ✅ **Error visibility** - private error messages for failed attempts
- ✅ **Success visibility** - public success messages for the channel

## 🔒 **Security Features**
- ✅ **Discord signature verification** - prevents fake requests
- ✅ **Input validation** - only processes valid video URLs
- ✅ **Rate limiting** - Discord handles abuse prevention
- ✅ **Permissions** - only works where slash commands are enabled

## 📊 **Advantages Over Traditional Bot**

| Feature | Slash Command | Traditional Bot |
|---------|---------------|-----------------|
| **Hosting** | ✅ Vercel (free) | ❌ Needs 24/7 server |
| **Setup** | ✅ 10 minutes | ❌ 30+ minutes |
| **Cost** | ✅ $0 | ❌ $5+/month |
| **UX** | ✅ Professional | ⚠️ Chat parsing |
| **Security** | ✅ Built-in | ⚠️ Manual |
| **Maintenance** | ✅ Zero | ❌ Server monitoring |

## 🎯 **Usage Examples**

### **TikTok Video:**
```
/track https://www.tiktok.com/@creator/video/1234567890
```

### **Instagram Reel:**
```
/track https://www.instagram.com/reel/ABC123DEF456/
```

### **YouTube Short:**
```
/track https://youtube.com/shorts/ABC123xyz
```

### **Short URLs (auto-detected):**
```
/track vm.tiktok.com/ABCD1234
```

## 🚨 **Troubleshooting**

### **"Application did not respond"**
- Check your Vercel deployment is live
- Verify the interaction endpoint URL is correct
- Check server logs for errors

### **"Unknown interaction"**
- Ensure slash command is registered properly
- Verify Discord Application ID is correct

### **"Invalid signature"**
- Check `DISCORD_PUBLIC_KEY` environment variable
- Ensure no extra spaces in the key

## 🎉 **Ready to Use!**

Once set up, users can submit videos with:
```
/track https://tiktok.com/@viral/video/123
```

And your dashboard will automatically populate with their submissions! 

## 💡 **Pro Tips**
- **Pin a message** explaining how to use `/track` command
- **Test thoroughly** with different URL formats
- **Monitor logs** for any processing errors
- **Use your webhook** for sending additional notifications

This approach gives you all the benefits of automated video submission while running entirely on your existing Vercel infrastructure! 🚀 