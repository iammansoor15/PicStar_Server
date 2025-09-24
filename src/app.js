import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import imageRoutes from './routes/image-routes.js';
import templateRoutes from './routes/template-routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { requestLogger, logger } from './middleware/logger.js';
import config from './config/config.js';
import cleanupService from './utils/cleanup-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware pipeline
if (config.app.env === 'production') {
    app.use(rateLimiter); // Rate limiting for production
}
app.use(requestLogger); // Request logging
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Static files with proper MIME type for PNG transparency
app.use('/uploads', express.static(config.paths.uploads, {
    setHeaders: (res, path) => {
        if (path.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        }
    }
}));

// Routes
app.use('/', imageRoutes);
app.use('/api/templates', templateRoutes);

// Error handling
app.use(errorHandler);

// Ensure required directories exist
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
app.listen(config.app.port, config.app.host, () => {
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
