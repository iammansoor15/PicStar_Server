import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // category key
  seq: { type: Number, default: 0 },
}, { collection: 'counters' });

export default mongoose.models.Counter || mongoose.model('Counter', CounterSchema);