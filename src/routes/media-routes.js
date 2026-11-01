import { createVideoMediaRouter } from './video-media-router.js';
import { hlsStorage } from '../services/hls-storage.js';
import { videoMedia } from '../services/video-media-service.js';

export default createVideoMediaRouter({ storage: hlsStorage, verify: videoMedia.verify });
