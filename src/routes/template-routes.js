import express from 'express';
import { upload } from '../middleware/upload.js';
import templateController from '../controllers/template-controller.js';

const router = express.Router();

// Root template endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Picstar Template Service',
    version: '1.0.0',
    endpoints: {
      categories: 'GET /api/templates/categories',
      byCategory: 'GET /api/templates/category/:category',
      upload: 'POST /api/templates/upload',
      batchUpload: 'POST /api/templates/batch-upload',
      delete: 'DELETE /api/templates/:category/:templateId',
      search: 'GET /api/templates/search',
      health: 'GET /api/templates/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Template management routes

/**
 * GET /api/templates/categories
 * Get all available template categories
 */
router.get('/categories', templateController.getTemplateCategories.bind(templateController));

/**
 * GET /api/templates/category/:category
 * Get templates by category with pagination
 * Query params: page, limit, sort_by, order, next_cursor
 */
router.get('/category/:category', templateController.getTemplatesByCategory.bind(templateController));

/**
 * POST /api/templates/upload
 * Upload a single template
 * Body: category (required), name, description
 * File: template image
 */
router.post('/upload', upload.single('template'), templateController.uploadTemplate.bind(templateController));

/**
 * POST /api/templates/batch-upload
 * Upload multiple templates to a category
 * Body: category (required)
 * Files: template images (field name: 'templates')
 */
router.post('/batch-upload', upload.array('templates', 50), templateController.batchUploadTemplates.bind(templateController));

/**
 * DELETE /api/templates/:category/:templateId
 * Delete a specific template
 */
router.delete('/:category/:templateId', templateController.deleteTemplate.bind(templateController));

/**
 * GET /api/templates/search
 * Search templates across categories
 * Query params: query, categories, page, limit, next_cursor
 */
router.get('/search', templateController.searchTemplates.bind(templateController));

/**
 * GET /api/templates/debug/all
 * Debug endpoint to see ALL templates in Cloudinary
 */
router.get('/debug/all', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get ALL templates using different search strategies
    const searches = [
      { name: 'All narayana_templates', expression: 'folder:narayana_templates/*' },
      { name: 'By tags template', expression: 'tags:template' },
      { name: 'By tags narayana-app', expression: 'tags:narayana-app' },
      { name: 'All in congratulations', expression: 'folder:narayana_templates/congratulations' },
      { name: 'Public ID search congratulations', expression: 'public_id:narayana_templates/congratulations/*' },
      { name: 'Context category congratulations', expression: 'context.category:congratulations' }
    ];
    
    const results = {};
    
    for (const search of searches) {
      try {
        const result = await import('../utils/cloudinary.js').then(module => 
          module.default.search
            .expression(search.expression)
            .with_field('tags')
            .with_field('context')
            .max_results(parseInt(limit))
            .sort_by('created_at', 'desc')
            .execute()
        );
        
        results[search.name] = {
          total_count: result.total_count,
          found: result.resources.length,
          templates: result.resources.map(r => ({
            public_id: r.public_id,
            secure_url: r.secure_url,
            created_at: r.created_at,
            tags: r.tags,
            context: r.context,
            folder: r.folder
          }))
        };
      } catch (error) {
        results[search.name] = { error: error.message };
      }
    }
    
    res.json({
      success: true,
      debug: 'All Cloudinary search strategies',
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/templates/health
 * Health check for template service
 */
router.get('/health', async (req, res) => {
  try {
    const isConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && 
                           process.env.CLOUDINARY_API_KEY && 
                           process.env.CLOUDINARY_API_SECRET);
    
    let cloudinaryStatus = 'not_configured';
    if (isConfigured) {
      try {
        // Test Cloudinary connection
        const { v2: cloudinary } = await import('cloudinary');
        await cloudinary.api.ping();
        cloudinaryStatus = 'connected';
      } catch (error) {
        cloudinaryStatus = 'connection_failed';
      }
    }
    
    res.json({
      success: true,
      message: 'Template service is running',
      cloudinary: {
        configured: isConfigured,
        status: cloudinaryStatus,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'set' : 'not_set'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;