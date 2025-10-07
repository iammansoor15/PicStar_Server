import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRouter from './routes/auth.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'auth-api', time: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose
  .connect(mongoUri, {
    dbName: process.env.MONGO_DB_NAME || 'picstar',
  })
  .then(() => {
    console.log('Connected to MongoDB');
    const port = process.env.PORT || 10010;
    app.listen(port, () => {
      console.log(`Auth server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect MongoDB:', err.message);
    process.exit(1);
  });
