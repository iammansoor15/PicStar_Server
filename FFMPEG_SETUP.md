# FFmpeg Setup for Video Compositing

## What is this?

The backend now supports compositing videos with overlays (photos, text, banners) using FFmpeg.

## Installation Steps

### 1. Install FFmpeg on Windows

**Option A: Using Chocolatey (Recommended)**
```powershell
choco install ffmpeg
```

**Option B: Manual Installation**
1. Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/
2. Download "ffmpeg-git-full.7z" or the .zip version
3. Extract to `C:\ffmpeg`
4. Add `C:\ffmpeg\bin` to your System PATH:
   - Press Windows + X → System
   - Click "Advanced system settings"
   - Click "Environment Variables"
   - Under "System variables", find "Path"
   - Click "Edit" → "New"
   - Add `C:\ffmpeg\bin`
   - Click "OK" on all dialogs
5. Restart PowerShell/Terminal

**Option C: Using Scoop**
```powershell
scoop install ffmpeg
```

### 2. Verify Installation

```powershell
ffmpeg -version
```

You should see FFmpeg version information.

### 3. Start the Backend Server

```bash
cd C:\Picstar\PicStar_Server
npm start
```

The server will start on `http://localhost:10000` (or your configured port).

## API Endpoint

### POST `/api/videos/composite`

**Request Body:**
```json
{
  "videoUrl": "https://example.com/video.mp4",
  "overlays": {
    "photos": [
      {
        "uri": "https://example.com/photo.jpg",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 200
      }
    ],
    "texts": [
      {
        "text": "Hello World",
        "x": 50,
        "y": 50,
        "fontSize": 32,
        "color": "#FFFFFF"
      }
    ],
    "banner": {
      "uri": "https://example.com/banner.png"
    }
  },
  "dimensions": {
    "width": 1080,
    "height": 1920
  }
}
```

**Response:**
```json
{
  "success": true,
  "videoUrl": "https://cloudinary.com/.../composited_video.mp4",
  "url": "https://cloudinary.com/.../composited_video.mp4"
}
```

## Troubleshooting

### "ffmpeg not found" error

Make sure FFmpeg is installed and in your PATH. Restart your terminal and backend server after installation.

### Backend connection errors

1. Make sure the backend is running
2. Check that the React Native app is pointing to the correct backend URL
3. For Android emulator, the backend should be at `http://10.0.2.2:10000`
4. For physical devices, use your computer's network IP (not localhost)

### Video processing takes too long

- Processing time depends on video length and overlay complexity
- Typical processing: 30-60 seconds for a 10-second video
- The backend uploads the result to Cloudinary for permanent storage

## Testing

Test the endpoint with curl:

```bash
curl -X POST http://localhost:10000/api/videos/composite \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "overlays": {
      "texts": [{"text": "Test", "x": 100, "y": 100, "fontSize": 48, "color": "#FFFFFF"}]
    },
    "dimensions": {"width": 1080, "height": 1920}
  }'
```
