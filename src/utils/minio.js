import { Client } from 'minio';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

dotenv.config();

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET || 'picstar';

// Ensure bucket exists
async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET);
      console.log(`✅ MinIO bucket '${BUCKET}' created`);
    }
  } catch (error) {
    console.error('❌ MinIO bucket check failed:', error.message);
  }
}

// Initialize bucket on startup
ensureBucket();

// Get presigned URL for an object
// Note: S3/MinIO presigned URLs have a max expiry of 7 days (604800 seconds)
// For truly permanent URLs, configure bucket policy for public read access
async function getPublicUrl(objectName) {
  const expiry = 604800; // 7 days (maximum allowed)
  return await minioClient.presignedGetObject(BUCKET, objectName, expiry);
}

// Upload buffer to MinIO
async function uploadBuffer(buffer, folder, options = {}) {
  const ext = options.extension || '.png';
  const filename = options.filename || `${uuidv4()}${ext}`;
  const objectName = folder ? `${folder}/${filename}` : filename;

  const metadata = {
    'Content-Type': options.contentType || 'application/octet-stream',
    ...options.metadata,
  };

  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, metadata);

  const url = await getPublicUrl(objectName);
  return {
    objectName,
    url,
    secure_url: url,
    public_id: objectName,
    size: buffer.length,
  };
}

// Upload file from path to MinIO
async function uploadFile(filePath, folder, options = {}) {
  const ext = path.extname(filePath);
  const filename = options.filename || `${uuidv4()}${ext}`;
  const objectName = folder ? `${folder}/${filename}` : filename;

  const metadata = {
    'Content-Type': options.contentType || getMimeType(ext),
    ...options.metadata,
  };

  await minioClient.fPutObject(BUCKET, objectName, filePath, metadata);

  const stat = await minioClient.statObject(BUCKET, objectName);

  const url = await getPublicUrl(objectName);
  return {
    objectName,
    url,
    secure_url: url,
    public_id: objectName,
    size: stat.size,
    etag: stat.etag,
  };
}

// Upload from stream
async function uploadStream(stream, folder, options = {}) {
  const ext = options.extension || '.png';
  const filename = options.filename || `${uuidv4()}${ext}`;
  const objectName = folder ? `${folder}/${filename}` : filename;

  const metadata = {
    'Content-Type': options.contentType || 'application/octet-stream',
    ...options.metadata,
  };

  await minioClient.putObject(BUCKET, objectName, stream, options.size, metadata);

  const url = await getPublicUrl(objectName);
  return {
    objectName,
    url,
    secure_url: url,
    public_id: objectName,
  };
}

// Delete object from MinIO
async function deleteObject(objectName) {
  try {
    await minioClient.removeObject(BUCKET, objectName);
    return { success: true };
  } catch (error) {
    console.error('❌ MinIO delete error:', error.message);
    return { success: false, error: error.message };
  }
}

// List objects in a folder
async function listObjects(prefix = '', recursive = true) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjects(BUCKET, prefix, recursive);

    stream.on('data', (obj) => objects.push(obj));
    stream.on('error', reject);
    stream.on('end', () => resolve(objects));
  });
}

// List folders (prefixes) under a path
async function listFolders(prefix = '') {
  return new Promise((resolve, reject) => {
    const folders = new Set();
    const stream = minioClient.listObjects(BUCKET, prefix, false);

    stream.on('data', (obj) => {
      if (obj.prefix) {
        folders.add(obj.prefix.replace(prefix, '').replace('/', ''));
      }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve([...folders]));
  });
}

// Get object stats
async function getObjectStats(objectName) {
  try {
    const stat = await minioClient.statObject(BUCKET, objectName);
    return {
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      contentType: stat.metaData?.['content-type'],
    };
  } catch (error) {
    return null;
  }
}

// Helper to get mime type from extension
function getMimeType(ext) {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

export default {
  client: minioClient,
  bucket: BUCKET,
  uploadBuffer,
  uploadFile,
  uploadStream,
  deleteObject,
  listObjects,
  listFolders,
  getObjectStats,
  getPublicUrl,
};
