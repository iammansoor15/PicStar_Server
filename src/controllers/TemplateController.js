import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import Template from '../models/Template.js';

class TemplateController {
// Upload image to Cloudinary and save metadata to MongoDB
  uploadAndSaveTemplate = async (req, res) => {
    try {
      const { category } = req.body;
      if (!category) {
        return res.status(400).json({ success: false, error: 'Category is required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
      }

      console.log('📤 Uploading image to Cloudinary...', {
        category,
        filename: req.file.originalname,
        size: req.file.size
      });

// Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: `narayana_templates/${category}`,
        resource_type: 'image',
        transformation: [{ aspect_ratio: '9:16', crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto' }]
      });

      console.log('✅ Image uploaded to Cloudinary:', uploadResult.secure_url);

      // Clean up temporary file
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.warn('Failed to delete temp file:', err);
      }

      const normalizedCategory = category.toLowerCase().trim();

      // Persist to MongoDB (serial_no auto-increments per category)
      const doc = await Template.create({
        image_url: uploadResult.secure_url,
        category: normalizedCategory,
      });

      return res.status(201).json({
        success: true,
        data: {
          image_url: doc.image_url,
          serial_no: doc.serial_no,
          category: doc.category,
          created_at: doc.created_at,
        }
      });
    } catch (error) {
      console.error('❌ Error in uploadAndSaveTemplate:', error);
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(500).json({ success: false, error: error.message || 'Failed to upload and save template' });
    }
  }

// Get all templates or filter by category (from MongoDB)
  listTemplates = async (req, res) => {
    try {
      const { category, limit = 20, page = 1 } = req.query;

      const normalizedCategory = category ? category.toLowerCase().trim() : null;
      const lim = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const pg = Math.max(1, parseInt(page) || 1);

const filter = normalizedCategory ? { category: normalizedCategory } : {};
      const total = await Template.countDocuments(filter);
      const templates = await Template.find(filter)
        .sort({ serial_no: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .lean();

      return res.json({
        success: true,
        data: {
          templates,
          pagination: {
            page: pg,
            limit: lim,
            total,
            pages: Math.ceil(total / lim)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error in listTemplates:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to list templates'
      });
    }
  }

// Get latest template for a category (from MongoDB)
  getLatestTemplate = async (req, res) => {
    try {
      const { category } = req.params;

      if (!category) {
        return res.status(400).json({
          success: false,
          error: 'Category is required'
        });
      }

const normalizedCategory = category.toLowerCase().trim();
      const template = await Template.findOne({ category: normalizedCategory }).sort({ serial_no: -1 }).lean();
      return res.json({ success: true, data: { template } });

    } catch (error) {
      console.error('❌ Error in getLatestTemplate:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get latest template'
      });
    }
  }

  // Get template by category and serial number (from MongoDB)
  getBySerial = async (req, res) => {
    try {
      const { category, serial } = req.params;
      if (!category || !serial) {
        return res.status(400).json({ success: false, error: 'Category and serial are required' });
      }
      const normalizedCategory = String(category).toLowerCase().trim();
      const serialNo = Number(serial);
      if (!Number.isFinite(serialNo) || serialNo <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid serial number' });
      }
      const template = await Template.findOne({ category: normalizedCategory, serial_no: serialNo }).lean();
      if (!template) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }
      return res.json({ success: true, data: template });
    } catch (error) {
      console.error('❌ Error in getBySerial:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch template by serial' });
    }
  }
}

export default new TemplateController();
