import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import Template from '../models/Template.js';

const execPromise = promisify(exec);

// Crop image using FFmpeg
async function cropImageWithFFmpeg(inputPath, cropParams) {
  const { crop_x, crop_y, crop_w, crop_h, preview_w, preview_h } = cropParams;

  // Parse values
  const cx = parseInt(crop_x, 10) || 0;
  const cy = parseInt(crop_y, 10) || 0;
  const cw = parseInt(crop_w, 10);
  const ch = parseInt(crop_h, 10);
  const pw = parseInt(preview_w, 10);
  const ph = parseInt(preview_h, 10);

  console.log('✂️ Crop parameters received:', { cx, cy, cw, ch, pw, ph });

  if (!cw || !ch || !pw || !ph || cw <= 0 || ch <= 0 || pw <= 0 || ph <= 0) {
    console.log('⚠️ Invalid crop parameters, skipping crop');
    return inputPath;
  }

  console.log('✂️ Cropping image with FFmpeg...');
  console.log(`   Preview dimensions: ${pw}x${ph}`);
  console.log(`   Crop area: ${cw}x${ch} at (${cx},${cy})`);

  try {
    // Get original image dimensions using FFprobe (use -show_streams for images)
    const probeCmd = `ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "${inputPath}"`;
    console.log(`   Probe command: ${probeCmd}`);
    const { stdout: probeOut, stderr: probeErr } = await execPromise(probeCmd);
    console.log(`   Probe output: "${probeOut.trim()}"`, probeErr ? `stderr: ${probeErr}` : '');

    const dimensions = probeOut.trim().split('\n')[0]; // Take first line
    const [origW, origH] = dimensions.split('x').map(Number);

    if (!origW || !origH) {
      console.log('⚠️ Could not get image dimensions, skipping crop');
      return inputPath;
    }

    console.log(`   Original image: ${origW}x${origH}`);

    // Scale crop coordinates from preview to original image
    const scaleX = origW / pw;
    const scaleY = origH / ph;
    const realX = Math.max(0, Math.round(cx * scaleX));
    const realY = Math.max(0, Math.round(cy * scaleY));
    let realW = Math.round(cw * scaleX);
    let realH = Math.round(ch * scaleY);

    // Ensure crop doesn't exceed image bounds
    if (realX + realW > origW) realW = origW - realX;
    if (realY + realH > origH) realH = origH - realY;

    console.log(`   Scale factors: X=${scaleX.toFixed(2)}, Y=${scaleY.toFixed(2)}`);
    console.log(`   Scaled crop: ${realW}x${realH} at (${realX},${realY})`);

    // Create output path
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_cropped${ext}`);

    // Run FFmpeg crop
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -vf "crop=${realW}:${realH}:${realX}:${realY}" -y "${outputPath}"`;
    console.log(`   FFmpeg command: ${ffmpegCmd}`);

    const { stdout: ffOut, stderr: ffErr } = await execPromise(ffmpegCmd);
    if (ffErr) console.log(`   FFmpeg stderr: ${ffErr.substring(0, 200)}`);

    // Verify output file exists
    if (!fs.existsSync(outputPath)) {
      console.log('❌ Cropped file was not created, using original');
      return inputPath;
    }

    const origSize = fs.statSync(inputPath).size;
    const croppedSize = fs.statSync(outputPath).size;
    console.log(`✅ Image cropped successfully (${origSize} -> ${croppedSize} bytes)`);

    // Delete original, return cropped path
    try { fs.unlinkSync(inputPath); } catch {}

    return outputPath;
  } catch (err) {
    console.error('❌ Crop error:', err.message);
    return inputPath;
  }
}


// Best-effort derive Cloudinary public_id from a secure_url
function derivePublicIdFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('upload');
    if (idx === -1) return null;
    let start = idx + 1;
    if (parts[start] && /^v\d+$/.test(parts[start])) start++;
    const pathParts = parts.slice(start);
    if (pathParts.length === 0) return null;
    const last = pathParts[pathParts.length - 1];
    const dot = last.lastIndexOf('.');
    pathParts[pathParts.length - 1] = dot > 0 ? last.substring(0, dot) : last;
    return pathParts.join('/');
  } catch {
    return null;
  }
}

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

      // Check if crop is requested
      let filePathToUpload = req.file.path;
      console.log('📐 Crop fields:', {
        crop_x: req.body.crop_x,
        crop_y: req.body.crop_y,
        crop_w: req.body.crop_w,
        crop_h: req.body.crop_h,
        preview_w: req.body.preview_w,
        preview_h: req.body.preview_h,
      });
      const hasCrop = req.body.crop_w && req.body.crop_h && req.body.preview_w && req.body.preview_h;
      console.log('📐 hasCrop:', hasCrop);

      if (hasCrop) {
        try {
          filePathToUpload = await cropImageWithFFmpeg(req.file.path, {
            crop_x: req.body.crop_x,
            crop_y: req.body.crop_y,
            crop_w: req.body.crop_w,
            crop_h: req.body.crop_h,
            preview_w: req.body.preview_w,
            preview_h: req.body.preview_h,
          });
        } catch (cropErr) {
          console.error('❌ Crop failed, using original:', cropErr.message);
          filePathToUpload = req.file.path;
        }
      }

      // Upload to Cloudinary (skip auto-crop transformation if we already cropped)
      const uploadOptions = {
        folder: `narayana_templates/${String(subcategoryInput).toLowerCase().trim()}`,
        resource_type: 'image',
      };

      // Only apply auto-crop if we didn't manually crop
      if (!hasCrop) {
        uploadOptions.transformation = [{ aspect_ratio: '9:16', crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto' }];
      } else {
        uploadOptions.transformation = [{ quality: 'auto', fetch_format: 'auto' }];
      }

      const uploadResult = await cloudinary.uploader.upload(filePathToUpload, uploadOptions);

      console.log('✅ Image uploaded to Cloudinary:', uploadResult.secure_url);

      // Clean up temporary file(s)
      try {
        fs.unlinkSync(filePathToUpload);
      } catch (err) {
        console.warn('Failed to delete temp file:', err);
      }
      // Also try to delete original if it's different
      if (filePathToUpload !== req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }

      const normalizedMain = mainCategoryRaw ? String(mainCategoryRaw).toLowerCase().trim() : null;
      const normalizedSub = (subCategoryRaw || subcategoryInput) ? String(subCategoryRaw || subcategoryInput).toLowerCase().trim() : null;

      // Parse optional axes and sizes from multipart fields
      // Default sizes match app: photo 100x100 (square), text 120x50
      // Photo constraints: min 60, max 200 (square)
      // Text constraints: min 80x40, max 80%x60% of container
      let photoAxis = { x: 0, y: 0, width: 100, height: 100 };
      let textAxis = { x: 0, y: 0, width: 120, height: 50 };
      try {
        // Photo axis (JSON or flat fields)
        if (typeof req.body.photo_container_axis === 'string') {
          const parsed = JSON.parse(req.body.photo_container_axis);
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            photoAxis.x = Number(parsed.x);
            photoAxis.y = Number(parsed.y);
          }
          if (Number.isFinite(parsed.width)) photoAxis.width = Number(parsed.width);
          if (Number.isFinite(parsed.height)) photoAxis.height = Number(parsed.height);
        } else if (req.body.photo_x !== undefined && req.body.photo_y !== undefined) {
          const x = Number(req.body.photo_x);
          const y = Number(req.body.photo_y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            photoAxis.x = x;
            photoAxis.y = y;
          }
        }
        // Photo size (flat fields)
        if (req.body.photo_w !== undefined) {
          const w = Number(req.body.photo_w);
          // Enforce app constraints: min 60, max 200
          if (Number.isFinite(w)) {
            photoAxis.width = Math.max(60, Math.min(200, w));
            photoAxis.height = photoAxis.width; // Keep square
          }
        }
        if (req.body.photo_h !== undefined) {
          const h = Number(req.body.photo_h);
          if (Number.isFinite(h)) {
            photoAxis.height = Math.max(60, Math.min(200, h));
            photoAxis.width = photoAxis.height; // Keep square
          }
        }

        // Text axis (JSON or flat fields)
        if (typeof req.body.text_container_axis === 'string') {
          const tParsed = JSON.parse(req.body.text_container_axis);
          if (Number.isFinite(tParsed.x) && Number.isFinite(tParsed.y)) {
            textAxis.x = Number(tParsed.x);
            textAxis.y = Number(tParsed.y);
          }
          if (Number.isFinite(tParsed.width)) textAxis.width = Number(tParsed.width);
          if (Number.isFinite(tParsed.height)) textAxis.height = Number(tParsed.height);
        } else if (req.body.text_x !== undefined && req.body.text_y !== undefined) {
          const tx = Number(req.body.text_x);
          const ty = Number(req.body.text_y);
          if (Number.isFinite(tx) && Number.isFinite(ty)) {
            textAxis.x = tx;
            textAxis.y = ty;
          }
        }
        // Text size (flat fields) - min 80x40 from app constraints
        if (req.body.text_w !== undefined) {
          const w = Number(req.body.text_w);
          if (Number.isFinite(w)) {
            textAxis.width = Math.max(80, w); // min 80
          }
        }
        if (req.body.text_h !== undefined) {
          const h = Number(req.body.text_h);
          if (Number.isFinite(h)) {
            textAxis.height = Math.max(40, h); // min 40
          }
        }
      } catch (e) {
        console.warn('Invalid axis provided, using defaults. Error:', e?.message || e);
      }

      // Parse reference dimensions (for pixel-perfect app scaling)
      // Default: 270x480 (9:16 aspect ratio) - matches website editor
      let coordRef = { width: 270, height: 480 };
      try {
        if (req.body.reference_w !== undefined) {
          const w = Number(req.body.reference_w);
          if (Number.isFinite(w) && w > 0) coordRef.width = w;
        }
        if (req.body.reference_h !== undefined) {
          const h = Number(req.body.reference_h);
          if (Number.isFinite(h) && h > 0) coordRef.height = h;
        }
      } catch (e) {
        console.warn('Invalid reference dimensions, using defaults');
      }

      // Persist to MongoDB (serial_no auto-increments per subcategory)
      const doc = await Template.create({
        image_url: uploadResult.secure_url,
        main_category: normalizedMain,
        subcategory: normalizedSub,
        photo_container_axis: photoAxis,
        text_container_axis: textAxis,
        coordinate_reference: coordRef,
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
          coordinate_reference: doc.coordinate_reference,
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

  // Batch fetch by subcategory/main with ordered serial_no and optional start/limit
  // New non-breaking endpoint: GET /api/templates/batch
  // Query params:
  // - subcategory or category (legacy)
  // - religion or main_category (optional)
  // - start_serial (default 1)
  // - limit (default 5)
  // - order (asc|desc, default asc)
  batchBySubcategory = async (req, res) => {
    try {
      const { subcategory, sub_category, category, religion, main_category } = req.query || {};
      const sub = (subcategory || sub_category || category || '').toString().toLowerCase().trim();
      const main = (religion || main_category || '').toString().toLowerCase().trim();
      if (!sub) {
        return res.status(400).json({ success: false, error: 'subcategory is required' });
      }
      const startSerialRaw = req.query?.start_serial ?? req.query?.startSerial ?? 1;
      const limitRaw = req.query?.limit ?? 5;
      const order = (req.query?.order || 'asc').toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
      const startSerial = Math.max(1, parseInt(startSerialRaw, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 5));

      // Build filter with legacy compatibility for subcategory matching
      const andConds = [ { $or: [ { subcategory: sub }, { category: sub } ] } ];
      if (main) andConds.push({ main_category: main });
      // Restrict serial range to reduce scan and ensure deterministic slice
      andConds.push({ serial_no: { $gte: startSerial, $lt: startSerial + limit + 1000 } }); // generous upper window
      const filter = { $and: andConds };

      const sort = { serial_no: order === 'desc' ? -1 : 1 };
      // Fetch up to a larger window then trim to the exact [startSerial..startSerial+limit-1]
      const docs = await Template.find(filter)
        .sort(sort)
        .limit(limit * 3) // overfetch to account for gaps in serials
        .lean();

      const wantedSet = new Set(Array.from({ length: limit }, (_, i) => startSerial + i));
      const picked = [];
      for (const d of docs) {
        const sn = Number(d?.serial_no);
        if (wantedSet.has(sn)) picked.push(d);
        if (picked.length >= limit) break;
      }

      // Shape response to include combination requested
      // Include photo/text axis and coordinate_reference for pixel-perfect positioning
      const items = picked.map(t => ({
        category: t.main_category ?? null,
        subcategory: t.subcategory || t.category || null,
        image_url: t.image_url,
        video_url: t.video_url || null,
        resource_type: t.resource_type || 'image',
        serial_no: t.serial_no,
        photo_container_axis: t.photo_container_axis || { x: 0, y: 0, width: 100, height: 100 },
        text_container_axis: t.text_container_axis || { x: 0, y: 0, width: 120, height: 50 },
        coordinate_reference: t.coordinate_reference || { width: 270, height: 480 },
      }));

      return res.json({ success: true, data: { templates: items, meta: { subcategory: sub, main_category: main || null, start_serial: startSerial, limit, order } } });
    } catch (error) {
      console.error('❌ Error in batchBySubcategory:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Failed to fetch batch' });
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

      const normalized = String(category).toLowerCase().trim();
      // Support both main and subcategory lookups to be flexible with client usage.
      // Order by serial_no desc to get the newest.
      const templateRaw = await Template.findOne({
        $or: [
          { main_category: normalized }, // e.g., hindu, muslim, christian
          { subcategory: normalized },    // e.g., congratulations, birthday
          { category: normalized }        // legacy fallback
        ]
      }).sort({ serial_no: -1 }).lean();

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

  // List by main (MongoDB)
  listByMain = async (req, res) => {
    try {
      const main = String(req.params.main || '').toLowerCase().trim();
      if (!main) return res.status(400).json({ success: false, error: 'main category is required' });

      const lim = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
      const pg = Math.max(1, parseInt(req.query.page) || 1);

      const filter = { main_category: main };

      const total = await Template.countDocuments(filter);
      const templatesRaw = await Template.find(filter)
        .sort({ serial_no: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .lean();

      const templates = templatesRaw.map(t => ({ ...t, category: t.subcategory || t.category || null }));

      return res.json({
        success: true,
        data: {
          templates,
          pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) }
        }
      });
    } catch (error) {
      console.error('❌ Error in listByMain:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Failed to list templates by main category' });
    }
  }

  // List by main + subcategory (MongoDB)
  listByMainAndSub = async (req, res) => {
    try {
      const main = String(req.params.main || '').toLowerCase().trim();
      const sub = String(req.params.sub || '').toLowerCase().trim();
      if (!main || !sub) return res.status(400).json({ success: false, error: 'main and subcategory are required' });

      const lim = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
      const pg = Math.max(1, parseInt(req.query.page) || 1);

      const filter = {
        main_category: main,
        $or: [ { subcategory: sub }, { category: sub } ],
      };

      const total = await Template.countDocuments(filter);
      const templatesRaw = await Template.find(filter)
        .sort({ serial_no: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .lean();

      const templates = templatesRaw.map(t => ({ ...t, category: t.subcategory || t.category || null }));

      return res.json({
        success: true,
        data: {
          templates,
          pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) }
        }
      });
    } catch (error) {
      console.error('❌ Error in listByMainAndSub:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Failed to list templates by main and subcategory' });
    }
  }

  // Latest by main + subcategory (MongoDB)
  getLatestByMainAndSub = async (req, res) => {
    try {
      const { main, sub } = req.params;
      if (!main || !sub) {
        return res.status(400).json({ success: false, error: 'main and sub are required' });
      }
      const m = String(main).toLowerCase().trim();
      const s = String(sub).toLowerCase().trim();
      const templateRaw = await Template.findOne({
        main_category: m,
        $or: [ { subcategory: s }, { category: s } ] // legacy fallback
      }).sort({ serial_no: -1 }).lean();
      const template = templateRaw ? { ...templateRaw, category: templateRaw.subcategory || templateRaw.category || null } : null;
      return res.json({ success: true, data: { template } });
    } catch (error) {
      console.error('❌ Error in getLatestByMainAndSub:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to get latest by main and subcategory' });
    }
  }

  // GET /api/templates/categories - Get distinct subcategories from database
  getDistinctCategories = async (req, res) => {
    try {
      // Get distinct subcategories from templates collection
      const subcategories = await Template.distinct('subcategory');

      // Filter out null/empty values and normalize
      const validSubcategories = subcategories
        .filter(s => s && typeof s === 'string' && s.trim())
        .map(s => s.toLowerCase().trim())
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique
        .sort();

      // Format as category objects with key and label (no icons)
      const categories = validSubcategories.map(sub => ({
        key: sub,
        label: sub.charAt(0).toUpperCase() + sub.slice(1), // Capitalize first letter
      }));

      return res.json({
        success: true,
        data: {
          categories,
          total: categories.length
        }
      });
    } catch (error) {
      console.error('❌ Error in getDistinctCategories:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get categories'
      });
    }
  }

  // DELETE /api/templates/:id - delete a template (DB) and try to remove from Cloudinary
  deleteTemplate = async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      const doc = await Template.findById(id).lean();
      if (!doc) return res.status(404).json({ success: false, error: 'Template not found' });

      // Attempt Cloudinary deletion (best-effort)
      try {
        const url = doc.image_url || doc.video_url || '';
        const publicId = derivePublicIdFromUrl(url);
        if (publicId) {
          await cloudinary.api.delete_resources([publicId]);
        }
      } catch (e) {
        console.warn('Cloudinary delete failed (continuing):', e?.message || e);
      }

      await Template.findByIdAndDelete(id);
      return res.json({ success: true, data: { id } });
    } catch (error) {
      console.error('❌ Error in deleteTemplate:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Failed to delete template' });
    }
  }
}

export default new TemplateController();
