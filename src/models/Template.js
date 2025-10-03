import mongoose from 'mongoose';
import Counter from './Counter.js';

const TemplateSchema = new mongoose.Schema({
  image_url: { type: String, required: true },
  serial_no: { type: Number, required: true, index: true },
  category: { type: String, required: true, index: true },
  created_at: { type: Date, default: Date.now, index: true },
  // Axis for the photo container (x, y positions)
  photo_container_axis: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
  // Axis for the text container (x, y positions)
  text_container_axis: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
}, { collection: 'templates' });

// Auto-increment serial_no per category
TemplateSchema.pre('validate', async function(next) {
  if (this.serial_no && this.serial_no > 0) return next();
  try {
    const categoryKey = String(this.category || 'default');
    const result = await Counter.findByIdAndUpdate(
      categoryKey,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.serial_no = result.seq;
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.models.Template || mongoose.model('Template', TemplateSchema);