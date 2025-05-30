#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const TIKHUB_API_KEY = process.env.TIKHUB_API_KEY;
const TEST_VIDEO_ID = "7494355764417547551";

async function debugTikHubResponse() {
    console.log('🔍 Debug TikHub API Response...\n');

    try {
        const testUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${TEST_VIDEO_ID}`;
        console.log('🌐 Calling:', testUrl);

        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TIKHUB_API_KEY}`,
                'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
            }
        });

        console.log('\n📡 Response Status:', response.status, response.statusText);
        console.log('📋 Response Headers:', Object.fromEntries(response.headers.entries()));

        const responseText = await response.text();
        console.log('\n📦 Raw Response Text:');
        console.log('='.repeat(80));
        console.log(responseText);
        console.log('='.repeat(80));

        try {
            const jsonData = JSON.parse(responseText);
            console.log('\n📊 Parsed JSON (formatted):');
            console.log(JSON.stringify(jsonData, null, 2));
        } catch (parseError) {
            console.log('\n❌ Could not parse as JSON:', parseError.message);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

debugTikHubResponse().catch(console.error); 