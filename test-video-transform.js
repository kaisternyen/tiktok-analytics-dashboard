#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

// Import our TikHub service
const { scrapeTikTokVideo } = require('./src/lib/tikhub');

async function testVideoTransform() {
    console.log('🚀 Testing Video Data Transformation...\n');

    const testUrl = 'https://www.tiktok.com/@_markhowell/video/7494355764417547551';

    try {
        const result = await scrapeTikTokVideo(testUrl);

        console.log('📊 Transformation Result:');
        console.log('='.repeat(60));
        console.log('Success:', result.success);

        if (result.success && result.data) {
            console.log('\n✨ Transformed Video Data:');
            console.log(`🆔 ID: ${result.data.id}`);
            console.log(`📱 Username: ${result.data.username}`);
            console.log(`📝 Description: ${result.data.description}`);
            console.log(`👀 Views: ${result.data.views.toLocaleString()}`);
            console.log(`❤️  Likes: ${result.data.likes.toLocaleString()}`);
            console.log(`💬 Comments: ${result.data.comments.toLocaleString()}`);
            console.log(`🔄 Shares: ${result.data.shares.toLocaleString()}`);
            console.log(`🕐 Timestamp: ${result.data.timestamp}`);
            console.log(`🏷️  Hashtags: [${result.data.hashtags.join(', ')}]`);
            console.log(`🎵 Music: ${result.data.music ? `${result.data.music.name} by ${result.data.music.author}` : 'N/A'}`);
            console.log(`🖼️  Thumbnail: ${result.data.thumbnailUrl ? 'Available' : 'N/A'}`);
            console.log(`🔗 URL: ${result.data.url}`);
        } else {
            console.log(`❌ Error: ${result.error}`);
            if (result.debugInfo) {
                console.log('\n🔍 Debug Info:', JSON.stringify(result.debugInfo, null, 2));
            }
        }

    } catch (error) {
        console.error('💥 Test failed:', error);
    }
}

testVideoTransform().catch(console.error); 