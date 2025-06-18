"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const account_scrapers_js_1 = require("./src/lib/account-scrapers.js");
const prisma_js_1 = require("./src/lib/prisma.js");
async function testInstagramIntegration() {
    console.log('🔍 Testing Instagram account tracking integration...\n');
    try {
        // Test 1: Add a test Instagram account
        console.log('1. Adding test Instagram account...');
        const testAccount = await prisma_js_1.prisma.trackedAccount.create({
            data: {
                username: 'cristiano', // Popular account for testing
                platform: 'instagram',
                accountType: 'all',
                isActive: true,
                lastChecked: new Date(),
                description: 'Test Instagram integration'
            }
        });
        console.log(`✅ Created test account: @${testAccount.username} (ID: ${testAccount.id})\n`);
        // Test 2: Test the account tracking
        console.log('2. Testing Instagram content fetching...');
        const result = await (0, account_scrapers_js_1.checkTrackedAccount)({
            id: testAccount.id,
            username: testAccount.username,
            platform: testAccount.platform,
            accountType: testAccount.accountType
        });
        console.log('📊 Account check result:');
        console.log(`   Status: ${result.status}`);
        console.log(`   New videos found: ${result.newVideos}`);
        console.log(`   Error: ${result.error || 'None'}`);
        if (result.addedVideos && result.addedVideos.length > 0) {
            console.log('\n📹 Sample videos added:');
            result.addedVideos.slice(0, 3).forEach((video, index) => {
                console.log(`   ${index + 1}. ${video.description.substring(0, 50)}...`);
                console.log(`      URL: ${video.url}`);
                console.log(`      Timestamp: ${video.timestamp}\n`);
            });
        }
        // Test 3: Check database state
        console.log('3. Checking database state...');
        const instagramVideos = await prisma_js_1.prisma.video.count({
            where: { platform: 'instagram' }
        });
        const instagramAccounts = await prisma_js_1.prisma.trackedAccount.count({
            where: { platform: 'instagram' }
        });
        console.log(`📊 Database state:`);
        console.log(`   Instagram accounts: ${instagramAccounts}`);
        console.log(`   Instagram videos: ${instagramVideos}`);
        // Test 4: Test account validation in API
        console.log('\n4. Testing Instagram account validation...');
        const validationResponse = await fetch('http://localhost:3000/api/tracked-accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'cristiano',
                platform: 'instagram',
                accountType: 'all'
            })
        });
        if (validationResponse.ok) {
            const validationData = await validationResponse.json();
            console.log(`✅ Instagram account validation successful`);
            console.log(`   Display name: ${validationData.displayName || 'N/A'}`);
            console.log(`   Followers: ${validationData.followers || 'N/A'}`);
            console.log(`   Total posts: ${validationData.totalPosts || 'N/A'}`);
        }
        else {
            console.error(`❌ Instagram account validation failed: ${validationResponse.status}`);
        }
        console.log('\n🎉 Instagram integration test completed!');
        // Cleanup (optional)
        console.log('\n5. Cleaning up test data...');
        await prisma_js_1.prisma.video.deleteMany({
            where: { platform: 'instagram', username: 'cristiano' }
        });
        await prisma_js_1.prisma.trackedAccount.delete({
            where: { id: testAccount.id }
        });
        console.log('✅ Test data cleaned up');
    }
    catch (error) {
        console.error('❌ Error during Instagram integration test:', error);
    }
    finally {
        await prisma_js_1.prisma.$disconnect();
    }
}
// Run the test
testInstagramIntegration();
