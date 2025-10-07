import jwt from 'jsonwebtoken';
import config from '../config/config.js';

export const authRequired = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Missing token' });

    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = { id: decoded.id };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};