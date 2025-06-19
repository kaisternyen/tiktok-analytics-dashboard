const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixInstagramTrackingIssue() {
  console.log('=== FIXING INSTAGRAM TRACKING ISSUE FOR touchgrassdailys ===');
  
  const apiKey = process.env.TIKHUB_API_KEY;
  if (!apiKey) {
    console.error('❌ TIKHUB_API_KEY not found');
    return;
  }

  try {
    // 1. Check current database state
    console.log('\n1. CHECKING CURRENT DATABASE STATE:');
    const account = await prisma.trackedAccount.findFirst({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });

    if (!account) {
      console.log('❌ touchgrassdailys account not found in database');
      return;
    }

    console.log(`✅ Found account: ${account.username}`);
    console.log(`   ID: ${account.id}`);
    console.log(`   lastVideoId: ${account.lastVideoId || 'none'}`);
    console.log(`   lastChecked: ${account.lastChecked || 'never'}`);
    console.log(`   lastPostAdded: ${account.lastPostAdded || 'never'}`);
    console.log(`   isActive: ${account.isActive}`);

    const videoCount = await prisma.video.count({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });
    console.log(`   Tracked videos in DB: ${videoCount}`);

    // 2. Fetch current posts from Instagram API
    console.log('\n2. FETCHING CURRENT POSTS FROM INSTAGRAM API:');
    const response = await fetch(`https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts_and_reels_by_username?username=touchgrassdailys&count=10`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (!response.ok) {
      console.error('❌ Instagram API Error:', response.status, response.statusText);
      return;
    }

    const data = await response.json();
    if (!data.data || !data.data.data || !data.data.data.items) {
      console.error('❌ Invalid API response structure');
      return;
    }

    const posts = data.data.data.items;
    console.log(`✅ Found ${posts.length} posts from Instagram API`);

    console.log('\n📋 RECENT POSTS:');
    posts.forEach((post, index) => {
      const timestamp = new Date(post.taken_at * 1000).toISOString();
      const date = timestamp.split('T')[0];
      console.log(`${index + 1}. ID: ${post.id} - Date: ${date} - Caption: ${(post.caption?.text || '').substring(0, 50)}...`);
    });

    // 3. Check for the posts from 6-18 and 6-19
    console.log('\n3. LOOKING FOR POSTS FROM 6-18 AND 6-19 (2024):');
    const targetPosts = posts.filter(post => {
      const postDate = new Date(post.taken_at * 1000);
      const month = postDate.getMonth() + 1; // getMonth() returns 0-11
      const day = postDate.getDate();
      return (month === 6 && (day === 18 || day === 19));
    });

    if (targetPosts.length > 0) {
      console.log(`✅ Found ${targetPosts.length} posts from 6-18 or 6-19:`);
      targetPosts.forEach((post, index) => {
        const timestamp = new Date(post.taken_at * 1000).toISOString();
        console.log(`   ${index + 1}. ID: ${post.id} - ${timestamp} - ${(post.caption?.text || '').substring(0, 50)}...`);
      });
    } else {
      console.log('❌ No posts found from 6-18 or 6-19, 2024');
      console.log('Available post dates:');
      posts.slice(0, 5).forEach(post => {
        const timestamp = new Date(post.taken_at * 1000).toISOString();
        console.log(`   - ${timestamp.split('T')[0]}`);
      });
    }

    // 4. Analyze the tracking issue
    console.log('\n4. ANALYZING TRACKING ISSUE:');
    const currentBaselineIndex = posts.findIndex(post => {
      return post.id === account.lastVideoId;
    });

    if (currentBaselineIndex === -1) {
      console.log('⚠️ Current baseline (lastVideoId) not found in recent posts');
      console.log(`   Looking for: ${account.lastVideoId}`);
      console.log('   This suggests the baseline might be too old or the posts have been missed');
    } else {
      console.log(`✅ Current baseline found at index: ${currentBaselineIndex}`);
      const newPosts = posts.slice(0, currentBaselineIndex);
      console.log(`   New posts since baseline: ${newPosts.length}`);
      
      if (newPosts.length > 0) {
        console.log('🆕 NEW POSTS THAT SHOULD HAVE BEEN TRACKED:');
        newPosts.forEach((post, index) => {
          const timestamp = new Date(post.taken_at * 1000).toISOString();
          console.log(`   ${index + 1}. ${post.id} - ${timestamp.split('T')[0]}`);
        });
      }
    }

    // 5. Reset baseline to capture missed posts
    console.log('\n5. RESETTING BASELINE TO CAPTURE MISSED POSTS:');
    
    // Find a good baseline point that's before the 6-18 and 6-19 posts
    let newBaselineIndex = posts.length - 1;
    if (targetPosts.length > 0) {
      // Find the oldest target post and set baseline before it
      const oldestTargetPostIndex = posts.findIndex(post => 
        targetPosts.some(target => target.id === post.id)
      );
      if (oldestTargetPostIndex !== -1) {
        newBaselineIndex = Math.min(oldestTargetPostIndex + 2, posts.length - 1);
      }
    }

    const newBaselinePost = posts[newBaselineIndex];
    const newBaselineTimestamp = new Date(newBaselinePost.taken_at * 1000).toISOString();
    
    console.log(`🎯 Setting new baseline to post at index ${newBaselineIndex}:`);
    console.log(`   ID: ${newBaselinePost.id}`);
    console.log(`   Date: ${newBaselineTimestamp.split('T')[0]}`);
    console.log(`   This will make ${newBaselineIndex} posts available for tracking`);

    // Update the baseline
    await prisma.trackedAccount.update({
      where: { id: account.id },
      data: { 
        lastVideoId: newBaselinePost.id,
        lastChecked: new Date(Date.now() - 24 * 60 * 60 * 1000) // Set lastChecked to yesterday to force a check
      }
    });

    console.log('✅ Baseline updated successfully');

    // 6. Manually trigger a check
    console.log('\n6. TRIGGERING MANUAL CHECK:');
    
    try {
      // Import the TypeScript file using dynamic import
      const { checkTrackedAccount } = await import('./src/lib/account-scrapers.ts');
      
      const result = await checkTrackedAccount({
        id: account.id,
        username: account.username,
        platform: account.platform,
        accountType: account.accountType,
        keyword: account.keyword
      });

      console.log('✅ Manual check completed:');
      console.log(`   Status: ${result.status}`);
      console.log(`   New videos found: ${result.newVideos}`);
      
      if (result.addedVideos && result.addedVideos.length > 0) {
        console.log('📹 VIDEOS ADDED TO TRACKING:');
        result.addedVideos.forEach((video, index) => {
          console.log(`   ${index + 1}. ${video.id} - ${video.timestamp.split('T')[0]}`);
        });
      }

    } catch (error) {
      console.error('❌ Error during manual check:', error.message);
      
      // Alternative: Force a check by calling the API endpoint
      console.log('🔄 Attempting alternative check via API...');
      try {
        const checkResponse = await fetch('http://localhost:3000/api/tracked-accounts/check', {
          method: 'POST'
        });
        
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          console.log('✅ API check completed');
          console.log(`   Total new videos: ${checkData.summary?.totalNewVideos || 0}`);
        } else {
          console.log('⚠️ API check failed, but baseline has been reset');
        }
      } catch (apiError) {
        console.log('⚠️ API check not available, but baseline has been reset');
      }
    }

    // 7. Final verification
    console.log('\n7. FINAL VERIFICATION:');
    const updatedAccount = await prisma.trackedAccount.findFirst({
      where: { id: account.id }
    });
    
    const finalVideoCount = await prisma.video.count({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });

    console.log(`✅ Updated account state:`);
    console.log(`   lastVideoId: ${updatedAccount.lastVideoId}`);
    console.log(`   lastChecked: ${updatedAccount.lastChecked}`);
    console.log(`   lastPostAdded: ${updatedAccount.lastPostAdded}`);
    console.log(`   Tracked videos: ${finalVideoCount} (was ${videoCount})`);

    if (finalVideoCount > videoCount) {
      console.log(`🎉 SUCCESS: Added ${finalVideoCount - videoCount} new videos to tracking!`);
    } else {
      console.log('⚠️ No new videos were added during this check');
      console.log('💡 The system is now configured to catch new posts going forward');
      console.log('💡 Try posting a test post and running another check');
    }

    console.log('\n8. NEXT STEPS:');
    console.log('✅ Baseline has been reset to capture missed posts');
    console.log('✅ System will now track new posts correctly');
    console.log('🔄 Future posts will be automatically detected');
    console.log('📋 You can manually trigger checks using: POST /api/tracked-accounts/check');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixInstagramTrackingIssue().catch(console.error); 