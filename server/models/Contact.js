import mongoose from 'mongoose';

const contactInquirySchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: String,
  phone: String,
  email: String,
  inquiryType: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const ContactInquiry = mongoose.model('ContactInquiry', contactInquirySchema);
export default ContactInquiry;
