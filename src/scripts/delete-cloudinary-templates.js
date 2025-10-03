import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const PREFIX = 'narayana_templates';

async function confirm() {
  const envConfirm = process.env.CLOUDINARY_DELETE_CONFIRM === 'YES_DELETE_ALL';
  if (!envConfirm) {
    console.error('Refusing to delete. Set CLOUDINARY_DELETE_CONFIRM=YES_DELETE_ALL in your environment for this run.');
    process.exit(1);
  }
}

async function deleteAll() {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    await confirm();

    console.log(`Listing resources with prefix: ${PREFIX}`);
    let next_cursor = undefined;
    let totalDeleted = 0;

    do {
      const list = await cloudinary.api.resources({
        type: 'upload',
        prefix: `${PREFIX}/`,
        max_results: 500,
        next_cursor,
      });
      const ids = (list.resources || []).map((r) => r.public_id);
      if (ids.length > 0) {
        console.log(`Deleting ${ids.length} resources...`);
        const del = await cloudinary.api.delete_resources(ids);
        totalDeleted += ids.length;
      }
      next_cursor = list.next_cursor;
    } while (next_cursor);

    console.log('Deleting derived resources and empty folders...');
    try {
      await cloudinary.api.delete_resources_by_prefix(`${PREFIX}/`);
    } catch {}

    // Attempt to remove folders (from deepest to root)
    const folders = await cloudinary.api.root_folders();
    async function deleteFolderRecursively(folderPath) {
      try {
        const sub = await cloudinary.api.sub_folders(folderPath);
        for (const f of sub.folders || []) {
          await deleteFolderRecursively(f.path);
        }
        await cloudinary.api.delete_folder(folderPath);
        console.log(`Deleted folder: ${folderPath}`);
      } catch (e) {
        // ignore
      }
    }
    await deleteFolderRecursively(PREFIX);

    console.log(`✅ Completed. Total images deleted: ${totalDeleted}`);
  } catch (err) {
    console.error('Error deleting Cloudinary templates:', err.message);
    process.exit(1);
  }
}

await deleteAll();