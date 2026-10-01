import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  id: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'subadmin' },
  name: String,
  access: [String]
});

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
