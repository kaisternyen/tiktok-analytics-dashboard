// Debug script to check raw Instagram API data
require('dotenv').config();

async function debugInstagramRawData() {
    try {
        console.log('🔍 Debugging raw Instagram API data...\n');
        
        const apiKey = process.env.TIKHUB_API_KEY;
        if (!apiKey) {
            console.error('❌ TIKHUB_API_KEY not found');
            return;
        }
        
        const response = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts_and_reels_by_username?username=touchgrassdailys&count=3`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) {
            console.error(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        
        if (data.data?.data?.items) {
            const posts = data.data.data.items;
            console.log(`✅ Found ${posts.length} posts. Analyzing first post structure:\n`);
            
            const firstPost = posts[0];
            console.log('📋 Raw post data structure:');
            console.log('=====================================');
            console.log(`ID: ${firstPost.id}`);
            console.log(`Shortcode: ${firstPost.shortcode}`);
            console.log(`Code: ${firstPost.code}`);
            console.log(`Permalink: ${firstPost.permalink}`);
            console.log(`Display URL: ${firstPost.display_url}`);
            console.log(`Taken At: ${firstPost.taken_at} (${new Date(firstPost.taken_at * 1000).toISOString()})`);
            console.log('');
            
            console.log('🔑 Available fields:');
            Object.keys(firstPost).forEach(key => {
                const value = firstPost[key];
                const type = typeof value;
                const preview = type === 'string' ? value.substring(0, 50) + (value.length > 50 ? '...' : '') : value;
                console.log(`  ${key}: ${type} = ${preview}`);
            });
            
            console.log('\n🔗 URL Generation Analysis:');
            if (firstPost.permalink) {
                console.log(`✅ Permalink available: ${firstPost.permalink}`);
            } else {
                console.log('❌ No permalink found');
            }
            
            if (firstPost.shortcode) {
                console.log(`✅ Shortcode available: ${firstPost.shortcode}`);
                console.log(`   Generated URL: https://www.instagram.com/p/${firstPost.shortcode}/`);
            } else {
                console.log('❌ No shortcode found');
            }
            
            if (firstPost.code) {
                console.log(`✅ Code available: ${firstPost.code}`);
                console.log(`   Generated URL: https://www.instagram.com/p/${firstPost.code}/`);
            } else {
                console.log('❌ No code found');
            }
            
        } else {
            console.log('❌ No posts found in response');
            console.log('Raw response:', JSON.stringify(data, null, 2));
        }
        
    } catch (error) {
        console.error('💥 Error:', error);
    }
}

debugInstagramRawData(); 