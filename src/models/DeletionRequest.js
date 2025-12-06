import mongoose from 'mongoose';

const deletionRequestSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
    trackingToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed'],
      default: 'pending',
      index: true
    },
    notes: { type: String, trim: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

deletionRequestSchema.index({ phone: 1, createdAt: -1 });
deletionRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('DeletionRequest', deletionRequestSchema);
