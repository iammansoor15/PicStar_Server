import express from 'express';
import { logger } from '../middleware/logger.js';
import { upload } from '../middleware/upload.js';
import { uploadRateLimiter } from '../middleware/rate-limit.js';
import { processImage, processBatch } from '../controllers/image-controller.js';
import cleanupService from '../utils/cleanup-service.js';
import keepAliveService from '../utils/keep-alive-service.js';

const router = express.Router();

// Health check endpoint for connectivity testing
router.get('/health', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.ip;
  const userAgent = req.get('User-Agent');
  logger.info('Mobile device health check', { ip: clientIp, userAgent });
  res.status(200).json({ 
    status: 'ok', 
    message: 'Background removal server is running',
    keepAlive: keepAliveService.getStatus(),
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for debugging
router.post('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  console.log('📋 Request method:', req.method);
  console.log('📋 Request headers:', req.headers);
  console.log('📋 Request body:', req.body);
  res.status(200).json({ 
    status: 'ok', 
    message: 'Test endpoint working',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// API status endpoint
router.get('/', (req, res) => {
  res.status(200).json({ 
    name: 'Picstar Image Processing API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      process: 'POST /process',
      batch: 'POST /process-batch',
      templates: 'GET /api/templates'
    },
    timestamp: new Date().toISOString()
  });
});
router.post('/process', uploadRateLimiter, upload.single('image'), processImage);
router.post('/process-batch', uploadRateLimiter, upload.array('images', 10), (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || req.ip;
  const userAgent = req.get('User-Agent');
  logger.info('Mobile device connected: processing batch', { ip: clientIp, userAgent, files: (req.files || []).length });
  next();
}, processBatch);

// Cleanup service stats endpoint
router.get('/cleanup-stats', async (req, res) => {
  try {
    const stats = await cleanupService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Keep-alive service status endpoint
router.get('/keep-alive-status', (req, res) => {
  try {
    const status = keepAliveService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual keep-alive ping endpoint for testing
router.post('/keep-alive-ping', async (req, res) => {
  try {
    const result = await keepAliveService.manualPing();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
