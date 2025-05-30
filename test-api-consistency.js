#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const TEST_VIDEOS = [
    'https://www.tiktok.com/@_markhowell/video/7494355764417547551',
    'https://www.tiktok.com/@charlidamelio/video/7000000000000000000', // Invalid ID to test error handling
    'https://www.tiktok.com/@khaby.lame/video/7300000000000000000',   // Another test video
    'https://www.tiktok.com/@_markhowell/video/7494355764417547551',  // Duplicate to test consistency
];

const PRODUCTION_API = 'https://kisbydb.vercel.app/api/scrape';
const LOCAL_API = 'http://localhost:3000/api/scrape';

async function testApiEndpoint(apiUrl, videoUrl, testName) {
    console.log(`\n🧪 ${testName}`);
    console.log(`📍 API: ${apiUrl}`);
    console.log(`🎬 Video: ${videoUrl}`);

    const startTime = Date.now();

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: videoUrl }),
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`⏱️  Response time: ${duration}ms`);
        console.log(`📡 Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ Error response: ${errorText}`);
            return {
                success: false,
                status: response.status,
                error: errorText,
                duration,
                timestamp: new Date().toISOString()
            };
        }

        const data = await response.json();
        console.log(`✅ Success: ${data.success ? 'true' : 'false'}`);

        if (data.success && data.data) {
            console.log(`👤 Username: @${data.data.username}`);
            console.log(`👁️  Views: ${data.data.views?.toLocaleString() || 'N/A'}`);
            console.log(`❤️  Likes: ${data.data.likes?.toLocaleString() || 'N/A'}`);
            console.log(`💬 Comments: ${data.data.comments?.toLocaleString() || 'N/A'}`);
        } else {
            console.log(`❌ API returned success:false - ${data.error || 'Unknown error'}`);
        }

        return {
            success: data.success,
            status: response.status,
            data: data.data,
            error: data.error,
            duration,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`💥 Network/Fetch Error: ${error.message}`);
        return {
            success: false,
            status: 0,
            error: error.message,
            duration,
            timestamp: new Date().toISOString()
        };
    }
}

async function testConsistency() {
    console.log('🔄 CONSISTENCY TEST: Testing same video multiple times');
    console.log('='.repeat(60));

    const testVideo = TEST_VIDEOS[0];
    const results = [];

    for (let i = 1; i <= 5; i++) {
        const result = await testApiEndpoint(
            PRODUCTION_API,
            testVideo,
            `Consistency Test ${i}/5`
        );
        results.push(result);

        // Wait 2 seconds between requests to avoid rate limiting
        if (i < 5) {
            console.log('⏳ Waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log('\n📊 CONSISTENCY ANALYSIS:');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log(`✅ Successful: ${successful}/5 (${(successful / 5 * 100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failed}/5 (${(failed / 5 * 100).toFixed(1)}%)`);
    console.log(`⏱️  Average response time: ${avgDuration.toFixed(0)}ms`);

    // Check for data consistency
    const successfulResults = results.filter(r => r.success && r.data);
    if (successfulResults.length > 1) {
        const firstResult = successfulResults[0].data;
        const allConsistent = successfulResults.every(r =>
            r.data.id === firstResult.id &&
            r.data.username === firstResult.username
        );

        console.log(`🔄 Data consistency: ${allConsistent ? '✅ CONSISTENT' : '❌ INCONSISTENT'}`);

        if (!allConsistent) {
            console.log('🚨 INCONSISTENT DATA DETECTED:');
            successfulResults.forEach((result, index) => {
                console.log(`  ${index + 1}: ID=${result.data.id}, Username=${result.data.username}`);
            });
        }
    }

    return results;
}

async function testErrorHandling() {
    console.log('\n🛡️ ERROR HANDLING TEST');
    console.log('='.repeat(60));

    const errorTests = [
        { url: '', name: 'Empty URL' },
        { url: 'invalid-url', name: 'Invalid URL' },
        { url: 'https://www.tiktok.com/invalid', name: 'Invalid TikTok URL' },
        { url: 'https://www.tiktok.com/@user/video/1234567890', name: 'Non-existent Video ID' }
    ];

    for (const test of errorTests) {
        await testApiEndpoint(PRODUCTION_API, test.url, `Error Test: ${test.name}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function testRateLimiting() {
    console.log('\n⚡ RATE LIMITING TEST');
    console.log('='.repeat(60));

    const promises = [];
    const testVideo = TEST_VIDEOS[0];

    // Fire 3 requests simultaneously
    for (let i = 1; i <= 3; i++) {
        promises.push(testApiEndpoint(
            PRODUCTION_API,
            testVideo,
            `Concurrent Test ${i}/3`
        ));
    }

    const results = await Promise.all(promises);

    const successful = results.filter(r => r.success).length;
    console.log(`\n📊 Concurrent test results: ${successful}/3 successful`);

    return results;
}

async function testDifferentVideos() {
    console.log('\n🎬 DIFFERENT VIDEOS TEST');
    console.log('='.repeat(60));

    const results = [];

    for (let i = 0; i < TEST_VIDEOS.length; i++) {
        const result = await testApiEndpoint(
            PRODUCTION_API,
            TEST_VIDEOS[i],
            `Video Test ${i + 1}/${TEST_VIDEOS.length}`
        );
        results.push(result);

        if (i < TEST_VIDEOS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    return results;
}

async function runFullTestSuite() {
    console.log('🚀 STARTING COMPREHENSIVE API CONSISTENCY TEST');
    console.log('🕐 Started at:', new Date().toISOString());
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    console.log('🔑 TikHub API Key configured:', !!process.env.TIKHUB_API_KEY);
    console.log('='.repeat(80));

    const allResults = {
        consistency: await testConsistency(),
        errorHandling: await testErrorHandling(),
        rateLimiting: await testRateLimiting(),
        differentVideos: await testDifferentVideos()
    };

    console.log('\n🎯 FINAL SUMMARY');
    console.log('='.repeat(80));

    const consistencySuccess = allResults.consistency.filter(r => r.success).length;
    const rateLimitingSuccess = allResults.rateLimiting.filter(r => r.success).length;
    const differentVideosSuccess = allResults.differentVideos.filter(r => r.success).length;

    console.log(`🔄 Consistency Test: ${consistencySuccess}/5 successful (${(consistencySuccess / 5 * 100).toFixed(1)}%)`);
    console.log(`⚡ Rate Limiting Test: ${rateLimitingSuccess}/3 successful (${(rateLimitingSuccess / 3 * 100).toFixed(1)}%)`);
    console.log(`🎬 Different Videos Test: ${differentVideosSuccess}/${TEST_VIDEOS.length} successful`);

    const overallSuccess = consistencySuccess + rateLimitingSuccess + differentVideosSuccess;
    const totalTests = 5 + 3 + TEST_VIDEOS.length;

    console.log(`\n🎉 OVERALL SUCCESS RATE: ${overallSuccess}/${totalTests} (${(overallSuccess / totalTests * 100).toFixed(1)}%)`);

    if (overallSuccess / totalTests < 0.9) {
        console.log('🚨 SUCCESS RATE BELOW 90% - NEEDS INVESTIGATION!');
        console.log('\n🔧 RECOMMENDED FIXES:');
        console.log('1. Add retry logic for failed requests');
        console.log('2. Implement exponential backoff');
        console.log('3. Add request timeout handling');
        console.log('4. Improve error messages');
        console.log('5. Add circuit breaker pattern');
    } else {
        console.log('✅ API appears to be working consistently!');
    }

    console.log('\n🕐 Test completed at:', new Date().toISOString());
}

// Run the test suite
runFullTestSuite().catch(console.error); 