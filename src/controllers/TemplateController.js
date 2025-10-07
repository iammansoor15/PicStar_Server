import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import Template from '../models/Template.js';

class TemplateController {
// Upload image to Cloudinary and save metadata to MongoDB
  uploadAndSaveTemplate = async (req, res) => {
    try {
      // Accept subcategory as the primary field; fall back to legacy 'category'
      const subcategoryInput = req.body.subcategory || req.body.sub_category || req.body.category;
      if (!subcategoryInput) {
        return res.status(400).json({ success: false, error: 'Subcategory is required' });
      }
      // Optional main/sub categories (keep parsing for consistency)
      const mainCategoryRaw = typeof req.body.religion === 'string' ? req.body.religion : (typeof req.body.main_category === 'string' ? req.body.main_category : null);
      const subCategoryRaw = typeof req.body.subcategory === 'string' ? req.body.subcategory : (typeof req.body.sub_category === 'string' ? req.body.sub_category : null);
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
      }

      console.log('📤 Uploading image to Cloudinary...', {
        subcategory: subcategoryInput,
        filename: req.file.originalname,
        size: req.file.size
      });
      // Debug incoming text fields
      try {
        console.log('📝 Multipart fields received:', Object.keys(req.body || {}));
        if (req.body?.photo_container_axis) {
          console.log('🧭 photo_container_axis (raw):', req.body.photo_container_axis);
        }
        if (req.body?.photo_x || req.body?.photo_y) {
          console.log('🧭 photo_x/photo_y:', req.body.photo_x, req.body.photo_y);
        }
      } catch {}

// Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: `narayana_templates/${String(subcategoryInput).toLowerCase().trim()}`,
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

      const normalizedMain = mainCategoryRaw ? String(mainCategoryRaw).toLowerCase().trim() : null;
      const normalizedSub = (subCategoryRaw || subcategoryInput) ? String(subCategoryRaw || subcategoryInput).toLowerCase().trim() : null;

      // Parse optional axes from multipart fields
      let photoAxis = { x: 0, y: 0 };
      let textAxis = { x: 0, y: 0 };
      try {
        // Photo axis (JSON or flat fields)
        if (typeof req.body.photo_container_axis === 'string') {
          const parsed = JSON.parse(req.body.photo_container_axis);
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            photoAxis = { x: Number(parsed.x), y: Number(parsed.y) };
          }
        } else if (req.body.photo_x !== undefined && req.body.photo_y !== undefined) {
          const x = Number(req.body.photo_x);
          const y = Number(req.body.photo_y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            photoAxis = { x, y };
          }
        }
        // Text axis (JSON or flat fields)
        if (typeof req.body.text_container_axis === 'string') {
          const tParsed = JSON.parse(req.body.text_container_axis);
          if (Number.isFinite(tParsed.x) && Number.isFinite(tParsed.y)) {
            textAxis = { x: Number(tParsed.x), y: Number(tParsed.y) };
          }
        } else if (req.body.text_x !== undefined && req.body.text_y !== undefined) {
          const tx = Number(req.body.text_x);
          const ty = Number(req.body.text_y);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            textAxis = { x: tx, y: ty };
          }
        }
      } catch (e) {
        console.warn('Invalid axis provided, using defaults. Error:', e?.message || e);
      }

      // Persist to MongoDB (serial_no auto-increments per subcategory)
      const doc = await Template.create({
        image_url: uploadResult.secure_url,
        main_category: normalizedMain,
        subcategory: normalizedSub,
        photo_container_axis: photoAxis,
        text_container_axis: textAxis,
      });

      return res.status(201).json({
        success: true,
        data: {
          image_url: doc.image_url,
          serial_no: doc.serial_no,
          // Back-compat: include 'category' mirroring subcategory
          category: doc.subcategory,
          subcategory: doc.subcategory,
          main_category: doc.main_category,
          created_at: doc.created_at,
          photo_container_axis: doc.photo_container_axis,
          text_container_axis: doc.text_container_axis,
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
      // New: accept main + sub for filtering
      const { religion, main_category, subcategory, sub_category } = req.query;

      const normalizedCategory = category ? String(category).toLowerCase().trim() : null;
      // Support multiple religions via comma list
      const mainRaw = (religion || main_category) ? String(religion || main_category) : null;
      let normalizedMain = null;
      let normalizedMains = [];
      if (mainRaw) {
        const parts = mainRaw.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
        if (parts.length > 1) normalizedMains = parts;
        else normalizedMain = parts[0];
      }
      const normalizedSub = (subcategory || sub_category) ? String(subcategory || sub_category).toLowerCase().trim() : null;

      const lim = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const pg = Math.max(1, parseInt(page) || 1);

      // Build filter allowing any combination; fallback compatibility for legacy docs
      const andConds = [];
      if (normalizedCategory) {
        // Treat 'category' query as subcategory filter for new docs, with legacy fallback
        andConds.push({ $or: [ { subcategory: normalizedCategory }, { category: normalizedCategory } ] });
      }
      if (normalizedMains && normalizedMains.length > 0) {
        andConds.push({ main_category: { $in: normalizedMains } });
      } else if (normalizedMain) {
        andConds.push({ main_category: normalizedMain });
      }
      if (normalizedSub) {
        // Match either explicit subcategory field or legacy category field
        andConds.push({ $or: [ { subcategory: normalizedSub }, { category: normalizedSub } ] });
      }
      const filter = andConds.length > 0 ? { $and: andConds } : {};

      const total = await Template.countDocuments(filter);
      const templatesRaw = await Template.find(filter)
        .sort({ serial_no: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .lean();

      // Back-compat: ensure 'category' mirrors 'subcategory' in response objects
      const templates = templatesRaw.map(t => ({
        ...t,
        category: t.subcategory || t.category || null,
      }));

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

      const normalized = category.toLowerCase().trim();
      const templateRaw = await Template.findOne({ $or: [ { subcategory: normalized }, { category: normalized } ] }).sort({ serial_no: -1 }).lean();
      const template = templateRaw ? { ...templateRaw, category: templateRaw.subcategory || templateRaw.category || null } : null;
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
      const normalized = String(category).toLowerCase().trim();
      const serialNo = Number(serial);
      if (!Number.isFinite(serialNo) || serialNo <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid serial number' });
      }
      const templateRaw = await Template.findOne({ serial_no: serialNo, $or: [ { subcategory: normalized }, { category: normalized } ] }).lean();
      if (!templateRaw) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }
      const template = { ...templateRaw, category: templateRaw.subcategory || templateRaw.category || null };
      return res.json({ success: true, data: template });
    } catch (error) {
      console.error('❌ Error in getBySerial:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to fetch template by serial' });
    }
  }
}

export default new TemplateController();
