import JobApplication from '../models/Job.js';
import sendAdminEmail from '../utils/sendEmail.js';

const memoryJobs = [];

export const submitJobApplication = async (req, res) => {
  const { jobId, jobTitle, fullName, email, phone, location, experience, qualification, notes, resumeName } = req.body;

  if (!fullName || !phone || !experience || !location) {
    return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
  }

  const jobData = {
    id: `FMT-JOB-${Date.now()}`,
    jobId,
    jobTitle,
    fullName,
    email,
    phone,
    location,
    experience,
    qualification,
    notes,
    resumeName: resumeName || 'Not uploaded',
    status: 'RECEIVED',
    appliedAt: new Date()
  };

  try {
    await JobApplication.create(jobData);
  } catch (error) {
    memoryJobs.push(jobData);
  }

  sendAdminEmail(
    `New Job Application: ${jobTitle} from ${fullName}`,
    `New Job Application:\nJob: ${jobTitle}\nName: ${fullName}\nPhone: ${phone}\nEmail: ${email || 'N/A'}\nLocation: ${location}\nNotes: ${notes || 'None'}`,
    email
  );

  res.status(201).json({
    success: true,
    message: 'Job application received successfully!',
    applicationId: jobData.id
  });
};

export const getMemoryJobs = () => memoryJobs;
