import multer from 'multer';

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File size is too large'
            });
        }
    }

    if (err.message.includes('Invalid file type')) {
        return res.status(400).json({
            error: err.message
        });
    }

    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred' 
            : err.message
    });
};