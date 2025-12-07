import mongoose from 'mongoose';
import Counter from './Counter.js';

const TemplateSchema = new mongoose.Schema({
  image_url: { type: String, required: true },
  // Optional video URL when the template is a video
  video_url: { type: String, default: null },
  // Resource type for the template: 'image' or 'video' (default 'image' for backward compatibility)
  resource_type: { type: String, enum: ['image', 'video'], default: 'image', index: true },

  serial_no: { type: Number, required: true, index: true },
  // Main and sub categories stored explicitly (subcategory is primary)
  main_category: { type: String, index: true, default: null },
  subcategory: { type: String, required: true, index: true },
  created_at: { type: Date, default: Date.now, index: true },
  // Axis for the photo container (x, y positions and size)
  // Size constraints match app: min 60px, max 200px, default 100px (square)
  photo_container_axis: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 100 },  // Photo is square, so width = height
    height: { type: Number, default: 100 },
  },
  // Axis for the text container (x, y positions and size)
  // Size constraints match app: min 80x40, max 80%x60% of container, default 120x50
  text_container_axis: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 120 },
    height: { type: Number, default: 50 },
  },
  // Reference canvas dimensions used when setting coordinates
  // The app will scale coordinates from this reference to its actual container size
  // Default: 270x480 (9:16 aspect ratio) - matches website editor
  coordinate_reference: {
    width: { type: Number, default: 270 },
    height: { type: Number, default: 480 },
  },
}, { collection: 'templates' });

// Auto-increment serial_no per subcategory (fallback to legacy 'category' if present)
TemplateSchema.pre('validate', async function(next) {
  if (this.serial_no && this.serial_no > 0) return next();
  try {
    const key = String(this.subcategory || this.category || 'default');
    const result = await Counter.findByIdAndUpdate(
      key,
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
