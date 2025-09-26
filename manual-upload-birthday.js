import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Configuration
const SERVER_URL = 'https://picstar-server.onrender.com';
const ASSETS_PATH = path.resolve('../app/assets');

console.log('🚀 Starting manual birthday template upload...');
console.log(`📁 Assets path: ${ASSETS_PATH}`);
console.log(`🌐 Server URL: ${SERVER_URL}`);

async function uploadBirthdayTemplates() {
  try {
    // Check if assets directory exists
    const files = await fs.readdir(ASSETS_PATH);
    const birthdayFiles = files.filter(file => 
      file.toLowerCase().includes('birthday') && 
      ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())
    );

    console.log(`📸 Found ${birthdayFiles.length} birthday templates:`);
    birthdayFiles.forEach(file => console.log(`  - ${file}`));

    if (birthdayFiles.length === 0) {
      console.log('❌ No birthday templates found');
      return;
    }

    // Upload each file individually
    for (const file of birthdayFiles) {
      console.log(`\n📤 Uploading ${file}...`);
      
      try {
        const filePath = path.join(ASSETS_PATH, file);
        const fileBuffer = await fs.readFile(filePath);
        
        const formData = new FormData();
        formData.append('category', 'birthday');
        formData.append('name', `Birthday Template - ${file}`);
        formData.append('description', 'Birthday template uploaded via script');
        formData.append('template', fileBuffer, {
          filename: file,
          contentType: 'image/jpeg'
        });

        const response = await fetch(`${SERVER_URL}/api/templates/upload`, {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders()
        });

        const result = await response.json();
        
        if (result.success) {
          console.log(`✅ Successfully uploaded ${file}`);
          console.log(`   - Template ID: ${result.data.id}`);
          console.log(`   - Cloudinary URL: ${result.data.secure_url}`);
        } else {
          console.error(`❌ Failed to upload ${file}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error uploading ${file}:`, error.message);
      }
    }

    // Verify uploads by checking birthday category
    console.log('\n🔍 Verifying uploads...');
    const verifyResponse = await fetch(`${SERVER_URL}/api/templates/category/birthday?page=1&limit=20`);
    const verifyData = await verifyResponse.json();
    
    if (verifyData.success) {
      console.log(`✅ Verification: Found ${verifyData.data.templates.length} templates in birthday category`);
      verifyData.data.templates.forEach(template => {
        console.log(`   - ${template.name} (${template.id})`);
      });
    } else {
      console.error('❌ Verification failed:', verifyData.error);
    }

  } catch (error) {
    console.error('❌ Error in upload process:', error.message);
  }
}

// Check server health first
async function checkServerHealth() {
  try {
    console.log('🔍 Checking server health...');
    const response = await fetch(`${SERVER_URL}/api/templates/health`);
    const data = await response.json();
    
    if (data.success && data.cloudinary.status === 'connected') {
      console.log('✅ Server is running and Cloudinary is configured');
      return true;
    } else {
      console.error('❌ Server or Cloudinary configuration issue');
      console.log('Cloudinary status:', data.cloudinary);
      return false;
    }
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  const isHealthy = await checkServerHealth();
  if (isHealthy) {
    await uploadBirthdayTemplates();
  }
}

main().catch(console.error);