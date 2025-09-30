import sharp from 'sharp';
import { transparentBackground } from 'transparent-background';

// Resize helper to bound images to a max dimension to speed up CPU processing
async function preResize(buffer, maxDim = 1024) {
  try {
    const max = Math.max(64, Math.min(Number(maxDim) || 1024, 4096));
    return await sharp(buffer)
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
  } catch {
    // If resize fails, fall back to original buffer
    return buffer;
  }
}

async function removeBackground(buffer) {
  try {
    return await transparentBackground(buffer, 'png', { fast: false });
  } catch {
    // Fallback: return original if background removal fails
    return buffer;
  }
}

async function finalizePng(buffer) {
  return await sharp(buffer)
    .png({ quality: 100, compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

export async function processSingle(payload, ctx) {
  const { file } = payload; // { buffer, mimetype, originalname }
  if (!file?.buffer?.length) throw new Error('Invalid file buffer');

  // Resize to speed up, then remove background, then finalize PNG
  const maxSize = payload?.options?.maxSize || 1024;
  const resized = await preResize(file.buffer, maxSize);
  const removed = await removeBackground(resized);
  const processed = await finalizePng(removed);

  const originalBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const processedBase64 = `data:image/png;base64,${processed.toString('base64')}`;

  return {
    success: true,
    originalImage: originalBase64,
    processedImage: processedBase64,
    metadata: {
      originalSize: file.buffer.length,
      processedSize: processed.length,
      filename: file.originalname || 'image',
      compression: ((1 - processed.length / file.buffer.length) * 100).toFixed(1) + '%',
    },
  };
}

export async function processBatch(payload, ctx) {
  const { files } = payload; // array of { buffer, mimetype, originalname }
  if (!Array.isArray(files) || files.length === 0) throw new Error('No files in payload');

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const maxSize = payload?.options?.maxSize || 1024;
      const resized = await preResize(file.buffer, maxSize);
      const removed = await removeBackground(resized);
      const processed = await finalizePng(removed);

      const originalBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const processedBase64 = `data:image/png;base64,${processed.toString('base64')}`;

      results.push({
        success: true,
        index: i,
        originalImage: originalBase64,
        processedImage: processedBase64,
        metadata: {
          originalSize: file.buffer.length,
          processedSize: processed.length,
          filename: file.originalname || `image_${i + 1}`,
          compression: ((1 - processed.length / file.buffer.length) * 100).toFixed(1) + '%',
        },
      });
    } catch (err) {
      // Fallback: include original image if processing fails
      results.push({
        success: true,
        index: i,
        originalImage: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        processedImage: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        warning: 'Background removal failed, using original image',
        error: err?.message || String(err),
      });
    }

    // Yield to event loop between images to keep server responsive
    await new Promise((r) => setImmediate(r));
    if (ctx?.reportProgress) ctx.reportProgress(Math.round(((i + 1) / files.length) * 100));
  }

  return { success: true, results, summary: { total: files.length } };
}