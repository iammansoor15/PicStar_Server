/**
 * Fix User Data Script
 * 
 * This script updates the user's name in the database from "User" to the actual name.
 * Run this once to fix corrupted user data.
 */

import mongoose from 'mongoose';
import User from './src/models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PHONE_NUMBER = '+919494978146'; // Your phone number
const ACTUAL_NAME = 'Your Actual Name'; // ⚠️ REPLACE THIS WITH YOUR REAL NAME

async function fixUserData() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/picstar';
    await mongoose.connect(mongoUri);
    
    console.log('✅ Connected to MongoDB');
    console.log('📱 Looking for user with phone:', PHONE_NUMBER);
    
    // Find the user
    const user = await User.findOne({ phone: PHONE_NUMBER });
    
    if (!user) {
      console.error('❌ User not found with phone:', PHONE_NUMBER);
      console.log('💡 Available users:');
      const allUsers = await User.find({}).select('name phone email');
      allUsers.forEach(u => {
        console.log(`   - ${u.name} (${u.phone || u.email})`);
      });
      process.exit(1);
    }
    
    console.log('📋 Current user data:');
    console.log('   Name:', user.name);
    console.log('   Phone:', user.phone);
    console.log('   Email:', user.email || 'N/A');
    console.log('   Profile Photo:', user.profilePhotoUrl || 'None');
    console.log('   Phone Verified:', user.isPhoneVerified);
    
    if (user.name === 'User' || user.name === 'Temporary') {
      console.log('');
      console.log('⚠️  Name needs to be fixed!');
      console.log('');
      console.log('🔄 Updating name to:', ACTUAL_NAME);
      
      // Update the name
      user.name = ACTUAL_NAME;
      await user.save();
      
      console.log('✅ User name updated successfully!');
      console.log('');
      console.log('📋 Updated user data:');
      console.log('   Name:', user.name);
      console.log('   Phone:', user.phone);
    } else {
      console.log('');
      console.log('✅ User name looks good! No changes needed.');
      console.log(`   Current name: ${user.name}`);
    }
    
    console.log('');
    console.log('🎉 Done! You can now sign in and your name should appear correctly.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the fix
fixUserData();
