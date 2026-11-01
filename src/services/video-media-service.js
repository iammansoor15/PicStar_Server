import config from '../config/config.js';
import { createVideoMediaService } from '../utils/video-media.js';

export const videoMedia = createVideoMediaService({
  baseUrl: config.app.publicApiBaseUrl,
  secret: config.hls.signingSecret,
  ttl: config.hls.urlTtlSeconds,
  enabled: config.hls.enabled,
  bucket: config.minio.bucket,
  allowedHosts: config.hls.storageHosts,
});
