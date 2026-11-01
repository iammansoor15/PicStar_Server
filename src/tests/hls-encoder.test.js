import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { encodeHls, fitVideo, makeLadder, cropFilter, masterPlaylist, runTool, probeVideo, canvasDimensions } from '../services/hls-encoder.js';
test('quality ladders preserve aspect ratio and do not upscale small sources', () => {
  assert.deepEqual(canvasDimensions(640, 360, { width: 270, height: 480 }), { width: 648, height: 1152 });
  assert.deepEqual(fitVideo(1080, 1920, 540), { width: 540, height: 960 });
  assert.deepEqual(fitVideo(1920, 1080, 360), { width: 640, height: 360 });
  assert.equal(makeLadder(240, 320).length, 1);
  assert.deepEqual(makeLadder(1080, 1920).map(v => v.name), ['360p', '540p', '720p']);
  for (const v of makeLadder(719, 1279)) {
    assert.ok(v.width <= 719 && v.height <= 1279);
    assert.equal(v.width % 2, 0); assert.equal(v.height % 2, 0);
  }
});
test('crop mapping and optional audio are represented correctly', () => {
  assert.equal(cropFilter({ crop_x: 10, crop_y: 10, crop_w: 50, crop_h: 80, preview_w: 100, preview_h: 100 }, 720, 1280), 'crop=360:1024:72:128');
  const ladder = makeLadder(720, 1280);
  const silent = masterPlaylist(ladder, { hasAudio: false, fps: 24 });
  assert.ok(silent.includes('#EXT-X-INDEPENDENT-SEGMENTS'));
  assert.equal((silent.match(/#EXT-X-STREAM-INF/g) || []).length, 3);
  assert.equal(silent.includes('mp4a.40.2'), false);
  assert.ok(masterPlaylist(ladder, { hasAudio: true, fps: 24 }).includes('mp4a.40.2'));
});
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
test('real FFmpeg creates playable portrait, silent, landscape, and rotated HLS', {
  skip: available ? false : 'FFmpeg unavailable locally; run on the video worker host.', timeout: 180000,
}, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'picstar-hls-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const item of [
    { name: 'portrait', w: 720, h: 1280, audio: true, duration: 2.2 },
    { name: 'silent', w: 240, h: 320, audio: false, duration: 0.7 },
    { name: 'landscape', w: 640, h: 360, audio: true, duration: 2.2 },
    { name: 'rotated', w: 320, h: 240, audio: false, duration: 0.7, rotate: true },
  ]) {
    let source = path.join(dir, item.name + '.mp4');
    const args = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=' + item.w + 'x' + item.h + ':rate=24'];
    if (item.audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000');
    args.push('-t', String(item.duration), '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
    if (item.audio) args.push('-c:a', 'aac');
    args.push(source); await runTool(ffmpeg, args);
    if (item.rotate) {
      const rotated = path.join(dir, 'with-rotation.mp4');
      await runTool(ffmpeg, ['-loglevel', 'error', '-y', '-display_rotation:v:0', '90', '-i', source, '-c', 'copy', rotated]);
      source = rotated;
    }
    const out = path.join(dir, item.name), info = await encodeHls(source, out, { ffmpeg, ffprobe });
    assert.equal(info.hasAudio, item.audio);
    if (item.rotate) assert.ok(info.height > info.width);
    if (item.name === 'portrait') assert.equal(info.variants.length, 3);
    for (const variant of info.variants) {
      const file = path.join(out, 'hls', variant.name, 'index.m3u8');
      const body = await fs.readFile(file, 'utf8');
      assert.ok(body.includes('#EXT-X-ENDLIST')); assert.ok(body.includes('#EXT-X-MAP:URI="init.mp4"'));
      await runTool(ffmpeg, ['-loglevel', 'error', '-i', file, '-f', 'null', '-']);
      const decoded = await probeVideo(file, { ffprobe });
      assert.equal(decoded.width, variant.width); assert.equal(decoded.height, variant.height);
      assert.ok(Math.abs(decoded.duration - info.duration) < 0.3);
    }
    if (item.name === 'landscape') {
      const framed = await encodeHls(source, path.join(dir, 'framed'), { ffmpeg, ffprobe, canvas: { width: 270, height: 480 } });
      assert.ok(Math.abs(framed.width / framed.height - 9 / 16) < 0.001);
    }
    assert.ok((await fs.stat(path.join(out, 'poster.jpg'))).size > 0);
    assert.ok((await fs.stat(path.join(out, 'source.mp4'))).size > 0);
  }
});
