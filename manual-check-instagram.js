const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function manualCheckInstagram() {
  console.log('=== MANUAL INSTAGRAM CHECK ===');
  
  try {
    // 1. Check current status
    const account = await prisma.trackedAccount.findFirst({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });

    if (!account) {
      console.log('❌ touchgrassdailys account not found');
      return;
    }

    const videoCount = await prisma.video.count({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });

    console.log(`📊 Current status:`);
    console.log(`   Account: ${account.username}`);
    console.log(`   Tracked videos: ${videoCount}`);
    console.log(`   Last check: ${account.lastChecked || 'never'}`);
    console.log(`   Last post added: ${account.lastPostAdded || 'never'}`);

    // 2. Trigger manual check via API
    console.log('\n🔍 Triggering manual check...');
    
    try {
      const response = await fetch('http://localhost:3000/api/tracked-accounts/check', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Check completed successfully!');
        console.log(`   Duration: ${data.duration}ms`);
        console.log(`   Total new videos found: ${data.summary?.totalNewVideos || 0}`);
        
        if (data.results) {
          const instagramResults = data.results.filter(r => r.platform === 'instagram' && r.username === 'touchgrassdailys');
          if (instagramResults.length > 0) {
            const result = instagramResults[0];
            console.log(`   touchgrassdailys result: ${result.status}`);
            console.log(`   New videos: ${result.newVideos}`);
          }
        }
      } else {
        console.error('❌ API call failed:', response.status, response.statusText);
      }
    } catch (apiError) {
      console.error('❌ Error calling API:', apiError.message);
      console.log('💡 Make sure your Next.js server is running on port 3000');
    }

    // 3. Show updated status
    const updatedAccount = await prisma.trackedAccount.findFirst({
      where: { id: account.id }
    });
    
    const finalVideoCount = await prisma.video.count({
      where: { username: 'touchgrassdailys', platform: 'instagram' }
    });

    console.log('\n📊 Updated status:');
    console.log(`   Tracked videos: ${finalVideoCount} (was ${videoCount})`);
    console.log(`   Last check: ${updatedAccount.lastChecked}`);
    
    if (finalVideoCount > videoCount) {
      console.log(`🎉 Added ${finalVideoCount - videoCount} new videos!`);
    } else {
      console.log('📝 No new videos found this time');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

manualCheckInstagram().catch(console.error); 