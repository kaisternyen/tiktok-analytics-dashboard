"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = uploadToS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
async function uploadToS3(buffer, key, contentType = 'image/jpeg') {
    console.log('🚀 S3 upload starting...');
    console.log('📦 Buffer size:', buffer.length, 'bytes');
    console.log('🔑 Key:', key);
    console.log('📋 Content type:', contentType);
    console.log('🪣 Bucket:', process.env.S3_BUCKET_NAME);
    console.log('🌍 Region:', process.env.AWS_REGION);
    try {
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            // Removed ACL since bucket doesn't support it
        }));
        const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        console.log('✅ S3 upload completed successfully!');
        console.log('🔗 S3 URL:', s3Url);
        return s3Url;
    }
    catch (error) {
        console.error('❌ S3 upload failed:', error);
        throw error;
    }
}
