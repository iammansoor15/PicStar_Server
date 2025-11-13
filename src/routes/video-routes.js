import express from 'express';
import multer from 'multer';
import path from 'path';
import videoController from '../controllers/video-controller.js';

const router = express.Router();

// Configure multer for video uploads (disk storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const allowedVideo = /mp4|mov|m4v|webm|mkv|avi|mpeg|mpg/;
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const extOk = allowedVideo.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = /^video\//.test(file.mimetype) || allowedVideo.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only video files are allowed (mp4, mov, m4v, webm, mkv, avi, mpeg)'));
  },
});

// Health for videos API
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'videos', timestamp: new Date().toISOString() });
});

// POST /api/videos/upload - field name: "video"
router.post('/upload', upload.single('video'), (req, res, next) => videoController.upload(req, res, next));

// POST /api/videos/composite - composite video with overlays
router.post('/composite', (req, res, next) => videoController.composite(req, res, next));

export default router;
