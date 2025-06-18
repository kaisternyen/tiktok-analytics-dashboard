require('dotenv').config({ path: '.env.local' });
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testS3Upload() {
  try {
    console.log('🔧 Testing S3 connectivity...');
    console.log('Bucket:', process.env.S3_BUCKET_NAME);
    console.log('Region:', process.env.AWS_REGION);
    
    // Test upload
    const testBuffer = Buffer.from('Hello S3!');
    const key = `test/test-${Date.now()}.txt`;
    
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: testBuffer,
        ContentType: 'text/plain',
      })
    );
    
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    console.log('✅ S3 upload successful!');
    console.log('URL:', s3Url);
    
  } catch (error) {
    console.error('❌ S3 upload failed:', error.message);
    console.error('Full error:', error);
  }
}

testS3Upload(); 