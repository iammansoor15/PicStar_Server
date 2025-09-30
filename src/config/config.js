import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Helper function to parse file sizes like '50MB'
const parseFileSize = (sizeStr) => {
    if (!sizeStr) return null;
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)(KB|MB|GB)$/i);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
    return value * multipliers[unit];
};

const config = {
    app: {
        port: process.env.PORT || 10000,
        host: process.env.SERVER_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
        env: process.env.NODE_ENV || 'development',
        apiPrefix: '/api',
        // Server URL from environment or localhost for development
        serverUrl: process.env.SERVER_URL || 'http://localhost:10000',
    },
    paths: {
        root: path.resolve(__dirname, '../../'),
        uploads: path.resolve(__dirname, '../../', process.env.UPLOADS_DIR || 'uploads'),
        logs: path.resolve(__dirname, '../../logs'),
    },
    cors: {
        origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN || '*').split(','),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
    },
    backgroundRemoval: {
        maxFileSize: parseFileSize(process.env.MAX_FILE_SIZE) || 
                    (process.env.NODE_ENV === 'production' ? 15 * 1024 * 1024 : 50 * 1024 * 1024), // 15MB prod, 50MB dev
        maxFilesPerBatch: parseInt(process.env.MAX_FILES_PER_BATCH) || 
                         (process.env.NODE_ENV === 'production' ? 3 : 10), // 3 prod, 10 dev
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
        outputFormat: 'png', // PNG supports transparency
        quality: 100, // Maximum quality for transparency preservation
        useGpu: String(process.env.BACKGROUND_GPU_ENABLED || '').toLowerCase() === 'true', // default false
    },
    cleanup: {
        intervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES) || 
                        (process.env.NODE_ENV === 'production' ? 1 : 5), // 1 min prod, 5 min dev
        maxFileAgeMinutes: parseInt(process.env.MAX_FILE_AGE_MINUTES) || 
                          (process.env.NODE_ENV === 'production' ? 5 : 30), // 5 min prod, 30 min dev
        autoCleanupEnabled: process.env.AUTO_CLEANUP_ENABLED !== 'false', // Default true
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 
                    (process.env.NODE_ENV === 'production' ? 30 : 100), // 30 prod, 100 dev
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || 'logs/server.log',
    },
    cloudinary: {
        // Only for template management, NOT background removal
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    }
};

export default config;