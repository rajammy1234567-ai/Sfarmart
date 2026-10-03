import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Controller imports
import {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  getVendorsByCategory
} from '../controllers/categoryController.js';
import {
  createProduct,
  updateProduct,
  getAllProducts,
  deleteProduct,
  toggleProductStock,
  syncVendorCategories
} from '../controllers/productController.js';
import { getAllVendors } from '../controllers/vendorController.js';

// Model imports
import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';

// Script import
import {
  validateStagingUri,
  runStagingCategorySetup,
  REQUIRED_UNIQUE_INDEXES,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../scripts/setupStagingCategories.js';

// Helper to create mock response object
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

test('Offline Category Management & Discovery Test Suite', async (t) => {
  const originalCategoryFind = Category.find;
  const originalCategoryFindOne = Category.findOne;
  const originalVendorFind = Vendor.find;
  const originalVendorFindById = Vendor.findById;
  const originalVendorFindByIdAndUpdate = Vendor.findByIdAndUpdate;
  const originalProductFind = Product.find;
  const originalProductFindById = Product.findById;
  const originalProductFindByIdAndUpdate = Product.findByIdAndUpdate;
  const originalProductFindByIdAndDelete = Product.findByIdAndDelete;
  const originalProductDistinct = Product.distinct;

  t.beforeEach(() => {
    Category.find = () => ({ sort: () => [] });
    Category.findOne = async () => null;
    Vendor.find = () => ({ populate: () => ({ sort: () => [] }) });
    Vendor.findById = async () => null;
    Vendor.findByIdAndUpdate = async () => null;
    Product.find = () => ({ populate: () => ({ populate: () => ({ sort: () => [] }), sort: () => [] }) });
    Product.findById = async () => null;
    Product.findByIdAndUpdate = () => ({ populate: async () => null });
    Product.findByIdAndDelete = async () => null;
    Product.distinct = async () => [];
  });

  t.afterEach(() => {
    Category.find = originalCategoryFind;
    Category.findOne = originalCategoryFindOne;
    Vendor.find = originalVendorFind;
    Vendor.findById = originalVendorFindById;
    Vendor.findByIdAndUpdate = originalVendorFindByIdAndUpdate;
    Product.find = originalProductFind;
    Product.findById = originalProductFindById;
    Product.findByIdAndUpdate = originalProductFindByIdAndUpdate;
    Product.findByIdAndDelete = originalProductFindByIdAndDelete;
    Product.distinct = originalProductDistinct;
  });

  await t.test('1. Partner Auth & Status: Non-admin caller is rejected with 403 MODERATED_FLOW_REQUIRED', async () => {
    const req = { user: null, body: { name: 'Fresh Fruits', type: 'GROCERY' } };
    const res = createMockRes();
    await createCategory(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODERATED_FLOW_REQUIRED');

    // Customer role is rejected
    const custReq = { user: { role: 'CUSTOMER', id: new mongoose.Types.ObjectId().toString() }, body: { name: 'Fresh Fruits', type: 'GROCERY' } };
    const custRes = createMockRes();
    await createCategory(custReq, custRes);
    assert.equal(custRes.statusCode, 403);
    assert.equal(custRes.body.code, 'MODERATED_FLOW_REQUIRED');

    // Vendor role is rejected from direct creation
    const vendReq = { user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId().toString() }, body: { name: 'Fresh Fruits', type: 'GROCERY' } };
    const vendRes = createMockRes();
    await createCategory(vendReq, vendRes);
    assert.equal(vendRes.statusCode, 403);
    assert.equal(vendRes.body.code, 'MODERATED_FLOW_REQUIRED');
  });

  await t.test('2. Partner Moderation Gate: Vendor must submit category request, direct publish prohibited', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();
    const req = {
      user: { role: 'VENDOR', vendorId },
      body: { name: 'Organic Greens', type: 'GROCERY' }
    };
    const res = createMockRes();
    await createCategory(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'MODERATED_FLOW_REQUIRED');
    assert.match(res.body.message, /categories\/request/i);
  });

  await t.test('3. Field Validation: Admin create rejects invalid name, type, and malformed slugs', async () => {
    const adminUser = { role: 'ADMIN', _id: new mongoose.Types.ObjectId().toString() };

    // Empty name
    const res1 = createMockRes();
    await createCategory({ user: adminUser, body: { name: '', type: 'GROCERY' } }, res1);
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_NAME');

    // Invalid type
    const res2 = createMockRes();
    await createCategory({ user: adminUser, body: { name: 'Fresh Herbs', type: 'ELECTRONICS' } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'INVALID_TYPE');

    // Malformed slug
    const res3 = createMockRes();
    await createCategory({ user: adminUser, body: { name: 'Fresh Herbs', type: 'GROCERY', slug: 'INVALID SLUG!!!' } }, res3);
    assert.equal(res3.statusCode, 400);
    assert.equal(res3.body.code, 'INVALID_SLUG');
  });

  await t.test('4. Duplicate Detection: Detects equivalent slug or case-insensitive/normalized-whitespace name match with 409', async () => {
    const adminUser = { role: 'ADMIN', _id: new mongoose.Types.ObjectId().toString() };

    const existingCat = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Fresh Fruits & Vegetables',
      slug: 'fruits-vegetables',
      type: 'GROCERY'
    };

    Category.findOne = async () => existingCat;

    // Test A: Name with mixed casing and multiple spaces
    const req1 = {
      user: adminUser,
      body: { name: '  fresh   fruits &  vegetables  ', type: 'GROCERY' }
    };
    const res1 = createMockRes();
    await createCategory(req1, res1);

    assert.equal(res1.statusCode, 409);
    assert.equal(res1.body.code, 'DUPLICATE_CATEGORY');
    assert.equal(res1.body.category._id, existingCat._id);

    // Test B: Slug duplicate match
    const req2 = {
      user: adminUser,
      body: { name: 'New Fruit Assortment', slug: 'fruits-vegetables', type: 'GROCERY' }
    };
    const res2 = createMockRes();
    await createCategory(req2, res2);

    assert.equal(res2.statusCode, 409);
    assert.equal(res2.body.code, 'DUPLICATE_CATEGORY');
  });

  await t.test('4b. Concurrent Creation Race: E11000 on unique slug or unique nameNormalized returns 409 safely', async () => {
    const adminUser = { role: 'ADMIN', _id: new mongoose.Types.ObjectId().toString() };

    const concurrentWinner = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Organic Honey',
      nameNormalized: 'organic honey',
      slug: 'organic-honey',
      type: 'GROCERY'
    };

    // Scenario A: Race condition on slug_1
    let findCount = 0;
    Category.findOne = async () => {
      findCount++;
      return findCount === 1 ? null : concurrentWinner;
    };

    const originalSave = Category.prototype.save;
    Category.prototype.save = async function() {
      const err = new Error('E11000 duplicate key error collection: categories index: slug_1 dup key');
      err.code = 11000;
      throw err;
    };

    try {
      const req = {
        user: adminUser,
        body: { name: 'Organic Honey', type: 'GROCERY' }
      };
      const res = createMockRes();
      await createCategory(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, 'DUPLICATE_CATEGORY');
      assert.equal(res.body.category._id, concurrentWinner._id);
    } finally {
      Category.prototype.save = originalSave;
    }

    // Scenario B: Race condition on same normalized name but DIFFERENT slugs!
    findCount = 0;
    Category.findOne = async () => {
      findCount++;
      return findCount === 1 ? null : concurrentWinner;
    };

    Category.prototype.save = async function() {
      const err = new Error('E11000 duplicate key error collection: categories index: nameNormalized_1 dup key');
      err.code = 11000;
      throw err;
    };

    try {
      const reqDiffSlug = {
        user: adminUser,
        body: { name: '  organic   HONEY  ', slug: 'pure-honey-variant', type: 'GROCERY' }
      };
      const resDiffSlug = createMockRes();
      await createCategory(reqDiffSlug, resDiffSlug);

      assert.equal(resDiffSlug.statusCode, 409);
      assert.equal(resDiffSlug.body.code, 'DUPLICATE_CATEGORY');
      assert.equal(resDiffSlug.body.category._id, concurrentWinner._id);
    } finally {
      Category.prototype.save = originalSave;
    }
  });

  await t.test('5. Product Creation Strict Category Validation: Rejects fake IDs like cat-1 and non-existent IDs', async () => {
    const vendorId = new mongoose.Types.ObjectId().toString();

    // Fake string ID 'cat-1'
    const req1 = {
      user: { role: 'VENDOR', vendorId },
      body: { name: 'Apples', price: 100, category: 'cat-1' }
    };
    const res1 = createMockRes();
    await createProduct(req1, res1);
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_CATEGORY');

    // Valid ObjectId but category not in database or inactive
    Category.findOne = async () => null;
    const missingCatId = new mongoose.Types.ObjectId().toString();
    const req2 = {
      user: { role: 'VENDOR', vendorId },
      body: { name: 'Apples', price: 100, category: missingCatId }
    };
    const res2 = createMockRes();
    await createProduct(req2, res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'CATEGORY_NOT_FOUND');
  });

  await t.test('6. Product Update Strict Category Validation & Ownership Checks', async () => {
    const ownerVendorId = new mongoose.Types.ObjectId();
    const otherVendorId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId().toString();

    const existingProd = {
      _id: productId,
      name: 'Shimla Apples',
      vendor: ownerVendorId,
      category: new mongoose.Types.ObjectId()
    };

    Product.findById = async () => existingProd;

    // Caller is different vendor -> FORBIDDEN
    const forbiddenReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: otherVendorId.toString() },
      body: { name: 'Hacked Name' }
    };
    const forbiddenRes = createMockRes();
    await updateProduct(forbiddenReq, forbiddenRes);
    assert.equal(forbiddenRes.statusCode, 403);
    assert.equal(forbiddenRes.body.code, 'FORBIDDEN');

    // Updating category with fake string ID -> INVALID_CATEGORY
    const badCatReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: ownerVendorId.toString() },
      body: { category: 'cat-2' }
    };
    const badCatRes = createMockRes();
    await updateProduct(badCatReq, badCatRes);
    assert.equal(badCatRes.statusCode, 400);
    assert.equal(badCatRes.body.code, 'INVALID_CATEGORY');

    // Updating category with inactive/missing category -> CATEGORY_NOT_FOUND
    Category.findOne = async () => null;
    const missingCatReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: ownerVendorId.toString() },
      body: { category: new mongoose.Types.ObjectId().toString() }
    };
    const missingCatRes = createMockRes();
    await updateProduct(missingCatReq, missingCatRes);
    assert.equal(missingCatRes.statusCode, 400);
    assert.equal(missingCatRes.body.code, 'CATEGORY_NOT_FOUND');
  });

  await t.test('6b. Product Lifecycle Sync: Update, Stock Change, and Delete maintain Vendor Category Membership', async () => {
    const ownerVendorId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId().toString();
    const catId1 = new mongoose.Types.ObjectId();
    const catId2 = new mongoose.Types.ObjectId();

    let syncedVendorId = null;
    Product.distinct = async (field, query) => {
      syncedVendorId = query.vendor;
      return [catId2];
    };
    Category.find = () => ({
      distinct: async () => [catId2]
    });
    let vendorSetUpdated = null;
    Vendor.findByIdAndUpdate = async (id, update) => {
      vendorSetUpdated = update;
      return { _id: id };
    };

    // A. Update Product triggers category sync
    const prodDoc = {
      _id: productId,
      name: 'Old Apples',
      vendor: ownerVendorId,
      category: catId1
    };
    Product.findById = async () => prodDoc;
    Product.findByIdAndUpdate = () => ({
      populate: async () => ({ ...prodDoc, category: catId2 })
    });
    Category.findOne = async () => ({ _id: catId2, isActive: true });

    const updateReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: ownerVendorId.toString() },
      body: { category: catId2.toString() }
    };
    const updateRes = createMockRes();
    await updateProduct(updateReq, updateRes);
    assert.equal(updateRes.statusCode, 200);
    assert.equal(String(syncedVendorId), String(ownerVendorId));
    assert.deepEqual(vendorSetUpdated.$set.categories, [catId2]);

    // B. Stock Toggle triggers category sync
    let saveCalled = false;
    const stockProdDoc = {
      _id: productId,
      name: 'Old Apples',
      vendor: ownerVendorId,
      stockQty: 10,
      inStock: true,
      save: async () => { saveCalled = true; }
    };
    Product.findById = async () => stockProdDoc;
    const stockReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: ownerVendorId.toString() },
      body: { inStock: false }
    };
    const stockRes = createMockRes();
    await toggleProductStock(stockReq, stockRes);
    assert.equal(stockRes.statusCode, 200);
    assert.equal(saveCalled, true);
    assert.equal(String(syncedVendorId), String(ownerVendorId));

    // C. Product Delete triggers category sync
    let deleteCalled = false;
    Product.findById = async () => prodDoc;
    Product.findByIdAndDelete = async (id) => { deleteCalled = true; return { _id: id }; };
    const delReq = {
      params: { id: productId },
      user: { role: 'VENDOR', vendorId: ownerVendorId.toString() }
    };
    const delRes = createMockRes();
    await deleteProduct(delReq, delRes);
    assert.equal(delRes.statusCode, 200);
    assert.equal(deleteCalled, true);
    assert.equal(String(syncedVendorId), String(ownerVendorId));
  });

  await t.test('7. Discovery Safety: Unknown/empty category query returns 0 items without unrelated data leak', async () => {
    Category.findOne = async () => null; // Category not found

    // Product query with unknown category
    const prodReq = { query: { category: 'non-existent-category' } };
    const prodRes = createMockRes();
    await getAllProducts(prodReq, prodRes);
    assert.equal(prodRes.statusCode, 200);
    assert.equal(prodRes.body.count, 0);
    assert.deepEqual(prodRes.body.products, []);

    // Vendor query with unknown category
    const vendReq = { query: { category: 'non-existent-category' } };
    const vendRes = createMockRes();
    await getAllVendors(vendReq, vendRes);
    assert.equal(vendRes.statusCode, 200);
    assert.equal(vendRes.body.count, 0);
    assert.deepEqual(vendRes.body.vendors, []);
  });

  await t.test('8. Category Discovery Routes: getCategoryBySlug & getVendorsByCategory return 404 for unknown slug', async () => {
    Category.findOne = async () => null;

    const slugReq = { params: { slug: 'unknown-slug' } };
    const slugRes = createMockRes();
    await getCategoryBySlug(slugReq, slugRes);
    assert.equal(slugRes.statusCode, 404);

    const vendReq = { params: { slug: 'unknown-slug' } };
    const vendRes = createMockRes();
    await getVendorsByCategory(vendReq, vendRes);
    assert.equal(vendRes.statusCode, 404);
  });

  await t.test('9. Vendor Category Membership Sync: syncVendorCategories keeps vendor categories aligned with active products', async () => {
    const vendorId = new mongoose.Types.ObjectId();
    const activeCat1 = new mongoose.Types.ObjectId();
    const activeCat2 = new mongoose.Types.ObjectId();

    Product.distinct = async () => [activeCat1, activeCat2];
    Category.find = () => ({
      distinct: async () => [activeCat1, activeCat2]
    });

    let updatedSet = null;
    Vendor.findByIdAndUpdate = async (id, update) => {
      updatedSet = update;
      return { _id: id };
    };

    await syncVendorCategories(vendorId);
    assert.ok(updatedSet);
    assert.deepEqual(updatedSet.$set.categories, [activeCat1, activeCat2]);
  });

  await t.test('10. Staging Setup Script: Pinned host/DB validation and dry-run execution without DB writes', async () => {
    // Rejects production or wrong host
    assert.throws(() => {
      validateStagingUri('mongodb+srv://admin:pass@production-cluster.mongodb.net/production_db');
    }, /FAIL-CLOSED/);

    // Rejects wrong database
    assert.throws(() => {
      validateStagingUri(`mongodb+srv://admin:pass@${APPROVED_STAGING_HOST}/wrong_database`);
    }, /FAIL-CLOSED/);

    // Rejects non srv protocol
    assert.throws(() => {
      validateStagingUri(`mongodb://admin:pass@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}`);
    }, /FAIL-CLOSED/);

    // Valid staging URI
    const validUri = `mongodb+srv://testUser:secret@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}?retryWrites=true&w=majority`;
    assert.equal(validateStagingUri(validUri), validUri);

    // Dry-run mode executes cleanly and validates 8 categories and required unique indexes
    const dryRunResult = await runStagingCategorySetup({
      dryRun: true,
      uri: validUri
    });

    assert.equal(dryRunResult.success, true);
    assert.equal(dryRunResult.dryRun, true);
    assert.equal(dryRunResult.categoriesCount, 8);
    assert.equal(dryRunResult.indexesCount, 3);
    assert.equal(REQUIRED_UNIQUE_INDEXES[0].collection, 'categories');
    assert.deepEqual(REQUIRED_UNIQUE_INDEXES[0].keys, { slug: 1 });
    assert.equal(REQUIRED_UNIQUE_INDEXES[0].options.unique, true);
    assert.equal(REQUIRED_UNIQUE_INDEXES[1].collection, 'categories');
    assert.deepEqual(REQUIRED_UNIQUE_INDEXES[1].keys, { nameNormalized: 1 });
    assert.equal(REQUIRED_UNIQUE_INDEXES[1].options.unique, true);
    assert.equal(REQUIRED_UNIQUE_INDEXES[2].collection, 'categories');
    assert.deepEqual(REQUIRED_UNIQUE_INDEXES[2].keys, { type: 1, sortOrder: 1 });
  });
});
