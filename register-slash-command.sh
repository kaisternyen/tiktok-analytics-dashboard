#!/bin/bash

# Replace these with your actual values from Discord Developer Portal
APPLICATION_ID="your_application_id_here"
BOT_TOKEN="your_bot_token_here"

echo "🚀 Registering /s command with Discord..."

curl -X POST \
  "https://discord.com/api/v10/applications/$APPLICATION_ID/commands" \
  -H "Authorization: Bot $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "s",
    "description": "Submit a video for analytics tracking",
    "options": [
      {
        "type": 3,
        "name": "url",
        "description": "TikTok, Instagram, or YouTube video URL",
        "required": true
      }
    ]
  }'

echo ""
echo "✅ Command registered! If you see a 200 response above, you're ready to go!"
echo ""
echo "Next steps:"
echo "1. Add the bot to your Discord server"
echo "2. Try: /s https://tiktok.com/@user/video/123" 