import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const ASSETS_PATH = path.resolve(__dirname, '../../../app/assets');

// Template categorization rules
const TEMPLATE_CATEGORIES = {
  'Birthday': ['Birthday1.jpeg', 'Birthday2.jpeg', 'Birthday3.jpeg', 'Birthday4.jpeg', 'Birthday5.jpeg', 'Birthday6.jpeg'],
  'Congratulations': ['Congratulate1.jpeg', 'Congratulate2.jpeg', 'Congratulate3.jpeg', 'Congratulate4.jpeg']
};

/**
 * Check if the server is running
 */
async function checkServerHealth() {
  try {
    console.log('🔍 Checking server health...');
    const response = await fetch(`${SERVER_URL}/api/templates/health`);
    const data = await response.json();
    
    if (data.success && data.cloudinary_configured) {
      console.log('✅ Server is running and Cloudinary is configured');
      return true;
    } else {
      console.error('❌ Server is running but Cloudinary is not properly configured');
      console.log('Please check your .env file and ensure CLOUDINARY_* variables are set');
      return false;
    }
  } catch (error) {
    console.error('❌ Server is not running or not responding:', error.message);
    console.log('Please start the server with: npm run dev');
    return false;
  }
}

/**
 * Check if assets directory exists and get list of template files
 */
async function getTemplateFiles() {
  try {
    console.log(`📁 Scanning assets directory: ${ASSETS_PATH}`);
    const files = await fs.readdir(ASSETS_PATH);
    
    // Filter only image files that are templates
    const templateFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && 
             (file.includes('Birthday') || file.includes('Congratulate'));
    });

    console.log(`📸 Found ${templateFiles.length} template files to migrate:`);
    templateFiles.forEach(file => console.log(`  - ${file}`));
    
    return templateFiles;
  } catch (error) {
    console.error('❌ Error reading assets directory:', error.message);
    console.log('Please ensure the assets directory exists at:', ASSETS_PATH);
    return [];
  }
}

/**
 * Categorize a template file based on its name
 */
function categorizeTemplate(filename) {
  for (const [category, files] of Object.entries(TEMPLATE_CATEGORIES)) {
    if (files.includes(filename)) {
      return category.toLowerCase();
    }
  }
  
  // Fallback categorization based on filename patterns
  if (filename.toLowerCase().includes('birthday')) {
    return 'birthday';
  } else if (filename.toLowerCase().includes('congratulat')) {
    return 'congratulations';
  }
  
  return 'uncategorized';
}

/**
 * Upload templates by category
 */
async function uploadTemplatesByCategory(templateFiles) {
  // Group files by category
  const categorizedFiles = {};
  
  templateFiles.forEach(file => {
    const category = categorizeTemplate(file);
    if (!categorizedFiles[category]) {
      categorizedFiles[category] = [];
    }
    categorizedFiles[category].push(file);
  });

  console.log('📂 Templates grouped by category:');
  Object.entries(categorizedFiles).forEach(([category, files]) => {
    console.log(`  ${category}: ${files.length} files`);
  });

  // Upload each category
  const results = {};
  
  for (const [category, files] of Object.entries(categorizedFiles)) {
    console.log(`\n📤 Uploading ${files.length} templates to "${category}" category...`);
    
    try {
      // Create form data for batch upload
      const formData = new FormData();
      formData.append('category', category);
      
      // Add all files for this category
      for (const file of files) {
        const filePath = path.join(ASSETS_PATH, file);
        const fileBuffer = await fs.readFile(filePath);
        formData.append('templates', fileBuffer, {
          filename: file,
          contentType: `image/${path.extname(file).slice(1)}`
        });
      }

      // Upload to server
      const response = await fetch(`${SERVER_URL}/api/templates/batch-upload`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const result = await response.json();
      
      if (result.success) {
        const summary = result.data.summary;
        console.log(`✅ Category "${category}": ${summary.successful_uploads}/${summary.total_files} uploaded successfully`);
        
        if (summary.failed_uploads > 0) {
          console.log(`⚠️  ${summary.failed_uploads} files failed to upload`);
          result.data.results
            .filter(r => !r.success)
            .forEach(r => console.log(`   - ${r.file}: ${r.error}`));
        }
        
        results[category] = {
          success: true,
          uploaded: summary.successful_uploads,
          failed: summary.failed_uploads,
          total: summary.total_files
        };
      } else {
        console.error(`❌ Category "${category}": ${result.error}`);
        results[category] = {
          success: false,
          error: result.error,
          total: files.length
        };
      }
      
    } catch (error) {
      console.error(`❌ Error uploading category "${category}":`, error.message);
      results[category] = {
        success: false,
        error: error.message,
        total: files.length
      };
    }
  }

  return results;
}

/**
 * Print migration summary
 */
function printMigrationSummary(results) {
  console.log('\n🎯 Migration Summary:');
  console.log('=====================================');
  
  let totalUploaded = 0;
  let totalFailed = 0;
  let totalFiles = 0;
  
  Object.entries(results).forEach(([category, result]) => {
    totalFiles += result.total;
    
    if (result.success) {
      totalUploaded += result.uploaded;
      totalFailed += result.failed || 0;
      console.log(`✅ ${category}: ${result.uploaded}/${result.total} uploaded`);
    } else {
      totalFailed += result.total;
      console.log(`❌ ${category}: 0/${result.total} uploaded (${result.error})`);
    }
  });
  
  console.log('=====================================');
  console.log(`📊 Total: ${totalUploaded} uploaded, ${totalFailed} failed, ${totalFiles} total`);
  
  if (totalUploaded > 0) {
    console.log('\n✅ Migration completed! Your templates are now stored in Cloudinary.');
    console.log('You can now update your React Native app to use the Cloudinary API.');
  } else {
    console.log('\n❌ Migration failed! Please check the errors above and try again.');
  }
}

/**
 * Main migration function
 */
async function migrateTemplates() {
  console.log('🚀 Starting template migration to Cloudinary...\n');
  
  // Check if server is running and configured
  const serverHealthy = await checkServerHealth();
  if (!serverHealthy) {
    process.exit(1);
  }
  
  // Get template files to migrate
  const templateFiles = await getTemplateFiles();
  if (templateFiles.length === 0) {
    console.log('❌ No template files found to migrate.');
    process.exit(1);
  }
  
  // Confirm migration
  console.log(`\n📤 Ready to migrate ${templateFiles.length} templates to Cloudinary.`);
  console.log('This will upload all templates to your Cloudinary account.');
  
  // For script automation, we'll proceed automatically
  // In a production environment, you might want to add a confirmation prompt
  
  // Perform the migration
  const results = await uploadTemplatesByCategory(templateFiles);
  
  // Print summary
  printMigrationSummary(results);
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run migration
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateTemplates().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

export { migrateTemplates, checkServerHealth, getTemplateFiles };