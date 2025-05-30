#!/usr/bin/env node

/**
 * Test the /api/scrape endpoint integration
 */

require('dotenv').config({ path: '.env.local' });

const TEST_VIDEO_URL = "https://www.tiktok.com/@_markhowell/video/7494355764417547551";

async function testScrapeEndpoint() {
    console.log('🧪 Testing /api/scrape endpoint...\n');

    try {
        const response = await fetch('http://localhost:3000/api/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: TEST_VIDEO_URL }),
        });

        console.log(`📡 Response status: ${response.status} ${response.statusText}`);

        const result = await response.json();

        console.log('\n📦 Response structure:');
        console.log('   - Success:', result.success);
        console.log('   - Message:', result.message || 'No message');
        console.log('   - Error:', result.error || 'No error');

        if (result.data) {
            console.log('\n📊 Video data:');
            console.log('   - ID:', result.data.id);
            console.log('   - Username:', result.data.username);
            console.log('   - Description:', result.data.description?.substring(0, 50) + '...');
            console.log('   - Views:', result.data.views?.toLocaleString());
            console.log('   - Likes:', result.data.likes?.toLocaleString());
            console.log('   - Comments:', result.data.comments?.toLocaleString());
            console.log('   - Shares:', result.data.shares?.toLocaleString());
            console.log('   - URL:', result.data.url);
        }

        if (result.debugInfo) {
            console.log('\n🔍 Debug info available');
        }

        console.log('\n📋 Full response:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ SUCCESS: Scrape endpoint is working correctly!');
        } else {
            console.log('\n❌ FAILED: Scrape endpoint returned an error');
        }

        return result;

    } catch (error) {
        console.error('💥 Error testing scrape endpoint:', error.message);
        return null;
    }
}

async function main() {
    console.log('🚀 TikTok Scrape Integration Test\n');
    console.log(`🎬 Test Video: ${TEST_VIDEO_URL}`);
    console.log('🌐 Target: http://localhost:3000/api/scrape');
    console.log('\n' + '='.repeat(80));

    const result = await testScrapeEndpoint();

    console.log('\n' + '='.repeat(80));
    console.log('🏁 TEST COMPLETE');

    if (result?.success) {
        console.log('✅ Integration is working correctly!');
        console.log('💡 You can now add TikTok videos through the frontend.');
    } else {
        console.log('❌ Integration needs fixing.');
        console.log('💡 Check the server logs for more details.');
    }
}

main().catch(console.error); 