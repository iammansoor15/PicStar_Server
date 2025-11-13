import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import Template from '../models/Template.js';
import axios from 'axios';

const execPromise = promisify(exec);

class VideoController {
  // POST /api/videos/upload
  async upload(req, res) {
    try {
      // Accept subcategory as primary
      const subcategoryInput = req.body.subcategory || req.body.sub_category || req.body.category;
      if (!subcategoryInput) {
        return res.status(400).json({ success: false, error: 'Subcategory is required' });
      }
      // Optional main category
      const mainCategoryRaw = typeof req.body.main_category === 'string' ? req.body.main_category : (typeof req.body.religion === 'string' ? req.body.religion : null);

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No video file provided' });
      }

      console.log('📤 Uploading video to Cloudinary...', {
        subcategory: subcategoryInput,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      // Upload video to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: `narayana_templates/${String(subcategoryInput).toLowerCase().trim()}`,
        resource_type: 'video',
      });

      console.log('✅ Video uploaded to Cloudinary:', uploadResult.secure_url);

      // Cleanup temp file
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

      const normalizedMain = mainCategoryRaw ? String(mainCategoryRaw).toLowerCase().trim() : null;
      const normalizedSub = String(subcategoryInput).toLowerCase().trim();

      // Persist to MongoDB
      const doc = await Template.create({
        image_url: uploadResult.secure_url, // keep required field populated
        video_url: uploadResult.secure_url,
        resource_type: 'video',
        main_category: normalizedMain,
        subcategory: normalizedSub,
        // videos don't use axes (default 0,0 preserved)
      });

      return res.status(201).json({
        success: true,
        data: {
          video_url: doc.video_url,
          image_url: doc.image_url,
          resource_type: doc.resource_type,
          serial_no: doc.serial_no,
          category: doc.subcategory, // back-compat
          subcategory: doc.subcategory,
          main_category: doc.main_category,
          created_at: doc.created_at,
        }
      });
    } catch (error) {
      console.error('❌ Error uploading video:', error);
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(500).json({ success: false, error: error.message || 'Failed to upload video' });
    }
  }

  // POST /api/videos/composite
  async composite(req, res) {
    const startTime = Date.now();
    const requestId = `composite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('\n' + '='.repeat(80));
    console.log(`🎬 [${requestId}] VIDEO COMPOSITE REQUEST STARTED`);
    console.log('='.repeat(80));
    
    try {
      const { videoUrl, overlays, dimensions } = req.body;

      if (!videoUrl) {
        console.error(`❌ [${requestId}] Missing videoUrl in request`);
        return res.status(400).json({ success: false, error: 'videoUrl is required' });
      }

      console.log(`📋 [${requestId}] Request Details:`, {
        videoUrl: videoUrl.substring(0, 80) + '...',
        photoCount: overlays?.photos?.length || 0,
        textCount: overlays?.texts?.length || 0,
        dimensions,
        timestamp: new Date().toISOString()
      });
      
      if (overlays?.photos?.length > 0) {
        console.log(`📸 [${requestId}] Photo overlays:`);
        overlays.photos.forEach((photo, i) => {
          console.log(`   ${i + 1}. Position: (${photo.x}, ${photo.y}), Size: ${photo.width}x${photo.height}`);
        });
      }
      
      if (overlays?.texts?.length > 0) {
        console.log(`📝 [${requestId}] Text overlays:`);
        overlays.texts.forEach((text, i) => {
          console.log(`   ${i + 1}. "${text.text}" at (${text.x}, ${text.y}), Font: ${text.fontSize}px`);
        });
      }

      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      if (!fs.existsSync(tempDir)) {
        console.log(`📁 [${requestId}] Creating temp directory: ${tempDir}`);
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const inputPath = path.join(tempDir, `input_${timestamp}.mp4`);
      const outputPath = path.join(tempDir, `output_${timestamp}.mp4`);

      console.log(`📂 [${requestId}] File paths:`);
      console.log(`   Input:  ${inputPath}`);
      console.log(`   Output: ${outputPath}`);

      // Download input video
      console.log(`📥 [${requestId}] Downloading video from: ${videoUrl.substring(0, 60)}...`);
      const downloadStart = Date.now();
      
      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(inputPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const downloadTime = Date.now() - downloadStart;
      const fileSize = fs.statSync(inputPath).size;
      console.log(`✅ [${requestId}] Video downloaded in ${downloadTime}ms (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

      // Get actual video dimensions using FFprobe
      console.log(`🔍 [${requestId}] Getting video dimensions with FFprobe...`);
      const probeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${inputPath}"`;
      const { stdout: probeOutput } = await execPromise(probeCommand);
      const [videoWidth, videoHeight] = probeOutput.trim().split('x').map(Number);
      
      console.log(`   App dimensions: ${dimensions.width}x${dimensions.height}`);
      console.log(`   Video dimensions: ${videoWidth}x${videoHeight}`);
      
      // Calculate scaling factors
      const scaleX = videoWidth / dimensions.width;
      const scaleY = videoHeight / dimensions.height;
      console.log(`   Scale factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);

      // Build FFmpeg filter complex
      const filters = [];
      const inputs = [`-i "${inputPath}"`];
      let inputIndex = 1;

      // Download and add photo overlays
      const photoInputs = [];
      if (overlays?.photos && Array.isArray(overlays.photos)) {
        console.log(`📸 [${requestId}] Downloading ${overlays.photos.length} photo(s)...`);
        
        for (let i = 0; i < overlays.photos.length; i++) {
          const photo = overlays.photos[i];
          if (!photo.uri) {
            console.warn(`⚠️ [${requestId}] Photo ${i + 1} has no URI, skipping`);
            continue;
          }

          const photoPath = path.join(tempDir, `photo_${timestamp}_${i}.jpg`);
          console.log(`   Downloading photo ${i + 1}/${overlays.photos.length}: ${photo.uri.substring(0, 50)}...`);
          
          const photoDownloadStart = Date.now();
          
          // Download photo
          const photoResponse = await axios({
            url: photo.uri,
            method: 'GET',
            responseType: 'stream'
          });
          const photoWriter = fs.createWriteStream(photoPath);
          photoResponse.data.pipe(photoWriter);
          await new Promise((resolve, reject) => {
            photoWriter.on('finish', resolve);
            photoWriter.on('error', reject);
          });

          const photoDownloadTime = Date.now() - photoDownloadStart;
          const photoSize = fs.statSync(photoPath).size;
          console.log(`   ✅ Photo ${i + 1} downloaded in ${photoDownloadTime}ms (${(photoSize / 1024).toFixed(2)} KB)`);

          inputs.push(`-i "${photoPath}"`);
          photoInputs.push({ index: inputIndex++, ...photo, path: photoPath });
        }
      }

      // Build filter complex
      console.log(`🔧 [${requestId}] Building FFmpeg filter complex...`);
      let previousOutput = '[0:v]';

      // Overlay photos
      if (photoInputs.length > 0) {
        console.log(`   Adding ${photoInputs.length} photo overlay(s)`);
      }
      photoInputs.forEach((photo, i) => {
        const outputName = i === photoInputs.length - 1 ? 'out' : `tmp${i}`;
        // Scale coordinates and dimensions from app to video
        const scaledX = Math.round(photo.x * scaleX);
        const scaledY = Math.round(photo.y * scaleY);
        const scaledWidth = Math.round(photo.width * scaleX);
        const scaledHeight = Math.round(photo.height * scaleY);
        
        console.log(`   Photo ${i + 1}: (${photo.x},${photo.y}) ${photo.width}x${photo.height} -> (${scaledX},${scaledY}) ${scaledWidth}x${scaledHeight}`);
        
        filters.push(
          `[${photo.index}:v]scale=${scaledWidth}:${scaledHeight}[scaled${i}]`,
          `${previousOutput}[scaled${i}]overlay=${scaledX}:${scaledY}[${outputName}]`
        );
        previousOutput = `[${outputName}]`;
      });

      // Add text overlays with backgrounds
      if (overlays?.texts && Array.isArray(overlays.texts) && overlays.texts.length > 0) {
        console.log(`   Adding ${overlays.texts.length} text overlay(s)`);
        const textFilters = overlays.texts.map((text, i) => {
          const escapedText = String(text.text).replace(/'/g, "\\\\\\\\'").replace(/:/g, '\\\\\\\\:');
          // Scale coordinates, dimensions, and font size from app to video
          const scaledX = Math.round(text.x * scaleX);
          const scaledY = Math.round(text.y * scaleY);
          const scaledWidth = Math.round((text.width || 120) * scaleX);
          const scaledHeight = Math.round((text.height || 40) * scaleY);
          const scaledFontSize = Math.round(text.fontSize * scaleY);
          
          // Check if text should be bold
          const isBold = text.fontWeight === 'bold' || text.fontWeight === '700' || text.fontWeight === '800' || text.fontWeight === '900';
          const boldParam = isBold ? ':bold=1' : '';
          
          console.log(`   Text ${i + 1}: "${text.text}" at (${text.x},${text.y}) size ${text.fontSize} weight=${text.fontWeight} bg=${text.backgroundColor} -> (${scaledX},${scaledY}) size ${scaledFontSize} bold=${isBold}`);
          
          // Build filter parts
          const parts = [];
          
          // Add background box if backgroundColor is not transparent
          if (text.backgroundColor && text.backgroundColor !== 'transparent') {
            // Parse rgba color (e.g., "rgba(0, 0, 0, 0.8)" -> "0x000000@0.8")
            let boxColor = '0x000000@0.8'; // default
            try {
              const rgbaMatch = text.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
              if (rgbaMatch) {
                const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
                const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
                const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
                const a = rgbaMatch[4] || '1';
                boxColor = `0x${r}${g}${b}@${a}`;
              }
            } catch (e) {
              console.warn(`   ⚠️ Failed to parse backgroundColor: ${text.backgroundColor}`);
            }
            parts.push(`drawbox=x=${scaledX}:y=${scaledY}:w=${scaledWidth}:h=${scaledHeight}:color=${boxColor}:t=fill`);
          }
          
          // Add text on top of background
          parts.push(`drawtext=text='${escapedText}':x=${scaledX}:y=${scaledY}:fontsize=${scaledFontSize}:fontcolor=${text.color}${boldParam}:borderw=2:bordercolor=black`);
          
          return parts.join(',');
        }).join(',');

        if (filters.length > 0) {
          filters[filters.length - 1] = filters[filters.length - 1].replace('[out]', '[tmp_text]');
          filters.push(`[tmp_text]${textFilters}[out]`);
        } else {
          filters.push(`${previousOutput}${textFilters}[out]`);
        }
      }

      // Ensure output tag
      if (filters.length === 0) {
        console.log(`   No overlays, using direct copy`);
        filters.push(`${previousOutput}copy[out]`);
      }

      const filterComplex = filters.join(';');
      const command = `ffmpeg ${inputs.join(' ')} -filter_complex "${filterComplex}" -map "[out]" -map 0:a? -c:v libx264 -preset fast -c:a copy -y "${outputPath}"`;

      console.log(`\n🎬 [${requestId}] Executing FFmpeg...`);
      console.log(`   Command: ${command.substring(0, 200)}...`);
      
      const ffmpegStart = Date.now();

      // Execute FFmpeg
      const { stdout, stderr } = await execPromise(command);
      
      const ffmpegTime = Date.now() - ffmpegStart;
      const outputSize = fs.statSync(outputPath).size;
      console.log(`✅ [${requestId}] FFmpeg processing complete in ${ffmpegTime}ms`);
      console.log(`   Output size: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);

      // Upload processed video to Cloudinary
      console.log(`\n📤 [${requestId}] Uploading to Cloudinary...`);
      const uploadStart = Date.now();
      
      const uploadResult = await cloudinary.uploader.upload(outputPath, {
        folder: 'narayana_templates/composited',
        resource_type: 'video',
      });

      const uploadTime = Date.now() - uploadStart;
      console.log(`✅ [${requestId}] Video uploaded to Cloudinary in ${uploadTime}ms`);
      console.log(`   URL: ${uploadResult.secure_url}`);

      // Cleanup temp files
      console.log(`🧹 [${requestId}] Cleaning up temp files...`);
      let cleanupCount = 0;
      try {
        fs.unlinkSync(inputPath);
        cleanupCount++;
        fs.unlinkSync(outputPath);
        cleanupCount++;
        photoInputs.forEach(p => {
          try { 
            fs.unlinkSync(p.path);
            cleanupCount++;
          } catch (e) {}
        });
        console.log(`   ✅ Cleaned up ${cleanupCount} file(s)`);
      } catch (e) {
        console.warn(`   ⚠️ Cleanup warning: ${e.message}`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`\n🎉 [${requestId}] VIDEO COMPOSITE COMPLETED SUCCESSFULLY`);
      console.log(`   Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
      console.log(`   Output URL: ${uploadResult.secure_url}`);
      console.log('='.repeat(80) + '\n');

      return res.status(200).json({
        success: true,
        videoUrl: uploadResult.secure_url,
        url: uploadResult.secure_url,
        processingTime: totalTime
      });

    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`\n❌ [${requestId}] VIDEO COMPOSITE FAILED after ${errorTime}ms`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.log('='.repeat(80) + '\n');
      
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to composite video',
        requestId
      });
    }
  }
}

export default new VideoController();
