const { scrapeMediaPost } = require('./src/lib/tikhub');

async function testInstagramTimestamp() {
    console.log('🔍 Testing Instagram timestamp extraction...');
    
    // Test with a sample Instagram URL (you can replace this with an actual Instagram post URL)
    const testUrl = 'https://www.instagram.com/p/example/'; // Replace with actual URL
    
    try {
        const result = await scrapeMediaPost(testUrl);
        
        console.log('📊 TikHub API Result:');
        console.log('Success:', result.success);
        console.log('Has Data:', !!result.data);
        
        if (result.data) {
            console.log('📅 Timestamp Fields:');
            console.log('- timestamp:', result.data.timestamp);
            console.log('- timestamp type:', typeof result.data.timestamp);
            console.log('- All keys:', Object.keys(result.data));
            
            // Check if it's an Instagram post
            if (result.data.username && result.data.fullName) {
                console.log('📱 Instagram Post Data:');
                console.log('- Username:', result.data.username);
                console.log('- Full Name:', result.data.fullName);
                console.log('- Description:', result.data.description?.substring(0, 100) + '...');
                console.log('- Likes:', result.data.likes);
                console.log('- Comments:', result.data.comments);
                console.log('- Timestamp:', result.data.timestamp);
                
                // Test date conversion
                if (result.data.timestamp) {
                    const date = new Date(result.data.timestamp);
                    console.log('📅 Converted Date:', date.toISOString());
                    console.log('📅 Date is valid:', !isNaN(date.getTime()));
                }
            }
        }
        
        if (result.error) {
            console.log('❌ Error:', result.error);
        }
        
    } catch (error) {
        console.error('💥 Error testing Instagram timestamp:', error);
    }
}

// Run the test
testInstagramTimestamp();
