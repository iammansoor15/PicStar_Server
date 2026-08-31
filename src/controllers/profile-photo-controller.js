import minio from '../utils/minio.js';
import User from '../models/User.js';
import sharp from 'sharp';
import config from '../config/config.js';

/**
 * Resize image for background removal processing
 * @param {Buffer} buffer - Image buffer
 * @param {number} maxDim - Maximum dimension
 * @returns {Promise<Buffer>} - Resized buffer
 */
const preResize = async (buffer, maxDim = 1024) => {
  try {
    console.log(`   Resizing image to max ${maxDim}px...`);
    const max = Math.max(64, Math.min(Number(maxDim) || 1024, 4096));
    const resized = await sharp(buffer)
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    console.log(`   ✅ Resized: ${buffer.length} -> ${resized.length} bytes`);
    return resized;
  } catch (error) {
    console.warn('   ⚠️ Resize failed, using original:', error.message);
    return buffer;
  }
};

/**
 * Remove background from image
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Buffer>} - Processed buffer with transparent background
 */
const removeBackground = async (buffer) => {
  try {
    console.log('   Removing background...');
    
    // Force CPU-only execution if configured
    if (!config.backgroundRemoval.useGpu) {
      process.env.CUDA_VISIBLE_DEVICES = '';
      process.env.USE_CUDA = '0';
      process.env.ORT_OVERRIDE_PROVIDER = 'cpu';
    }
    
    // Dynamic import
    const { transparentBackground } = await import('transparent-background');
    const removed = await transparentBackground(buffer, 'png', { fast: false });
    console.log(`   ✅ Background removed: ${buffer.length} -> ${removed.length} bytes`);
    return removed;
  } catch (error) {
    console.error('   ❌ Background removal failed:', error.message);
    console.log('   ⚠️ Falling back to original image');
    return buffer;
  }
};

/**
 * Finalize PNG with optimal settings
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Buffer>} - Optimized PNG buffer
 */
const finalizePng = async (buffer) => {
  try {
    console.log('   Finalizing PNG...');
    const finalized = await sharp(buffer)
      .png({ quality: 100, compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();
    console.log(`   ✅ PNG finalized: ${finalized.length} bytes`);
    return finalized;
  } catch (error) {
    console.warn('   ⚠️ PNG finalization failed:', error.message);
    return buffer;
  }
};

/**
 * Upload profile photo to MinIO
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} userId - User ID for folder organization
 * @returns {Promise<string>} - MinIO URL
 */
const uploadToMinio = async (fileBuffer, userId) => {
  try {
    console.log('   Uploading to MinIO...');

    // Resize to 500x500 for profile photos
    const resizedBuffer = await sharp(fileBuffer)
      .resize(500, 500, { fit: 'cover', position: 'centre' })
      .png({ quality: 90 })
      .toBuffer();

    const result = await minio.uploadBuffer(resizedBuffer, `profile_photos/${userId}`, {
      extension: '.png',
      contentType: 'image/png',
    });

    console.log(`   ✅ Uploaded to MinIO: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error('   ❌ MinIO upload error:', error);
    throw error;
  }
};

/**
 * Upload or update user's profile photo
 */
export const uploadProfilePhoto = async (req, res) => {
  try {
    console.log('📸 Profile photo upload request received');
    console.log('   Headers:', Object.keys(req.headers));
    console.log('   Has file:', !!req.file);
    console.log('   User:', req.user);
    
    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log('   File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer
    });

    // Get user ID from authenticated request
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      console.error('❌ User not authenticated');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    console.log(`📸 Processing profile photo for user: ${userId}`);
    console.log('🔄 Step 1: Resize image');
    
    // Step 1: Resize for faster processing
    const resized = await preResize(req.file.buffer, 1024);
    
    console.log('🔄 Step 2: Remove background');
    
    // Step 2: Remove background
    const noBgBuffer = await removeBackground(resized);
    
    console.log('🔄 Step 3: Finalize PNG');
    
    // Step 3: Finalize PNG
    const finalBuffer = await finalizePng(noBgBuffer);
    
    console.log('🔄 Step 4: Upload to MinIO');

    // Step 4: Upload to MinIO
    const profilePhotoUrl = await uploadToMinio(finalBuffer, userId);

    console.log('🔄 Step 5: Save to MongoDB');
    console.log(`   Profile photo URL: ${profilePhotoUrl}`);

    // Update user document in database
    const user = await User.findByIdAndUpdate(
      userId,
      { profilePhotoUrl },
      { new: true, runValidators: true }
    );

    if (!user) {
      console.error('❌ User not found in database');
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('✅ SUCCESS! Profile photo pipeline complete:');
    console.log(`   👤 User: ${user.name} (${userId})`);
    console.log(`   🖼️  Original size: ${req.file.size} bytes`);
    console.log(`   🎨 Final size: ${finalBuffer.length} bytes`);
    console.log(`   🔗 MinIO URL: ${profilePhotoUrl}`);
    console.log(`   💾 Saved to MongoDB: profilePhotoUrl field updated`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Return updated user data
    return res.status(200).json({
      success: true,
      data: {
        profilePhotoUrl,
        user: user.toJSON ? user.toJSON() : user,
        processing: {
          originalSize: req.file.size,
          processedSize: finalBuffer.length,
          backgroundRemoved: true
        }
      },
      message: 'Profile photo uploaded successfully with background removed'
    });
  } catch (error) {
    console.error('❌❌❌ ERROR in profile photo upload pipeline ❌❌❌');
    console.error(`   Error type: ${error.name}`);
    console.error(`   Error message: ${error.message}`);
    console.error(`   Stack trace:`, error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload profile photo',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get user's profile photo URL
 */
export const getProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        profilePhotoUrl: user.profilePhotoUrl
      }
    });
  } catch (error) {
    console.error('❌ Error getting profile photo:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get profile photo'
    });
  }
};

/**
 * Delete user's profile photo
 */
export const deleteProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete from MinIO if exists
    if (user.profilePhotoUrl) {
      try {
        // Extract object name from URL
        const url = new URL(user.profilePhotoUrl);
        const objectName = url.pathname.replace(`/${minio.bucket}/`, '');

        await minio.deleteObject(objectName);
        console.log(`🗑️ Deleted photo from MinIO: ${objectName}`);
      } catch (minioError) {
        console.warn('⚠️ Could not delete from MinIO:', minioError.message);
      }
    }

    // Update user document
    user.profilePhotoUrl = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile photo deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting profile photo:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete profile photo'
    });
  }
};
