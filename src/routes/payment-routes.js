import { Router } from 'express';
import { createOrder, verifyPayment, handleWebhook, getTransactions } from '../controllers/payment-controller.js';
import { authRequired } from '../middleware/auth-middleware.js';

const router = Router();

// Create order (requires authentication)
router.post('/create-order', authRequired, createOrder);

// Verify payment (requires authentication)
router.post('/verify-payment', authRequired, verifyPayment);

// Webhook endpoint (no auth - verified via signature)
router.post('/webhook', handleWebhook);

// Get transaction history (requires authentication)
router.get('/transactions', authRequired, getTransactions);

export default router;
