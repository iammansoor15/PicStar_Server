import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { validObjectKey } from '../utils/video-media.js';

export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size < 1) throw new Error('Invalid range');
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid range');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (![start, end].every(Number.isSafeInteger) || start >= size || end < start) {
      throw new Error('Invalid range');
    }
  }
  return { start, end, length: end - start + 1 };
}

export function resolveMediaObject(claims, file) {
  if (file === 'source.mp4' && validObjectKey(claims.source)) {
    return { key: claims.source, contentType: 'video/mp4' };
  }
  if (file === 'poster.jpg' && validObjectKey(claims.poster)) {
    return { key: claims.poster, contentType: 'image/jpeg' };
  }
  if (!file.startsWith('hls/') || !validObjectKey(file) || !validObjectKey(claims.hls)) return null;
  if (claims.hls !== 'video-media/' + claims.sub + '/' + claims.ver + '/hls') return null;
  const relative = file.slice(4);
  if (!/^(master\.m3u8|\d{1,4}p\/(index\.m3u8|init\.mp4|segment_\d{5}\.m4s))$/.test(relative)) return null;
  const contentType = relative.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' :
    relative.endsWith('.m4s') ? 'video/iso.segment' : 'video/mp4';
  return { key: claims.hls + '/' + relative, contentType };
}

export function createVideoMediaRouter({ storage, verify }) {
  const router = Router();
  router.get('/video/:id/:token/*file', async (req, res) => {
    let claims;
    try {
      claims = verify(req.params.token, req.params.id);
    } catch {
      return res.status(401).json({ success: false, error: 'Media access expired. Refresh the video.' });
    }
    const file = Array.isArray(req.params.file) ? req.params.file.join('/') : req.params.file;
    const object = resolveMediaObject(claims, file || '');
    if (!object) return res.status(404).end();
    try {
      const stat = await storage.stat(object.key);
      const etag = '"' + stat.etag.replaceAll('"', '') + '"';
      res.set({
        'Content-Type': object.contentType,
        'Accept-Ranges': 'bytes',
        'ETag': etag,
        'Cache-Control': 'private, max-age=' + Math.max(0, Math.min(3600, claims.exp - Math.floor(Date.now() / 1000))),
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.headers['if-none-match'] === etag && !req.headers.range) return res.status(304).end();
      let range;
      try {
        const rangeHeader = !req.headers['if-range'] || req.headers['if-range'] === etag ? req.headers.range : null;
        range = parseByteRange(rangeHeader, stat.size);
      } catch {
        return res.status(416).set('Content-Range', 'bytes */' + stat.size).end();
      }
      if (range) {
        res.status(206).set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + stat.size);
      }
      res.set('Content-Length', String(range ? range.length : stat.size));
      if (req.method === 'HEAD') return res.end();
      const stream = await storage.read(object.key, range);
      await pipeline(stream, res);
    } catch (error) {
      if (res.destroyed || error.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      if (res.headersSent) return res.destroy();
      const missing = ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(error.code);
      res.status(missing ? 404 : 503).json({ success: false, error: 'Video media is unavailable.' });
    }
  });
  return router;
}
