import minio from '../utils/minio.js';
import streamifier from 'streamifier';

class TemplateController {
  TEMPLATE_FOLDER_PREFIX = "narayana_templates";

  // Sanitize category string (safe for folder names)
  sanitizeCategory(category) {
    return category.replace(/[^a-zA-Z0-9-_]/g, "");
  }

  // Extract category from object name
  extractCategory(objectName) {
    const parts = objectName.split("/");
    // Example: narayana_templates/congratulations/abcd1234.png
    if (parts.length >= 3 && parts[0] === this.TEMPLATE_FOLDER_PREFIX) {
      return parts[1];
    }
    return null;
  }

  // Extract unique template ID (filename without extension)
  extractTemplateId(objectName) {
    const parts = objectName.split("/");
    if (parts.length > 0) {
      const filename = parts[parts.length - 1];
      return filename.split('.')[0];
    }
    return null;
  }

  // Get file format from object name
  getFormat(objectName) {
    const ext = objectName.split('.').pop();
    return ext || 'unknown';
  }

  // ===============================
  // Fetch all templates
  // ===============================
  async getAllTemplates(req, res) {
    try {
      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 10;
      const offset = (pageNum - 1) * limitNum;

      const objects = await minio.listObjects(`${this.TEMPLATE_FOLDER_PREFIX}/`);

      // Sort by lastModified descending
      objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      // Paginate
      const paginatedObjects = objects.slice(offset, offset + limitNum);

      const templates = await Promise.all(paginatedObjects.map(async obj => {
        const url = await minio.getPublicUrl(obj.name);
        return {
          id: this.extractTemplateId(obj.name),
          category: this.extractCategory(obj.name),
          url,
          secure_url: url,
          public_id: obj.name,
          format: this.getFormat(obj.name),
          created_at: obj.lastModified,
          size: obj.size,
        };
      }));

      res.json({
        templates,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_count: objects.length,
          has_next_page: offset + limitNum < objects.length,
          next_cursor: offset + limitNum < objects.length ? String(pageNum + 1) : null
        }
      });
    } catch (err) {
      console.error("Error fetching templates:", err);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  }

  // ===============================
  // Fetch templates by category
  // ===============================
  async getTemplatesByCategory(req, res) {
    try {
      const category = req.params.category;
      const safeCategory = this.sanitizeCategory(category);
      const folder = `${this.TEMPLATE_FOLDER_PREFIX}/${safeCategory}/`;

      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 10;
      const offset = (pageNum - 1) * limitNum;

      const objects = await minio.listObjects(folder);

      // Sort by lastModified descending
      objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      // Paginate
      const paginatedObjects = objects.slice(offset, offset + limitNum);

      const templates = await Promise.all(paginatedObjects.map(async obj => {
        const url = await minio.getPublicUrl(obj.name);
        return {
          id: this.extractTemplateId(obj.name),
          category: safeCategory,
          url,
          secure_url: url,
          public_id: obj.name,
          format: this.getFormat(obj.name),
          created_at: obj.lastModified,
          size: obj.size,
        };
      }));

      return res.json({
        success: true,
        data: {
          category: safeCategory,
          templates,
          pagination: {
            current_page: pageNum,
            per_page: limitNum,
            total_count: objects.length,
            has_next_page: offset + limitNum < objects.length,
            next_cursor: offset + limitNum < objects.length ? String(pageNum + 1) : null
          }
        }
      });
    } catch (err) {
      console.error("Error loading templates by category:", err);
      return res.status(500).json({ success: false, error: "Failed to load category templates" });
    }
  }

  // ===============================
  // Upload new template
  // ===============================
  async uploadTemplate(req, res) {
    try {
      const category = this.sanitizeCategory(req.body.category);
      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Template file is required" });
      }

      const folder = `${this.TEMPLATE_FOLDER_PREFIX}/${category}`;
      const originalFilename = req.file.originalname.replace(/\.[^/.]+$/, "");
      const ext = req.file.originalname.match(/\.[^/.]+$/)?.[0] || '.png';

      let uploadResult;
      if (req.file.buffer) {
        uploadResult = await minio.uploadBuffer(req.file.buffer, folder, {
          filename: `${originalFilename}${ext}`,
          contentType: req.file.mimetype || 'image/png',
        });
      } else {
        uploadResult = await minio.uploadFile(req.file.path, folder, {
          filename: `${originalFilename}${ext}`,
          contentType: req.file.mimetype || 'image/png',
        });
      }

      return res.json({
        success: true,
        data: {
          template: {
            id: this.extractTemplateId(uploadResult.objectName),
            category,
            secure_url: uploadResult.secure_url,
            url: uploadResult.url,
            public_id: uploadResult.objectName,
            format: this.getFormat(uploadResult.objectName),
            created_at: new Date().toISOString(),
            size: uploadResult.size,
          }
        }
      });
    } catch (err) {
      console.error("Error uploading template:", err);
      return res.status(500).json({ success: false, error: "Failed to upload template" });
    }
  }

  // ===============================
  // Get template categories (subfolders of prefix)
  // ===============================
  async getTemplateCategories(req, res) {
    try {
      const folders = await minio.listFolders(`${this.TEMPLATE_FOLDER_PREFIX}/`);
      const categories = folders.map(f => ({
        key: f,
        label: f,
      }));
      return res.json({ success: true, data: { categories } });
    } catch (err) {
      console.error('Error fetching template categories:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch template categories' });
    }
  }

  // ===============================
  // Batch upload templates
  // ===============================
  async batchUploadTemplates(req, res) {
    try {
      const category = this.sanitizeCategory(req.body.category || 'uncategorized');
      const folder = `${this.TEMPLATE_FOLDER_PREFIX}/${category}`;
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const uploadOne = async (file) => {
        try {
          const ext = file.originalname.match(/\.[^/.]+$/)?.[0] || '.png';
          let uploadResult;

          if (file.buffer) {
            uploadResult = await minio.uploadBuffer(file.buffer, folder, {
              extension: ext,
              contentType: file.mimetype || 'image/png',
            });
          } else {
            uploadResult = await minio.uploadFile(file.path, folder, {
              contentType: file.mimetype || 'image/png',
            });
          }

          return {
            success: true,
            template: {
              id: this.extractTemplateId(uploadResult.objectName),
              category,
              secure_url: uploadResult.secure_url,
              url: uploadResult.url,
              public_id: uploadResult.objectName,
              format: this.getFormat(uploadResult.objectName),
              created_at: new Date().toISOString(),
              size: uploadResult.size,
            }
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      };

      const results = [];
      for (const f of files) {
        results.push(await uploadOne(f));
      }

      return res.json({ success: true, data: { results, category } });
    } catch (err) {
      console.error('Error in batch upload:', err);
      return res.status(500).json({ success: false, error: 'Failed to batch upload templates' });
    }
  }

  // ===============================
  // Delete template by category + id
  // ===============================
  async deleteTemplate(req, res) {
    try {
      const category = this.sanitizeCategory(req.params.category);
      const templateId = this.sanitizeCategory(req.params.templateId);
      if (!category || !templateId) {
        return res.status(400).json({ success: false, error: 'category and templateId are required' });
      }

      // List objects to find the actual file (we don't know the extension)
      const prefix = `${this.TEMPLATE_FOLDER_PREFIX}/${category}/${templateId}`;
      const objects = await minio.listObjects(prefix);

      if (objects.length === 0) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }

      // Delete the first matching object
      const result = await minio.deleteObject(objects[0].name);
      return res.json({ success: true, data: { result, public_id: objects[0].name } });
    } catch (err) {
      console.error('Error deleting template:', err);
      return res.status(500).json({ success: false, error: 'Failed to delete template' });
    }
  }

  // ===============================
  // Search templates
  // ===============================
  async searchTemplates(req, res) {
    try {
      const query = (req.query.query || '').trim().toLowerCase();
      const categories = (req.query.categories || '').split(',').filter(Boolean);
      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 20;
      const offset = (pageNum - 1) * limitNum;

      // List all objects under the template prefix
      const objects = await minio.listObjects(`${this.TEMPLATE_FOLDER_PREFIX}/`);

      // Filter by categories if specified
      let filteredObjects = objects;
      if (categories.length > 0) {
        const safeCats = categories.map(c => this.sanitizeCategory(c).toLowerCase());
        filteredObjects = objects.filter(obj => {
          const objCategory = this.extractCategory(obj.name);
          return objCategory && safeCats.includes(objCategory.toLowerCase());
        });
      }

      // Filter by query (search in object name/id)
      if (query) {
        filteredObjects = filteredObjects.filter(obj =>
          obj.name.toLowerCase().includes(query)
        );
      }

      // Sort by lastModified descending
      filteredObjects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      // Paginate
      const paginatedObjects = filteredObjects.slice(offset, offset + limitNum);

      const templates = await Promise.all(paginatedObjects.map(async obj => {
        const url = await minio.getPublicUrl(obj.name);
        return {
          id: this.extractTemplateId(obj.name),
          category: this.extractCategory(obj.name),
          url,
          secure_url: url,
          public_id: obj.name,
          format: this.getFormat(obj.name),
          created_at: obj.lastModified,
          size: obj.size,
        };
      }));

      return res.json({
        success: true,
        data: {
          templates,
          pagination: {
            current_page: pageNum,
            per_page: limitNum,
            total_count: filteredObjects.length,
            has_next_page: offset + limitNum < filteredObjects.length,
            next_cursor: offset + limitNum < filteredObjects.length ? String(pageNum + 1) : null
          }
        }
      });
    } catch (err) {
      console.error('Error searching templates:', err);
      return res.status(500).json({ success: false, error: 'Failed to search templates' });
    }
  }
}

export default new TemplateController();
