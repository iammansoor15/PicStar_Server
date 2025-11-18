import express from 'express';
import notificationService from '../services/notification-service.js';

const router = express.Router();

/**
 * GET /api/notifications/current
 * Get the current notification (random video template)
 */
router.get('/current', (req, res) => {
  try {
    const notification = notificationService.getCurrentNotification();
    
    if (!notification) {
      return res.status(200).json({
        success: true,
        notification: null,
        message: 'No notification available yet'
      });
    }

    return res.status(200).json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch notification'
    });
  }
});

/**
 * GET /api/notifications/status
 * Get notification service status
 */
router.get('/status', (req, res) => {
  try {
    const status = notificationService.getStatus();
    return res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch status'
    });
  }
});

/**
 * POST /api/notifications/start
 * Start the notification service
 */
router.post('/start', (req, res) => {
  try {
    notificationService.start();
    return res.status(200).json({
      success: true,
      message: 'Notification service started'
    });
  } catch (error) {
    console.error('Error starting service:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to start service'
    });
  }
});

/**
 * POST /api/notifications/stop
 * Stop the notification service
 */
router.post('/stop', (req, res) => {
  try {
    notificationService.stop();
    return res.status(200).json({
      success: true,
      message: 'Notification service stopped'
    });
  } catch (error) {
    console.error('Error stopping service:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to stop service'
    });
  }
});

export default router;
