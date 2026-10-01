import Application from '../models/Application.js';
import sendAdminEmail from '../utils/sendEmail.js';

const memoryApplications = [];

export const submitApplication = async (req, res) => {
  const { categoryId, fullName, phone, email, state, district, experience, notes } = req.body;

  if (!fullName || !phone || !state || !district) {
    return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
  }

  const appData = {
    id: `FMT-APP-${Date.now()}`,
    categoryId,
    fullName,
    phone,
    email,
    state,
    district,
    experience,
    notes,
    status: 'RECEIVED',
    createdAt: new Date()
  };

  try {
    await Application.create(appData);
  } catch (error) {
    memoryApplications.push(appData);
  }

  // Pass user's filled email for replyTo header & user auto-confirmation email
  sendAdminEmail(
    `New Partner Application: ${categoryId} from ${fullName}`,
    `You have received a new partner application on Farmart.\n\nDetails:\nID: ${appData.id}\nCategory: ${categoryId}\nName: ${fullName}\nPhone: ${phone}\nEmail: ${email || 'N/A'}\nState: ${state}\nDistrict: ${district}\nNotes: ${notes || 'None'}`,
    email
  );

  res.status(201).json({
    success: true,
    message: 'Application received successfully!',
    applicationId: appData.id
  });
};

export const getMemoryApplications = () => memoryApplications;
