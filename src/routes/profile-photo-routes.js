import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadProfilePhoto, getProfilePhoto, deleteProfilePhoto } from '../controllers/profile-photo-controller.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

const router = express.Router();

/**
 * @route   GET /api/profile-photo/test
 * @desc    Test endpoint to verify route is working
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Profile photo routes are working!',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /api/profile-photo/upload
 * @desc    Upload or update user's profile photo
 * @access  Private (requires authentication)
 */
router.post('/upload', authMiddleware, upload.single('profilePhoto'), uploadProfilePhoto);

/**
 * @route   GET /api/profile-photo
 * @desc    Get user's profile photo URL
 * @access  Private (requires authentication)
 */
router.get('/', authMiddleware, getProfilePhoto);

/**
 * @route   DELETE /api/profile-photo
 * @desc    Delete user's profile photo
 * @access  Private (requires authentication)
 */
router.delete('/', authMiddleware, deleteProfilePhoto);

export default router;
