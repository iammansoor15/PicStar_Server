import fetch from 'node-fetch';
import { logger } from '../middleware/logger.js';

class KeepAliveService {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.config = {
            url: process.env.KEEP_ALIVE_URL || 'https://picstar-server.onrender.com/',
            interval: parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES || '5') * 60 * 1000, // Convert to milliseconds
            enabled: process.env.KEEP_ALIVE_ENABLED === 'true',
            timeout: 30000 // 30 second timeout
        };
    }

    async pingServer() {
        try {
            const startTime = Date.now();
            logger.info(`🏓 Pinging keep-alive server: ${this.config.url}`);
            
            const response = await fetch(this.config.url, {
                method: 'GET',
                timeout: this.config.timeout,
                headers: {
                    'User-Agent': 'KeepAlive-Service/1.0'
                }
            });

            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
                const data = await response.json();
                logger.info(`✅ Keep-alive ping successful (${responseTime}ms) - Server status: ${data.status || 'unknown'}`);
                return { success: true, responseTime, data };
            } else {
                logger.warn(`⚠️ Keep-alive ping returned ${response.status}: ${response.statusText}`);
                return { success: false, status: response.status, statusText: response.statusText };
            }
        } catch (error) {
            logger.error(`❌ Keep-alive ping failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    start() {
        if (!this.config.enabled) {
            logger.info('🔕 Keep-alive service is disabled');
            return;
        }

        if (this.isRunning) {
            logger.warn('⚠️ Keep-alive service is already running');
            return;
        }

        logger.info(`🚀 Starting keep-alive service`);
        logger.info(`📡 Target URL: ${this.config.url}`);
        logger.info(`⏰ Ping interval: ${this.config.interval / 1000 / 60} minutes`);

        // Ping immediately on start
        this.pingServer();

        // Set up recurring pings
        this.intervalId = setInterval(() => {
            this.pingServer();
        }, this.config.interval);

        this.isRunning = true;
        logger.info('✅ Keep-alive service started successfully');
    }

    stop() {
        if (!this.isRunning) {
            logger.info('Keep-alive service is not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        logger.info('🛑 Keep-alive service stopped');
    }

    getStatus() {
        return {
            enabled: this.config.enabled,
            running: this.isRunning,
            url: this.config.url,
            intervalMinutes: this.config.interval / 1000 / 60,
            nextPing: this.isRunning ? new Date(Date.now() + this.config.interval).toISOString() : null
        };
    }

    // Manual ping for testing
    async manualPing() {
        logger.info('🔧 Manual keep-alive ping requested');
        return await this.pingServer();
    }
}

// Create singleton instance
const keepAliveService = new KeepAliveService();

export default keepAliveService;