import mongoose from 'mongoose';
import User from './src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get phone number from command line argument
    const phone = process.argv[2];

    if (!phone) {
      console.log('Usage: node check-user.js <phone_number>');
      console.log('Example: node check-user.js +919494978146');
      process.exit(1);
    }

    // Find user by phone
    const user = await User.findOne({ phone });

    if (!user) {
      console.log('❌ User not found with phone:', phone);
      process.exit(1);
    }

    console.log('=== USER DATA IN DATABASE ===');
    console.log('ID:', user._id);
    console.log('Name:', user.name);
    console.log('Email:', user.email || 'Not set');
    console.log('Phone:', user.phone);
    console.log('Profile Photo URL:', user.profilePhotoUrl || 'Not set');
    console.log('Is Phone Verified:', user.isPhoneVerified);
    console.log('Created At:', user.createdAt);
    console.log('Updated At:', user.updatedAt);
    console.log('============================\n');

    // Ask if user wants to update the name
    if (user.name === 'User' || user.name === 'Temporary' || user.name === 'user') {
      console.log('⚠️  Current name is:', user.name);
      console.log('\nTo update the name, run:');
      console.log(`node update-user.js ${phone} "Your Actual Name"`);
    }

    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUser();
