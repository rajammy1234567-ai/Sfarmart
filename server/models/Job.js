import mongoose from 'mongoose';

const jobApplicationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  jobId: String,
  jobTitle: String,
  fullName: String,
  email: String,
  phone: String,
  location: String,
  experience: String,
  qualification: String,
  notes: String,
  resumeName: String,
  status: { type: String, default: 'RECEIVED' },
  appliedAt: { type: Date, default: Date.now }
});

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);
export default JobApplication;
