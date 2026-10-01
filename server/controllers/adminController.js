import Admin from '../models/Admin.js';
import Application from '../models/Application.js';
import JobApplication from '../models/Job.js';
import User from '../models/User.js';
import ContactInquiry from '../models/Contact.js';
import bcrypt from 'bcryptjs';

import { getMemoryApplications } from './applicationController.js';
import { getMemoryInquiries } from './contactController.js';
import { getMemoryJobs } from './jobController.js';
import { getMemoryUsers } from './userController.js';

import jwt from 'jsonwebtoken';

const getJwtAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

export const seedAdmin = async () => {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const initUsername = process.env.ADMIN_INIT_USERNAME;
      const initPassword = process.env.ADMIN_INIT_PASSWORD;

      if (initUsername && initPassword) {
        const hashedPassword = await bcrypt.hash(initPassword, 10);
        await Admin.create({
          id: `admin-${Date.now()}`,
          username: initUsername,
          password: hashedPassword,
          role: 'superadmin',
          name: process.env.ADMIN_INIT_NAME || 'System Administrator',
          access: ['users', 'partners', 'riders', 'jobs']
        });
        console.log('👑 Initial Administrator provisioned from environment variables.');
      } else {
        console.log('ℹ️ No admin accounts exist. Set ADMIN_INIT_USERNAME and ADMIN_INIT_PASSWORD in environment to bootstrap.');
      }
    }
  } catch (err) {
    console.warn('Admin bootstrap check error:', err.message);
  }
};

export const adminLogin = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  try {
    const adminUser = await Admin.findOne({ username });
    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const secret = getJwtAccessSecret();
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const token = jwt.sign(
      {
        sub: adminUser._id || adminUser.id,
        id: adminUser._id || adminUser.id,
        username: adminUser.username,
        role: adminUser.role || 'ADMIN',
        name: adminUser.name,
        access: adminUser.access || []
      },
      secret,
      { expiresIn: '8h' }
    );

    const adminObj = adminUser.toObject();
    delete adminObj.password;
    adminObj.token = token;

    return res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: adminObj
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
};

export const createSubAdmin = async (req, res) => {
  // Enforce server-side least privilege: only superadmin can create subadmins or assign permissions
  if (req.user?.adminRole !== 'superadmin') {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'FORBIDDEN',
      message: 'Access denied: Only superadmin can create subadmin accounts'
    });
  }

  const { username, password, name, access } = req.body;
  if (!username || !password || !name || !access) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  if (!Array.isArray(access)) {
    return res.status(400).json({ success: false, message: 'Access must be an array of permissions' });
  }

  try {
    const exists = await Admin.findOne({ username });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await Admin.create({
      id: `subadmin-${Date.now()}`,
      username,
      password: hashedPassword,
      role: 'subadmin',
      name,
      access
    });

    const adminObj = newAdmin.toObject();
    delete adminObj.password;
    res.status(201).json({ success: true, message: 'Sub Admin created successfully', admin: adminObj });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create Sub Admin', error: error.message });
  }
};

export const getAdminData = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.adminRole === 'superadmin';
    const subAdminAccess = Array.isArray(req.user?.access) ? req.user.access : [];

    // If requesting a specific module via query param, verify permission
    const requestedModule = req.query?.module;
    if (requestedModule) {
      if (!isSuperAdmin && !subAdminAccess.includes(requestedModule)) {
        return res.status(403).json({
          ok: false,
          success: false,
          code: 'FORBIDDEN',
          message: `Access denied: Subadmin does not have access to '${requestedModule}' module`
        });
      }
    } else if (!isSuperAdmin && subAdminAccess.length === 0) {
      // Subadmin with zero module permissions: deny by default
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'FORBIDDEN',
        message: 'Access denied: Subadmin has no assigned module permissions'
      });
    }

    // Determine which modules are permitted to be retrieved
    const canAccessPartners = isSuperAdmin || (subAdminAccess.includes('partners') && (!requestedModule || requestedModule === 'partners'));
    const canAccessJobs = isSuperAdmin || (subAdminAccess.includes('jobs') && (!requestedModule || requestedModule === 'jobs'));
    const canAccessUsers = isSuperAdmin || (subAdminAccess.includes('users') && (!requestedModule || requestedModule === 'users'));
    const canAccessInquiries = isSuperAdmin || (subAdminAccess.includes('inquiries') && (!requestedModule || requestedModule === 'inquiries'));

    const [applications, jobApplications, users, contactInquiries] = await Promise.all([
      canAccessPartners ? Application.find().sort({ createdAt: -1 }) : Promise.resolve([]),
      canAccessJobs ? JobApplication.find().sort({ appliedAt: -1 }) : Promise.resolve([]),
      canAccessUsers ? User.find({}, '-password').sort({ _id: -1 }) : Promise.resolve([]),
      canAccessInquiries ? ContactInquiry.find().sort({ createdAt: -1 }) : Promise.resolve([])
    ]);

    res.json({
      success: true,
      data: {
        applications: canAccessPartners ? (applications.length > 0 ? applications : getMemoryApplications().reverse()) : [],
        jobApplications: canAccessJobs ? (jobApplications.length > 0 ? jobApplications : getMemoryJobs().reverse()) : [],
        users: canAccessUsers ? (users.length > 0 ? users : getMemoryUsers().map(({ password, ...u }) => u).reverse()) : [],
        contactInquiries: canAccessInquiries ? (contactInquiries.length > 0 ? contactInquiries : getMemoryInquiries().reverse()) : []
      }
    });
  } catch (error) {
    const isSuperAdmin = req.user?.adminRole === 'superadmin';
    const subAdminAccess = Array.isArray(req.user?.access) ? req.user.access : [];
    const requestedModule = req.query?.module;

    const canAccessPartners = isSuperAdmin || (subAdminAccess.includes('partners') && (!requestedModule || requestedModule === 'partners'));
    const canAccessJobs = isSuperAdmin || (subAdminAccess.includes('jobs') && (!requestedModule || requestedModule === 'jobs'));
    const canAccessUsers = isSuperAdmin || (subAdminAccess.includes('users') && (!requestedModule || requestedModule === 'users'));
    const canAccessInquiries = isSuperAdmin || (subAdminAccess.includes('inquiries') && (!requestedModule || requestedModule === 'inquiries'));

    res.json({
      success: true,
      data: {
        applications: canAccessPartners ? getMemoryApplications().reverse() : [],
        jobApplications: canAccessJobs ? getMemoryJobs().reverse() : [],
        users: canAccessUsers ? getMemoryUsers().map(({ password, ...u }) => u).reverse() : [],
        contactInquiries: canAccessInquiries ? getMemoryInquiries().reverse() : []
      }
    });
  }
};

export const updateApplicationStatus = async (req, res) => {
  const { id, type, status } = req.body;
  if (!id || !type || !status) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  // Server-side module authorization for subadmins
  const isSuperAdmin = req.user?.adminRole === 'superadmin';
  const subAdminAccess = Array.isArray(req.user?.access) ? req.user.access : [];

  if (!isSuperAdmin) {
    let requiredModule = null;
    if (type === 'partner') requiredModule = 'partners';
    else if (type === 'job') requiredModule = 'jobs';

    if (!requiredModule || !subAdminAccess.includes(requiredModule)) {
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'FORBIDDEN',
        message: `Access denied: Subadmin does not have permission to manage '${type}' applications`
      });
    }
  }

  try {
    let updated = false;
    if (type === 'partner') {
      const resObj = await Application.findOneAndUpdate({ id }, { status });
      if (resObj) updated = true;
    } else if (type === 'job') {
      const resObj = await JobApplication.findOneAndUpdate({ id }, { status });
      if (resObj) updated = true;
    }

    if (updated) {
      return res.json({ success: true, message: `Status updated to ${status}` });
    }
  } catch (error) {
    // fallback
  }

  // memory fallback update
  const memApps = getMemoryApplications();
  const memJobs = getMemoryJobs();
  let found = false;

  if (type === 'partner') {
    const idx = memApps.findIndex(a => a.id === id);
    if (idx !== -1) {
      memApps[idx].status = status;
      found = true;
    }
  } else if (type === 'job') {
    const idx = memJobs.findIndex(j => j.id === id);
    if (idx !== -1) {
      memJobs[idx].status = status;
      found = true;
    }
  }

  if (found) {
    res.json({ success: true, message: `Status updated to ${status}` });
  } else {
    res.status(404).json({ success: false, message: 'Record not found' });
  }
};
