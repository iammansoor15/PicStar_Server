import express from 'express';
import multer from 'multer';
import path from 'path';
import TemplateController from '../controllers/TemplateController.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'));
    }
  }
});

// Health for templates API (used by mobile probes)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'templates', timestamp: new Date().toISOString() });
});

// POST /api/templates/upload - Upload image to Cloudinary
router.post('/upload', upload.single('image'), TemplateController.uploadAndSaveTemplate);

// GET /api/templates - List all templates (with optional category filter)
router.get('/', TemplateController.listTemplates);

// GET /api/templates/latest/:category - Get latest template for a category
router.get('/latest/:category', TemplateController.getLatestTemplate);

// GET /api/templates/by-serial/:category/:serial - Get a template by category and serial number
router.get('/by-serial/:category/:serial', TemplateController.getBySerial);

export default router;
