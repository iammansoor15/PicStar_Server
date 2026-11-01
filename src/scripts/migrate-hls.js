import config from '../config/config.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import Template from '../models/Template.js';
import { newVideoJob, objectKeyFromUrl } from '../utils/video-media.js';
import { hlsStorage } from '../services/hls-storage.js';

const apply = process.argv.includes('--apply');
const retry = process.argv.includes('--retry-failed');
try {
  await connectDB();
  const filter = {
    resource_type: 'video',
    $or: [
      { 'video_media.status': { $exists: false } },
      ...(retry ? [{ 'video_media.status': 'failed' }] : []),
    ],
  };
  const docs = await Template.find(filter).lean();
  let queued = 0;
  let unavailable = 0;
  for (const doc of docs) {
    const source = doc.video_media?.original_url || doc.video_url;
    const key = doc.video_media?.original_key || objectKeyFromUrl(source, config.minio.bucket, config.hls.storageHosts);
    try {
      if (key) await hlsStorage.stat(key);
      else {
        const url = new URL(source);
        if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' ||
            !/^\/[a-zA-Z0-9_-]+\/video\/upload\//.test(url.pathname)) throw new Error('Unsupported source');
      }
      if (apply) {
        const job = newVideoJob({ originalKey: key, originalUrl: key ? null : source, sourceKey: key });
        const result = await Template.updateOne({
          _id: doc._id,
          $or: [{ 'video_media.status': { $exists: false } }, ...(retry ? [{ 'video_media.status': 'failed' }] : [])],
        }, { $set: { video_media: job } });
        if (!result.modifiedCount) continue;
      }
      queued++;
      console.log(apply ? 'Queued:' : 'Would queue:', String(doc._id));
    } catch {
      unavailable++;
      console.log('Source unavailable:', String(doc._id));
    }
  }
  console.log(JSON.stringify({ apply, candidates: docs.length, queued, unavailable }));
  if (unavailable) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
