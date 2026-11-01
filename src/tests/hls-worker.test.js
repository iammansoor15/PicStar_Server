import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHlsWorker, jobClaim } from '../services/hls-worker.js';
const id = '6a95ddcc6d547db8aa3fecbf';
function fixture({ fail = false, attempts = 0, deleted = false, stop = null } = {}) {
  const updates = [], uploads = [], removed = []; let output;
  const Template = {
    updateMany: async () => ({}),
    findOneAndUpdate: (query, update) => ({ lean: async () => ({
      _id: id, video_media: { status: 'processing', version: 'old', original_key: 'original.mp4',
        attempts: attempts + 1, claim: update.$set['video_media.claim'] },
    }) }),
    updateOne: async (query, update) => { updates.push({ query, update, uploads: uploads.length }); return { matchedCount: deleted ? 0 : 1 }; },
  };
  const storage = {
    download: async (key, file) => fs.writeFile(file, 'input'),
    upload: async key => { if (fail && uploads.length) throw new Error('Upload failed'); uploads.push(key); },
    deletePrefix: async prefix => removed.push(prefix),
  };
  const encoder = async (input, out, options) => {
    output = out;
    if (stop) { stop.abort(); options.signal.throwIfAborted(); }
    await fs.mkdir(path.join(out, 'hls'), { recursive: true });
    for (const file of ['source.mp4', 'poster.jpg', 'hls/master.m3u8']) await fs.writeFile(path.join(out, file), 'fixture');
    return { width: 360, height: 640, duration: 2, variants: [{}] };
  };
  return { updates, uploads, removed, output: () => output,
    worker: createHlsWorker({ Template, storage, encoder, downloadExternal: async () => {},
      settings: { maxSourceBytes: 1024 }, log: { log() {}, error() {} } }),
  };
}
test('expired worker leases are eligible for recovery', () => {
  const now = new Date(), query = jobClaim(now);
  assert.equal(query['video_media.attempts'].$lt, 3);
  assert.ok(query.$or.some(branch => branch['video_media.locked_until']?.$lt === now));
});
test('publish occurs after all uploads and uses a unique attempt version', async () => {
  const job = fixture(); await job.worker.runOne();
  const publish = job.updates.at(-1);
  assert.equal(publish.update.$set['video_media.status'], 'ready');
  assert.equal(publish.uploads, 3);
  assert.notEqual(publish.update.$set['video_media.version'], 'old');
  assert.ok(job.uploads.at(-1).endsWith('/hls/master.m3u8'));
  await assert.rejects(fs.stat(job.output()), { code: 'ENOENT' });
});
test('partial uploads are removed and failed jobs retry with a delay', async () => {
  const job = fixture({ fail: true }); await job.worker.runOne();
  assert.equal(job.updates.at(-1).update.$set['video_media.status'], 'pending');
  assert.ok(job.updates.at(-1).update.$set['video_media.next_attempt_at'] > new Date());
  assert.equal(job.removed.length, 1);
});
test('three failed attempts are terminal', async () => {
  const job = fixture({ fail: true, attempts: 2 }); await job.worker.runOne();
  assert.equal(job.updates.at(-1).update.$set['video_media.status'], 'failed');
});
test('deleted or superseded documents cannot be republished', async () => {
  const job = fixture({ deleted: true }); await job.worker.runOne();
  assert.equal(job.removed.length, 1);
  assert.ok(job.updates.at(-1).query['video_media.claim']);
});
test('shutdown releases work without consuming an attempt', async () => {
  const stop = new AbortController(), job = fixture({ stop }); await job.worker.runOne(stop.signal);
  assert.equal(job.updates.at(-1).update.$set['video_media.status'], 'pending');
  assert.equal(job.updates.at(-1).update.$inc['video_media.attempts'], -1);
});
