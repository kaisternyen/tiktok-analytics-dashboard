#!/usr/bin/env node

const LOCAL_URL = 'http://localhost:3000';

async function scrapeAll() {
    console.log('🔄 Starting TEST automated scraping...');
    console.log(`⏰ ${new Date().toLocaleString()}`);

    try {
        const response = await fetch(`${LOCAL_URL}/api/scrape-all`);
        const result = await response.json();

        if (response.ok) {
            console.log('✅ Scraping successful!');
            console.log(`📊 Processed: ${result.summary.successful}/${result.summary.totalVideos} videos`);

            // Show changes for each video
            result.summary.results.forEach(video => {
                if (video.status === 'success' && video.changes) {
                    const changes = video.changes;
                    const hasChanges = changes.views || changes.likes || changes.comments || changes.shares;

                    if (hasChanges) {
                        console.log(`📈 @${video.username}: ${changes.views > 0 ? `+${changes.views} views ` : ''}${changes.likes > 0 ? `+${changes.likes} likes ` : ''}${changes.comments > 0 ? `+${changes.comments} comments ` : ''}${changes.shares > 0 ? `+${changes.shares} shares` : ''}`);
                    } else {
                        console.log(`📊 @${video.username}: No changes`);
                    }
                }
            });
        } else {
            console.error('❌ Scraping failed:', result.error);
        }
    } catch (error) {
        console.error('💥 Error:', error.message);
    }

    console.log('---');
}

// Run immediately
scrapeAll();

// Run every 30 seconds for testing
console.log('🕐 Setting up TEST automation (every 30 seconds)...');
console.log('⚡ Will scrape every 30 seconds. Press Ctrl+C to stop.');

let count = 1;
setInterval(() => {
    console.log(`\n🔔 Test scrape #${++count} triggered!`);
    scrapeAll();
}, 30 * 1000); // Every 30 seconds

// Keep the process alive
process.on('SIGINT', () => {
    console.log('\n👋 Stopping test automation...');
    process.exit(0);
}); 