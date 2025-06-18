require('dotenv').config({ path: '.env.local' });

async function testVideoSubmission() {
  // Using the new TikTok video URL provided by the user for debugging
  const testUrl = 'https://www.tiktok.com/@mino.mp4/video/7517092599849602335';
  
  console.log('🎬 Testing video submission with S3 upload...');
  console.log('📝 Test URL:', testUrl);
  
  try {
    const response = await fetch('http://localhost:3000/api/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: testUrl }),
    });

    const data = await response.json();
    
    console.log('📊 Response status:', response.status);
    console.log('📦 Response data:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Video submission successful!');
      console.log('🆔 Video ID:', data.data.id);
      console.log('👤 Username:', data.data.username);
      console.log('👁️ Views:', data.data.views);
      console.log('❤️ Likes:', data.data.likes);
      console.log('📝 Message:', data.message);
      
      // Check if this was a new video (should trigger S3 upload)
      if (data.message === 'added') {
        console.log('🆕 This was a NEW video - S3 upload should have happened!');
      } else {
        console.log('🔄 This was an UPDATE - S3 upload only happens for new videos');
      }
    } else {
      console.log('❌ Video submission failed:', data.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

// Run the test immediately
testVideoSubmission(); 