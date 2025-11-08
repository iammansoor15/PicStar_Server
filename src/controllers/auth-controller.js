import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/config.js';
import otpService from '../services/otp-service.js';

const isValidEmail = (email) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Accept Indian phone: 10 digits or +91 prefix
const normalizeIndianPhone = (phone) => {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  if (p.startsWith('0')) p = p.replace(/^0+/, '');
  if (/^\d{10}$/.test(p)) return '+91' + p;
  return null;
};

const sign = (userId) => {
  return jwt.sign({ id: userId }, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn });
};

export const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    let emailNorm = email && String(email).trim().toLowerCase();
    let phoneNorm = normalizeIndianPhone(phone);

    if (!emailNorm && !phoneNorm) {
      return res.status(400).json({ success: false, error: 'Provide a valid email or Indian phone' });
    }

    // Check uniqueness
    const existing = await User.findOne({ $or: [emailNorm ? { email: emailNorm } : null, phoneNorm ? { phone: phoneNorm } : null].filter(Boolean) });
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists with provided email/phone' });
    }

    const passwordHash = await bcrypt.hash(String(password), config.auth.passwordSaltRounds);

    const user = await User.create({
      name: String(name).trim(),
      email: emailNorm || undefined,
      phone: phoneNorm || undefined,
      passwordHash,
    });

    const token = sign(user._id.toString());
    return res.status(201).json({ success: true, data: { token, user: { id: user._id, name: user.name, email: user.email, phone: user.phone } } });
  } catch (e) {
    console.error('Auth register error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, phone, password, identifier } = req.body || {};

    const provided = identifier || email || phone;
    if (!provided) return res.status(400).json({ success: false, error: 'Provide email or Indian phone to login' });

    let query = null;
    if (isValidEmail(provided)) {
      query = { email: String(provided).toLowerCase() };
    } else {
      const phoneNorm = normalizeIndianPhone(provided);
      if (!phoneNorm) return res.status(400).json({ success: false, error: 'Invalid email or Indian phone' });
      query = { phone: phoneNorm };
    }

    const user = await User.findOne(query);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = sign(user._id.toString());
    return res.json({ success: true, data: { token, user: { id: user._id, name: user.name, email: user.email, phone: user.phone } } });
  } catch (e) {
    console.error('Auth login error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email phone');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// OTP-based authentication endpoints
export const sendOtp = async (req, res) => {
  try {
    const { phone, mode } = req.body || {}; // mode can be 'register' or 'signin'
    
    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({ success: false, error: 'Valid Indian phone number required' });
    }
    
    // Check if user already exists with this phone
    const existingUser = await User.findOne({ phone: phoneNorm });
    
    // For registration mode: reject if phone is already verified
    if (mode === 'register' && existingUser && existingUser.isPhoneVerified) {
      return res.status(409).json({ success: false, error: 'Phone number already registered. Please sign in.' });
    }
    
    // For signin mode: require that phone exists and is verified
    if (mode === 'signin') {
      if (!existingUser) {
        return res.status(404).json({ success: false, error: 'Phone number not registered. Please register first.' });
      }
      if (!existingUser.isPhoneVerified) {
        return res.status(400).json({ success: false, error: 'Phone number not verified. Please complete registration first.' });
      }
    }
    
    // Send OTP via 2factor.in
    const result = await otpService.sendOTP(phoneNorm);
    
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to send OTP' });
    }
    
    // Store OTP info in database (create temp user or update existing)
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const otpHash = await bcrypt.hash(result.otp, 10);
    
    if (existingUser) {
      // Update existing unverified user
      existingUser.otp = otpHash;
      existingUser.otpExpiry = otpExpiry;
      existingUser.otpSessionId = result.sessionId;
      await existingUser.save();
    } else {
      // Create temporary user entry for OTP verification
      await User.create({
        name: 'Temporary', // Will be updated after OTP verification
        phone: phoneNorm,
        otp: otpHash,
        otpExpiry,
        otpSessionId: result.sessionId,
        isPhoneVerified: false,
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone: phoneNorm,
        expiresIn: 600, // 10 minutes in seconds
      },
    });
  } catch (e) {
    console.error('Send OTP error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, name } = req.body || {};
    
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    }
    
    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({ success: false, error: 'Valid Indian phone number required' });
    }
    
    if (!otp || String(otp).length !== 6) {
      return res.status(400).json({ success: false, error: 'Valid 6-digit OTP required' });
    }
    
    // Find user with pending OTP
    const user = await User.findOne({ phone: phoneNorm }).select('+otp +otpExpiry +otpSessionId');
    if (!user || !user.otp) {
      return res.status(404).json({ success: false, error: 'No OTP request found. Please request a new OTP.' });
    }
    
    // Check OTP expiry
    if (user.otpExpiry && new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, error: 'OTP expired. Please request a new OTP.' });
    }
    
    // Verify OTP
    const isValid = await bcrypt.compare(String(otp), user.otp);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid OTP' });
    }
    
    // OTP verified - update user
    user.name = String(name).trim();
    user.isPhoneVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpSessionId = undefined;
    await user.save();
    
    // Generate JWT token
    const token = sign(user._id.toString());
    
    return res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
        },
      },
    });
  } catch (e) {
    console.error('Verify OTP error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Check if OTP is valid without creating/updating user
export const checkOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    
    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({ success: false, error: 'Valid Indian phone number required' });
    }
    
    if (!otp || String(otp).length !== 6) {
      return res.status(400).json({ success: false, error: 'Valid 6-digit OTP required' });
    }
    
    // Find user with pending OTP
    const user = await User.findOne({ phone: phoneNorm }).select('+otp +otpExpiry');
    if (!user || !user.otp) {
      return res.status(404).json({ success: false, error: 'No OTP request found. Please request a new OTP.' });
    }
    
    // Check OTP expiry
    if (user.otpExpiry && new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, error: 'OTP expired. Please request a new OTP.' });
    }
    
    // Verify OTP
    const isValid = await bcrypt.compare(String(otp), user.otp);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid OTP' });
    }
    
    // OTP is valid, return success without modifying user
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (e) {
    console.error('Check OTP error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body || {};
    
    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({ success: false, error: 'Valid Indian phone number required' });
    }
    
    // Check if user exists
    const user = await User.findOne({ phone: phoneNorm });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Phone number not found. Please register first.' });
    }
    
    if (user.isPhoneVerified) {
      return res.status(400).json({ success: false, error: 'Phone already verified. Please login.' });
    }
    
    // Send new OTP
    const result = await otpService.resendOTP(phoneNorm);
    
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to resend OTP' });
    }
    
    // Update OTP info
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const otpHash = await bcrypt.hash(result.otp, 10);
    
    user.otp = otpHash;
    user.otpExpiry = otpExpiry;
    user.otpSessionId = result.sessionId;
    await user.save();
    
    return res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        phone: phoneNorm,
        expiresIn: 600,
      },
    });
  } catch (e) {
    console.error('Resend OTP error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
