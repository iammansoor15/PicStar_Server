import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment');
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || 'picstar',
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10,
    });
    isConnected = true;
    console.log('✅ Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err;
  }
}

export function getDbStatus() {
  return {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}