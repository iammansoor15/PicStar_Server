import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createVideoMediaService, validObjectKey } from '../utils/video-media.js';
import { createVideoMediaRouter, parseByteRange, resolveMediaObject } from '../routes/video-media-router.js';
const id = '6a95ddcc6d547db8aa3fecbf';
const secret = 'test-only-media-signing-secret';
const service = createVideoMediaService({ baseUrl: 'https://example.test', secret, bucket: 'picstar', allowedHosts: ['s3.example.test'] });
const asset = { _id: id, resource_type: 'video', video_url: 'old.mp4', video_media: {
  status: 'ready', version: 'v1', source_key: 'video-media/' + id + '/v1/source.mp4',
  poster_key: 'video-media/' + id + '/v1/poster.jpg', hls_prefix: 'video-media/' + id + '/v1/hls',
} };
const tokenOf = url => new URL(url).pathname.split('/')[5];
test('relative HLS paths retain scoped access and expose a separate MP4', () => {
  const video = service.present(asset);
  const segment = new URL('segment_00000.m4s', new URL('360p/index.m3u8', video.hls_url));
  assert.equal(tokenOf(segment), tokenOf(video.hls_url));
  const claims = service.verify(tokenOf(segment), id);
  assert.equal(resolveMediaObject(claims, 'hls/360p/segment_00000.m4s').key, asset.video_media.hls_prefix + '/360p/segment_00000.m4s');
  assert.ok(video.source_mp4_url.endsWith('/source.mp4'));
  assert.equal(video.video_media, undefined);
  assert.throws(() => service.verify(tokenOf(segment), '000000000000000000000000'));
  assert.equal(resolveMediaObject(claims, 'hls/../source.mp4'), null);
});
test('expired MinIO URLs are refreshed and processing streams are hidden', () => {
  const result = service.present({ _id: id, resource_type: 'video', video_url: 'https://s3.example.test/picstar/narayana_templates/old.mp4?expired=1' });
  assert.equal(service.verify(tokenOf(result.source_mp4_url), id).source, 'narayana_templates/old.mp4');
  assert.equal(service.present({ ...asset, video_media: { ...asset.video_media, status: 'processing' } }).hls_url, null);
  const disabled = createVideoMediaService({ baseUrl: 'https://example.test', secret, bucket: 'picstar', enabled: false });
  assert.equal(disabled.present(asset).hls_url, null);
});
test('image identifiers and dates survive response transformation', () => {
  const image = { _id: new mongoose.Types.ObjectId(id), resource_type: 'image', created_at: new Date('2026-01-01') };
  const result = JSON.parse(JSON.stringify(service.transform({ data: [image, asset] })));
  assert.equal(result.data[0]._id, id);
  assert.equal(result.data[0].created_at, '2026-01-01T00:00:00.000Z');
});
test('ranges support seeks and reject invalid offsets and traversal', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5, length: 4 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9, length: 3 });
  for (const header of ['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5']) assert.throws(() => parseByteRange(header, 10));
  for (const key of ['../secret', '/source.mp4', 'x/../source', 'x//source', 'x\\source']) assert.equal(validObjectKey(key), false);
});
test('HTTP media delivery enforces access, HEAD, range, MIME, and conditional requests', async t => {
  const bytes = Buffer.from('0123456789'); let reads = 0;
  const storage = {
    stat: async () => ({ size: bytes.length, etag: 'fixture' }),
    read: async (key, range) => { reads++; return Readable.from(range ? bytes.subarray(range.start, range.end + 1) : bytes); },
  };
  const app = express(); app.use('/api/media', createVideoMediaRouter({ storage, verify: service.verify }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const video = service.present(asset);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const url = origin + new URL(video.source_mp4_url).pathname;
  let response = await fetch(url, { headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(await response.text(), '2345');
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  const count = reads; response = await fetch(url, { method: 'HEAD' });
  assert.equal(response.status, 200); assert.equal(reads, count);
  assert.equal(response.headers.get('content-length'), '10');
  assert.equal((await fetch(url, { headers: { Range: 'bytes=100-' } })).status, 416);
  assert.equal((await fetch(url, { headers: { 'If-None-Match': '"fixture"' } })).status, 304);
  response = await fetch(origin + new URL(video.hls_url).pathname);
  assert.equal(response.headers.get('content-type'), 'application/vnd.apple.mpegurl'); await response.arrayBuffer();
  const expired = jwt.sign({ sub: id }, secret, { audience: 'video-media', issuer: 'picstar', expiresIn: -1 });
  assert.equal((await fetch(origin + '/api/media/video/' + id + '/' + expired + '/source.mp4')).status, 401);
});
