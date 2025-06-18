import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToS3(buffer: Buffer, key: string, contentType = 'image/jpeg') {
  console.log('🚀 S3 upload starting...');
  console.log('📦 Buffer size:', buffer.length, 'bytes');
  console.log('🔑 Key:', key);
  console.log('📋 Content type:', contentType);
  console.log('🪣 Bucket:', process.env.S3_BUCKET_NAME);
  console.log('🌍 Region:', process.env.AWS_REGION);
  
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Removed ACL since bucket doesn't support it
      })
    );
    
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    console.log('✅ S3 upload completed successfully!');
    console.log('🔗 S3 URL:', s3Url);
    return s3Url;
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw error;
  }
} 