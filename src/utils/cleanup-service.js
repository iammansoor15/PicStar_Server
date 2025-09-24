import fs from 'fs/promises';
import path from 'path';
import config from '../config/config.js';

class CleanupService {
    constructor() {
        this.uploadsDir = config.paths.uploads;
        this.maxFileAge = config.cleanup.maxFileAgeMinutes * 60 * 1000;
        this.cleanupInterval = config.cleanup.intervalMinutes * 60 * 1000;
        this.autoCleanupEnabled = config.cleanup.autoCleanupEnabled;
        this.isRunning = false;
    }

    /**
     * Start the periodic cleanup service
     */
    start() {
        if (!this.autoCleanupEnabled) {
            console.log('🧹 Auto-cleanup is disabled (AUTO_CLEANUP_ENABLED=false)');
            return;
        }

        if (this.isRunning) {
            console.log('🧹 Cleanup service already running');
            return;
        }

        this.isRunning = true;
        console.log('🧹 Starting periodic cleanup service...');
        console.log(`📁 Monitoring directory: ${this.uploadsDir}`);
        console.log(`⏰ Max file age: ${this.maxFileAge / 1000 / 60} minutes`);
        console.log(`🔄 Cleanup interval: ${this.cleanupInterval / 1000 / 60} minutes`);

        // Run initial cleanup
        this.performCleanup();

        // Schedule periodic cleanups
        this.intervalId = setInterval(() => {
            this.performCleanup();
        }, this.cleanupInterval);
    }

    /**
     * Stop the cleanup service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('🧹 Cleanup service stopped');
    }

    /**
     * Perform cleanup of old files
     */
    async performCleanup() {
        try {
            console.log('🧹 Starting cleanup cycle...');
            
            // Ensure uploads directory exists
            await this.ensureUploadsDirectory();

            // Get all files in uploads directory
            const files = await fs.readdir(this.uploadsDir);
            
            if (files.length === 0) {
                console.log('📁 Uploads directory is clean');
                return;
            }

            const now = Date.now();
            let cleanedCount = 0;
            let totalSize = 0;

            for (const file of files) {
                try {
                    const filePath = path.join(this.uploadsDir, file);
                    const stats = await fs.stat(filePath);

                    // Skip directories
                    if (stats.isDirectory()) {
                        continue;
                    }

                    const fileAge = now - stats.mtime.getTime();
                    const fileSizeKB = Math.round(stats.size / 1024);
                    totalSize += stats.size;

                    // Clean up old files
                    if (fileAge > this.maxFileAge) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                        console.log(`🗑️ Cleaned up old file: ${file} (${fileSizeKB}KB, ${Math.round(fileAge / 60000)} minutes old)`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Error processing file ${file}:`, error.message);
                }
            }

            const remainingFiles = files.length - cleanedCount;
            const totalSizeKB = Math.round(totalSize / 1024);

            if (cleanedCount > 0) {
                console.log(`✅ Cleanup complete: ${cleanedCount} files removed, ${remainingFiles} files remaining (${totalSizeKB}KB total)`);
            } else {
                console.log(`📁 No cleanup needed: ${remainingFiles} files, ${totalSizeKB}KB total`);
            }

        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }

    /**
     * Ensure uploads directory exists
     */
    async ensureUploadsDirectory() {
        try {
            await fs.access(this.uploadsDir);
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdir(this.uploadsDir, { recursive: true });
            console.log(`📁 Created uploads directory: ${this.uploadsDir}`);
        }
    }

    /**
     * Manual cleanup of all files (for emergency use)
     */
    async cleanAll() {
        try {
            console.log('🧹 Performing emergency cleanup of all files...');
            
            const files = await fs.readdir(this.uploadsDir);
            let cleanedCount = 0;

            for (const file of files) {
                try {
                    const filePath = path.join(this.uploadsDir, file);
                    const stats = await fs.stat(filePath);

                    if (!stats.isDirectory()) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                        console.log(`🗑️ Removed: ${file}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Error removing file ${file}:`, error.message);
                }
            }

            console.log(`✅ Emergency cleanup complete: ${cleanedCount} files removed`);
        } catch (error) {
            console.error('❌ Error during emergency cleanup:', error);
        }
    }

    /**
     * Get cleanup statistics
     */
    async getStats() {
        try {
            const files = await fs.readdir(this.uploadsDir);
            let totalSize = 0;
            let fileCount = 0;
            let oldFileCount = 0;
            const now = Date.now();

            for (const file of files) {
                try {
                    const filePath = path.join(this.uploadsDir, file);
                    const stats = await fs.stat(filePath);

                    if (!stats.isDirectory()) {
                        fileCount++;
                        totalSize += stats.size;

                        const fileAge = now - stats.mtime.getTime();
                        if (fileAge > this.maxFileAge) {
                            oldFileCount++;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Error getting stats for file ${file}:`, error.message);
                }
            }

            return {
                uploadsDirectory: this.uploadsDir,
                totalFiles: fileCount,
                oldFiles: oldFileCount,
                totalSizeBytes: totalSize,
                totalSizeKB: Math.round(totalSize / 1024),
                totalSizeMB: Math.round(totalSize / 1024 / 1024),
                maxFileAge: this.maxFileAge,
                cleanupInterval: this.cleanupInterval,
                isRunning: this.isRunning
            };
        } catch (error) {
            console.error('❌ Error getting cleanup stats:', error);
            return null;
        }
    }
}

// Create and export singleton instance
const cleanupService = new CleanupService();
export default cleanupService;