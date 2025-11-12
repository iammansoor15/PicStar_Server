import crypto from 'crypto';
import axios from 'axios';
import config from '../config/config.js';
import Transaction from '../models/Transaction.js';

class RazorpayService {
  constructor() {
    this.keyId = config.razorpay.keyId;
    this.keySecret = config.razorpay.keySecret;
    this.webhookSecret = config.razorpay.webhookSecret;
    this.baseUrl = 'https://api.razorpay.com/v1';
  }

  /**
   * Create a Razorpay order
   * @param {Object} params - Order parameters
   * @param {number} params.amount - Amount in smallest currency unit (paise for INR)
   * @param {string} params.currency - Currency code (default: INR)
   * @param {string} params.receipt - Unique receipt ID
   * @param {Object} params.notes - Additional notes/metadata
   * @returns {Promise<Object>} Razorpay order object
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay credentials not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/orders`,
        {
          amount: Math.round(amount), // Must be integer
          currency,
          receipt,
          notes,
        },
        {
          auth: {
            username: this.keyId,
            password: this.keySecret,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Razorpay createOrder error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.description || 'Failed to create Razorpay order');
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} params - Payment verification parameters
   * @param {string} params.orderId - Razorpay order ID
   * @param {string} params.paymentId - Razorpay payment ID
   * @param {string} params.signature - Razorpay signature
   * @returns {boolean} True if signature is valid
   */
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!this.keySecret) {
      throw new Error('Razorpay key secret not configured');
    }

    const generatedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Verify Razorpay webhook signature
   * @param {string} body - Raw webhook body
   * @param {string} signature - X-Razorpay-Signature header
   * @returns {boolean} True if webhook signature is valid
   */
  verifyWebhookSignature(body, signature) {
    if (!this.webhookSecret) {
      console.warn('Razorpay webhook secret not configured - skipping verification');
      return true; // Allow in dev if webhook secret not set
    }

    const generatedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Fetch payment details from Razorpay
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async fetchPayment(paymentId) {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay credentials not configured');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/payments/${paymentId}`,
        {
          auth: {
            username: this.keyId,
            password: this.keySecret,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Razorpay fetchPayment error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.description || 'Failed to fetch payment details');
    }
  }

  /**
   * Create a transaction record in database
   * @param {Object} params - Transaction parameters
   * @returns {Promise<Object>} Created transaction
   */
  async createTransaction({ userId, amount, currency, orderId, notes = {} }) {
    const transaction = await Transaction.create({
      userId,
      amount,
      currency,
      orderId,
      status: 'pending',
      notes,
    });

    return transaction;
  }

  /**
   * Update transaction with payment details
   * @param {string} orderId - Razorpay order ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated transaction
   */
  async updateTransaction(orderId, updates) {
    const transaction = await Transaction.findOneAndUpdate(
      { orderId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  }

  /**
   * Get transaction by order ID
   * @param {string} orderId - Razorpay order ID
   * @returns {Promise<Object>} Transaction
   */
  async getTransactionByOrderId(orderId) {
    const transaction = await Transaction.findOne({ orderId });
    return transaction;
  }

  /**
   * Get user's transaction history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of transactions
   */
  async getUserTransactions(userId, { limit = 20, skip = 0, status = null } = {}) {
    const query = { userId };
    if (status) {
      query.status = status;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    return transactions;
  }
}

export default new RazorpayService();
