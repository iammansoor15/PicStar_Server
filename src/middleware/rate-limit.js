import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '../config/config.js';

// Create rate limiter with environment-based configuration
export const rateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs, // Time window in milliseconds
    max: config.rateLimit.maxRequests, // Limit each IP to max requests per windowMs
    message: {
        error: 'Too many requests from this IP',
        details: `Please try again after ${config.rateLimit.windowMs / 1000 / 60} minutes`
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip successful responses when counting towards the limit
    skipSuccessfulRequests: false,
    // Skip failed responses when counting towards the limit  
    skipFailedRequests: false,
    // Fix for Render.com proxy headers
    trustProxy: true,
    // Use the library helper to properly handle IPv4/IPv6 and proxies
    keyGenerator: (req) => ipKeyGenerator(req),
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            message: `You have exceeded the ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 1000 / 60} minutes limit.`,
            retryAfter: Math.round(config.rateLimit.windowMs / 1000)
        });
    }
});

// Stricter rate limiter for file uploads
export const uploadRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: Math.floor(config.rateLimit.maxRequests / 4), // 25% of normal limit for uploads
    message: {
        error: 'Too many upload requests from this IP',
        details: `Upload limit: ${Math.floor(config.rateLimit.maxRequests / 4)} requests per ${config.rateLimit.windowMs / 1000 / 60} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Fix for Render.com proxy headers
    trustProxy: true,
    // Use the library helper to properly handle IPv4/IPv6 and proxies
    keyGenerator: (req) => ipKeyGenerator(req),
    handler: (req, res) => {
        res.status(429).json({
            error: 'Upload rate limit exceeded',
            message: `Upload rate limited to ${Math.floor(config.rateLimit.maxRequests / 4)} requests per ${config.rateLimit.windowMs / 1000 / 60} minutes.`,
            retryAfter: Math.round(config.rateLimit.windowMs / 1000)
        });
    }
});
