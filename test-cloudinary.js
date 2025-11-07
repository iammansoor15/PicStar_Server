import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import streamifier from 'streamifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

console.log('🧪 Testing Cloudinary Configuration\n');

// Check if credentials are loaded
console.log('📋 Environment Variables:');
console.log(`  CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Not Set'}`);
console.log(`  CLOUDINARY_API_KEY: ${process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Not Set'}`);
console.log(`  CLOUDINARY_API_SECRET: ${process.env.CLOUDINARY_API_SECRET ? '✅ Set (length: ' + process.env.CLOUDINARY_API_SECRET?.length + ')' : '❌ Not Set'}`);
console.log('');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

console.log('🔧 Cloudinary Configuration:');
console.log(`  Cloud Name: ${cloudinary.config().cloud_name}`);
console.log(`  API Key: ${cloudinary.config().api_key}`);
console.log(`  Secure: ${cloudinary.config().secure}`);
console.log('');

// Test 1: Ping Cloudinary API
console.log('🔍 Test 1: Pinging Cloudinary API...');
try {
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary API is accessible');
    console.log(`   Status: ${result.status}`);
} catch (error) {
    console.error('❌ Failed to ping Cloudinary API:');
    console.error(`   Error: ${error.message}`);
    console.error(`   HTTP Code: ${error.http_code}`);
    process.exit(1);
}
console.log('');

// Test 2: Create a test image buffer
console.log('🔍 Test 2: Creating test image...');
const testImageData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);
console.log(`✅ Test image created (${testImageData.length} bytes)`);
console.log('');

// Test 3: Upload test image using buffer
console.log('🔍 Test 3: Uploading test image via buffer...');
try {
    const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'profile_photos/test_user',
                transformation: [
                    { width: 500, height: 500, crop: 'fill' },
                    { quality: 'auto:good' }
                ],
                overwrite: true,
                invalidate: true,
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        
        // Create readable stream from buffer
        streamifier.createReadStream(testImageData).pipe(uploadStream);
    });

    console.log('✅ Upload successful!');
    console.log(`   URL: ${uploadResult.secure_url}`);
    console.log(`   Public ID: ${uploadResult.public_id}`);
    console.log(`   Format: ${uploadResult.format}`);
    console.log(`   Size: ${uploadResult.bytes} bytes`);
    console.log('');

    // Test 4: Delete test image
    console.log('🔍 Test 4: Cleaning up test image...');
    try {
        await cloudinary.uploader.destroy(uploadResult.public_id);
        console.log('✅ Test image deleted successfully');
    } catch (deleteError) {
        console.warn('⚠️ Could not delete test image:', deleteError.message);
    }
} catch (error) {
    console.error('❌ Upload failed:');
    console.error(`   Error: ${error.message}`);
    if (error.http_code) {
        console.error(`   HTTP Code: ${error.http_code}`);
    }
    process.exit(1);
}

console.log('');
console.log('✅ All tests passed! Cloudinary is configured correctly.');
console.log('');
console.log('💡 Next steps:');
console.log('   1. Make sure your server is running');
console.log('   2. Try uploading a profile photo from your app');
console.log('   3. Check server console for upload logs');
