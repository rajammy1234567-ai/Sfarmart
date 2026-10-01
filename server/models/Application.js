import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  categoryId: String,
  fullName: String,
  phone: String,
  email: String,
  state: String,
  district: String,
  experience: String,
  notes: String,
  status: { type: String, default: 'RECEIVED' },
  createdAt: { type: Date, default: Date.now }
});

const Application = mongoose.model('Application', applicationSchema);
export default Application;
