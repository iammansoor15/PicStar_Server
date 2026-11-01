# HLS video delivery

Recorded template playback uses adaptive HLS. Edited exports, gallery saves, sharing, older app versions, and web previews continue to use MP4.

## Components

- src/services/hls-encoder.js prepares H.264/AAC MP4, JPEG posters, and fMP4 HLS renditions.
- src/services/hls-worker.js claims durable MongoDB template jobs. A separate PM2 process runs src/workers/hls-worker.js.
- src/routes/media-routes.js serves signed, scoped playlists and media from the existing private MinIO bucket.
- src/utils/video-media.js enriches all template/video API responses. Stored object keys are independent of expiring URLs.
- The app's TemplateVideoPlayer selects ready HLS streams, refreshes access once on failure, then tries MP4. Offscreen/background decoders are unmounted.
- VideoDownloadService downloads a complete MP4 only for explicit save/share and deduplicates simultaneous exports.

## Environment

Keep the existing database, storage, authentication, payment, and 2Factor configuration.

Add to the backend .env:

    HLS_ENABLED=true
    HLS_SIGNING_SECRET=<a persistent random secret of at least 32 bytes>
    HLS_STORAGE_HOSTS=s3.codebinary.in,storage.codebinary.in
    HLS_MAX_DURATION_SECONDS=600

Generate the signing secret once, store it only in the server environment, and retain it across restarts. The API and worker use the same .env. JWT_SECRET can supply the signing secret when a dedicated HLS_SIGNING_SECRET is absent; a dedicated secret is recommended.

Optional settings:

- HLS_URL_TTL_SECONDS: defaults to 21600 (six hours), bounded to 600–86400 seconds.
- FFMPEG_PATH / FFPROBE_PATH: executable locations when not on PATH.

FFmpeg and FFprobe must be installed. The worker uses one job at a time and two encoder threads. Inputs retain the existing 100 MB upload limit. Preparation times out per encoder command and defaults to a maximum ten-minute input duration.

## Start and migrate

From the backend directory:

    npm run test:config
    npm run test:hls
    pm2 restart picstar --update-env
    pm2 start ecosystem.hls.config.cjs
    npm run hls:migrate
    npm run hls:migrate -- --apply
    pm2 save

The migration defaults to a dry run. It adds jobs for existing videos without changing their IDs, ordering, categories, overlay coordinates, or original objects. It recovers legacy MinIO sources by object key rather than requesting their expired signed URLs. Existing Cloudinary video sources are downloaded only from the supported HTTPS upload origin.

Rerunning the migration skips queued/ready assets. To requeue terminal failures:

    npm run hls:migrate -- --apply --retry-failed

In local development, run the API and npm run worker:hls in separate terminals.

## Upload and playback contract

POST /api/videos/upload returns HTTP 202 after the input is durably uploaded and its pending template is saved. The upload page polls preparation status.

GET /api/videos/:id/playback returns fresh template metadata, including:

- hls_status: legacy, pending, processing, ready, or failed
- hls_url: a master playlist only when preparation is ready and HLS_ENABLED is true
- source_mp4_url: an independent complete MP4
- poster_url, media_version, video_width, video_height, video_duration
- video_url: MP4 compatibility for existing consumers

List, category, latest, serial, and batch template responses use the same enrichment. Batch items include stable IDs. Internal storage/lease fields are omitted from API responses.

Signed URLs put the token in the path, so relative variant, initialization, and segment references retain authorization. Signing just a master playlist's query string does not authorize its child objects. The media route validates the asset scope and every requested path, handles GET/HEAD/range/conditional requests, and exposes the relevant headers through CORS.

Media segment requests bypass the normal low-volume API quota. The existing private bucket policy is retained.

## Encoding, retries, and deletion

- Renditions target short edges of 360, 540, and 720 pixels, bounded to 1280 pixels on the long edge; source resolution is never increased.
- HLS uses two-second aligned closed GOPs, VOD playlists, H.264 Main/AAC, and independent fMP4 segments.
- The MP4 reference canvas is preserved for photo/text/banner export geometry. Letterboxing preserves source aspect ratio without enlarging source content.
- Worker leases last two minutes and are renewed every thirty seconds. Abandoned leases can be reclaimed.
- Retries are bounded to three attempts with backoff. Each attempt has its own immutable object prefix.
- The master is uploaded last and the template becomes ready only after every media object is present.
- Removing a template removes its source and generated media prefixes. Deletion invalidates the worker's conditional publish operation.
- Backfill retains original files. Do not remove originals as part of this migration.

## Checks and rollback

npm run test:hls includes real FFmpeg encode/decode checks when FFmpeg is installed. On a machine without FFmpeg, the real-codec test is explicitly skipped; run it on the worker host before rollout.

Validate all variants, initialization files, and segments through their signed HTTP paths. Confirm MP4 byte ranges and poster responses. Test expired access, slow-network adaptation, looping, save/share, and overlays on physical Android/iOS devices. React Native Video v6 does not provide HLS disk caching on iOS; Android's player cache is bounded to 64 MB.

To disable HLS delivery while retaining MP4 playback and background preparation:

    # Set HLS_ENABLED=false in .env
    pm2 restart picstar --update-env

Keep the worker running to prepare MP4 exports for new uploads. The migration leaves original URLs and objects intact, and the rollout backup contains the previous source, .env, and affected video metadata.

## Removed playback code

Whole-MP4 feed prefetching and its manager were replaced with bounded HLS playback and explicit export downloads. TemplateGrid and TemplateTabView were unreferenced by application entry points and were removed. Unused DASH and SmoothStreaming player modules are disabled; HLS remains enabled. Server MP4 compositing, the native VideoComposer, image behavior, and downloaded user templates are retained.
