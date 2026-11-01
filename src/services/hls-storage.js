import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import minio from '../utils/minio.js';

export const hlsStorage = {
  stat: key => minio.client.statObject(minio.bucket, key),
  read: (key, range) => range ?
    minio.client.getPartialObject(minio.bucket, key, range.start, range.length) :
    minio.client.getObject(minio.bucket, key),
  download: async (key, file, maxBytes, { signal } = {}) => {
    const stat = await minio.client.statObject(minio.bucket, key);
    if (stat.size > maxBytes) throw new Error('Video source exceeds the upload size limit');
    const stream = await minio.client.getObject(minio.bucket, key);
    await pipeline(stream, fs.createWriteStream(file, { mode: 0o600 }), { signal });
  },
  upload: (key, file, contentType) => minio.client.fPutObject(minio.bucket, key, file, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  }),
  deletePrefix: async prefix => {
    if (!/^video-media\/[a-f0-9]{24}\/[a-f0-9-]+\/$/i.test(prefix)) throw new Error('Invalid video asset prefix');
    const objects = await minio.listObjects(prefix);
    if (objects.length) await minio.client.removeObjects(minio.bucket, objects.map(object => object.name));
  },
};

export async function downloadCloudinarySource(value, file, { signal, maxBytes }) {
  let url = new URL(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' ||
        !/^\/[a-zA-Z0-9_-]+\/video\/upload\//.test(url.pathname)) {
      throw new Error('Unsupported external video source');
    }
    const response = await fetch(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('External video source is unavailable');
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      throw new Error('Video source exceeds the upload size limit');
    }
    let size = 0;
    async function* limited(body) {
      for await (const chunk of body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('Video source exceeds the upload size limit');
        yield chunk;
      }
    }
    await pipeline(limited(response.body), fs.createWriteStream(file, { mode: 0o600 }), { signal });
    if (!size) throw new Error('Video source is empty');
    return;
  }
  throw new Error('Too many external video redirects');
}
