import mongoose from 'mongoose';
import User from './src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function updateUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get arguments from command line
    const phone = process.argv[2];
    const newName = process.argv[3];
    const profilePhotoUrl = process.argv[4]; // Optional

    if (!phone || !newName) {
      console.log('Usage: node update-user.js <phone_number> <new_name> [profile_photo_url]');
      console.log('Example: node update-user.js +919494978146 "John Doe"');
      console.log('Example: node update-user.js +919494978146 "John Doe" "https://example.com/photo.jpg"');
      process.exit(1);
    }

    // Find user by phone
    const user = await User.findOne({ phone });

    if (!user) {
      console.log('❌ User not found with phone:', phone);
      process.exit(1);
    }

    console.log('=== CURRENT USER DATA ===');
    console.log('Name:', user.name);
    console.log('Profile Photo URL:', user.profilePhotoUrl || 'Not set');
    console.log('========================\n');

    // Update user data
    const updateData = { name: newName };
    if (profilePhotoUrl) {
      updateData.profilePhotoUrl = profilePhotoUrl;
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true }
    );

    console.log('=== UPDATED USER DATA ===');
    console.log('Name:', updatedUser.name);
    console.log('Profile Photo URL:', updatedUser.profilePhotoUrl || 'Not set');
    console.log('=========================\n');

    console.log('✅ User updated successfully!');
    console.log('\nNow sign out and sign in again in your app to see the changes.');

    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateUser();
