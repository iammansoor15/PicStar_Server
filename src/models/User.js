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
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema);