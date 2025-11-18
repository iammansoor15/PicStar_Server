import cron from 'node-cron';
import Template from '../models/Template.js';
import { logger } from '../middleware/logger.js';

class NotificationService {
  constructor() {
    this.currentNotification = null;
    this.isRunning = false;
  }

  /**
   * Select a random video template from the database
   */
  async selectRandomVideo() {
    try {
      // Count total video templates
      const count = await Template.countDocuments({ resource_type: 'video' });
      
      if (count === 0) {
        logger.info('📭 No video templates found in database');
        return null;
      }

      // Get a random video template
      const random = Math.floor(Math.random() * count);
      const randomVideo = await Template.findOne({ resource_type: 'video' })
        .skip(random)
        .lean();

      if (randomVideo) {
        const notification = {
          id: randomVideo._id.toString(),
          title: `New ${randomVideo.subcategory || 'Template'} Video!`,
          message: `Check out this amazing ${randomVideo.main_category || ''} video template`,
          videoUrl: randomVideo.video_url,
          imageUrl: randomVideo.image_url,
          subcategory: randomVideo.subcategory,
          mainCategory: randomVideo.main_category,
          timestamp: new Date().toISOString(),
        };

        this.currentNotification = notification;
        logger.info(`🔔 New notification generated: ${notification.title}`);
        return notification;
      }

      return null;
    } catch (error) {
      logger.error(`❌ Error selecting random video: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the current notification
   */
  getCurrentNotification() {
    return this.currentNotification;
  }

  /**
   * Start the notification scheduler (every 10 seconds)
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Notification service already running');
      return;
    }

    // Generate initial notification
    this.selectRandomVideo();

    // Schedule notification generation every 10 seconds
    this.job = cron.schedule('*/10 * * * * *', async () => {
      await this.selectRandomVideo();
    });

    this.isRunning = true;
    logger.info('🔔 Notification service started - generating notifications every 10 seconds');
  }

  /**
   * Stop the notification scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.isRunning = false;
      logger.info('🛑 Notification service stopped');
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentNotification: this.currentNotification,
    };
  }
}

export default new NotificationService();
