import { setTimeout as delay } from 'node:timers/promises';
import config from '../config/config.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import Template from '../models/Template.js';
import { hlsStorage, downloadCloudinarySource } from '../services/hls-storage.js';
import { createHlsWorker } from '../services/hls-worker.js';

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
try {
  await connectDB();
  const worker = createHlsWorker({
    Template, storage: hlsStorage, downloadExternal: downloadCloudinarySource, settings: config.hls,
  });
  console.log('HLS worker started; one video is prepared at a time.');
  while (!controller.signal.aborted) {
    try {
      const worked = await worker.runOne(controller.signal);
      if (!worked) await delay(3000, undefined, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) break;
      console.error('HLS worker will retry:', error.message);
      await delay(5000, undefined, { signal: controller.signal }).catch(() => {});
    }
  }
} finally {
  await mongoose.disconnect();
}
