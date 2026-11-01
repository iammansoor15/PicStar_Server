import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const SAFE_KEY = /^[a-zA-Z0-9_./-]+$/;
export function validObjectKey(key) {
  return typeof key === 'string' && SAFE_KEY.test(key) &&
    !key.startsWith('/') && key.split('/').every(part => part && part !== '.' && part !== '..');
}

export function objectKeyFromUrl(value, bucket, allowedHosts = []) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (allowedHosts.length && !allowedHosts.includes(url.hostname)) return null;
    const prefix = '/' + bucket + '/';
    if (!url.pathname.startsWith(prefix)) return null;
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    return validObjectKey(key) ? key : null;
  } catch {
    return null;
  }
}

export function newVideoJob({ originalKey = null, originalUrl = null, sourceKey = null, crop = null }) {
  return {
    status: 'pending',
    version: crypto.randomUUID(),
    original_key: originalKey,
    original_url: originalUrl,
    source_key: sourceKey,
    crop,
    attempts: 0,
    next_attempt_at: new Date(),
  };
}

export function parseVideoCrop(body) {
  if (!body.crop_w && !body.crop_h) return null;
  const fields = ['crop_x', 'crop_y', 'crop_w', 'crop_h', 'preview_w', 'preview_h'];
  const values = Object.fromEntries(fields.map(key => [key, Number(body[key] ?? 0)]));
  if (!Object.values(values).every(Number.isFinite) ||
      values.crop_x < 0 || values.crop_y < 0 ||
      values.crop_w <= 0 || values.crop_h <= 0 ||
      values.preview_w <= 0 || values.preview_h <= 0) {
    throw new Error('Invalid video crop dimensions');
  }
  return values;
}

export function createVideoMediaService({ baseUrl, secret, ttl = 21600, enabled = true, bucket, allowedHosts = [] }) {
  function sourceKey(template) {
    return template.video_media?.source_key ||
      (!template.video_media?.status ? objectKeyFromUrl(template.video_url, bucket, allowedHosts) : null);
  }

  function present(template) {
    const raw = typeof template.toObject === 'function' ? template.toObject() : template;
    if (raw.resource_type !== 'video') return raw;
    const { video_media: media = {}, ...safe } = raw;
    const id = String(raw._id || raw.id || '');
    const ready = media.status === 'ready';
    const source = sourceKey(raw);
    const fallback = media.original_url || (!media.status ? raw.video_url : null);
    const fields = {
      ...safe,
      id: id || safe.id,
      hls_status: media.status || 'legacy',
      media_version: media.version || 'legacy',
      hls_url: null,
      source_mp4_url: source ? null : fallback,
      poster_url: media.poster_key ? null : (raw.image_url !== raw.video_url ? raw.image_url : null),
      video_width: media.width || null,
      video_height: media.height || null,
      video_duration: media.duration || null,
    };
    if (!secret || !/^[a-f0-9]{24}$/i.test(id)) return fields;
    const claims = {
      sub: id,
      ver: media.version || 'legacy',
      source: source || null,
      hls: enabled && ready ? media.hls_prefix : null,
      poster: media.poster_key || null,
    };
    const token = jwt.sign(claims, secret, {
      algorithm: 'HS256', expiresIn: ttl, audience: 'video-media', issuer: 'picstar',
    });
    const root = baseUrl.replace(/\/+$/, '') + '/api/media/video/' + id + '/' + token + '/';
    if (claims.source) {
      fields.source_mp4_url = root + 'source.mp4';
      fields.video_url = fields.source_mp4_url;
    }
    if (claims.hls) fields.hls_url = root + 'hls/master.m3u8';
    if (claims.poster) {
      fields.poster_url = root + 'poster.jpg';
      fields.image_url = fields.poster_url;
    }
    return fields;
  }

  function transform(body) {
    if (body == null || typeof body !== 'object' || body instanceof Date || Buffer.isBuffer(body)) return body;
    if (Array.isArray(body)) return body.map(transform);
    if (body.resource_type === 'video') return present(body);
    if (typeof body.toObject === 'function') return transform(body.toObject());
    if (typeof body.toJSON === 'function') return transform(body.toJSON());
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, transform(value)]));
  }

  function middleware(req, res, next) {
    const json = res.json.bind(res);
    res.json = body => json(transform(body));
    next();
  }

  function verify(token, id) {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'], audience: 'video-media', issuer: 'picstar',
    });
    if (claims.sub !== id) throw new Error('Invalid media scope');
    return claims;
  }

  return { present, transform, middleware, verify, sourceKey };
}
