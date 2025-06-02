const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function switchToTesting() {
  try {
    console.log('🔧 Switching all videos to testing mode...');
    
    // Update all videos to testing cadence
    const result = await prisma.video.updateMany({
      where: { isActive: true },
      data: { 
        scrapingCadence: 'testing',
        // Reset last scraped time to ensure they get picked up immediately
        lastScrapedAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
      }
    });
    
    console.log(`✅ Updated ${result.count} videos to testing mode`);
    console.log('📊 Videos should now update every minute');
    console.log('⏰ Wait 1-2 minutes and check your dashboard for updates');
    
    // Show current video status
    const videos = await prisma.video.findMany({
      where: { isActive: true },
      select: {
        username: true,
        platform: true,
        scrapingCadence: true,
        lastScrapedAt: true,
        currentViews: true
      }
    });
    
    console.log('\n📋 Current video status:');
    videos.forEach(video => {
      const minutesAgo = Math.floor((Date.now() - video.lastScrapedAt.getTime()) / (1000 * 60));
      console.log(`  @${video.username} (${video.platform}): ${video.scrapingCadence}, last scraped ${minutesAgo}min ago, ${video.currentViews.toLocaleString()} views`);
    });
    
  } catch (error) {
    console.error('❌ Error switching to testing mode:', error);
  } finally {
    await prisma.$disconnect();
  }
}

switchToTesting(); 