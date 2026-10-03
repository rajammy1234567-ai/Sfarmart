import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Controllers
import {
  createCategory,
  requestCategory,
  getMyCategoryRequests,
  getCategoryRequestsAdmin,
  approveCategoryRequestAdmin,
  rejectCategoryRequestAdmin,
  mapCategoryRequestAdmin,
  getAllCategories,
  getAllCategoriesAdmin,
  updateCategoryAdmin
} from '../controllers/categoryController.js';

// Models
import Category from '../models/Category.js';
import CategoryRequest from '../models/CategoryRequest.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('Moderated Category Flow & Authorization Test Suite (Offline)', async (t) => {
  // Backup model methods
  const origCatFind = Category.find;
  const origCatFindOne = Category.findOne;
  const origCatFindById = Category.findById;
  const origCatReqFind = CategoryRequest.find;
  const origCatReqFindOne = CategoryRequest.findOne;
  const origCatReqFindById = CategoryRequest.findById;
  const origCatReqCreate = CategoryRequest.create;
  const origCatReqCount = CategoryRequest.countDocuments;
  const origVendorFindById = Vendor.findById;

  t.beforeEach(() => {
    Category.find = () => ({ sort: () => [] });
    Category.findOne = async () => null;
    Category.findById = async () => null;
    CategoryRequest.find = () => ({ populate: () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => [] }) }) }) }) });
    CategoryRequest.findOne = async () => null;
    CategoryRequest.findById = async () => null;
    CategoryRequest.create = async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc });
    CategoryRequest.countDocuments = async () => 0;
    Vendor.findById = async () => null;
  });

  t.afterEach(() => {
    Category.find = origCatFind;
    Category.findOne = origCatFindOne;
    Category.findById = origCatFindById;
    CategoryRequest.find = origCatReqFind;
    CategoryRequest.findOne = origCatReqFindOne;
    CategoryRequest.findById = origCatReqFindById;
    CategoryRequest.create = origCatReqCreate;
    CategoryRequest.countDocuments = origCatReqCount;
    Vendor.findById = origVendorFindById;
  });

  // -------------------------------------------------------------------------
  // 1. Direct Partner Create Blocked (Moderated Flow Enforcement)
  // -------------------------------------------------------------------------
  await t.test('1. Direct Partner Create Blocked: Partners cannot publish global categories directly', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    const req = {
      user: { role: 'VENDOR', vendorId },
      body: { name: 'Exotic Berries', type: 'GROCERY' }
    };
    const res = createMockRes();

    await createCategory(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODERATED_FLOW_REQUIRED');
    assert.match(res.body.message, /categories\/request/i);
  });

  await t.test('2. Direct Create Guard: Non-admin (customer/anonymous) cannot call POST /categories', async () => {
    // Unauthenticated
    const res1 = createMockRes();
    await createCategory({ user: null, body: { name: 'Berries' } }, res1);
    assert.equal(res1.statusCode, 403);
    assert.equal(res1.body.code, 'MODERATED_FLOW_REQUIRED');

    // Customer
    const res2 = createMockRes();
    await createCategory({ user: { role: 'CUSTOMER', id: '123' }, body: { name: 'Berries' } }, res2);
    assert.equal(res2.statusCode, 403);
    assert.equal(res2.body.code, 'MODERATED_FLOW_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // 2. Partner Category Request Validation & Submission
  // -------------------------------------------------------------------------
  await t.test('3. Partner Request Auth: Inactive or unapproved partner is rejected with 403', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    Vendor.findById = async () => ({ _id: vendorId, isActive: false, isApproved: true });

    const req = {
      user: { role: 'VENDOR', vendorId },
      body: { proposedName: 'Microgreens', proposedType: 'GROCERY' }
    };
    const res = createMockRes();
    await requestCategory(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
    assert.match(res.body.message, /active and approved/i);
  });

  await t.test('4. Partner Request Validation: Rejects invalid proposed name and type', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    Vendor.findById = async () => ({ _id: vendorId, isActive: true, isApproved: true });

    // Empty name
    const res1 = createMockRes();
    await requestCategory({ user: { role: 'VENDOR', vendorId }, body: { proposedName: '', proposedType: 'GROCERY' } }, res1);
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_NAME');

    // Name too short
    const res2 = createMockRes();
    await requestCategory({ user: { role: 'VENDOR', vendorId }, body: { proposedName: 'A', proposedType: 'GROCERY' } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'INVALID_NAME');

    // Invalid type
    const res3 = createMockRes();
    await requestCategory({ user: { role: 'VENDOR', vendorId }, body: { proposedName: 'Microgreens', proposedType: 'TOYS' } }, res3);
    assert.equal(res3.statusCode, 400);
    assert.equal(res3.body.code, 'INVALID_TYPE');
  });

  await t.test('5. Existing Approved Category Detection: 409 returned with existing category ID if already active', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    Vendor.findById = async () => ({ _id: vendorId, isActive: true, isApproved: true });

    const existingCat = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Fresh Fruits & Vegetables',
      slug: 'fresh-fruits-vegetables',
      nameNormalized: 'fresh fruits & vegetables',
      type: 'GROCERY',
      isActive: true
    };

    Category.findOne = async () => existingCat;

    const req = {
      user: { role: 'VENDOR', vendorId },
      body: { proposedName: '  fresh   fruits &  vegetables  ', proposedType: 'GROCERY' }
    };
    const res = createMockRes();
    await requestCategory(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'CATEGORY_ALREADY_EXISTS');
    assert.equal(res.body.exists, true);
    assert.equal(res.body.category._id, existingCat._id);
  });

  await t.test('6. Duplicate Pending Request Guard: 409 returned if vendor already has pending request for same name', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    Vendor.findById = async () => ({ _id: vendorId, isActive: true, isApproved: true });

    Category.findOne = async () => null; // No approved category exists

    const pendingDoc = {
      _id: new mongoose.Types.ObjectId(),
      vendor: vendorId,
      proposedName: 'Hydroponic Basil',
      nameNormalized: 'hydroponic basil',
      status: 'PENDING'
    };
    CategoryRequest.findOne = async () => pendingDoc;

    const req = {
      user: { role: 'VENDOR', vendorId },
      body: { proposedName: 'Hydroponic Basil', proposedType: 'GROCERY' }
    };
    const res = createMockRes();
    await requestCategory(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'REQUEST_ALREADY_PENDING');
  });

  await t.test('7. Successful Category Request Creation: Creates PENDING request with normalized name and requester ID', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    Vendor.findById = async () => ({ _id: vendorId, isActive: true, isApproved: true });

    Category.findOne = async () => null;
    CategoryRequest.findOne = async () => null;

    let createdDoc = null;
    CategoryRequest.create = async (doc) => {
      createdDoc = { _id: new mongoose.Types.ObjectId(), ...doc };
      return createdDoc;
    };
    CategoryRequest.findById = () => ({
      populate: async () => ({
        ...createdDoc,
        suggestedParentCategory: null
      })
    });

    const req = {
      user: { role: 'VENDOR', vendorId },
      body: {
        proposedName: '  Artisanal   Sourdough  ',
        proposedType: 'FOOD',
        proposedIcon: '🥖',
        reason: 'Fresh baked daily breads for morning catalog'
      }
    };
    const res = createMockRes();
    await requestCategory(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(createdDoc.proposedName, 'Artisanal Sourdough');
    assert.equal(createdDoc.nameNormalized, 'artisanal sourdough');
    assert.equal(createdDoc.proposedType, 'FOOD');
    assert.equal(createdDoc.status, 'PENDING');
    assert.equal(createdDoc.proposedIcon, '🥖');
    assert.equal(createdDoc.reason, 'Fresh baked daily breads for morning catalog');
  });

  // -------------------------------------------------------------------------
  // 3. Admin Moderation & Approval Flow
  // -------------------------------------------------------------------------
  await t.test('8. Admin Approval as Subcategory: Appends to parent category subCategories and updates status', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const parentId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    const parentCat = {
      _id: parentId,
      name: 'Dairy, Bread & Eggs',
      subCategories: [{ name: 'Eggs', slug: 'eggs' }],
      save: async function () { return this; }
    };

    const catReq = {
      _id: requestId,
      vendor: new mongoose.Types.ObjectId(),
      proposedName: 'Artisanal Sourdough',
      nameNormalized: 'artisanal sourdough',
      proposedType: 'FOOD',
      suggestedParentCategory: parentId,
      status: 'PENDING',
      save: async function () { return this; },
      populate: async function () { return this; }
    };

    const origStartSession = mongoose.startSession;
    const origReadyState = mongoose.connection?.readyState;
    if (mongoose.connection) mongoose.connection.readyState = 1;
    mongoose.startSession = async () => ({
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    });

    CategoryRequest.findById = () => ({
      populate() { return this; },
      session() { return this; },
      then(resolve, reject) { return Promise.resolve(catReq).then(resolve, reject); }
    });
    Category.findById = () => ({
      session() { return this; },
      then(resolve, reject) { return Promise.resolve(parentCat).then(resolve, reject); }
    });

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: {
        name: 'Artisanal Sourdough',
        asSubcategoryOf: parentId,
        adminNotes: 'Approved as subcategory under Dairy & Bread'
      }
    };
    const res = createMockRes();
    try {
      await approveCategoryRequestAdmin(req, res);
    } finally {
      mongoose.startSession = origStartSession;
      if (mongoose.connection) mongoose.connection.readyState = origReadyState;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(catReq.status, 'APPROVED');
    assert.equal(catReq.mappedCategory, parentId);
    assert.equal(parentCat.subCategories.length, 2);
    assert.equal(parentCat.subCategories[1].name, 'Artisanal Sourdough');
    assert.equal(parentCat.subCategories[1].slug, 'artisanal-sourdough');
  });

  await t.test('9. Admin Rejection: Updates status to REJECTED and saves rejection reason', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    const catReq = {
      _id: requestId,
      vendor: new mongoose.Types.ObjectId(),
      proposedName: 'Used Kitchen Utensils',
      status: 'PENDING',
      save: async function () { return this; },
      populate: async function () { return this; }
    };

    CategoryRequest.findById = () => ({
      populate: async () => catReq
    });

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: { reason: 'Does not meet fresh food / grocery taxonomy criteria' }
    };
    const res = createMockRes();
    await rejectCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(catReq.status, 'REJECTED');
    assert.equal(catReq.adminNotes, 'Does not meet fresh food / grocery taxonomy criteria');
  });

  await t.test('10. Admin Mapping: Maps request to existing active category without creating duplicate', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const targetCatId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    const existingCat = {
      _id: targetCatId,
      name: 'Fresh Fruits & Vegetables',
      isActive: true
    };

    const catReq = {
      _id: requestId,
      vendor: new mongoose.Types.ObjectId(),
      proposedName: 'Apples & Pears',
      status: 'PENDING',
      save: async function () { return this; },
      populate: async function () { return this; }
    };

    CategoryRequest.findById = () => ({
      populate: async () => catReq
    });
    Category.findOne = async () => existingCat;

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: {
        targetCategoryId: targetCatId,
        adminNotes: 'Mapped to primary Fruits & Vegetables category'
      }
    };
    const res = createMockRes();
    await mapCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(catReq.status, 'APPROVED');
    assert.equal(catReq.mappedCategory, targetCatId);
  });

  // -------------------------------------------------------------------------
  // 4. Customer Isolation Guard
  // -------------------------------------------------------------------------
  await t.test('11. Customer API Isolation: GET /api/categories only returns active approved categories, never pending/rejected requests', async () => {
    const activeCategories = [
      { _id: new mongoose.Types.ObjectId(), name: 'Fruits & Vegetables', isActive: true, sortOrder: 1 },
      { _id: new mongoose.Types.ObjectId(), name: 'Dairy & Bread', isActive: true, sortOrder: 2 }
    ];

    Category.find = (filter) => {
      assert.equal(filter.isActive, true);
      return {
        sort: () => activeCategories
      };
    };

    const req = { query: {} };
    const res = createMockRes();
    await getAllCategories(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 2);
    assert.deepEqual(res.body.categories, activeCategories);
  });
});
