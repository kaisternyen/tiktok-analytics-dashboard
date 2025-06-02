# 🤖 Discord Bot Setup for Video Submissions

Since Discord webhooks only work for SENDING messages (not receiving them), we need a Discord bot to listen for video URLs.

## 🚀 **Why a Bot Instead of Webhook?**
- **Webhooks**: Send messages TO Discord
- **Bots**: Listen for messages FROM Discord users
- **Our need**: Listen when users post video URLs

## 📋 **Setup Steps**

### **Step 1: Create Discord Application**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it "Video Tracker Bot" (or similar)
4. Click **"Create"**

### **Step 2: Create Bot**
1. In your application, go to **"Bot"** section
2. Click **"Add Bot"**
3. **Copy the Bot Token** (keep this secure!)
4. Enable **"Message Content Intent"** (required to read messages)

### **Step 3: Bot Permissions**
In the "Bot" section, enable these permissions:
- ✅ **Send Messages**
- ✅ **Read Message History** 
- ✅ **View Channels**
- ✅ **Use Slash Commands** (optional)

### **Step 4: Invite Bot to Server**
1. Go to **"OAuth2"** → **"URL Generator"**
2. Select **"bot"** scope
3. Select permissions: **Send Messages**, **Read Message History**, **View Channels**
4. **Copy the generated URL** and visit it
5. **Select your server** and authorize

### **Step 5: Add Bot Token to Environment**
Add to your `.env.local`:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
```

## 🔧 **Implementation Approach**

### **Option A: Simple Polling Bot** (Easier)
Create a simple bot that checks for new messages periodically:

```javascript
// Example bot structure
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('messageCreate', async (message) => {
    // Skip bot messages
    if (message.author.bot) return;
    
    // Check if message contains video URLs
    const hasVideoURL = /* URL detection logic */;
    
    if (hasVideoURL) {
        // Send to our /api/discord-webhook endpoint
        await fetch('your-domain.com/api/discord-webhook', {
            method: 'POST',
            body: JSON.stringify({
                content: message.content,
                author: {
                    username: message.author.username,
                    id: message.author.id
                },
                channel_id: message.channel.id,
                timestamp: message.createdAt.toISOString()
            })
        });
    }
});
```

### **Option B: Hosted Bot Service** (Recommended)
Use a service like Railway, Heroku, or Vercel to host the bot 24/7.

## 🎯 **Current Webhook Usage**
Your existing webhook (`https://discord.com/api/webhooks/1378988171584344104/...`) can be used to:
- **Send confirmations** back to Discord when videos are processed
- **Notify users** about successful/failed video additions
- **Send status updates** to the channel

## 💡 **Quick Alternative: Manual Testing**
For now, you can test the system manually:

1. **Use your existing `/api/discord-webhook` endpoint**
2. **Send test POST requests** with this format:

```bash
curl -X POST https://your-domain.com/api/discord-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check out this TikTok! https://tiktok.com/@user/video/123",
    "author": {
      "username": "testuser",
      "id": "123456789"
    },
    "channel_id": "1378988105570193418",
    "timestamp": "2025-06-02T07:00:00.000Z"
  }'
```

## 🚀 **Next Steps**
1. **Test manually** with curl/Postman first
2. **Decide on bot hosting** (Railway/Heroku/etc.)
3. **Implement simple bot** to forward messages
4. **Use your webhook** for sending confirmations back

Would you like me to help you set up the Discord bot, or would you prefer to test the system manually first? 