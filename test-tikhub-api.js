#!/usr/bin/env node

/**
 * TikHub API Key Tester
 * 
 * This script tests your TikHub API key to ensure it's working correctly.
 * Run: node test-tikhub-api.js
 */

require('dotenv').config({ path: '.env.local' });

const TIKHUB_API_KEY = process.env.TIKHUB_API_KEY;
const TEST_VIDEO_ID = "7304809083817774382"; // Sample TikTok video ID

async function testTikHubAPI() {
    console.log('🔍 Testing TikHub API Key...\n');

    // Check if API key is set
    if (!TIKHUB_API_KEY) {
        console.error('❌ TIKHUB_API_KEY not found in environment variables');
        console.log('💡 Make sure you have a .env.local file with:');
        console.log('   TIKHUB_API_KEY="your_actual_api_key_here"');
        process.exit(1);
    }

    console.log(`✅ API Key found: ${TIKHUB_API_KEY.substring(0, 20)}...`);

    try {
        // Test user info endpoint first
        console.log('👤 Testing user info endpoint...');

        const userResponse = await fetch(
            'https://api.tikhub.io/api/v1/tikhub/user/get_user_info',
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${TIKHUB_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!userResponse.ok) {
            console.error(`❌ User Info API Error: ${userResponse.status} ${userResponse.statusText}`);
            const errorText = await userResponse.text();
            console.error('Response:', errorText);

            if (userResponse.status === 401) {
                console.log('\n💡 This usually means:');
                console.log('   - Invalid API key format');
                console.log('   - API key not activated');
                console.log('   - Check your TikHub dashboard');
            }

            return false;
        }

        const userData = await userResponse.json();
        console.log('✅ User Info API Test Successful!');
        console.log(`📧 Email: ${userData.user_data?.email || 'N/A'}`);
        console.log(`💰 Balance: $${userData.user_data?.balance || 0}`);
        console.log(`🎁 Free Credits: ${userData.user_data?.free_credit || 0}`);
        console.log(`✉️  Email Verified: ${userData.user_data?.email_verified || false}`);

        // Test single video fetch
        console.log('\n🎬 Testing single video fetch...');

        const videoResponse = await fetch(
            `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${TEST_VIDEO_ID}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${TIKHUB_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const videoResponseText = await videoResponse.text();

        if (!videoResponse.ok) {
            console.error(`❌ Video API Error: ${videoResponse.status} ${videoResponse.statusText}`);
            console.error('Response:', videoResponseText);

            if (videoResponse.status === 402) {
                console.log('\n💡 Payment Required (402):');
                console.log('   - You need credits to use this endpoint');
                console.log('   - Add credits to your TikHub account');
                console.log('   - Or check the free tier availability');
            }

            return true; // User info worked, so API key is valid
        }

        const videoData = JSON.parse(videoResponseText);

        if (videoData && videoData.data) {
            console.log('✅ Video API Test Successful!');
            console.log(`📊 Video ID: ${videoData.data.aweme_id || 'N/A'}`);
            console.log(`👤 Author: ${videoData.data.author?.unique_id || 'N/A'}`);
            console.log(`❤️  Likes: ${videoData.data.statistics?.digg_count || 0}`);
            console.log(`💬 Comments: ${videoData.data.statistics?.comment_count || 0}`);
            console.log(`🔄 Shares: ${videoData.data.statistics?.share_count || 0}`);

            return true;
        } else {
            console.error('❌ Unexpected video response format');
            console.error('Response:', videoData);
            return true; // User info worked, so API key is valid
        }

    } catch (error) {
        console.error('❌ Network Error:', error.message);

        if (error.code === 'ENOTFOUND') {
            console.log('💡 Check your internet connection');
        }

        return false;
    }
}

async function main() {
    console.log('🚀 TikHub API Key Tester\n');

    const success = await testTikHubAPI();

    console.log('\n' + '='.repeat(50));

    if (success) {
        console.log('🎉 SUCCESS! Your TikHub API key is working correctly.');
        console.log('🔥 Your analytics dashboard is ready to scrape TikTok data!');
        console.log('\n📖 Next steps:');
        console.log('   1. Deploy to Vercel with your TIKHUB_API_KEY');
        console.log('   2. Test the /api/scrape endpoint');
        console.log('   3. Start tracking your TikTok videos!');
    } else {
        console.log('❌ FAILED! Please check your API key setup.');
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Verify your API key in TikHub dashboard');
        console.log('   2. Make sure you have sufficient credits');
        console.log('   3. Check the TIKHUB_SETUP.md guide');
    }

    console.log('\n📚 Helpful resources:');
    console.log('   - TikHub Dashboard: https://tikhub.io');
    console.log('   - Setup Guide: ./TIKHUB_SETUP.md');
    console.log('   - Migration Guide: ./MIGRATION_GUIDE.md');
}

// Run the test
main().catch(console.error); 