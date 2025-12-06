import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: false }, // Made optional for OTP-based registration
    profilePhotoUrl: { type: String, default: null },
    // OTP fields for phone verification
    otp: { type: String, select: false }, // Store hashed OTP, exclude from queries by default
    otpExpiry: { type: Date, select: false }, // OTP expiration time
    otpSessionId: { type: String, select: false }, // Session ID from 2factor.in
    isPhoneVerified: { type: Boolean, default: false }, // Track if phone is verified
    // Subscription fields (for quick access control)
    subscription: {
      status: { type: String, enum: ['active', 'expired', 'none'], default: 'none', index: true },
      currentPeriodEnd: { type: Date, default: null },
      lastTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
      createdAt: { type: Date, default: null },
    },
    // Account status for soft delete with grace period
    accountStatus: {
      type: String,
      enum: ['active', 'pending', 'deleted'],
      default: 'active',
      index: true,
    },
    // When account deletion is scheduled (15 days from pending status)
    deletionScheduledAt: {
      type: Date,
      default: null,
      index: true, // Index for efficient cron job queries
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema);