/**
 * Migration Script: Cloudinary to MinIO
 *
 * Downloads files from old Cloudinary URLs and uploads to MinIO,
 * then updates MongoDB with new MinIO URLs.
 *
 * Usage: node src/scripts/migrate-cloudinary-to-minio.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import path from 'path';
import minio from '../utils/minio.js';
import Template from '../models/Template.js';
import User from '../models/User.js';

dotenv.config();

// Regex to match Cloudinary URLs
const CLOUDINARY_REGEX = /cloudinary\.com/i;

/**
 * Connect to MongoDB
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment');
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'picstar',
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✅ Connected to MongoDB');
}

/**
 * Extract the relative path from a Cloudinary URL
 * e.g., https://res.cloudinary.com/xxx/image/upload/v123/narayana_templates/birthday/photo.jpg
 * -> narayana_templates/birthday/photo.jpg
 */
function extractPathFromCloudinaryUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Pattern: /cloud_name/resource_type/type/version/folder/file
    // We want everything after the version (v123456...)
    const match = pathname.match(/\/v\d+\/(.+)$/);
    if (match) {
      return match[1];
    }

    // Fallback: try to get path after /upload/
    const uploadMatch = pathname.match(/\/upload\/(.+)$/);
    if (uploadMatch) {
      // Remove version if present
      const pathWithoutVersion = uploadMatch[1].replace(/^v\d+\//, '');
      return pathWithoutVersion;
    }

    // Last resort: use the filename
    return path.basename(pathname);
  } catch (error) {
    console.error(`Failed to parse URL: ${url}`, error.message);
    return null;
  }
}

/**
 * Download file from URL and return as buffer
 */
async function downloadFile(url) {
  const response = await fetch(url, { timeout: 60000 });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());

  return { buffer, contentType };
}

/**
 * Get file extension from URL or content type
 */
function getExtension(url, contentType) {
  // Try to get from URL
  const urlExt = path.extname(new URL(url).pathname);
  if (urlExt) return urlExt;

  // Map content types to extensions
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  };

  return mimeToExt[contentType] || '.bin';
}

/**
 * Upload buffer to MinIO and return new URL
 */
async function uploadToMinio(buffer, objectPath, contentType) {
  const folder = path.dirname(objectPath);
  const filename = path.basename(objectPath);

  const result = await minio.uploadBuffer(buffer, folder, {
    filename,
    contentType,
    extension: path.extname(filename) || '.bin',
  });

  return result.url;
}

/**
 * Migrate a single URL from Cloudinary to MinIO
 */
async function migrateUrl(cloudinaryUrl) {
  if (!cloudinaryUrl || !CLOUDINARY_REGEX.test(cloudinaryUrl)) {
    return { success: false, reason: 'Not a Cloudinary URL' };
  }

  try {
    // Extract path from Cloudinary URL
    const objectPath = extractPathFromCloudinaryUrl(cloudinaryUrl);
    if (!objectPath) {
      return { success: false, reason: 'Could not extract path' };
    }

    // Download from Cloudinary (public URLs work without auth)
    console.log(`  📥 Downloading: ${objectPath}`);
    const { buffer, contentType } = await downloadFile(cloudinaryUrl);

    // Upload to MinIO
    console.log(`  📤 Uploading to MinIO: ${objectPath}`);
    const newUrl = await uploadToMinio(buffer, objectPath, contentType);

    return { success: true, newUrl, objectPath };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

/**
 * Migrate templates with Cloudinary URLs
 */
async function migrateTemplates() {
  console.log('\n📋 Finding templates with Cloudinary URLs...');

  const templates = await Template.find({
    $or: [
      { image_url: CLOUDINARY_REGEX },
      { video_url: CLOUDINARY_REGEX },
    ],
  });

  console.log(`Found ${templates.length} templates to migrate`);

  let successCount = 0;
  let failCount = 0;

  for (const template of templates) {
    console.log(`\n🖼️  Template ${template._id} (${template.subcategory}):`);

    let updated = false;

    // Migrate image_url
    if (template.image_url && CLOUDINARY_REGEX.test(template.image_url)) {
      const result = await migrateUrl(template.image_url);
      if (result.success) {
        template.image_url = result.newUrl;
        updated = true;
        console.log(`  ✅ Image migrated: ${result.objectPath}`);
      } else {
        console.log(`  ❌ Image failed: ${result.reason}`);
        failCount++;
      }
    }

    // Migrate video_url
    if (template.video_url && CLOUDINARY_REGEX.test(template.video_url)) {
      const result = await migrateUrl(template.video_url);
      if (result.success) {
        template.video_url = result.newUrl;
        updated = true;
        console.log(`  ✅ Video migrated: ${result.objectPath}`);
      } else {
        console.log(`  ❌ Video failed: ${result.reason}`);
        failCount++;
      }
    }

    // Save if updated
    if (updated) {
      await template.save();
      successCount++;
      console.log(`  💾 Saved to MongoDB`);
    }
  }

  return { total: templates.length, success: successCount, failed: failCount };
}

/**
 * Migrate user profile photos with Cloudinary URLs
 */
async function migrateUserPhotos() {
  console.log('\n👤 Finding users with Cloudinary profile photos...');

  const users = await User.find({
    profilePhotoUrl: CLOUDINARY_REGEX,
  });

  console.log(`Found ${users.length} users to migrate`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    console.log(`\n👤 User ${user._id} (${user.name}):`);

    const result = await migrateUrl(user.profilePhotoUrl);
    if (result.success) {
      user.profilePhotoUrl = result.newUrl;
      await user.save();
      successCount++;
      console.log(`  ✅ Profile photo migrated: ${result.objectPath}`);
      console.log(`  💾 Saved to MongoDB`);
    } else {
      console.log(`  ❌ Failed: ${result.reason}`);
      failCount++;
    }
  }

  return { total: users.length, success: successCount, failed: failCount };
}

/**
 * Verify no Cloudinary URLs remain
 */
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  const templatesWithCloudinary = await Template.countDocuments({
    $or: [
      { image_url: CLOUDINARY_REGEX },
      { video_url: CLOUDINARY_REGEX },
    ],
  });

  const usersWithCloudinary = await User.countDocuments({
    profilePhotoUrl: CLOUDINARY_REGEX,
  });

  console.log(`  Templates with Cloudinary URLs: ${templatesWithCloudinary}`);
  console.log(`  Users with Cloudinary URLs: ${usersWithCloudinary}`);

  return templatesWithCloudinary === 0 && usersWithCloudinary === 0;
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting Cloudinary to MinIO Migration\n');
  console.log('==========================================');

  try {
    // Connect to MongoDB
    await connectDB();

    // Migrate templates
    const templateResults = await migrateTemplates();

    // Migrate user photos
    const userResults = await migrateUserPhotos();

    // Print summary
    console.log('\n==========================================');
    console.log('📊 Migration Summary');
    console.log('==========================================');
    console.log(`Templates: ${templateResults.success}/${templateResults.total} migrated, ${templateResults.failed} failed`);
    console.log(`Users: ${userResults.success}/${userResults.total} migrated, ${userResults.failed} failed`);

    // Verify
    const allMigrated = await verifyMigration();

    if (allMigrated) {
      console.log('\n✅ Migration complete! All Cloudinary URLs have been replaced with MinIO URLs.');
    } else {
      console.log('\n⚠️  Some Cloudinary URLs remain. Please check the logs above for failures.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run migration
main();
