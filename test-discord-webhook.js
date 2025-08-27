#!/usr/bin/env node

require('dotenv').config();

async function testDiscordWebhook() {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error('❌ DISCORD_WEBHOOK_URL not found in environment variables');
        console.log('Add this to your .env file:');
        console.log('DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL');
        return;
    }

    console.log('🧪 Testing Discord webhook...');
    console.log(`📍 Webhook URL: ${webhookUrl.substring(0, 50)}...`);

    const testPayload = {
        embeds: [{
            title: "🧪 Test Notification",
            description: "This is a test message from your TikTok Analytics Dashboard!",
            color: 0x00ff00,
            fields: [
                {
                    name: "📊 Status",
                    value: "✅ Webhook is working correctly",
                    inline: true
                },
                {
                    name: "⏰ Time",
                    value: new Date().toLocaleString(),
                    inline: true
                }
            ],
            footer: {
                text: "TikTok Analytics Dashboard • Test Message"
            },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload)
        });

        if (response.ok) {
            console.log('✅ Discord webhook test successful!');
            console.log('📱 Check your Discord channel for the test message');
        } else {
            console.error(`❌ Discord webhook test failed: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error('Error details:', errorText);
        }
    } catch (error) {
        console.error('💥 Error testing Discord webhook:', error.message);
    }
}

testDiscordWebhook();
