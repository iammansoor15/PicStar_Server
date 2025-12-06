import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import DeletionRequest from '../models/DeletionRequest.js';
import User from '../models/User.js';
import otpService from '../services/otp-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normalize Indian phone number
const normalizeIndianPhone = (phone) => {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+91')) p = p.slice(3);
  if (p.startsWith('0')) p = p.replace(/^0+/, '');
  if (/^\d{10}$/.test(p)) return '+91' + p;
  return null;
};

// Temporary storage for OTPs (in production, use Redis or database)
const otpStore = new Map();

const router = Router();

// Token generation utility
function generateTrackingToken() {
  // Generate 8-character alphanumeric token
  // Exclude visually similar characters (I,1,O,0)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  const bytes = crypto.randomBytes(8);

  for (let i = 0; i < 8; i++) {
    token += chars[bytes[i] % chars.length];
  }

  return token;
}

// Ensure token uniqueness
async function generateUniqueToken() {
  let token;
  let exists = true;

  while (exists) {
    token = generateTrackingToken();
    exists = await DeletionRequest.findOne({ trackingToken: token });
  }

  return token;
}

// Serve account deletion request form
router.get('/account-delete-request', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/account-delete-request.html'));
});

// Send OTP for deletion request verification
router.post('/account-delete-request/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({
        success: false,
        message: 'Valid Indian phone number required',
      });
    }

    // Check if user exists with this phone
    const user = await User.findOne({ phone: phoneNorm });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number',
      });
    }

    // Check if account is already deleted
    if (user.accountStatus === 'deleted') {
      return res.status(403).json({
        success: false,
        message: 'This account has already been deleted',
      });
    }

    // Send OTP via 2factor.in
    const result = await otpService.sendOTP(phoneNorm);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to send OTP',
      });
    }

    // Store OTP info temporarily (10 minutes expiry)
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const otpHash = await bcrypt.hash(result.otp, 10);

    otpStore.set(phoneNorm, {
      otpHash,
      otpExpiry,
      sessionId: result.sessionId,
    });

    // Clean up expired OTPs
    setTimeout(() => {
      otpStore.delete(phoneNorm);
    }, 10 * 60 * 1000);

    console.log(`✅ OTP sent for deletion request: ${phoneNorm}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone: phoneNorm,
        expiresIn: 600, // 10 minutes in seconds
      },
    });
  } catch (error) {
    console.error('Error sending OTP for deletion request:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
});

// Submit deletion request (with OTP verification)
router.post('/account-delete-request', async (req, res) => {
  try {
    const { phone, reason, otp } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    if (!otp || String(otp).length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Valid 6-digit OTP required',
      });
    }

    // Normalize phone number
    const phoneNorm = normalizeIndianPhone(phone);
    if (!phoneNorm) {
      return res.status(400).json({
        success: false,
        message: 'Valid Indian phone number required',
      });
    }

    // Check if OTP exists for this phone
    const otpData = otpStore.get(phoneNorm);
    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'No OTP request found. Please request a new OTP.',
      });
    }

    // Check OTP expiry
    if (new Date() > otpData.otpExpiry) {
      otpStore.delete(phoneNorm);
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new OTP.',
      });
    }

    // Verify OTP
    const isValid = await bcrypt.compare(String(otp), otpData.otpHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    // OTP verified - clear it from store
    otpStore.delete(phoneNorm);

    // Verify user exists (security check)
    const user = await User.findOne({ phone: phoneNorm });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (user.accountStatus === 'deleted') {
      return res.status(403).json({
        success: false,
        message: 'This account has already been deleted',
      });
    }

    // Generate unique tracking token
    const trackingToken = await generateUniqueToken();

    // Create deletion request with token
    const deletionRequest = new DeletionRequest({
      phone: phoneNorm,
      reason: reason?.trim() || '',
      trackingToken,
    });

    await deletionRequest.save();

    console.log(`✅ Deletion request created (OTP verified): ${phoneNorm}, Token: ${trackingToken}`);

    res.status(201).json({
      success: true,
      message: 'Deletion request submitted successfully',
      data: {
        id: deletionRequest._id,
        phone: deletionRequest.phone,
        trackingToken: deletionRequest.trackingToken,
        status: deletionRequest.status,
        createdAt: deletionRequest.createdAt,
      },
    });
  } catch (error) {
    console.error('Error submitting deletion request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit deletion request',
      error: error.message,
    });
  }
});

// Serve deletion requests view page
router.get('/deletion-requests', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/deletion-requests.html'));
});

// Get all deletion requests (API endpoint)
router.get('/api/deletion-requests', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (status && ['pending', 'processing', 'completed'].includes(status)) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      DeletionRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DeletionRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching deletion requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deletion requests',
      error: error.message,
    });
  }
});

// Update deletion request status
router.patch('/api/deletion-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['pending', 'processing', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const updateData = { status };
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (status === 'completed') {
      updateData.processedAt = new Date();
    }

    const deletionRequest = await DeletionRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Deletion request not found',
      });
    }

    res.json({
      success: true,
      message: 'Deletion request updated successfully',
      data: deletionRequest,
    });
  } catch (error) {
    console.error('Error updating deletion request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update deletion request',
      error: error.message,
    });
  }
});

// Check deletion request status by tracking token
router.get('/api/deletion-requests/status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find deletion request by tracking token
    const deletionRequest = await DeletionRequest.findOne({ trackingToken: token });

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Invalid tracking token',
      });
    }

    // Find user by phone number
    const user = await User.findOne({ phone: deletionRequest.phone });

    if (!user) {
      return res.json({
        success: true,
        status: 'unknown',
        message: 'User not found',
        data: {
          phone: deletionRequest.phone,
          requestStatus: deletionRequest.status,
          createdAt: deletionRequest.createdAt,
        },
      });
    }

    // Calculate days remaining if account is pending
    let daysRemaining = null;
    if (user.accountStatus === 'pending' && user.deletionScheduledAt) {
      const now = new Date();
      const scheduledDate = new Date(user.deletionScheduledAt);
      const diffTime = scheduledDate - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Determine status message
    let statusMessage = '';
    if (user.accountStatus === 'deleted') {
      statusMessage = 'Your account has been permanently deleted.';
    } else if (user.accountStatus === 'pending') {
      statusMessage = `Your account deletion is scheduled. ${daysRemaining} day(s) remaining. Login to cancel the deletion.`;
    } else if (user.accountStatus === 'active' && deletionRequest.status === 'completed') {
      statusMessage = 'Your deletion request was cancelled.';
    } else {
      statusMessage = 'Your deletion request is being processed.';
    }

    res.json({
      success: true,
      status: user.accountStatus,
      message: statusMessage,
      data: {
        accountStatus: user.accountStatus,
        requestStatus: deletionRequest.status,
        daysRemaining,
        scheduledAt: user.deletionScheduledAt,
        createdAt: deletionRequest.createdAt,
        processedAt: deletionRequest.processedAt,
      },
    });
  } catch (error) {
    console.error('Error checking deletion request status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check deletion request status',
      error: error.message,
    });
  }
});

// Schedule account deletion (sets to pending with 15-day grace period)
router.patch('/api/deletion-requests/:id/delete-account', async (req, res) => {
  try {
    const { id } = req.params;

    // Find deletion request
    const deletionRequest = await DeletionRequest.findById(id);

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Deletion request not found',
      });
    }

    // Find user by phone
    const user = await User.findOne({ phone: deletionRequest.phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found for this phone number',
      });
    }

    // Check if already deleted
    if (user.accountStatus === 'deleted') {
      return res.json({
        success: true,
        message: 'Account already deleted',
        data: {
          accountStatus: user.accountStatus,
          deletionScheduledAt: null,
        },
      });
    }

    // Check if already pending
    if (user.accountStatus === 'pending') {
      return res.json({
        success: true,
        message: 'Account already scheduled for deletion',
        data: {
          accountStatus: user.accountStatus,
          deletionScheduledAt: user.deletionScheduledAt,
        },
      });
    }

    // Set account to pending with 15-day grace period
    user.accountStatus = 'pending';
    user.deletionScheduledAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
    await user.save();

    // Update deletion request status to processing
    deletionRequest.status = 'processing';
    await deletionRequest.save();

    console.log(`Account scheduled for deletion: ${user.phone}, scheduled for ${user.deletionScheduledAt}`);

    res.json({
      success: true,
      message: 'Account scheduled for deletion in 15 days',
      data: {
        accountStatus: user.accountStatus,
        deletionScheduledAt: user.deletionScheduledAt,
        daysRemaining: 15,
      },
    });
  } catch (error) {
    console.error('Error scheduling account deletion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule account deletion',
      error: error.message,
    });
  }
});

export default router;
