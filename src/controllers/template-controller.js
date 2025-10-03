import cloud from '../utils/cloudinary.js';
import streamifier from 'streamifier';

class TemplateController {
  TEMPLATE_FOLDER_PREFIX = "narayana_templates";

  // 🔹 Sanitize category string (safe for folder names)
  sanitizeCategory(category) {
    return category.replace(/[^a-zA-Z0-9-_]/g, "");
  }

  // 🔹 Extract category from Cloudinary public_id
  extractCategory(publicId) {
    const parts = publicId.split("/");
    // Example: narayana_templates/congratulations/abcd1234
    if (parts.length >= 3 && parts[0] === this.TEMPLATE_FOLDER_PREFIX) {
      return parts[1];
    }
    return null;
  }

  // 🔹 Extract unique template ID (last part of public_id)
  extractTemplateId(publicId) {
    const parts = publicId.split("/");
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }

  // ===============================
  // 📌 Fetch all templates
  // ===============================
  async getAllTemplates(req, res) {
    try {
      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 10;
      const sortField = req.query.sortField || "created_at";
      const sortOrder = req.query.sortOrder || "desc";

const result = await cloud.search
        .expression(`folder:${this.TEMPLATE_FOLDER_PREFIX}/*`)
        .sort_by(sortField, sortOrder)
        .max_results(limitNum)
        .next_cursor(req.query.next_cursor || undefined)
        .execute();

      const templates = result.resources.map(r => ({
        id: this.extractTemplateId(r.public_id),
        category: this.extractCategory(r.public_id),
        url: r.secure_url,
        public_id: r.public_id,
        format: r.format,
        created_at: r.created_at,
        width: r.width,
        height: r.height,
        tags: r.tags,
        context: r.context
      }));

      res.json({
        templates,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_count: result.total_count || templates.length,
          has_next_page: !!result.next_cursor,
          next_cursor: result.next_cursor || null
        }
      });
    } catch (err) {
      console.error("Error fetching templates:", err);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  }

  // ===============================
  // 📌 Fetch templates by category
  // ===============================
  async getTemplatesByCategory(req, res) {
    try {
      const category = req.params.category;
      const safeCategory = this.sanitizeCategory(category);
      const folder = `${this.TEMPLATE_FOLDER_PREFIX}/${safeCategory}`;

      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 10;
      const sortField = req.query.sort_by || req.query.sortField || "created_at";
      const sortOrder = req.query.order || req.query.sortOrder || "desc";

      const searchExpressions = [
        `folder:\"${folder}\"`,
        `public_id:${folder}/*`,
        `tags=${safeCategory}`,
        `context=${safeCategory}`
      ];

      let result;
      let templates = [];

      for (const expr of searchExpressions) {
        try {
result = await cloud.search
            .expression(expr)
            .sort_by(sortField, sortOrder)
            .max_results(limitNum)
            .next_cursor(req.query.next_cursor || undefined)
            .execute();

          if (result.resources && result.resources.length > 0) {
            templates = result.resources.map(r => ({
              id: this.extractTemplateId(r.public_id),
              category: safeCategory,
              secure_url: r.secure_url,
              url: r.secure_url,
              public_id: r.public_id,
              format: r.format,
              created_at: r.created_at,
              width: r.width,
              height: r.height,
              tags: r.tags,
              context: r.context
            }));
            break;
          }
        } catch (err) {
          console.warn(`Search failed for expression: ${expr}`, err.message);
          continue;
        }
      }

      return res.json({
        success: true,
        data: {
          category: safeCategory,
          templates,
          pagination: {
            current_page: pageNum,
            per_page: limitNum,
            total_count: result?.total_count || templates.length,
            has_next_page: !!result?.next_cursor,
            next_cursor: result?.next_cursor || null
          }
        }
      });
    } catch (err) {
      console.error("Error loading templates by category:", err);
      return res.status(500).json({ success: false, error: "Failed to load category templates" });
    }
  }

  // ===============================
  // 📌 Upload new template
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

      const uploadOptions = {
        folder,
        public_id: originalFilename,
        resource_type: "image",
        overwrite: true,
        use_filename: true,
        unique_filename: true,
        tags: [category],
        context: { category }
      };

      let uploadResult;
      if (req.file.buffer) {
        uploadResult = await new Promise((resolve, reject) => {
const uploadStream = cloud.uploader.upload_stream(uploadOptions, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });
      } else {
uploadResult = await cloud.uploader.upload(req.file.path, uploadOptions);
      }


      return res.json({
        success: true,
        data: {
          template: {
            id: this.extractTemplateId(uploadResult.public_id),
            category,
            secure_url: uploadResult.secure_url,
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
            format: uploadResult.format,
            created_at: uploadResult.created_at,
            width: uploadResult.width,
            height: uploadResult.height,
            tags: uploadResult.tags,
            context: uploadResult.context
          }
        }
      });
    } catch (err) {
      console.error("Error uploading template:", err);
      return res.status(500).json({ success: false, error: "Failed to upload template" });
    }
  }

  // ===============================
  // 📌 Get template categories (subfolders of prefix)
  // ===============================
  async getTemplateCategories(req, res) {
    try {
      const folder = this.TEMPLATE_FOLDER_PREFIX;
const result = await cloud.api.sub_folders(folder);
      const categories = (result.folders || []).map(f => ({
        key: f.name,
        label: f.name,
      }));
      return res.json({ success: true, data: { categories } });
    } catch (err) {
      console.error('Error fetching template categories:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch template categories' });
    }
  }

  // ===============================
  // 📌 Batch upload templates
  // ===============================
  async batchUploadTemplates(req, res) {
    try {
      const category = this.sanitizeCategory(req.body.category || 'uncategorized');
      const folder = `${this.TEMPLATE_FOLDER_PREFIX}/${category}`;
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }
      const uploadOne = (file) => new Promise((resolve) => {
        const uploadOptions = {
          folder,
          resource_type: 'image',
          overwrite: true,
          use_filename: true,
          unique_filename: true,
          tags: [category],
          context: { category },
        };
        const done = (err, result) => {
          if (err) {
            return resolve({ success: false, error: err.message });
          }
          resolve({
            success: true,
            template: {
              id: this.extractTemplateId(result.public_id),
              category,
              secure_url: result.secure_url,
              url: result.secure_url,
              public_id: result.public_id,
              format: result.format,
              created_at: result.created_at,
              width: result.width,
              height: result.height,
              tags: result.tags,
              context: result.context,
            }
          });
        };
        if (file.buffer) {
const uploadStream = cloud.uploader.upload_stream(uploadOptions, done);
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        } else {
cloud.uploader.upload(file.path, uploadOptions).then(r => done(null, r)).catch(e => done(e));
        }
      });

      const results = [];
      for (const f of files) {
        // sequential to avoid rate limits; can be parallel if desired
        // eslint-disable-next-line no-await-in-loop
        results.push(await uploadOne(f));
      }

      return res.json({ success: true, data: { results, category } });
    } catch (err) {
      console.error('Error in batch upload:', err);
      return res.status(500).json({ success: false, error: 'Failed to batch upload templates' });
    }
  }

  // ===============================
  // 📌 Delete template by category + id
  // ===============================
  async deleteTemplate(req, res) {
    try {
      const category = this.sanitizeCategory(req.params.category);
      const templateId = this.sanitizeCategory(req.params.templateId);
      if (!category || !templateId) {
        return res.status(400).json({ success: false, error: 'category and templateId are required' });
      }
      const publicId = `${this.TEMPLATE_FOLDER_PREFIX}/${category}/${templateId}`;
const result = await cloud.uploader.destroy(publicId, { resource_type: 'image' });
      return res.json({ success: true, data: { result, public_id: publicId } });
    } catch (err) {
      console.error('Error deleting template:', err);
      return res.status(500).json({ success: false, error: 'Failed to delete template' });
    }
  }

  // ===============================
  // 📌 Search templates
  // ===============================
  async searchTemplates(req, res) {
    try {
      const query = (req.query.query || '').trim();
      const categories = (req.query.categories || '').split(',').filter(Boolean);
      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = parseInt(req.query.limit) || 20;

      const expressions = [];
      expressions.push(`folder:${this.TEMPLATE_FOLDER_PREFIX}/*`);
      if (query) {
        expressions.push(`(${[
          `public_id:*${query}*`,
          `tags=${query}`,
          `context=${query}`
        ].join(' OR ')})`);
      }
      if (categories.length) {
        const cats = categories.map(c => this.sanitizeCategory(c));
        expressions.push(`(${cats.map(c => `folder:${this.TEMPLATE_FOLDER_PREFIX}/${c}/*`).join(' OR ')})`);
      }

      const expression = expressions.join(' AND ');
const result = await cloud.search
        .expression(expression)
        .sort_by('created_at', 'desc')
        .max_results(limitNum)
        .next_cursor(req.query.next_cursor || undefined)
        .execute();

      const templates = (result.resources || []).map(r => ({
        id: this.extractTemplateId(r.public_id),
        category: this.extractCategory(r.public_id),
        secure_url: r.secure_url,
        url: r.secure_url,
        public_id: r.public_id,
        format: r.format,
        created_at: r.created_at,
        width: r.width,
        height: r.height,
        tags: r.tags,
        context: r.context,
      }));

      return res.json({
        success: true,
        data: {
          templates,
          pagination: {
            current_page: pageNum,
            per_page: limitNum,
            total_count: result?.total_count || templates.length,
            has_next_page: !!result?.next_cursor,
            next_cursor: result?.next_cursor || null
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
