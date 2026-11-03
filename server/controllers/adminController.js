import Admin from '../models/Admin.js';
import Application from '../models/Application.js';
import JobApplication from '../models/Job.js';
import User from '../models/User.js';
import ContactInquiry from '../models/Contact.js';
import Vendor from '../models/Vendor.js';
import mongoose from 'mongoose';
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
    const canAccessPartners = (isSuperAdmin || subAdminAccess.includes('partners')) && (!requestedModule || requestedModule === 'partners');
    const canAccessJobs = (isSuperAdmin || subAdminAccess.includes('jobs')) && (!requestedModule || requestedModule === 'jobs');
    const canAccessUsers = (isSuperAdmin || subAdminAccess.includes('users')) && (!requestedModule || requestedModule === 'users');
    const canAccessInquiries = (isSuperAdmin || subAdminAccess.includes('inquiries')) && (!requestedModule || requestedModule === 'inquiries');

    // Query collections independently via Promise.allSettled with .lean() to prevent single-query cascading failures
    const [appsResult, jobsResult, usersResult, inqResult, vendorsResult] = await Promise.allSettled([
      canAccessPartners ? Application.find().sort({ createdAt: -1 }).lean() : Promise.resolve([]),
      canAccessJobs ? JobApplication.find().sort({ appliedAt: -1 }).lean() : Promise.resolve([]),
      canAccessUsers ? User.find({}, '-password -passwordHash -refreshToken -otp').sort({ _id: -1 }).lean() : Promise.resolve([]),
      canAccessInquiries ? ContactInquiry.find().sort({ createdAt: -1 }).lean() : Promise.resolve([]),
      canAccessPartners ? Vendor.find({}, '-passwordHash -password').sort({ createdAt: -1 }).lean() : Promise.resolve([])
    ]);

    const queryErrors = {};
    if (canAccessPartners && appsResult.status === 'rejected') {
      console.error('Failed to query applications:', appsResult.reason?.message || appsResult.reason);
      queryErrors.partners = appsResult.reason?.message || 'Failed to query partner applications';
    }
    if (canAccessJobs && jobsResult.status === 'rejected') {
      console.error('Failed to query job applications:', jobsResult.reason?.message || jobsResult.reason);
      queryErrors.jobs = jobsResult.reason?.message || 'Failed to query job applications';
    }
    if (canAccessUsers && usersResult.status === 'rejected') {
      console.error('Failed to query users:', usersResult.reason?.message || usersResult.reason);
      queryErrors.users = usersResult.reason?.message || 'Failed to query users';
    }
    if (canAccessInquiries && inqResult.status === 'rejected') {
      console.error('Failed to query contact inquiries:', inqResult.reason?.message || inqResult.reason);
      queryErrors.inquiries = inqResult.reason?.message || 'Failed to query contact inquiries';
    }
    if (canAccessPartners && vendorsResult.status === 'rejected') {
      console.error('Failed to query vendors:', vendorsResult.reason?.message || vendorsResult.reason);
    }

    // If client requested a specific module and that query failed, fail explicitly without swallowing
    if (requestedModule && queryErrors[requestedModule]) {
      return res.status(500).json({
        ok: false,
        success: false,
        code: 'MODULE_QUERY_ERROR',
        message: `Database error querying ${requestedModule}: ${queryErrors[requestedModule]}`
      });
    }

    const permittedModules = [
      canAccessPartners ? 'partners' : null,
      canAccessJobs ? 'jobs' : null,
      canAccessUsers ? 'users' : null,
      canAccessInquiries ? 'inquiries' : null
    ].filter(Boolean);

    if (permittedModules.length > 0 && permittedModules.every(m => queryErrors[m])) {
      return res.status(500).json({
        ok: false,
        success: false,
        code: 'AGGREGATION_FAILED',
        message: 'Database queries failed for all permitted modules',
        errors: queryErrors
      });
    }

    const rawApps = appsResult.status === 'fulfilled' ? appsResult.value : [];
    const rawJobs = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
    const rawUsers = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const rawInquiries = inqResult.status === 'fulfilled' ? inqResult.value : [];
    const rawVendors = vendorsResult.status === 'fulfilled' ? vendorsResult.value : [];

    const applications = rawApps.length > 0 ? rawApps : [...getMemoryApplications()].reverse();
    const jobApplications = (rawJobs.length > 0 ? rawJobs : [...getMemoryJobs()].reverse()).map(j => ({
      ...j,
      id: j.id || String(j._id)
    }));
    const users = (rawUsers.length > 0 ? rawUsers : [...getMemoryUsers()]).map(({ password, passwordHash, ...u }) => u).reverse();
    const contactInquiries = rawInquiries.length > 0 ? rawInquiries : [...getMemoryInquiries()].reverse();

    const formattedWebsiteApps = applications.map(a => ({
      ...a,
      id: a.id || String(a._id),
      originType: 'WEBSITE_LEAD',
      sourceLabel: 'Website Application (Lead)',
      isLoginAccount: false,
      type: 'partner'
    }));

    let formattedVendors = [];
    if (canAccessPartners && Array.isArray(rawVendors) && rawVendors.length > 0) {
      formattedVendors = rawVendors.map(v => {
        const { passwordHash, password, ...safeVendor } = v;
        return {
          ...safeVendor,
          id: String(v._id),
          _id: v._id,
          fullName: `${v.ownerName || 'Vendor'} (${v.storeName || 'Store'})`,
          ownerName: v.ownerName,
          storeName: v.storeName,
          phone: v.phone || '',
          categoryId: v.storeType || 'GROCERY',
          district: v.address?.city || '',
          state: v.address?.state || '',
          status: (v.isApproved && v.isActive) ? 'APPROVED' : 'RECEIVED',
          isApproved: Boolean(v.isApproved),
          isActive: Boolean(v.isActive),
          isOpen: Boolean(v.isOpen),
          originType: 'VENDOR_ACCOUNT',
          sourceLabel: 'Partner App Store (Vendor Account)',
          isLoginAccount: true,
          type: 'vendor',
          createdAt: v.createdAt || new Date()
        };
      });
    }

    const mergedPartners = [...formattedVendors, ...formattedWebsiteApps];

    return res.json({
      success: true,
      data: {
        applications: canAccessPartners ? mergedPartners : [],
        jobApplications: canAccessJobs ? jobApplications : [],
        users: canAccessUsers ? users : [],
        contactInquiries: canAccessInquiries ? contactInquiries : []
      },
      ...(Object.keys(queryErrors).length > 0 ? { partialErrors: queryErrors } : {})
    });
  } catch (error) {
    console.error('getAdminData unexpected error:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      code: 'SERVER_ERROR',
      message: error.message || 'Internal error retrieving admin data'
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
    if (type === 'partner' || type === 'vendor') {
      if (mongoose.isValidObjectId(id)) {
        const vendorDoc = await Vendor.findById(id);
        if (vendorDoc) {
          if (status === 'APPROVED') {
            vendorDoc.isApproved = true;
            vendorDoc.isActive = true;
            // Preserves intended store-opening rule: isOpen remains false until partner logs in and opens store
          } else if (status === 'REJECTED') {
            vendorDoc.isApproved = false;
            vendorDoc.isActive = false;
            vendorDoc.isOpen = false;
          }
          await vendorDoc.save();
          return res.json({
            success: true,
            isLoginAccount: true,
            originType: 'VENDOR_ACCOUNT',
            message: status === 'APPROVED'
              ? 'Partner store approved. Vendor can now log in to the Partner App.'
              : 'Partner store application rejected.'
          });
        }
      }
      const resObj = await Application.findOneAndUpdate({ id }, { status });
      if (resObj) {
        return res.json({
          success: true,
          isLoginAccount: false,
          originType: 'WEBSITE_LEAD',
          message: status === 'APPROVED'
            ? 'Website application lead marked as APPROVED. (Note: Lead is an inquiry only, not a login-enabled vendor account. Partner must register via Partner App to create an active store).'
            : `Website lead status marked as ${status}.`
        });
      }
    } else if (type === 'job') {
      const resObj = await JobApplication.findOneAndUpdate({ id }, { status });
      if (resObj) {
        return res.json({ success: true, message: `Status updated to ${status}` });
      }
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
