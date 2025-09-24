import cloudinary from '../utils/cloudinary.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

// Template controller for managing templates with Cloudinary
export class TemplateController {
  constructor() {
    this.TEMPLATE_FOLDER_PREFIX = 'narayana_templates';
  }

  /**
   * Upload a template to Cloudinary with proper categorization
   */
  async uploadTemplate(req, res) {
    try {
      console.log('📤 Starting template upload...');
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { category, name, description } = req.body;
      
      if (!category) {
        return res.status(400).json({
          success: false,
          error: 'Category is required'
        });
      }

      // Generate unique public ID for this template
      const templateId = uuidv4();
      const publicId = `${this.TEMPLATE_FOLDER_PREFIX}/${category}/${templateId}`;

      console.log(`📁 Uploading to Cloudinary with public_id: ${publicId}`);

      // Upload to Cloudinary from memory buffer
      const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
        public_id: publicId, // Already includes the full path
        resource_type: 'image',
        overwrite: false,
        tags: ['template', category, 'narayana-app'],
        context: {
          name: name || 'Untitled Template',
          description: description || '',
          category: category,
          uploaded_at: new Date().toISOString()
        }
      });

      // No file cleanup needed for memory storage

      console.log('✅ Template uploaded successfully to Cloudinary');

      res.json({
        success: true,
        data: {
          id: templateId,
          public_id: result.public_id,
          secure_url: result.secure_url,
          category: category,
          name: name || 'Untitled Template',
          description: description || '',
          width: result.width,
          height: result.height,
          format: result.format,
          resource_type: result.resource_type,
          created_at: result.created_at,
          bytes: result.bytes,
          url: result.url,
          version: result.version
        }
      });

    } catch (error) {
      console.error('❌ Error uploading template:', error);
      
      // No file cleanup needed for memory storage

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload template'
      });
    }
  }

  /**
   * Get templates by category with pagination and lazy loading support
   */
  async getTemplatesByCategory(req, res) {
    try {
      const { category } = req.params;
      const { page = 1, limit = 10, sort_by = 'created_at', order = 'desc' } = req.query;

      console.log(`📂 Fetching templates for category: ${category}, page: ${page}, limit: ${limit}`);

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      // Search for templates in the specific category folder
      const searchOptions = {
        type: 'upload',
        prefix: `${this.TEMPLATE_FOLDER_PREFIX}/${category}/`,
        max_results: limitNum,
        next_cursor: req.query.next_cursor || undefined,
        sort_by: [[sort_by, order]],
        resource_type: 'image'
      };

      const result = await cloudinary.search
        .expression(`folder:"${this.TEMPLATE_FOLDER_PREFIX}/${category}"`)
        .with_field('tags')
        .with_field('context')
        .max_results(limitNum)
        .next_cursor(req.query.next_cursor || undefined)
        .sort_by(sort_by, order)
        .execute();

      // Transform the results to a consistent format
      const templates = result.resources.map(resource => ({
        id: this.extractTemplateId(resource.public_id),
        public_id: resource.public_id,
        secure_url: resource.secure_url,
        url: resource.url,
        category: category,
        name: resource.context?.name || 'Untitled Template',
        description: resource.context?.description || '',
        width: resource.width,
        height: resource.height,
        format: resource.format,
        created_at: resource.created_at,
        bytes: resource.bytes,
        version: resource.version,
        tags: resource.tags || []
      }));

      console.log(`✅ Found ${templates.length} templates for category: ${category}`);

      res.json({
        success: true,
        data: {
          templates,
          pagination: {
            current_page: pageNum,
            per_page: limitNum,
            total_count: result.total_count,
            has_next_page: !!result.next_cursor,
            next_cursor: result.next_cursor || null
          },
          category: category
        }
      });

    } catch (error) {
      console.error(`❌ Error fetching templates for category ${req.params.category}:`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch templates'
      });
    }
  }

  /**
   * Get all available template categories
   */
  async getTemplateCategories(req, res) {
    try {
      console.log('📂 Fetching all template categories...');

      // Get all folders under the template prefix
      const result = await cloudinary.api.sub_folders(`${this.TEMPLATE_FOLDER_PREFIX}`);

      const categories = result.folders.map(folder => ({
        name: folder.name,
        path: folder.path,
        external_id: folder.external_id
      }));

      // For each category, get a count of templates
      const categoriesWithCounts = await Promise.all(
        categories.map(async (category) => {
          try {
            const searchResult = await cloudinary.search
              .expression(`folder:"${this.TEMPLATE_FOLDER_PREFIX}/${category.name}"`)
              .max_results(1)
              .execute();

            return {
              ...category,
              template_count: searchResult.total_count || 0
            };
          } catch (error) {
            console.warn(`⚠️ Error getting count for category ${category.name}:`, error.message);
            return {
              ...category,
              template_count: 0
            };
          }
        })
      );

      console.log(`✅ Found ${categoriesWithCounts.length} template categories`);

      res.json({
        success: true,
        data: {
          categories: categoriesWithCounts,
          total_categories: categoriesWithCounts.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching template categories:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch template categories'
      });
    }
  }

  /**
   * Delete a template by ID
   */
  async deleteTemplate(req, res) {
    try {
      const { category, templateId } = req.params;
      
      console.log(`🗑️ Deleting template: ${templateId} from category: ${category}`);

      const publicId = `${this.TEMPLATE_FOLDER_PREFIX}/${category}/${templateId}`;

      // Delete from Cloudinary
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image'
      });

      if (result.result === 'ok') {
        console.log('✅ Template deleted successfully from Cloudinary');
        res.json({
          success: true,
          message: 'Template deleted successfully',
          data: {
            template_id: templateId,
            category: category,
            public_id: publicId
          }
        });
      } else {
        console.warn('⚠️ Template may not exist or was already deleted:', result);
        res.status(404).json({
          success: false,
          error: 'Template not found or already deleted'
        });
      }

    } catch (error) {
      console.error('❌ Error deleting template:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete template'
      });
    }
  }

  /**
   * Batch upload templates from local files (for migration)
   */
  async batchUploadTemplates(req, res) {
    try {
      console.log('📤 Starting batch template upload...');
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const { category } = req.body;
      
      if (!category) {
        return res.status(400).json({
          success: false,
          error: 'Category is required for batch upload'
        });
      }

      console.log(`📁 Batch uploading ${req.files.length} templates to category: ${category}`);

      // Process all files in parallel (but with limited concurrency)
      const uploadPromises = req.files.map(async (file, index) => {
        try {
          const templateId = uuidv4();
          const publicId = `${this.TEMPLATE_FOLDER_PREFIX}/${category}/${templateId}`;

          console.log(`📸 Uploading file ${index + 1}/${req.files.length}: ${file.originalname}`);

          const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
            public_id: publicId, // Already includes the full path
            resource_type: 'image',
            overwrite: false,
            tags: ['template', category, 'narayana-app', 'batch-upload'],
            context: {
              name: file.originalname || `Template ${index + 1}`,
              description: `Template uploaded via batch process`,
              category: category,
              uploaded_at: new Date().toISOString(),
              batch_upload: 'true'
            }
          });

          // No file cleanup needed for memory storage

          console.log(`✅ Successfully uploaded ${file.originalname}`);

          return {
            success: true,
            file: file.originalname,
            template_id: templateId,
            public_id: result.public_id,
            secure_url: result.secure_url,
            index: index
          };

        } catch (error) {
          console.error(`❌ Error uploading file ${file.originalname}:`, error);
          
          // No file cleanup needed for memory storage

          return {
            success: false,
            file: file.originalname,
            error: error.message,
            index: index
          };
        }
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);
      
      // Count successes and failures
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      console.log(`🎯 Batch upload complete: ${successful.length} successful, ${failed.length} failed`);

      res.json({
        success: true,
        data: {
          results: results,
          summary: {
            total_files: req.files.length,
            successful_uploads: successful.length,
            failed_uploads: failed.length,
            category: category
          }
        }
      });

    } catch (error) {
      console.error('❌ Error in batch template upload:', error);
      
      // No file cleanup needed for memory storage

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to batch upload templates'
      });
    }
  }

  /**
   * Extract template ID from Cloudinary public_id
   */
  extractTemplateId(publicId) {
    const parts = publicId.split('/');
    return parts[parts.length - 1]; // Return the last part as template ID
  }

  /**
   * Search templates across all categories
   */
  async searchTemplates(req, res) {
    try {
      const { query, categories, page = 1, limit = 20 } = req.query;

      console.log(`🔍 Searching templates with query: "${query}", categories: ${categories}`);

      let searchExpression = `folder:${this.TEMPLATE_FOLDER_PREFIX}/*`;
      
      // Add query filter if provided
      if (query) {
        searchExpression += ` AND (tags:${query} OR context.name:${query})`;
      }

      // Add category filter if provided
      if (categories) {
        const categoryList = categories.split(',');
        const categoryFilters = categoryList.map(cat => `folder:"${this.TEMPLATE_FOLDER_PREFIX}/${cat.trim()}"`).join(' OR ');
        searchExpression += ` AND (${categoryFilters})`;
      }

      const result = await cloudinary.search
        .expression(searchExpression)
        .with_field('tags')
        .with_field('context')
        .max_results(parseInt(limit))
        .next_cursor(req.query.next_cursor || undefined)
        .sort_by('created_at', 'desc')
        .execute();

      const templates = result.resources.map(resource => ({
        id: this.extractTemplateId(resource.public_id),
        public_id: resource.public_id,
        secure_url: resource.secure_url,
        url: resource.url,
        category: this.extractCategory(resource.public_id),
        name: resource.context?.name || 'Untitled Template',
        description: resource.context?.description || '',
        width: resource.width,
        height: resource.height,
        format: resource.format,
        created_at: resource.created_at,
        bytes: resource.bytes,
        tags: resource.tags || []
      }));

      res.json({
        success: true,
        data: {
          templates,
          search_query: query,
          filtered_categories: categories ? categories.split(',') : null,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total_count: result.total_count,
            has_next_page: !!result.next_cursor,
            next_cursor: result.next_cursor || null
          }
        }
      });

    } catch (error) {
      console.error('❌ Error searching templates:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to search templates'
      });
    }
  }

  /**
   * Extract category from Cloudinary public_id
   */
  extractCategory(publicId) {
    const parts = publicId.split('/');
    if (parts.length >= 3 && parts[0] === this.TEMPLATE_FOLDER_PREFIX.replace('/', '')) {
      return parts[1]; // Return the category part
    }
    return 'uncategorized';
  }
}

// Create and export controller instance
const templateController = new TemplateController();
export default templateController;