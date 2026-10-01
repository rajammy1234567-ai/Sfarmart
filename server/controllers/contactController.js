import ContactInquiry from '../models/Contact.js';
import sendAdminEmail from '../utils/sendEmail.js';

const memoryInquiries = [];

export const submitContactInquiry = async (req, res) => {
  const { name, phone, email, inquiryType, message } = req.body;

  if (!name || !phone || !message) {
    return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
  }

  const inqData = {
    id: `FMT-MSG-${Date.now()}`,
    name,
    phone,
    email,
    inquiryType,
    message,
    createdAt: new Date()
  };

  try {
    await ContactInquiry.create(inqData);
  } catch (error) {
    memoryInquiries.push(inqData);
  }

  // Pass user's filled email for replyTo header & user auto-confirmation email
  sendAdminEmail(
    `New Contact Inquiry: ${inquiryType} from ${name}`,
    `New Inquiry Details:\nName: ${name}\nPhone: ${phone}\nEmail: ${email || 'N/A'}\nType: ${inquiryType}\n\nMessage:\n${message}`,
    email
  );

  res.status(201).json({
    success: true,
    message: 'Inquiry received successfully!',
    inquiryId: inqData.id
  });
};

export const getMemoryInquiries = () => memoryInquiries;
