import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encodeHls } from './hls-encoder.js';

export function jobClaim(now, maxAttempts = 3) {
  return {
    resource_type: 'video',
    'video_media.attempts': { $lt: maxAttempts },
    $or: [
      { 'video_media.status': 'pending', 'video_media.next_attempt_at': { $lte: now } },
      { 'video_media.status': 'processing', 'video_media.locked_until': { $lt: now } },
    ],
  };
}

async function outputFiles(dir, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...await outputFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

export function mediaContentType(file) {
  if (file.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (file.endsWith('.m4s')) return 'video/iso.segment';
  if (file.endsWith('.jpg')) return 'image/jpeg';
  return 'video/mp4';
}

export function createHlsWorker({ Template, storage, downloadExternal, settings, encoder = encodeHls, log = console }) {
  const maxAttempts = 3;
  async function runOne(parentSignal) {
    if (parentSignal?.aborted) return false;
    const now = new Date();
    await Template.updateMany({
      'video_media.status': 'processing', 'video_media.attempts': { $gte: maxAttempts },
      'video_media.locked_until': { $lt: now },
    }, { $set: { 'video_media.status': 'failed', 'video_media.last_error': 'Video preparation timed out.' } });
    const claim = crypto.randomUUID();
    const doc = await Template.findOneAndUpdate(jobClaim(now, maxAttempts), {
      $set: {
        'video_media.status': 'processing', 'video_media.claim': claim,
        'video_media.locked_until': new Date(Date.now() + 120000),
      },
      $inc: { 'video_media.attempts': 1 },
    }, { new: true, sort: { 'video_media.next_attempt_at': 1 } }).lean();
    if (!doc) return false;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), settings.encodingTimeoutMs || 900000);
    const stop = () => controller.abort();
    parentSignal?.addEventListener('abort', stop, { once: true });
    const owned = { _id: doc._id, 'video_media.claim': claim, 'video_media.status': 'processing' };
    const media = doc.video_media;
    const id = String(doc._id);
    const prefix = 'video-media/' + id + '/' + claim + '/';
    let work;
    let uploaded = false;
    const heartbeat = setInterval(async () => {
      try {
        const result = await Template.updateOne(owned, {
          $set: { 'video_media.locked_until': new Date(Date.now() + 120000) },
        });
        if (!result.matchedCount) controller.abort();
      } catch { controller.abort(); }
    }, 30000);
    try {
      const tempRoot = path.join(os.tmpdir(), 'picstar-hls');
      await fs.mkdir(tempRoot, { recursive: true });
      work = await fs.mkdtemp(path.join(tempRoot, id + '-'));
      const input = path.join(work, 'input');
      if (media.original_key || media.source_key) {
        await storage.download(media.original_key || media.source_key, input, settings.maxSourceBytes, { signal: controller.signal });
      } else {
        await downloadExternal(media.original_url || doc.video_url, input, {
          signal: controller.signal, maxBytes: settings.maxSourceBytes,
        });
      }
      controller.signal.throwIfAborted();
      const out = path.join(work, 'output');
      const info = await encoder(input, out, {
        signal: controller.signal, crop: media.crop, canvas: doc.coordinate_reference || { width: 270, height: 480 }, ffmpeg: settings.ffmpeg,
        ffprobe: settings.ffprobe, timeout: settings.encodingTimeoutMs, maxDuration: settings.maxDurationSeconds,
      });
      const files = await outputFiles(out);
      // Publish the master last; the document remains processing until every object exists.
      files.sort((a, b) => Number(a === 'hls/master.m3u8') - Number(b === 'hls/master.m3u8'));
      for (const file of files) {
        controller.signal.throwIfAborted();
        await storage.upload(prefix + file, path.join(out, ...file.split('/')), mediaContentType(file));
        uploaded = true;
      }
      const updated = await Template.updateOne(owned, {
        $set: {
          'video_media.status': 'ready', 'video_media.version': claim, 'video_media.source_key': prefix + 'source.mp4',
          'video_media.poster_key': prefix + 'poster.jpg', 'video_media.hls_prefix': prefix + 'hls',
          'video_media.width': info.width, 'video_media.height': info.height, 'video_media.duration': info.duration,
          'video_media.ready_at': new Date(), 'video_media.last_error': null,
        },
        $unset: { 'video_media.claim': '', 'video_media.locked_until': '' },
      });
      if (!updated.matchedCount) {
        await storage.deletePrefix(prefix);
      } else {
        log.log('HLS video ready:', id, 'variants:', info.variants.length);
      }
    } catch (error) {
      if (uploaded) await storage.deletePrefix(prefix).catch(() => {});
      const stopping = parentSignal?.aborted;
      const failed = !stopping && media.attempts >= maxAttempts;
      await Template.updateOne(owned, {
        $set: {
          'video_media.status': failed ? 'failed' : 'pending',
          'video_media.last_error': failed ? 'Video preparation failed. Please retry the upload.' : null,
          'video_media.next_attempt_at': new Date(Date.now() + (stopping ? 0 : Math.min(300000, 15000 * 2 ** media.attempts))),
        },
        $unset: { 'video_media.claim': '', 'video_media.locked_until': '' },
        ...(stopping ? { $inc: { 'video_media.attempts': -1 } } : {}),
      });
      if (!stopping) log.error('HLS preparation failed:', id, String(error.message).slice(0, 500));
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      parentSignal?.removeEventListener('abort', stop);
      if (work) await fs.rm(work, { recursive: true, force: true });
    }
    return true;
  }
  return { runOne };
}
