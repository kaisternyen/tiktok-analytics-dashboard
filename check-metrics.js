const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkMetrics() {
    try {
        console.log('📊 Detailed Metrics Data:\n');

        const metrics = await prisma.metricsHistory.findMany({
            include: {
                video: true
            },
            orderBy: { recordedAt: 'desc' }
        });

        metrics.forEach((metric, index) => {
            console.log(`${index + 1}. Metric for: ${metric.video.url}`);
            console.log(`   Views: ${metric.viewCount}`);
            console.log(`   Likes: ${metric.likeCount}`);
            console.log(`   Comments: ${metric.commentCount}`);
            console.log(`   Shares: ${metric.shareCount}`);
            console.log(`   Recorded: ${metric.recordedAt}`);
            console.log('   ---');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkMetrics(); 