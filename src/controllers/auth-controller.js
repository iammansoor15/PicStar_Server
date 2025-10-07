import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/config.js';

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