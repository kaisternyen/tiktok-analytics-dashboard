const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
    try {
        console.log('🔍 Checking database contents...\n');

        // Check videos
        const videos = await prisma.video.findMany({
            include: {
                metricsHistory: true
            }
        });

        console.log('📹 VIDEOS:');
        console.log('Total videos:', videos.length);

        if (videos.length > 0) {
            videos.forEach((video, index) => {
                console.log(`\n${index + 1}. ${video.title || 'Untitled'}`);
                console.log(`   URL: ${video.url}`);
                console.log(`   Views: ${video.viewCount || 0}`);
                console.log(`   Likes: ${video.likeCount || 0}`);
                console.log(`   Created: ${video.createdAt}`);
                console.log(`   Metrics History: ${video.metricsHistory.length} entries`);
            });
        } else {
            console.log('   No videos found');
        }

        // Check metrics history
        const metrics = await prisma.metricsHistory.findMany();
        console.log(`\n📊 METRICS HISTORY: ${metrics.length} total entries`);

        // List all tables
        console.log('\n🗂️ DATABASE TABLES:');
        const tables = await prisma.$queryRaw`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        tables.forEach(table => console.log(`   - ${table.table_name}`));

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkDatabase(); 