import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  
  currency: {
    type: String,
    required: true,
    default: 'INR',
    uppercase: true,
  },
  
  // Razorpay IDs
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  paymentId: {
    type: String,
    default: null,
    index: true,
  },
  
  signature: {
    type: String,
    default: null,
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    required: true,
    index: true,
  },
  
  // Metadata
  notes: {
    type: Map,
    of: String,
    default: {},
  },
  
  // Store full payment response for debugging/auditing
  razorpayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  
  // Error details if payment failed
  errorMessage: {
    type: String,
    default: null,
  },
  
  errorCode: {
    type: String,
    default: null,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Indexes for efficient queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
