# Auth API (email OR phone)

This is a lightweight authentication server for the mobile app.

Features
- Register with name + (email OR phone) + password
- Login with identifier (email OR phone) + password
- Get current user with JWT (Bearer token)
- MongoDB Atlas via MONGODB_URI

Requirements
- Node.js 18+

Setup
1) Install dependencies
   Windows PowerShell:
   - Navigate to this folder and install deps:
     npm install

2) Configure environment
   - .env is already created with:
     - MONGODB_URI (your provided URI)
     - PORT=10010
     - JWT_SECRET=please-change-this-secret
   - It is recommended to change JWT_SECRET to a long random value.

3) Run the server
   npm run dev

   The server will listen on http://localhost:10010 (Android emulator uses http://10.0.2.2:10010)

Endpoints
- POST /api/auth/register
  Body: { name, email?, phone?, password }
  Rules: exactly one of email or phone must be provided.

- POST /api/auth/login
  Body: { identifier?, email?, phone?, password }
  If identifier includes '@' it is treated as email; otherwise as phone.

- GET /api/auth/me
  Header: Authorization: Bearer <token>

Client configuration
- Auth base URL is configured via AppConfig:
  - DEVELOPMENT.DEV_AUTH_SERVER_URL = http://10.0.2.2:10010
  - PRODUCTION_AUTH_SERVER_URL can be set when you deploy the server.

Notes
- Users collection: unique on email and phone (both optional). Passwords are stored hashed with bcrypt.
- Responses are normalized to { data: { user, token } } to match the app's AuthService.
