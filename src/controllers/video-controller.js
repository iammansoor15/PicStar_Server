import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import Template from '../models/Template.js';

class VideoController {
  // POST /api/videos/upload
  async upload(req, res) {
    try {
      // Accept subcategory as primary
      const subcategoryInput = req.body.subcategory || req.body.sub_category || req.body.category;
      if (!subcategoryInput) {
        return res.status(400).json({ success: false, error: 'Subcategory is required' });
      }
      // Optional main category
      const mainCategoryRaw = typeof req.body.main_category === 'string' ? req.body.main_category : (typeof req.body.religion === 'string' ? req.body.religion : null);

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No video file provided' });
      }

      console.log('📤 Uploading video to Cloudinary...', {
        subcategory: subcategoryInput,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      // Upload video to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: `narayana_templates/${String(subcategoryInput).toLowerCase().trim()}`,
        resource_type: 'video',
      });

      console.log('✅ Video uploaded to Cloudinary:', uploadResult.secure_url);

      // Cleanup temp file
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

      const normalizedMain = mainCategoryRaw ? String(mainCategoryRaw).toLowerCase().trim() : null;
      const normalizedSub = String(subcategoryInput).toLowerCase().trim();

      // Persist to MongoDB
      const doc = await Template.create({
        image_url: uploadResult.secure_url, // keep required field populated
        video_url: uploadResult.secure_url,
        resource_type: 'video',
        main_category: normalizedMain,
        subcategory: normalizedSub,
        // videos don't use axes (default 0,0 preserved)
      });

      return res.status(201).json({
        success: true,
        data: {
          video_url: doc.video_url,
          image_url: doc.image_url,
          resource_type: doc.resource_type,
          serial_no: doc.serial_no,
          category: doc.subcategory, // back-compat
          subcategory: doc.subcategory,
          main_category: doc.main_category,
          created_at: doc.created_at,
        }
      });
    } catch (error) {
      console.error('❌ Error uploading video:', error);
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(500).json({ success: false, error: error.message || 'Failed to upload video' });
    }
  }
}

export default new VideoController();