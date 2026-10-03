import mongoose from 'mongoose';
import Category from '../models/Category.js';
import CategoryRequest from '../models/CategoryRequest.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import { notifyCategoryRequestOutcome } from '../services/notify.js';

const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Public: Get all active approved categories, optional type filter (for customer App and product selection)
export const getAllCategories = async (req, res) => {
  try {
    const { type, partner, home, homeOnly } = req.query;
    const filter = { isActive: true };

    // Partner selector retrieves all active categories for product assignment (?partner=true)
    // Home request / customer app filters for homeVisibility: true ({ isActive: true, homeVisibility: true })
    if (partner === 'true') {
      // Partner view: allow selection from all active categories regardless of Home visibility
    } else if (home === 'true' || homeOnly === 'true' || req.query.homeVisibility === 'true') {
      filter.homeVisibility = true;
    } else {
      // Default consumer view: only categories curated for Home visibility
      filter.homeVisibility = true;
    }

    if (type && ['GROCERY', 'FOOD'].includes(type.toUpperCase())) {
      filter.type = type.toUpperCase();
    }
    const categories = await Category.find(filter).sort({ sortOrder: 1, createdAt: 1 });
    res.json({ success: true, count: categories.length, categories });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// Public: Get a single active category by slug
export const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, message: 'Category slug is required' });
    }
    const category = await Category.findOne({ slug: slug.trim().toLowerCase(), isActive: true });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch category' });
  }
};

// Public: Get vendors that have this category assigned
export const getVendorsByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, message: 'Category slug is required' });
    }
    const category = await Category.findOne({ slug: slug.trim().toLowerCase(), isActive: true });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const vendors = await Vendor.find({
      categories: category._id,
      isActive: true
    })
      .populate('categories', 'name slug icon type')
      .sort({ isOpen: -1, rating: -1 });

    res.json({
      success: true,
      category,
      count: vendors.length,
      vendors
    });
  } catch (err) {
    console.error('Error fetching category vendors:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors for category' });
  }
};

// =========================================================================
// PARTNER ENDPOINTS: Moderated Flow (Request Category, View My Requests)
// =========================================================================

// Protected Partner Endpoint: Submit a Category Request for Admin Review
export const requestCategory = async (req, res) => {
  try {
    const caller = req.user;
    if (!caller || (caller.role !== 'VENDOR' && caller.role !== 'ADMIN')) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Only authenticated partners can request categories.'
      });
    }

    const vendorId = caller.vendorId || caller.id || caller._id;
    if (caller.role === 'VENDOR') {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor || vendor.isActive === false || vendor.isApproved === false) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Partner account must be active and approved to request categories.'
        });
      }
    }

    const { proposedName, proposedType, suggestedParentCategory, proposedIcon, reason } = req.body;

    // Validate proposed name
    if (!proposedName || typeof proposedName !== 'string' || !proposedName.trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NAME',
        message: 'Proposed category name must be a non-empty string.'
      });
    }

    const trimmedName = proposedName.trim();
    const normalizedName = trimmedName.replace(/\s+/g, ' ');
    if (normalizedName.length < 2 || normalizedName.length > 60) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_NAME',
        message: 'Proposed category name must be between 2 and 60 characters.'
      });
    }

    // Validate proposed type
    if (!proposedType || typeof proposedType !== 'string' || !['GROCERY', 'FOOD'].includes(proposedType.toUpperCase())) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TYPE',
        message: 'Category type must be GROCERY or FOOD.'
      });
    }
    const normalizedType = proposedType.toUpperCase();
    const normNameLower = normalizedName.toLowerCase();

    // Check if an approved category already exists with the same normalized name
    const existingApproved = await Category.findOne({
      $or: [
        { nameNormalized: normNameLower },
        { name: new RegExp(`^\\s*${escapeRegex(normalizedName).replace(/\\s+/g, '\\s+')}\\s*$`, 'i') }
      ],
      isActive: true
    });

    if (existingApproved) {
      return res.status(409).json({
        success: false,
        exists: true,
        code: 'CATEGORY_ALREADY_EXISTS',
        message: `An approved category "${existingApproved.name}" already exists. You can select it directly for your products.`,
        category: existingApproved
      });
    }

    // Check if vendor already has a PENDING request for this same normalized name
    const pendingDuplicate = await CategoryRequest.findOne({
      vendor: vendorId,
      nameNormalized: normNameLower,
      status: 'PENDING'
    });

    if (pendingDuplicate) {
      return res.status(409).json({
        success: false,
        code: 'REQUEST_ALREADY_PENDING',
        message: `You already have a pending request for "${normalizedName}". Our admin team is reviewing it.`,
        request: pendingDuplicate
      });
    }

    // Validate optional suggested parent category
    let validParentId = null;
    if (suggestedParentCategory) {
      if (!mongoose.isValidObjectId(suggestedParentCategory)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PARENT',
          message: 'Suggested parent category must be a valid ObjectId.'
        });
      }
      const parentDoc = await Category.findOne({ _id: suggestedParentCategory, isActive: true });
      if (!parentDoc) {
        return res.status(400).json({
          success: false,
          code: 'PARENT_NOT_FOUND',
          message: 'Suggested parent category does not exist or is inactive.'
        });
      }
      validParentId = parentDoc._id;
    }

    const sanitizedIcon = typeof proposedIcon === 'string' && proposedIcon.trim()
      ? proposedIcon.trim().slice(0, 20)
      : (normalizedType === 'FOOD' ? '🍛' : '🥦');

    const categoryRequest = await CategoryRequest.create({
      vendor: vendorId,
      proposedName: normalizedName,
      nameNormalized: normNameLower,
      proposedType: normalizedType,
      suggestedParentCategory: validParentId,
      proposedIcon: sanitizedIcon,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : '',
      status: 'PENDING'
    });

    const populated = await CategoryRequest.findById(categoryRequest._id)
      .populate('suggestedParentCategory', 'name slug icon type');

    res.status(201).json({
      success: true,
      message: 'Category request submitted successfully for admin review.',
      request: populated
    });
  } catch (err) {
    console.error('Error submitting category request:', err);
    res.status(500).json({ success: false, message: 'Server error while submitting category request' });
  }
};

// Protected Partner Endpoint: View My Category Requests
export const getMyCategoryRequests = async (req, res) => {
  try {
    const caller = req.user;
    if (!caller || (caller.role !== 'VENDOR' && caller.role !== 'ADMIN')) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Vendor authentication required.' });
    }
    const vendorId = caller.vendorId || caller.id || caller._id;

    const requests = await CategoryRequest.find({ vendor: vendorId })
      .populate('suggestedParentCategory', 'name slug icon type')
      .populate('mappedCategory', 'name slug icon type')
      .populate('createdCategory', 'name slug icon type')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (err) {
    console.error('Error fetching partner category requests:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch category requests' });
  }
};

// =========================================================================
// ADMIN DIRECT CREATION: Strictly restricted to ADMIN role
// =========================================================================
export const createCategory = async (req, res) => {
  try {
    const caller = req.user;
    if (!caller || caller.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        code: 'MODERATED_FLOW_REQUIRED',
        message: 'Partners cannot publish global categories directly. Please submit a category request via /api/categories/request.'
      });
    }

    const { name, slug, type, icon, image, subCategories, sortOrder: bodySortOrder } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Category name is required.' });
    }
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 2 || normalizedName.length > 60) {
      return res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Category name must be between 2 and 60 characters.' });
    }

    if (!type || typeof type !== 'string' || !['GROCERY', 'FOOD'].includes(type.toUpperCase())) {
      return res.status(400).json({ success: false, code: 'INVALID_TYPE', message: 'Category type must be GROCERY or FOOD.' });
    }
    const normalizedType = type.toUpperCase();
    const normNameLower = normalizedName.toLowerCase();

    let normalizedSlug;
    if (slug !== undefined && slug !== null && String(slug).trim() !== '') {
      const trimmedSlug = String(slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug) || trimmedSlug.length < 2 || trimmedSlug.length > 60) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SLUG',
          message: 'Category slug must contain only lowercase alphanumeric characters and hyphens.'
        });
      }
      normalizedSlug = trimmedSlug;
    } else {
      normalizedSlug = normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!normalizedSlug || normalizedSlug.length < 2) {
        normalizedSlug = `cat-${Date.now().toString(36)}`;
      }
    }

    const sanitizedIcon = typeof icon === 'string' && icon.trim() ? icon.trim().slice(0, 20) : (normalizedType === 'FOOD' ? '🍛' : '🥦');
    const sortOrder = typeof bodySortOrder === 'number' ? bodySortOrder : 50;

    const existing = await Category.findOne({
      $or: [
        { slug: normalizedSlug },
        { nameNormalized: normNameLower },
        { name: new RegExp(`^\\s*${escapeRegex(normalizedName).replace(/\\s+/g, '\\s+')}\\s*$`, 'i') }
      ]
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_CATEGORY',
        message: `Category already exists: ${existing.name}`,
        category: existing
      });
    }

    const newCategory = new Category({
      name: normalizedName,
      nameNormalized: normNameLower,
      slug: normalizedSlug,
      type: normalizedType,
      icon: sanitizedIcon,
      image: typeof image === 'string' ? image.trim().slice(0, 500) : '',
      subCategories: Array.isArray(subCategories)
        ? subCategories
            .filter((s) => s && typeof s.name === 'string' && s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              slug: (s.slug || s.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            }))
        : [],
      sortOrder,
      isActive: true
    });

    try {
      const saved = await newCategory.save();
      return res.status(201).json({
        success: true,
        message: 'Category created successfully by admin',
        category: saved
      });
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        const concurrentCategory = await Category.findOne({
          $or: [
            { slug: normalizedSlug },
            { nameNormalized: normNameLower }
          ]
        });
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_CATEGORY',
          message: `Category already exists: ${concurrentCategory?.name || normalizedName}`,
          category: concurrentCategory
        });
      }
      throw saveErr;
    }
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ success: false, message: 'Server error while creating category' });
  }
};

// =========================================================================
// ADMIN MODERATION & REVIEW CONTROLLERS
// =========================================================================

// Admin: Get all category requests with optional status filter
export const getCategoryRequestsAdmin = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    const requests = await CategoryRequest.find(filter)
      .populate('vendor', 'storeName ownerName phone storeType address')
      .populate('suggestedParentCategory', 'name slug icon type')
      .populate('mappedCategory', 'name slug icon type')
      .populate('createdCategory', 'name slug icon type')
      .populate('reviewedBy', 'name username role')
      .sort({ createdAt: -1 });

    const pendingCount = await CategoryRequest.countDocuments({ status: 'PENDING' });

    res.json({
      success: true,
      count: requests.length,
      pendingCount,
      requests
    });
  } catch (err) {
    console.error('Error fetching category requests for admin:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch category requests' });
  }
};

// Admin: Approve a category request (creates new global category OR adds as subcategory)
export const approveCategoryRequestAdmin = async (req, res) => {
  const { id } = req.params;
  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid category request ID' });
  }

  // Pre-flight check: Enforce database connection and transactional availability before any write
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database service is currently unavailable. Atomic category approval requires an active database connection.'
    });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    return res.status(503).json({
      success: false,
      code: 'TRANSACTIONS_UNAVAILABLE',
      message: 'Transaction session is unavailable. Atomic category approval requires database transaction support.'
    });
  }

  if (!session || typeof session.withTransaction !== 'function') {
    if (session) {
      try { await session.endSession(); } catch (_) {}
    }
    return res.status(503).json({
      success: false,
      code: 'TRANSACTIONS_UNAVAILABLE',
      message: 'Transaction support is unavailable.'
    });
  }

  try {
    let result = null;

    const executeApprovalTransaction = async (activeSession) => {
      const opts = { session: activeSession };

      const categoryRequest = await CategoryRequest.findById(id).populate('vendor').session(activeSession);

      if (!categoryRequest) {
        const notFoundErr = new Error('Category request not found');
        notFoundErr.statusCode = 404;
        notFoundErr.code = 'NOT_FOUND';
        throw notFoundErr;
      }

      if (categoryRequest.status !== 'PENDING') {
        const conflictErr = new Error(`Category request is already ${categoryRequest.status}`);
        conflictErr.statusCode = 400;
        conflictErr.code = 'ALREADY_PROCESSED';
        throw conflictErr;
      }

      const {
        name: bodyName,
        slug: bodySlug,
        type: bodyType,
        icon: bodyIcon,
        image,
        sortOrder,
        asSubcategoryOf,
        adminNotes
      } = req.body;

      const finalName = (bodyName || categoryRequest.proposedName).trim().replace(/\s+/g, ' ');
      const finalType = (bodyType || categoryRequest.proposedType).toUpperCase();
      const finalIcon = bodyIcon || categoryRequest.proposedIcon || (finalType === 'FOOD' ? '🍛' : '🥦');
      const normNameLower = finalName.toLowerCase();

      // Determine if a parent category is targeted
      const hasParentInBody = Object.prototype.hasOwnProperty.call(req.body, 'asSubcategoryOf');
      const targetParentId = hasParentInBody ? asSubcategoryOf : categoryRequest.suggestedParentCategory;
      const isParentTargeted = hasParentInBody
        ? (asSubcategoryOf !== null && asSubcategoryOf !== '')
        : Boolean(categoryRequest.suggestedParentCategory);

      // Case 1: Approve as a subcategory of an existing parent category
      if (isParentTargeted) {
        if (!targetParentId || !mongoose.isValidObjectId(targetParentId)) {
          const invErr = new Error('Parent category ID is invalid');
          invErr.statusCode = 400;
          invErr.code = 'INVALID_PARENT_CATEGORY';
          throw invErr;
        }

        const parentCat = await Category.findById(targetParentId).session(activeSession);
        if (!parentCat) {
          const notFoundErr = new Error('Parent category not found');
          notFoundErr.statusCode = 400;
          notFoundErr.code = 'PARENT_CATEGORY_NOT_FOUND';
          throw notFoundErr;
        }

        if (parentCat.isActive === false) {
          const inactiveErr = new Error(`Parent category "${parentCat.name}" is inactive`);
          inactiveErr.statusCode = 400;
          inactiveErr.code = 'PARENT_CATEGORY_INACTIVE';
          throw inactiveErr;
        }

        const subSlug = (bodySlug || finalName)
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        const existingSub = parentCat.subCategories?.find(
          (s) => s.slug === subSlug || s.name.toLowerCase() === finalName.toLowerCase()
        );

        if (!existingSub) {
          if (!parentCat.subCategories) parentCat.subCategories = [];
          parentCat.subCategories.push({ name: finalName, slug: subSlug });
          await parentCat.save(opts);
        }

        categoryRequest.status = 'APPROVED';
        categoryRequest.mappedCategory = parentCat._id;
        categoryRequest.reviewedBy = req.user._id || req.user.id;
        categoryRequest.reviewedAt = new Date();
        categoryRequest.adminNotes = adminNotes || `Approved as subcategory under "${parentCat.name}"`;
        await categoryRequest.save(opts);

        return {
          statusCode: 200,
          body: {
            success: true,
            message: `Category request approved as subcategory under "${parentCat.name}"`,
            request: categoryRequest,
            category: parentCat
          },
          notification: {
            type: 'APPROVED',
            message: `Your category request "${finalName}" was approved as a subcategory under "${parentCat.name}".`,
            category: parentCat,
            request: categoryRequest
          }
        };
      }

      // Case 2: Approve as a top-level global Category
      let normalizedSlug = bodySlug
        ? String(bodySlug).trim().toLowerCase()
        : finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      if (!normalizedSlug || normalizedSlug.length < 2) {
        normalizedSlug = `cat-${Date.now().toString(36)}`;
      }

      // Check for equivalent duplicates (slug OR normalized name) inside transaction
      const dupQuery = Category.findOne({
        $or: [
          { slug: normalizedSlug },
          { nameNormalized: normNameLower },
          { name: new RegExp(`^\\s*${escapeRegex(finalName).replace(/\\s+/g, '\\s+')}\\s*$`, 'i') }
        ]
      }).session(activeSession);
      const existing = await dupQuery;

      if (existing) {
        // Map to existing category
        categoryRequest.status = 'APPROVED';
        categoryRequest.mappedCategory = existing._id;
        categoryRequest.reviewedBy = req.user._id || req.user.id;
        categoryRequest.reviewedAt = new Date();
        categoryRequest.adminNotes = adminNotes || `Mapped to existing category "${existing.name}"`;
        await categoryRequest.save(opts);

        return {
          statusCode: 200,
          body: {
            success: true,
            message: `Existing category "${existing.name}" already active; request successfully mapped.`,
            request: categoryRequest,
            category: existing
          },
          notification: {
            type: 'MAPPED',
            message: `Category "${existing.name}" is already available. Your request has been mapped to it.`,
            category: existing,
            request: categoryRequest
          }
        };
      }

      const newCategory = new Category({
        name: finalName,
        nameNormalized: normNameLower,
        slug: normalizedSlug,
        type: finalType,
        icon: finalIcon,
        image: typeof image === 'string' ? image.trim().slice(0, 500) : '',
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 50,
        isActive: true
      });

      // Do NOT catch E11000 here to continue writes in the aborted transaction.
      // Let it throw out of withTransaction so the transaction aborts cleanly, and handle after abort via fresh transaction.
      const savedCategory = await newCategory.save(opts);

      categoryRequest.status = 'APPROVED';
      categoryRequest.createdCategory = savedCategory._id;
      categoryRequest.reviewedBy = req.user._id || req.user.id;
      categoryRequest.reviewedAt = new Date();
      categoryRequest.adminNotes = adminNotes || 'Approved as global category';
      await categoryRequest.save(opts);

      return {
        statusCode: 201,
        body: {
          success: true,
          message: 'Category request approved and global category created',
          request: categoryRequest,
          category: savedCategory
        },
        notification: {
          type: 'APPROVED',
          message: `Your category request "${finalName}" has been approved and is now active platform-wide!`,
          category: savedCategory,
          request: categoryRequest
        }
      };
    };

    // Execute within transaction
    try {
      await session.withTransaction(async () => {
        result = await executeApprovalTransaction(session);
      });
    } catch (txErr) {
      const isDuplicateKey =
        txErr.code === 11000 ||
        (txErr.name === 'MongoServerError' && txErr.code === 11000) ||
        (typeof txErr.message === 'string' && txErr.message.includes('E11000'));

      if (isDuplicateKey) {
        // Original transaction was aborted by E11000 duplicate conflict.
        // Cleanly terminate the aborted session and retry conflict mapping in a FRESH transaction.
        try {
          await session.endSession();
        } catch (_) {}
        session = null;

        session = await mongoose.startSession();
        if (!session || typeof session.withTransaction !== 'function') {
          return res.status(503).json({
            success: false,
            code: 'TRANSACTIONS_UNAVAILABLE',
            message: 'Unable to start fresh transaction to resolve duplicate category conflict.'
          });
        }

        await session.withTransaction(async () => {
          const retryRequest = await CategoryRequest.findById(id).populate('vendor').session(session);
          if (!retryRequest) {
            const notFoundErr = new Error('Category request not found');
            notFoundErr.statusCode = 404;
            notFoundErr.code = 'NOT_FOUND';
            throw notFoundErr;
          }

          if (retryRequest.status !== 'PENDING') {
            const conflictErr = new Error(`Category request is already ${retryRequest.status}`);
            conflictErr.statusCode = 400;
            conflictErr.code = 'ALREADY_PROCESSED';
            throw conflictErr;
          }

          const { name: bodyName, slug: bodySlug, adminNotes } = req.body;
          const finalName = (bodyName || retryRequest.proposedName).trim().replace(/\s+/g, ' ');
          const normNameLower = finalName.toLowerCase();
          let normalizedSlug = bodySlug
            ? String(bodySlug).trim().toLowerCase()
            : finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

          const concurrent = await Category.findOne({
            $or: [
              { slug: normalizedSlug },
              { nameNormalized: normNameLower },
              { name: new RegExp(`^\\s*${escapeRegex(finalName).replace(/\\s+/g, '\\s+')}\\s*$`, 'i') }
            ]
          }).session(session);

          if (!concurrent) {
            const conflictErr = new Error('Duplicate key conflict occurred, but matching category not found.');
            conflictErr.statusCode = 409;
            conflictErr.code = 'CONCURRENT_CONFLICT';
            throw conflictErr;
          }

          retryRequest.status = 'APPROVED';
          retryRequest.mappedCategory = concurrent._id;
          retryRequest.reviewedBy = req.user._id || req.user.id;
          retryRequest.reviewedAt = new Date();
          retryRequest.adminNotes = adminNotes || `Mapped to concurrent existing category "${concurrent.name}"`;
          await retryRequest.save({ session });

          result = {
            statusCode: 200,
            body: {
              success: true,
              message: `Category created concurrently; mapped to "${concurrent.name || finalName}"`,
              request: retryRequest,
              category: concurrent
            },
            notification: {
              type: 'MAPPED',
              message: `Category "${concurrent.name || finalName}" is already available. Your request has been mapped to it.`,
              category: concurrent,
              request: retryRequest
            }
          };
        });
      } else {
        throw txErr;
      }
    }

    // Send notifications ONLY after successful commit; failure must not alter committed outcome
    if (result?.notification) {
      try {
        await notifyCategoryRequestOutcome(result.notification.request, {
          type: result.notification.type,
          message: result.notification.message,
          category: result.notification.category
        });
      } catch (notifyErr) {
        console.error('[WARN] Post-commit notification failed:', notifyErr.message);
      }
    }

    return res.status(result.statusCode).json(result.body);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code,
        message: err.message
      });
    }
    console.error('Error approving category request:', err);
    return res.status(500).json({ success: false, message: 'Server error while approving category request' });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (e) {
        console.error('[WARN] Failed to end approval session:', e.message);
      }
    }
  }
};

// Admin: Reject a category request
export const rejectCategoryRequestAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid category request ID' });
    }

    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ success: false, code: 'REASON_REQUIRED', message: 'Rejection reason is required' });
    }

    const categoryRequest = await CategoryRequest.findById(id).populate('vendor');
    if (!categoryRequest) {
      return res.status(404).json({ success: false, message: 'Category request not found' });
    }

    if (categoryRequest.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_PROCESSED',
        message: `Category request is already ${categoryRequest.status}`
      });
    }

    categoryRequest.status = 'REJECTED';
    categoryRequest.adminNotes = reason.trim();
    categoryRequest.reviewedBy = req.user._id || req.user.id;
    categoryRequest.reviewedAt = new Date();
    await categoryRequest.save();

    await notifyCategoryRequestOutcome(categoryRequest, {
      type: 'REJECTED',
      message: `Your category request "${categoryRequest.proposedName}" was not approved: ${reason.trim()}`
    });

    res.json({
      success: true,
      message: 'Category request rejected',
      request: categoryRequest
    });
  } catch (err) {
    console.error('Error rejecting category request:', err);
    res.status(500).json({ success: false, message: 'Server error while rejecting category request' });
  }
};

// Admin: Map a category request to an existing category
export const mapCategoryRequestAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid category request ID' });
    }

    const { targetCategoryId, adminNotes } = req.body;
    if (!targetCategoryId || !mongoose.isValidObjectId(targetCategoryId)) {
      return res.status(400).json({ success: false, code: 'INVALID_CATEGORY_ID', message: 'Valid target category ID required' });
    }

    const targetCategory = await Category.findOne({ _id: targetCategoryId, isActive: true });
    if (!targetCategory) {
      return res.status(404).json({ success: false, code: 'CATEGORY_NOT_FOUND', message: 'Target category does not exist or is inactive' });
    }

    const categoryRequest = await CategoryRequest.findById(id).populate('vendor');
    if (!categoryRequest) {
      return res.status(404).json({ success: false, message: 'Category request not found' });
    }

    categoryRequest.status = 'APPROVED';
    categoryRequest.mappedCategory = targetCategory._id;
    categoryRequest.adminNotes = adminNotes ? adminNotes.trim() : `Mapped to existing category "${targetCategory.name}"`;
    categoryRequest.reviewedBy = req.user._id || req.user.id;
    categoryRequest.reviewedAt = new Date();
    await categoryRequest.save();

    await notifyCategoryRequestOutcome(categoryRequest, {
      type: 'MAPPED',
      message: `Your category request "${categoryRequest.proposedName}" was mapped to existing category "${targetCategory.name}".`,
      category: targetCategory
    });

    res.json({
      success: true,
      message: `Category request mapped to "${targetCategory.name}"`,
      request: categoryRequest,
      category: targetCategory
    });
  } catch (err) {
    console.error('Error mapping category request:', err);
    res.status(500).json({ success: false, message: 'Server error while mapping category request' });
  }
};

// Admin: Get all categories with product counts (for curation and reordering)
export const getAllCategoriesAdmin = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ sortOrder: 1, createdAt: 1 });
    const productCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    for (const p of productCounts) {
      if (p._id) countMap[p._id.toString()] = p.count;
    }

    const enriched = categories.map((cat) => ({
      ...cat.toObject(),
      productCount: countMap[cat._id.toString()] || 0
    }));

    res.json({
      success: true,
      count: enriched.length,
      categories: enriched
    });
  } catch (err) {
    console.error('Error fetching admin categories:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories for admin' });
  }
};

// Admin: Update a category (sort order, active status, icon, subcategories)
export const updateCategoryAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid category ID' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const allowed = ['name', 'icon', 'image', 'type', 'sortOrder', 'isActive', 'subCategories'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'name' && typeof req.body.name === 'string' && req.body.name.trim()) {
          const norm = req.body.name.trim().replace(/\s+/g, ' ');
          category.name = norm;
          category.nameNormalized = norm.toLowerCase();
        } else {
          category[key] = req.body[key];
        }
      }
    }

    await category.save();

    res.json({
      success: true,
      message: `Category "${category.name}" updated`,
      category
    });
  } catch (err) {
    console.error('Error updating category by admin:', err);
    res.status(500).json({ success: false, message: 'Server error while updating category' });
  }
};
