import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Admin from '../models/Admin.js';

const getJwtAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

export const requireAuth = async (req, res, next) => {
  try {
    const jwtSecret = getJwtAccessSecret();
    if (!jwtSecret) {
      return res.status(500).json({
        ok: false,
        success: false,
        code: 'CONFIG_ERROR',
        message: 'Server security configuration missing'
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication token is required'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtErr) {
      const code = jwtErr.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      return res.status(401).json({
        ok: false,
        success: false,
        code,
        message: jwtErr.name === 'TokenExpiredError' ? 'Access token has expired' : 'Invalid token'
      });
    }

    const userId = decoded.sub || decoded.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Token subject missing'
      });
    }

    // Verify ADMIN roles via authoritative database lookup
    if (decoded.role === 'ADMIN' || decoded.role === 'superadmin' || decoded.role === 'subadmin') {
      let adminRecord = null;
      try {
        if (mongoose.Types.ObjectId.isValid(userId)) {
          adminRecord = await Admin.findById(userId);
        }
        if (!adminRecord) {
          adminRecord = await Admin.findOne({ id: userId });
        }
        if (!adminRecord && decoded.username) {
          adminRecord = await Admin.findOne({ username: decoded.username });
        }
      } catch (dbErr) {
        console.error('Database error verifying admin record:', dbErr.message);
      }

      if (!adminRecord) {
        return res.status(401).json({
          ok: false,
          success: false,
          code: 'ADMIN_NOT_FOUND',
          message: 'Admin account not found or deactivated'
        });
      }

      req.user = {
        _id: adminRecord._id,
        id: adminRecord.id || adminRecord._id.toString(),
        role: 'ADMIN',
        adminRole: adminRecord.role || 'subadmin',
        username: adminRecord.username,
        name: adminRecord.name,
        access: Array.isArray(adminRecord.access) ? adminRecord.access : []
      };
      return next();
    }

    // Load full user doc if customer, or populate basic info
    if (decoded.role === 'VENDOR') {
      req.user = {
        _id: userId,
        id: userId,
        vendorId: decoded.vendorId || userId,
        role: 'VENDOR',
        phone: decoded.phone,
        name: decoded.name,
        status: 'ACTIVE'
      };
      return next();
    }

    if (decoded.role === 'RIDER') {
      req.user = {
        _id: userId,
        id: userId,
        riderId: userId,
        role: 'RIDER',
        phone: decoded.phone,
        name: decoded.name,
        status: 'ACTIVE'
      };
      return next();
    }

    const isExactAccountDeleteRequest = (r) => {
      if (r.method !== 'POST') return false;
      const rawPath = r.baseUrl ? (r.baseUrl + (r.path || '')) : (r.originalUrl || r.url || '');
      const pathOnly = rawPath.split('?')[0].replace(/\/+$/, '');
      return pathOnly === '/api/auth/account/delete';
    };

    const user = await User.findById(userId);
    if (!user) {
      // Handle retry of committed deletion whose HTTP response was lost over network
      if (isExactAccountDeleteRequest(req) && decoded.role === 'CUSTOMER') {
        return res.status(200).json({
          ok: true,
          success: true,
          code: 'ACCOUNT_ALREADY_DELETED',
          message: 'Account has already been permanently deleted.'
        });
      }

      return res.status(401).json({
        ok: false,
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account no longer exists'
      });
    }

    if (user.status !== 'ACTIVE') {
      // Allow resuming interrupted deletion flow if user is already flagged DELETED
      if (isExactAccountDeleteRequest(req) && user.status === 'DELETED' && decoded.role === 'CUSTOMER') {
        req.user = user;
        req.user.id = user._id;
        return next();
      }

      return res.status(403).json({
        ok: false,
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: `Your account is ${user.status.toLowerCase()}. Please contact support.`
      });
    }

    req.user = user;
    req.user.id = user._id;
    next();
  } catch (err) {
    console.error('requireAuth middleware error:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      code: 'SERVER_ERROR',
      message: 'Authentication check failed'
    });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'FORBIDDEN',
        message: `Access denied. Requires one of roles: [${roles.join(', ')}]`
      });
    }
    next();
  };
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwtSecret = getJwtAccessSecret();
      const decoded = jwtSecret ? jwt.verify(token, jwtSecret) : null;
      if (!decoded) return next();
      const userId = decoded.sub || decoded.id;
      if (userId) {
        if (decoded.role === 'VENDOR') {
          req.user = { _id: userId, id: userId, vendorId: decoded.vendorId || userId, role: 'VENDOR' };
        } else {
          const user = await User.findById(userId);
          if (user && user.status === 'ACTIVE') {
            req.user = user;
            req.user.id = user._id;
          }
        }
      }
    }
  } catch (e) {
    // optional auth passes silently
  }
  next();
};

// Backward-compatibility export
export const verifyToken = requireAuth;

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN' || req.user.adminRole !== 'superadmin') {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'FORBIDDEN',
      message: 'Access denied: Superadmin privileges required'
    });
  }
  next();
};

export const requireAdminModule = (getModuleName) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'FORBIDDEN',
        message: 'Access denied: Admin privileges required'
      });
    }

    // Superadmin has full unrestricted management access
    if (req.user.adminRole === 'superadmin') {
      return next();
    }

    // Subadmin must have explicit module permission
    if (req.user.adminRole === 'subadmin') {
      const moduleName = typeof getModuleName === 'function' ? getModuleName(req) : getModuleName;
      if (moduleName && Array.isArray(req.user.access) && req.user.access.includes(moduleName)) {
        return next();
      }
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'FORBIDDEN',
        message: `Access denied: Subadmin does not have access to '${moduleName || 'requested'}' module`
      });
    }

    // Deny by default
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'FORBIDDEN',
      message: 'Access denied: Insufficient permissions'
    });
  };
};

