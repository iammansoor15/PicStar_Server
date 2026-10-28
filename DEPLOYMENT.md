# Narayana App Server - Deployment Guide

## Overview

The Narayana App server provides background removal capabilities using local processing (no Cloudinary dependency) and template management features. This guide covers both development and production deployment.

## Background Removal Architecture

### Local Processing (No Cloudinary)
- Images are uploaded to local `uploads` folder via multipart/form-data
- Background removal is processed using `transparent-background` library locally
- Processed images are saved with `processed-` prefix in the same uploads folder
- Server returns local URLs for download: `/uploads/image.jpg` and `/uploads/processed-image.png`
- Automatic cleanup removes files older than configured age (default: 30 minutes)

### Template Management (Optional Cloudinary)
- Only template features use Cloudinary if configured
- Background removal is completely independent of Cloudinary

## Environment Configuration

### Winter domain

Set `BASE_URL=https://winter.codebinary.in` in the deployed environment or `.env`,
then restart the server. The local `.env` contains this public URL; supply your
existing database, storage, payment, and authentication settings separately.

The server and its web pages use this origin. `PUBLIC_API_BASE_URL` is an optional
override when pages need to call a different API origin. Existing deployments
using `SERVER_URL` remain supported, with `BASE_URL` taking priority.
Update or remove any old `PUBLIC_API_BASE_URL` value when moving domains.

If `CORS_ORIGIN` is restricted, include `https://winter.codebinary.in`. Configure
DNS, Nginx `server_name`, and the TLS certificate for the subdomain, and proxy the
full request path to the Node port. Keep `/winter` in the deletion form URL:

`https://winter.codebinary.in/winter/account-delete-request`

Run `npm run test:config` to verify environment handling and the public config
HTTP route without connecting to the database. See the mobile project's
`PRODUCTION_CONFIG.md` for the app build steps.

### Development Setup

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Update .env for development:**
   ```env
   NODE_ENV=development
   PORT=3000
   SERVER_HOST=0.0.0.0
   BASE_URL=http://localhost:3000
   
   # Background removal settings
   UPLOADS_DIR=uploads
   MAX_FILE_SIZE=50MB
   MAX_FILES_PER_BATCH=10
   
   # Cleanup settings
   CLEANUP_INTERVAL_MINUTES=5
   MAX_FILE_AGE_MINUTES=30
   AUTO_CLEANUP_ENABLED=true
   
   # CORS (allow all for development)
   CORS_ORIGIN=*
   
   # Logging
   LOG_LEVEL=debug
   ```

### Production Setup

1. **Copy production template:**
   ```bash
   cp .env.example .env
   ```

2. **Update production values:**
   ```env
   NODE_ENV=production
   PORT=3000
   SERVER_HOST=0.0.0.0
   BASE_URL=https://winter.codebinary.in
   
   # Stricter limits for production
   MAX_FILE_SIZE=20MB
   MAX_FILES_PER_BATCH=5
   
   # Aggressive cleanup for production
   CLEANUP_INTERVAL_MINUTES=2
   MAX_FILE_AGE_MINUTES=10
   
   # Restricted CORS
   CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
   
   # Stricter rate limits
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=50
   
   # Production logging
   LOG_LEVEL=info
   ```

## Configuration Options

### Server Settings
- `NODE_ENV`: Environment mode (development/production)
- `PORT`: Server port (default: 3000)
- `SERVER_HOST`: Bind address (0.0.0.0 for all interfaces)
- `BASE_URL`: Required public backend origin, including `http://` or `https://`
- `SERVER_URL`: Legacy environment alias, used when `BASE_URL` is absent
- `PUBLIC_API_BASE_URL`: Optional public web API origin; defaults to `BASE_URL`

### Background Removal
- `UPLOADS_DIR`: Upload directory path (default: uploads)
- `MAX_FILE_SIZE`: Maximum file size (e.g., 50MB, 20MB)
- `MAX_FILES_PER_BATCH`: Maximum files per batch upload

### Cleanup Service
- `CLEANUP_INTERVAL_MINUTES`: How often to run cleanup (default: 5)
- `MAX_FILE_AGE_MINUTES`: Max age before deletion (default: 30)
- `AUTO_CLEANUP_ENABLED`: Enable/disable automatic cleanup (true/false)

### Security
- `CORS_ORIGIN`: Allowed origins (* for dev, specific domains for prod)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window

### Logging
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `LOG_FILE`: Log file path (logs/server.log)

## Development

### Start Development Server
```bash
npm install
npm run dev
```

### Features in Development
- Hot reloading
- Debug logging
- No rate limiting
- Permissive CORS
- Longer file retention (30 minutes)

### Mobile Testing
The server binds to `0.0.0.0` so it's accessible from mobile devices on the same network:
- Find your network IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Update `API_BASE_URL` in .env to use your network IP
- Access from mobile: `http://YOUR_NETWORK_IP:3000`

## Production Deployment

### Option 1: Direct Node.js
```bash
# Install dependencies
npm install --production

# Set environment
export NODE_ENV=production

# Start server
npm start
```

### Option 2: Process Manager (PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'narayana-server',
    script: 'src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js --env production
```

### Option 3: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/app.js"]
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Security Considerations

### Production Security
1. **HTTPS**: Always use HTTPS in production
2. **CORS**: Restrict to specific domains
3. **Rate Limiting**: Enabled automatically in production
4. **File Limits**: Reduced file sizes and batch limits
5. **Cleanup**: Aggressive file cleanup (10 minutes max age)

### File Security
- Uploaded files are automatically cleaned up
- No persistent storage of user files
- Local processing only (no external service dependencies)

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Cleanup Stats
```bash
curl http://localhost:3000/cleanup-stats
```

### Log Monitoring
```bash
# Development (console)
npm run dev

# Production (file logs)
tail -f logs/server.log
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Change PORT in .env or kill existing process
   lsof -ti:3000 | xargs kill -9
   ```

2. **Permission errors on uploads folder:**
   ```bash
   mkdir uploads
   chmod 755 uploads
   ```

3. **High memory usage:**
   - Reduce `MAX_FILE_AGE_MINUTES` for more aggressive cleanup
   - Reduce `MAX_FILE_SIZE` and `MAX_FILES_PER_BATCH`

4. **CORS errors:**
   - Update `CORS_ORIGIN` to include your frontend domain
   - Use `*` for development only

### Performance Tuning

1. **File Cleanup:**
   - Production: 2-minute intervals, 10-minute retention
   - Development: 5-minute intervals, 30-minute retention

2. **Rate Limiting:**
   - Production: 50 requests per 15 minutes
   - Development: No rate limiting

3. **File Size Limits:**
   - Production: 20MB max file size, 5 files per batch
   - Development: 50MB max file size, 10 files per batch

## API Endpoints

### Background Removal
- `POST /process` - Single image processing
- `POST /process-batch` - Batch image processing
- `GET /uploads/:filename` - Download processed images

### System
- `GET /health` - Health check
- `GET /cleanup-stats` - Storage and cleanup statistics

### Templates (if Cloudinary configured)
- `GET /api/templates` - List templates
- Template management endpoints
