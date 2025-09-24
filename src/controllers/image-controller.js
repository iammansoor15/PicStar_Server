import { transparentBackground } from 'transparent-background';
import sharp from 'sharp';
import config from '../config/config.js';

export const processImage = async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        console.log('📥 Processing single image for background removal (memory only)...');
        
        // Read the uploaded file buffer directly from multer
        const inputBuffer = req.file.buffer;
        
        if (!inputBuffer || inputBuffer.length === 0) {
            throw new Error('Invalid file buffer');
        }

        console.log(`📊 Input image size: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        // Process the image (remove background) with transparent-background
        console.log('🔧 Processing image with transparent-background...');
        let outputBuffer;
        
        try {
            outputBuffer = await transparentBackground(inputBuffer, "png", {
                fast: false,
            });
            console.log('✅ Background removal completed successfully');
        } catch (transparentError) {
            console.log('⚠️ Background removal failed:', transparentError.message);
            console.log('🔄 Using original image as fallback');
            outputBuffer = inputBuffer;
        }

        // Post-process with sharp to ensure proper transparency and optimization
        const processedBuffer = await sharp(outputBuffer)
            .png({ 
                quality: 100,
                compressionLevel: 6, // Good compression for mobile
                adaptiveFiltering: true
            })
            .toBuffer();

        console.log(`📊 Processed image size: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        // Return base64 encoded images directly - no file storage
        const originalBase64 = `data:${req.file.mimetype};base64,${inputBuffer.toString('base64')}`;
        const processedBase64 = `data:image/png;base64,${processedBuffer.toString('base64')}`;

        res.json({
            success: true,
            data: {
                originalImage: originalBase64,
                processedImage: processedBase64,
                metadata: {
                    originalSize: inputBuffer.length,
                    processedSize: processedBuffer.length,
                    compression: ((1 - processedBuffer.length / inputBuffer.length) * 100).toFixed(1) + '%'
                }
            }
        });

    } catch (error) {
        console.error('❌ Error processing image:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process image'
        });
    }
};



// Batch processing endpoint for multiple images - Memory only processing
export const processBatch = async (req, res) => {
    console.log('📥 Batch processing request received (memory only)');
    console.log('📋 Request method:', req.method);
    console.log('📋 Request URL:', req.url);
    console.log('📁 Files received:', req.files ? req.files.length : 0);
    
    try {
        if (!req.files || req.files.length === 0) {
            console.log('❌ No files uploaded in request');
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
            });
        }

        console.log(`🔄 Processing batch of ${req.files.length} images in memory`);
        
        // Log file details
        req.files.forEach((file, index) => {
            console.log(`📸 File ${index + 1}:`, {
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                bufferSize: file.buffer ? file.buffer.length : 'No buffer'
            });
        });

        // Process all images in parallel using memory buffers only
        const processingPromises = req.files.map(async (file, index) => {
            try {
                console.log(`📸 Processing image ${index + 1}/${req.files.length}: ${file.originalname}`);

                // Get the input buffer directly from multer (no file system)
                const inputBuffer = file.buffer;
                
                if (!inputBuffer || inputBuffer.length === 0) {
                    throw new Error('Invalid file buffer');
                }

                console.log(`📊 Image ${index + 1} input size: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB`);

                // Process the image (remove background) with transparent-background
                console.log(`🔧 Processing image ${index + 1} with transparent-background...`);
                let outputBuffer;
                
                try {
                    outputBuffer = await transparentBackground(inputBuffer, "png", {
                        fast: false,
                    });
                    console.log(`✅ Background removal completed for image ${index + 1}`);
                } catch (transparentError) {
                    console.log(`⚠️ Background removal failed for image ${index + 1}:`, transparentError.message);
                    console.log(`🔄 Using original image as fallback for image ${index + 1}`);
                    outputBuffer = inputBuffer;
                }

                // Post-process with sharp to ensure proper transparency and mobile optimization
                const processedBuffer = await sharp(outputBuffer)
                    .png({ 
                        quality: 100,
                        compressionLevel: 6, // Good compression for mobile
                        adaptiveFiltering: true
                    })
                    .toBuffer();

                console.log(`✅ Completed processing image ${index + 1}/${req.files.length}`);
                console.log(`📊 Image ${index + 1} processed size: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);

                // Return base64 encoded images directly
                const originalBase64 = `data:${file.mimetype};base64,${inputBuffer.toString('base64')}`;
                const processedBase64 = `data:image/png;base64,${processedBuffer.toString('base64')}`;

                return {
                    success: true,
                    originalImage: originalBase64,
                    processedImage: processedBase64,
                    index: index,
                    metadata: {
                        originalSize: inputBuffer.length,
                        processedSize: processedBuffer.length,
                        filename: file.originalname,
                        compression: ((1 - processedBuffer.length / inputBuffer.length) * 100).toFixed(1) + '%'
                    }
                };
            } catch (error) {
                console.error(`❌ Error processing image ${index + 1}:`, error);
                
                // Return original image as fallback if processing completely fails
                try {
                    const originalBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
                    
                    return {
                        success: true,
                        originalImage: originalBase64,
                        processedImage: originalBase64, // Same as original since processing failed
                        index: index,
                        warning: 'Background removal failed, using original image',
                        error: error.message
                    };
                } catch (fallbackError) {
                    console.error(`❌ Complete failure for image ${index + 1}:`, fallbackError);
                    return {
                        success: false,
                        error: error.message,
                        index: index
                    };
                }
            }
        });

        // Wait for all processing to complete
        const results = await Promise.all(processingPromises);

        // Count successes and failures
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(`🎯 Batch processing complete: ${successful.length} successful, ${failed.length} failed`);
        console.log(`📋 Results details:`, JSON.stringify(results, null, 2));

        res.json({
            success: true,
            data: {
                results: results,
                summary: {
                    total: req.files.length,
                    successful: successful.length,
                    failed: failed.length
                }
            }
        });

    } catch (error) {
        console.error('❌ Batch processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process batch'
        });
    }
};
