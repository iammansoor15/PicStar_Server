# Server Logging Guide - Template Requests

## Overview
Enhanced logging has been implemented to track all client requests to the template endpoints. This provides detailed insights into client interactions and helps debug connection issues.

## Log Format
Each request is assigned a unique `requestId` in the format: `req_[timestamp]_[random]`

Example: `req_1728730465123_a9b8c7d6e`

## Logged Endpoints

### 1. Template Categories (`/api/templates/categories`)
**Logs when clients fetch the list of available template categories**

**Request Info Logged:**
- 🔵 Request type identifier
- 📱 Client IP address
- 🌐 User-Agent (device/app info)
- ⏰ Request timestamp (ISO format)
- 🔗 Request headers (content-type, accept, origin)
- 📊 Category counts per folder
- ⏱️ Total request processing time
- 📤 Success/error response status

### 2. Templates by Category (`/api/templates/category/:category`)
**Logs when clients fetch templates for a specific category**

**Request Info Logged:**
- 🔵 Request type identifier  
- 📱 Client IP address
- 🌐 User-Agent (device/app info)
- 📂 Requested category name
- 📄 Pagination parameters (page, limit)
- 🔄 Sort parameters (sort_by, order)
- ⏰ Request timestamp
- 🔗 Request headers
- 🔍 Search strategies attempted
- ⏱️ Time taken per search strategy
- ✅ Which strategy succeeded
- 📊 Number of templates found
- ⏱️ Total request processing time
- 📤 Response status

### 3. Template Service Info (`/api/templates/`)
**Logs when clients request service information**

**Request Info Logged:**
- 🔵 Request type identifier
- 📱 Client IP address  
- 🌐 User-Agent
- ⏰ Request timestamp
- 📤 Response sent confirmation

### 4. Health Check (`/api/templates/health`)
**Logs when clients check service health**

**Request Info Logged:**
- 🔵 Request type identifier
- 📱 Client IP address
- 🌐 User-Agent
- ⏰ Request timestamp
- 🔍 Cloudinary connection test results
- ✅/❌ Cloudinary status
- ⏱️ Health check duration
- 📤 Response status

## Log Examples

### Successful Template Fetch Request:
```
🔵 [req_1728730465123_a9b8c7d6e] CLIENT REQUEST - Templates Fetch
📱 Client IP: 192.168.29.100
🌐 User-Agent: okhttp/4.9.2 (React Native)
📂 Category: congratulations
📄 Page: 1, Limit: 20
🔄 Sort: created_at desc
⏰ Request Time: 2025-10-02T10:47:45.123Z
🔗 Request Headers: {"content-type":"application/json","accept":"application/json","origin":"http://localhost:8081"}

🔍 [req_1728730465123_a9b8c7d6e] Trying search strategy 1: folder:"narayana_templates/congratulations"
🔍 [req_1728730465123_a9b8c7d6e] Strategy 1 result: 15 templates found in 234ms
✅ [req_1728730465123_a9b8c7d6e] Using strategy 1 - found 15 templates
✅ [req_1728730465123_a9b8c7d6e] SUCCESS: Found 15 templates for category: congratulations
⏱️ [req_1728730465123_a9b8c7d6e] Total request time: 289ms
📤 [req_1728730465123_a9b8c7d6e] Response sent to client: 192.168.29.100
```

### Failed Request:
```
🔵 [req_1728730465124_b8c7d6e9f] CLIENT REQUEST - Templates Fetch
📱 Client IP: 192.168.29.100
🌐 User-Agent: okhttp/4.9.2 (React Native)
📂 Category: invalid_category

❌ [req_1728730465124_b8c7d6e9f] ERROR: Failed to fetch templates for category invalid_category
❌ [req_1728730465124_b8c7d6e9f] Error message: Category not found
⏱️ [req_1728730465124_b8c7d6e9f] Request time before error: 45ms
📤 [req_1728730465124_b8c7d6e9f] Error response sent to client: 192.168.29.100
```

## Monitoring Client Activity

### Real-time Monitoring
Monitor logs in real-time by watching the server console output. Each mobile app request will generate detailed logs showing:
- Which device/IP is making requests
- What templates they're requesting  
- How long requests take to process
- Whether requests succeed or fail

### Identifying Mobile App Connections
Mobile app requests typically show:
- User-Agent containing "React Native" or "okhttp"
- Content-Type: "application/json"
- Requests to `/api/templates/category/[category-name]`
- Pagination parameters (page=1, limit=10/20)

## Troubleshooting with Logs

### Connection Issues:
- No logs appearing = Client can't reach server (network/firewall issue)
- Logs show requests but errors = Server-side processing issue

### Performance Issues:
- Check ⏱️ "Total request time" values
- Check individual search strategy times
- Look for failed strategies causing fallbacks

### Template Loading Issues:
- Check which search strategies are being attempted
- Verify category names are correct
- Check Cloudinary connection status in health logs

## Log Retention
- Development: Console output only
- Production: Also saved to `logs/server.log` file

## Security Note
Client IP addresses are logged for debugging purposes. Ensure log files are kept secure and not exposed publicly.