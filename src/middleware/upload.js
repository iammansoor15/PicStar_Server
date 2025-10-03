import multer from 'multer';
import config from '../config/config.js';

// Configure multer for handling file uploads with memory storage
// All processing happens in memory - no file system dependencies
const storage = multer.memoryStorage(); // Store files in memory as Buffer objects

const fileFilter = (req, file, cb) => {
    if (config.backgroundRemoval.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and JPG images are allowed.'), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: config.backgroundRemoval.maxFileSize,
        files: config.backgroundRemoval.maxFilesPerBatch
    }
});
