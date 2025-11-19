import { Router } from 'express';
import { register, login, me, sendOtp, verifyOtp, resendOtp, checkOtp, subscriptionStatus, updateProfile } from '../controllers/auth-controller.js';
import { authRequired } from '../middleware/auth-middleware.js';

const router = Router();

// Traditional email/password registration (keep for backward compatibility)
router.post('/register', register);
router.post('/login', login);

// OTP-based registration
router.post('/send-otp', sendOtp);
router.post('/check-otp', checkOtp); // Verify OTP without creating user
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// User profile
router.get('/me', authRequired, me);
router.put('/profile', authRequired, updateProfile);

// Subscription status
router.get('/subscription-status', authRequired, subscriptionStatus);

export default router;
