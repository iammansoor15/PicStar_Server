import express from 'express';
import cors from 'cors';
import path from 'path';
import fetch from "node-fetch";
import cron from "node-cron";
import { fileURLToPath } from 'url';
import imageRoutes from './routes/image-routes.js';
import templateRoutes from './routes/templateRoutes.js';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { requestLogger, logger } from './middleware/logger.js';
import config from './config/config.js';
import cleanupService from './utils/cleanup-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Connect to MongoDB
await connectDB().catch((err) => {
  console.error('Failed to connect to MongoDB, exiting...', err.message);
  process.exit(1);
});



// Optional keep-alive ping (disabled by default). Controlled via env.
const KEEP_ALIVE_ENABLED = String(process.env.KEEP_ALIVE_ENABLED || '').toLowerCase() === 'true';
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || `${config.app.serverUrl}/health`;
const KEEP_ALIVE_INTERVAL_MINUTES = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES || '5');

if (KEEP_ALIVE_ENABLED) {
  const every = Math.max(1, KEEP_ALIVE_INTERVAL_MINUTES);
  cron.schedule(`*/${every} * * * *`, async () => {
    try {
      const res = await fetch(KEEP_ALIVE_URL);
      console.log("✅ Keep-alive ping:", KEEP_ALIVE_URL, "Status:", res.status);
    } catch (err) {
      console.error("❌ Keep-alive error:", err.message);
    }
  });
  console.log(`🕒 Keep-alive cron started. Target: ${KEEP_ALIVE_URL} every ${every}m`);
}



if (config.app.env === 'production') {
    app.set('trust proxy', 1); // Trust first proxy (Render.com)
}

if (config.app.env === 'production') {
    app.use(rateLimiter); // Rate limiting for production
}
app.use(requestLogger); // Request logging
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use('/uploads', express.static(config.paths.uploads, {
    setHeaders: (res, path) => {
        if (path.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        }
    }
}));


app.use('/', imageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/', imageRoutes);

// Auth routes
import authRoutes from './routes/auth-routes.js';
app.use('/api/auth', authRoutes);


// Error handling
app.use(errorHandler);

import fs from 'fs';
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dirPath}`);
    }
};

// Create required directories
ensureDirectoryExists(config.paths.uploads);

// Start cleanup service for uploads folder
cleanupService.start();


// Create logs directory if it doesn't exist
ensureDirectoryExists(config.paths.logs);




// Start server with environment-configured host
const server = app.listen(config.app.port, config.app.host, () => {
  console.log(`🚀 Server running in ${config.app.env} mode on ${config.app.host}:${config.app.port}`);
  console.log(`🌐 Server URL: ${config.app.serverUrl}`);
  console.log(`📁 Uploads directory: ${config.paths.uploads}`);
  console.log(`🧹 Auto-cleanup: ${config.cleanup.autoCleanupEnabled ? 'enabled' : 'disabled'}`);
  console.log(`🌐 CORS enabled for: ${Array.isArray(config.cors.origin) ? config.cors.origin.join(', ') : config.cors.origin}`);
  if (config.app.host === '0.0.0.0') {
      console.log(`📱 Accessible from any network interface`);
      console.log(`💡 For mobile testing, use your network IP instead of localhost`);
  }
});

// Harden server timeouts to better handle cold starts and processing
try {
  // Keep sockets open long enough for render/load balancers
  server.keepAliveTimeout = 65_000; // 65s
  server.headersTimeout = 66_000;   // must be > keepAliveTimeout
  server.requestTimeout = 120_000;  // 120s for processing endpoints
  console.log('⏱️ Server timeouts configured:', {
      keepAliveTimeout: server.keepAliveTimeout,
      headersTimeout: server.headersTimeout,
      requestTimeout: server.requestTimeout,
  });
} catch (e) {
  console.warn('⚠️ Could not set server timeouts:', e?.message);
}

// Global error handlers
process.on('unhandledRejection', (reason) => {
    console.error('🚨 Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught exception:', err);
});
