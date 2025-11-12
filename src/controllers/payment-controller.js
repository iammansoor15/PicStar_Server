import razorpayService from '../services/razorpay-service.js';
import config from '../config/config.js';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';

/**
 * Create a Razorpay order for payment
 * POST /api/payments/create-order
 */
export const createOrder = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🟢 [SERVER] POST /api/payments/create-order');
    console.log('='.repeat(70));
    
    const userId = req.user?.id;
    console.log('👤 [SERVER] User ID:', userId);
    
    if (!userId) {
      console.error('❌ [SERVER] No user ID - Unauthorized');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { amount, currency = 'INR', notes = {} } = req.body;
    console.log('📋 [SERVER] Request body:', JSON.stringify({ amount, currency, notes }, null, 2));

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      console.error('❌ [SERVER] Invalid amount:', amount);
      return res.status(400).json({ success: false, error: 'Valid amount required' });
    }

    // For test payments, allow small amounts. In production, you'd have business logic here
    // to determine the amount based on product/plan selection
    const amountInPaise = Math.round(amount * 100); // Convert to paise
    console.log('💰 [SERVER] Amount in paise:', amountInPaise);
    
    // Generate short receipt ID (max 40 chars for Razorpay)
    const timestamp = Date.now().toString(36); // Base36 timestamp
    const random = Math.random().toString(36).substring(2, 8); // 6 random chars
    const receipt = `rcpt_${timestamp}_${random}`; // e.g., rcpt_lz4t5k2s_abc123
    console.log('🧾 [SERVER] Generated receipt:', receipt, `(${receipt.length} chars)`);
    

    // Create Razorpay order
    console.log('\n📞 [SERVER] Calling Razorpay API to create order...');
    const order = await razorpayService.createOrder({
      amount: amountInPaise,
      currency,
      receipt,
      notes: {
        userId,
        ...notes,
      },
    });
    console.log('✅ [SERVER] Razorpay order created:', order.id);
    console.log('📦 [SERVER] Order details:', JSON.stringify(order, null, 2));

    // Save transaction to database
    console.log('\n💾 [SERVER] Saving transaction to database...');
    const transaction = await razorpayService.createTransaction({
      userId,
      amount: amountInPaise,
      currency,
      orderId: order.id,
      notes: {
        userId,
        ...notes,
      },
    });
    console.log('✅ [SERVER] Transaction saved with ID:', transaction._id);

    // Return order details and public key for client
    const responseData = {
      success: true,
      data: {
        orderId: order.id,
        amount: amountInPaise,
        currency,
        keyId: config.razorpay.keyId,
        transactionId: transaction._id,
      },
    };
    
    console.log('\n✅ [SERVER] Sending response to client');
    console.log('📤 [SERVER] Response:', JSON.stringify(responseData, null, 2));
    console.log('='.repeat(70) + '\n');
    
    return res.json(responseData);
  } catch (error) {
    console.error('\n❌ [SERVER] Create order error occurred!');
    console.error('🔴 [SERVER] Error:', error.message);
    console.error('🔴 [SERVER] Stack:', error.stack);
    console.error('='.repeat(70) + '\n');
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create order',
    });
  }
};

/**
 * Verify payment signature after successful payment
 * POST /api/payments/verify-payment
 */
export const verifyPayment = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🔐 [SERVER] POST /api/payments/verify-payment');
    console.log('='.repeat(70));
    
    const userId = req.user?.id;
    console.log('👤 [SERVER] User ID:', userId);
    
    if (!userId) {
      console.error('❌ [SERVER] No user ID - Unauthorized');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    console.log('📋 [SERVER] Verification data received:');
    console.log('  🆔 Order ID:', razorpay_order_id);
    console.log('  💳 Payment ID:', razorpay_payment_id);
    console.log('  ✍️  Signature:', razorpay_signature?.substring(0, 20) + '...');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error('❌ [SERVER] Missing verification parameters');
      return res.status(400).json({
        success: false,
        error: 'Missing payment verification parameters',
      });
    }

    // Verify signature
    console.log('\n🔍 [SERVER] Verifying payment signature with Razorpay...');
    const isValid = razorpayService.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    
    console.log('🔐 [SERVER] Signature verification result:', isValid ? '✅ VALID' : '❌ INVALID');

    if (!isValid) {
      console.error('❌ [SERVER] Invalid signature - marking transaction as failed');
      // Mark transaction as failed
      await razorpayService.updateTransaction(razorpay_order_id, {
        status: 'failed',
        errorMessage: 'Invalid payment signature',
      });
      console.error('='.repeat(70) + '\n');

      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature',
      });
    }

    // Fetch payment details from Razorpay
    console.log('\n📞 [SERVER] Fetching payment details from Razorpay API...');
    const paymentDetails = await razorpayService.fetchPayment(razorpay_payment_id);
    console.log('✅ [SERVER] Payment details fetched');
    console.log('📦 [SERVER] Payment status:', paymentDetails.status);

    // Update transaction as paid
    console.log('\n💾 [SERVER] Updating transaction status to PAID...');
    const transaction = await razorpayService.updateTransaction(razorpay_order_id, {
      status: 'paid',
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      razorpayResponse: paymentDetails,
    });
    console.log('✅ [SERVER] Transaction updated successfully');
    console.log('🎫 [SERVER] Transaction ID:', transaction._id);

    // Business logic: Activate subscription for 30 days
    console.log('\n💡 [SERVER] Activating subscription for user...');
    try {
      const subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      await User.findByIdAndUpdate(userId, {
        'subscription.status': 'active',
        'subscription.currentPeriodEnd': subscriptionEnd,
        'subscription.lastTransactionId': transaction._id,
        'subscription.createdAt': new Date(),
      });
      console.log('✅ [SERVER] Subscription activated until:', subscriptionEnd.toISOString());
    } catch (subErr) {
      console.error('⚠️ [SERVER] Failed to activate subscription:', subErr.message);
      // Don't fail the payment, just log the error
    }

    const responseData = {
      success: true,
      data: {
        transactionId: transaction._id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
      },
    };
    
    console.log('\n✅ [SERVER] Payment verification complete!');
    console.log('📤 [SERVER] Sending response:', JSON.stringify(responseData, null, 2));
    console.log('🎉 [SERVER] Payment successfully verified and processed!');
    console.log('='.repeat(70) + '\n');

    return res.json(responseData);
  } catch (error) {
    console.error('\n❌ [SERVER] Verify payment error occurred!');
    console.error('🔴 [SERVER] Error:', error.message);
    console.error('🔴 [SERVER] Stack:', error.stack);
    console.error('='.repeat(70) + '\n');
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify payment',
    });
  }
};

/**
 * Handle Razorpay webhooks for payment events
 * POST /api/payments/webhook
 */
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = razorpayService.verifyWebhookSignature(body, signature);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('Razorpay webhook event:', event.event);

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = event.payload?.payment?.entity || event.payload?.order?.entity;
        if (payment && payment.order_id) {
          const transaction = await razorpayService.getTransactionByOrderId(payment.order_id);
          
          if (transaction && transaction.status === 'pending') {
            await razorpayService.updateTransaction(payment.order_id, {
              status: 'paid',
              paymentId: payment.id,
              razorpayResponse: payment,
            });
            console.log(`Transaction ${transaction._id} marked as paid via webhook`);
          }
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        if (payment && payment.order_id) {
          await razorpayService.updateTransaction(payment.order_id, {
            status: 'failed',
            errorMessage: payment.error_description,
            errorCode: payment.error_code,
            razorpayResponse: payment,
          });
          console.log(`Transaction for order ${payment.order_id} marked as failed via webhook`);
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    // Always return 200 to acknowledge receipt
    return res.json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Still return 200 to prevent Razorpay from retrying
    return res.status(200).json({ success: false, error: error.message });
  }
};

/**
 * Get user's transaction history
 * GET /api/payments/transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { limit = 20, skip = 0, status } = req.query;

    const transactions = await razorpayService.getUserTransactions(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      status,
    });

    return res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transactions',
    });
  }
};
