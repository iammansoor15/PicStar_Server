import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

// Ensure logs directory exists
const ensureLogsDirectory = () => {
    if (!fs.existsSync(config.paths.logs)) {
        fs.mkdirSync(config.paths.logs, { recursive: true });
    }
};

// Simple console logger with timestamps
const consoleLogger = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    
    console.log(`[${timestamp}] ${levelUpper}: ${message} ${metaStr}`);
};

// File logger (for production)
const fileLogger = (level, message, meta = {}) => {
    ensureLogsDirectory();
    
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...meta
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    const logFile = path.resolve(config.paths.logs, 'server.log');
    
    fs.appendFileSync(logFile, logLine);
};

// Main logger function
export const logger = {
    info: (message, meta = {}) => {
        if (['info', 'debug'].includes(config.logging.level)) {
            consoleLogger('info', message, meta);
            if (config.app.env === 'production') {
                fileLogger('info', message, meta);
            }
        }
    },
    
    warn: (message, meta = {}) => {
        if (['warn', 'info', 'debug'].includes(config.logging.level)) {
            consoleLogger('warn', message, meta);
            if (config.app.env === 'production') {
                fileLogger('warn', message, meta);
            }
        }
    },
    
    error: (message, meta = {}) => {
        consoleLogger('error', message, meta);
        if (config.app.env === 'production') {
            fileLogger('error', message, meta);
        }
    },
    
    debug: (message, meta = {}) => {
        if (config.logging.level === 'debug') {
            consoleLogger('debug', message, meta);
        }
    }
};

// Express middleware for request logging
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    const { method, url, ip } = req;
    
    // Log request start
    logger.info(`${method} ${url}`, { 
        ip, 
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length') || 0
    });
    
    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration = Date.now() - start;
        const { statusCode } = res;
        
        // Log response
        const logLevel = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
        logger[logLevel](`${method} ${url} ${statusCode}`, {
            ip,
            duration: `${duration}ms`,
            statusCode
        });
        
        originalEnd.apply(res, args);
    };
    
    next();
};