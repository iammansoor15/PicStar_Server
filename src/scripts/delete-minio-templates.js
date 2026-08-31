import minio from '../utils/minio.js';
import dotenv from 'dotenv';

dotenv.config();

const PREFIX = 'narayana_templates';

async function confirm() {
  const envConfirm = process.env.MINIO_DELETE_CONFIRM === 'YES_DELETE_ALL';
  if (!envConfirm) {
    console.error('Refusing to delete. Set MINIO_DELETE_CONFIRM=YES_DELETE_ALL in your environment for this run.');
    process.exit(1);
  }
}

async function deleteAll() {
  try {
    await confirm();

    console.log(`Listing objects with prefix: ${PREFIX}`);

    const objects = await minio.listObjects(`${PREFIX}/`);
    console.log(`Found ${objects.length} objects to delete`);

    let totalDeleted = 0;

    for (const obj of objects) {
      try {
        await minio.deleteObject(obj.name);
        totalDeleted++;
        if (totalDeleted % 10 === 0) {
          console.log(`Deleted ${totalDeleted}/${objects.length} objects...`);
        }
      } catch (e) {
        console.warn(`Failed to delete ${obj.name}:`, e.message);
      }
    }

    console.log(`✅ Completed. Total objects deleted: ${totalDeleted}`);
  } catch (err) {
    console.error('Error deleting MinIO templates:', err.message);
    process.exit(1);
  }
}

await deleteAll();
