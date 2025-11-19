import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

function requireXorEmailPhone(body) {
  const hasEmail = !!(body.email && String(body.email).trim());
  const hasPhone = !!(body.phone && String(body.phone).trim());
  return hasEmail !== hasPhone; // XOR
}

function signToken(user) {
  const payload = { sub: user.id, name: user.name, email: user.email || null, phone: user.phone || null };
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (min 2 chars)' });
    }

    if (!requireXorEmailPhone({ email, phone })) {
      return res.status(400).json({ error: 'Provide either email OR phone (not both)' });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Normalize identifiers
    const normEmail = email ? String(email).trim().toLowerCase() : undefined;
    const normPhone = phone ? String(phone).trim() : undefined;

    // Check duplicates
    const existing = await User.findOne({ $or: [ { email: normEmail }, { phone: normPhone } ] });
    if (existing) {
      return res.status(409).json({ error: 'Account already exists with this email or phone' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({ name: String(name).trim(), email: normEmail, phone: normPhone, passwordHash });

    const token = signToken(user.toJSON());
    return res.status(201).json({ data: { user: user.toJSON(), token } });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { identifier, email, phone, password } = req.body || {};

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    let query;
    if (identifier) {
      const id = String(identifier).trim();
      if (id.includes('@')) {
        query = { email: id.toLowerCase() };
      } else {
        query = { phone: id };
      }
    } else if (email) {
      query = { email: String(email).trim().toLowerCase() };
    } else if (phone) {
      query = { phone: String(phone).trim() };
    } else {
      return res.status(400).json({ error: 'Provide identifier (email or phone)' });
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user.toJSON());
    return res.json({ data: { user: user.toJSON(), token } });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ data: { user: user.toJSON() } });
  } catch (e) {
    console.error('Me error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, profilePhotoUrl } = req.body || {};
    
    // Build update object with only provided fields
    const update = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (trimmedName.length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }
      update.name = trimmedName;
    }
    if (profilePhotoUrl !== undefined) {
      update.profilePhotoUrl = profilePhotoUrl;
    }
    
    // If no fields to update, return error
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { $set: update },
      { new: true, runValidators: true }
    );
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ data: { user: user.toJSON() } });
  } catch (e) {
    console.error('Profile update error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
