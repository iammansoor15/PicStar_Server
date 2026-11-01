import express from 'express';
import multer from 'multer';
import path from 'path';
import videoController from '../controllers/video-controller.js';
import mongoose from 'mongoose';
import Template from '../models/Template.js';
import { videoMedia } from '../services/video-media-service.js';

const router = express.Router();
router.use(videoMedia.middleware);

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

router.get('/:id/playback', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, error: 'Video not found' });
  try {
    const template = await Template.findOne({ _id: req.params.id, resource_type: 'video' }).lean();
    if (!template) return res.status(404).json({ success: false, error: 'Video not found' });
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: { template } });
  } catch {
    return res.status(503).json({ success: false, error: 'Video is temporarily unavailable' });
  }
});

// POST /api/videos/upload - field name: "video"
router.post('/upload', upload.single('video'), (req, res, next) => videoController.upload(req, res, next));

// POST /api/videos/upload-photo - upload photo overlay (no multer, uses base64)
router.post('/upload-photo', (req, res, next) => videoController.uploadPhoto(req, res, next));

// POST /api/videos/composite - composite video with overlays
router.post('/composite', (req, res, next) => videoController.composite(req, res, next));

export default router;
