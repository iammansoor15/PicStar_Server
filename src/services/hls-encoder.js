import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function runTool(binary, args, { signal, timeout = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { signal, timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1048576); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) :
      reject(new Error('Video encoder failed: ' + stderr.slice(-1200))));
  });
}

export async function probeVideo(file, options = {}) {
  const output = await runTool(options.ffprobe || 'ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], options);
  const probe = JSON.parse(output);
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  if (!video || !video.width || !video.height) throw new Error('Source has no playable video stream');
  const rotation = Number(video.side_data_list?.find(item => item.rotation !== undefined)?.rotation || video.tags?.rotate || 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  const [rateN, rateD = 1] = String(video.avg_frame_rate || video.r_frame_rate || '30/1').split('/').map(Number);
  return {
    width: rotated ? video.height : video.width,
    height: rotated ? video.width : video.height,
    duration: Number(probe.format.duration || video.duration || 0),
    fps: Math.max(1, Math.min(30, Math.round(rateN / rateD) || 30)),
    hasAudio: probe.streams.some(stream => stream.codec_type === 'audio'),
  };
}

const even = value => Math.max(2, Math.floor(value / 2) * 2);
export function fitVideo(width, height, shortEdge) {
  const factor = Math.min(1, shortEdge / Math.min(width, height), 1280 / Math.max(width, height));
  return { width: even(width * factor), height: even(height * factor) };
}

export function canvasDimensions(width, height, canvas) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const w = Math.max(1, Math.round(canvas.width));
  const h = Math.max(1, Math.round(canvas.height));
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error('Invalid video reference dimensions');
  const divisor = gcd(w, h), unitW = w / divisor, unitH = h / divisor;
  const step = unitW % 2 || unitH % 2 ? 2 : 1;
  const wanted = Math.ceil(Math.max(width / unitW, height / unitH) / step) * step;
  const maximum = Math.floor(1920 / Math.max(unitW, unitH) / step) * step;
  const scale = Math.min(wanted, maximum);
  if (scale < 1) throw new Error('Unsupported video reference dimensions');
  return { width: unitW * scale, height: unitH * scale };
}
export function makeLadder(width, height) {
  const presets = [
    { size: 360, videoBitrate: 350000, audioBitrate: 64000 },
    { size: 540, videoBitrate: 800000, audioBitrate: 96000 },
    { size: 720, videoBitrate: 1600000, audioBitrate: 96000 },
  ];
  const seen = new Set();
  return presets.flatMap(preset => {
    const dimensions = fitVideo(width, height, preset.size);
    const key = dimensions.width + 'x' + dimensions.height;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...preset, ...dimensions, name: Math.min(dimensions.width, dimensions.height) + 'p' }];
  });
}

export function cropFilter(crop, width, height) {
  if (!crop) return null;
  const x = Math.min(even(width) - 2, Math.max(0, Math.floor(crop.crop_x * width / crop.preview_w / 2) * 2));
  const y = Math.min(even(height) - 2, Math.max(0, Math.floor(crop.crop_y * height / crop.preview_h / 2) * 2));
  const w = Math.min(even(crop.crop_w * width / crop.preview_w), even(width - x));
  const h = Math.min(even(crop.crop_h * height / crop.preview_h), even(height - y));
  return 'crop=' + w + ':' + h + ':' + x + ':' + y;
}

export function masterPlaylist(variants, { hasAudio, fps }) {
  return [
    '#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS',
    ...variants.flatMap(variant => {
      const total = variant.videoBitrate + (hasAudio ? variant.audioBitrate : 0);
      const codecs = 'avc1.4d401f' + (hasAudio ? ',mp4a.40.2' : '');
      return [
        '#EXT-X-STREAM-INF:BANDWIDTH=' + Math.ceil(total * 1.25) +
          ',AVERAGE-BANDWIDTH=' + total + ',RESOLUTION=' + variant.width + 'x' + variant.height +
          ',FRAME-RATE=' + fps.toFixed(3) + ',CODECS="' + codecs + '"',
        variant.name + '/index.m3u8',
      ];
    }), '',
  ].join('\n');
}

export async function encodeHls(input, output, { signal, crop = null, canvas = null, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe',
  timeout = 900000, maxDuration = 600, threads = 2 } = {}) {
  const options = { signal, timeout, ffmpeg, ffprobe };
  const initial = await probeVideo(input, options);
  if (!initial.duration || initial.duration > maxDuration) throw new Error('Video exceeds the supported preparation duration');
  await fs.mkdir(output, { recursive: true });
  const source = path.join(output, 'source.mp4');
  const filter = cropFilter(crop, initial.width, initial.height);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?'];
  const cropSize = filter ? filter.slice(5).split(':').map(Number) : [initial.width, initial.height];
  const frame = canvas ? canvasDimensions(cropSize[0], cropSize[1], canvas) : { width: 1920, height: 1920 };
  const scaling = "scale=w='min(" + frame.width + ",iw)':h='min(" + frame.height + ",ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
  const padding = canvas ? 'pad=' + frame.width + ':' + frame.height + ':(ow-iw)/2:(oh-ih)/2:black' : null;
  const filters = [filter, scaling, padding, 'setsar=1'].filter(Boolean);
  args.push('-vf', filters.join(','), '-c:v', 'libx264', '-threads', String(threads),
    '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-metadata:s:v:0', 'rotate=0', source);
  await runTool(ffmpeg, args, options);
  const info = await probeVideo(source, options);
  const variants = makeLadder(info.width, info.height);
  for (const variant of variants) {
    const dir = path.join(output, 'hls', variant.name);
    await fs.mkdir(dir, { recursive: true });
    const encoding = [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=' + variant.width + ':' + variant.height + ',fps=' + info.fps + ',setsar=1',
      '-c:v', 'libx264', '-threads', String(threads), '-preset', 'fast', '-profile:v', 'main',
      '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-b:v', String(variant.videoBitrate),
      '-maxrate', String(variant.videoBitrate), '-bufsize', String(variant.videoBitrate * 2),
      '-g', String(info.fps * 2), '-keyint_min', String(info.fps * 2), '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*2)', '-flags', '+cgop',
      '-c:a', 'aac', '-b:a', String(variant.audioBitrate), '-ac', '2', '-ar', '48000',
      '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4', '-hls_flags', 'independent_segments',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', path.join(dir, 'segment_%05d.m4s'), path.join(dir, 'index.m3u8'),
    ];
    await runTool(ffmpeg, encoding, options);
    const playlist = await fs.readFile(path.join(dir, 'index.m3u8'), 'utf8');
    if (!playlist.includes('#EXT-X-ENDLIST') || !playlist.includes('#EXT-X-MAP:')) {
      throw new Error('Encoder produced an incomplete HLS playlist');
    }
  }
  await fs.writeFile(path.join(output, 'hls', 'master.m3u8'), masterPlaylist(variants, info));
  const posterSize = fitVideo(info.width, info.height, 540);
  await runTool(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(1, info.duration / 2)), '-i', source,
    '-frames:v', '1', '-vf', 'scale=' + posterSize.width + ':' + posterSize.height, '-q:v', '3',
    path.join(output, 'poster.jpg'),
  ], options);
  return { ...info, variants };
}
