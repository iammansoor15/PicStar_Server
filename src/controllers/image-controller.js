import config from '../config/config.js';
import { createJob, getJob, registerProcessor } from '../jobs/job-queue.js';
import { processSingle as singleProcessor, processBatch as batchProcessor } from '../jobs/processors/image-processor.js';

// Register processors once (no-op if re-registered)
registerProcessor('single-image', singleProcessor);
registerProcessor('batch-image', batchProcessor);

// Enqueue single image processing and return jobId immediately
export const processImage = async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const maxSize = parseInt(req.body?.max_size || req.query?.max_size || req.headers['x-max-size'] || '1024', 10);

        const job = createJob('single-image', {
            file: {
                buffer: req.file.buffer,
                mimetype: req.file.mimetype,
                originalname: req.file.originalname,
                size: req.file.size,
            },
            options: { maxSize: isNaN(maxSize) ? 1024 : maxSize }
        });

        return res.status(202).json({
            success: true,
            jobId: job.id,
            status: job.status,
            queuedAt: job.createdAt
        });
    } catch (error) {
        console.error('❌ Error enqueuing image:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to enqueue image'
        });
    }
};

// Enqueue batch processing and return jobId immediately
export const processBatch = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded' });
        }

        const files = (req.files || []).map(f => ({
            buffer: f.buffer,
            mimetype: f.mimetype,
            originalname: f.originalname,
            size: f.size,
        }));

        const maxSize = parseInt(req.body?.max_size || req.query?.max_size || req.headers['x-max-size'] || '1024', 10);

        const job = createJob('batch-image', { files, options: { maxSize: isNaN(maxSize) ? 1024 : maxSize } });

        return res.status(202).json({
            success: true,
            jobId: job.id,
            status: job.status,
            queuedAt: job.createdAt,
            total: files.length
        });
    } catch (error) {
        console.error('❌ Error enqueuing batch:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to enqueue batch'
        });
    }
};

// Job status endpoint handler
export const getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = getJob(jobId);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const { id, status, progress, createdAt, updatedAt, result, error } = job;
        // Disable caching for job status to avoid 304 responses
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');
        // Update Last-Modified to force fresh responses
        res.set('Last-Modified', new Date().toUTCString());
        return res.json({ success: true, id, status, progress, createdAt, updatedAt, result, error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch job status' });
    }
};
