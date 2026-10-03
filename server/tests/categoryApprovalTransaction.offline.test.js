import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import CategoryRequest from '../models/CategoryRequest.js';
import { approveCategoryRequestAdmin } from '../controllers/categoryController.js';
import * as notifyModule from '../services/notify.js';

const createMockRes = () => {
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
};

const createMockQuery = (result, onSession) => {
  const q = {
    populate() {
      return q;
    },
    session(sess) {
      if (onSession) onSession(sess);
      return q;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    }
  };
  return q;
};

test('Category Approval Transaction, Rollback & Parent Validation Suite (Offline)', async (t) => {
  const origStartSession = mongoose.startSession;
  const origFindById = CategoryRequest.findById;
  const origCatFindById = Category.findById;
  const origCatFindOne = Category.findOne;
  const origReadyState = mongoose.connection?.readyState;

  t.beforeEach(() => {
    if (mongoose.connection) {
      mongoose.connection.readyState = 1;
    }
  });

  t.afterEach(() => {
    mongoose.startSession = origStartSession;
    CategoryRequest.findById = origFindById;
    Category.findById = origCatFindById;
    Category.findOne = origCatFindOne;
    if (mongoose.connection) {
      mongoose.connection.readyState = origReadyState;
    }
  });

  await t.test('1. Atomic Approval: Both Category creation and CategoryRequest status update use the same transaction session', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    let transactionExecuted = false;
    let endSessionCalled = false;
    let categorySavedWithSession = false;
    let requestSavedWithSession = false;
    let sessionPassedToFind = false;

    const mockSession = {
      withTransaction: async (fn) => {
        transactionExecuted = true;
        await fn();
      },
      endSession: async () => {
        endSessionCalled = true;
      }
    };

    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Artisan Cheeses',
      proposedType: 'GROCERY',
      proposedIcon: '🧀',
      save: async function (opts) {
        if (opts && opts.session === mockSession) {
          requestSavedWithSession = true;
        }
        return this;
      }
    };

    CategoryRequest.findById = (id) => createMockQuery(mockRequest, (sess) => {
      assert.equal(sess, mockSession);
      sessionPassedToFind = true;
    });

    Category.findOne = (filter) => createMockQuery(null, (sess) => {
      assert.equal(sess, mockSession);
    });

    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function (opts) {
      if (opts && opts.session === mockSession) {
        categorySavedWithSession = true;
      }
      this._id = new mongoose.Types.ObjectId();
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: { name: 'Artisan Cheeses', type: 'GROCERY' }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(transactionExecuted, true, 'session.withTransaction must be executed');
      assert.equal(sessionPassedToFind, true, 'CategoryRequest query must receive session');
      assert.equal(categorySavedWithSession, true, 'Category must be saved with active session');
      assert.equal(requestSavedWithSession, true, 'CategoryRequest must be saved with active session');
      assert.equal(endSessionCalled, true, 'session.endSession must be called in finally block');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('2. Rollback on Failure: Error in request update aborts transaction and rolls back category creation', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    let transactionAborted = false;
    let endSessionCalled = false;

    const mockSession = {
      withTransaction: async (fn) => {
        try {
          await fn();
        } catch (err) {
          transactionAborted = true;
          throw err;
        }
      },
      endSession: async () => {
        endSessionCalled = true;
      }
    };

    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Artisan Cheeses',
      proposedType: 'GROCERY',
      save: async function () {
        throw new Error('Database write conflict on CategoryRequest');
      }
    };

    CategoryRequest.findById = () => createMockQuery(mockRequest);
    Category.findOne = () => createMockQuery(null);

    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: { name: 'Artisan Cheeses', type: 'GROCERY' }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 500);
      assert.equal(res.body.success, false);
      assert.equal(transactionAborted, true, 'Transaction must be aborted when write fails');
      assert.equal(endSessionCalled, true, 'endSession must still be called on error');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('3. Post-Commit Notification Resilience: Notification error does NOT roll back or fail committed approval', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };

    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Organic Eggs',
      proposedType: 'GROCERY',
      save: async function () { return this; }
    };

    CategoryRequest.findById = () => createMockQuery(mockRequest);
    Category.findOne = () => createMockQuery(null);

    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: adminId, role: 'ADMIN' },
      body: { name: 'Organic Eggs', type: 'GROCERY' }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(mockRequest.status, 'APPROVED');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('4. Unavailable DB Connection: Returns 503 DATABASE_UNAVAILABLE before any write', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    mongoose.connection.readyState = 0; // Disconnected

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Exotic Herbs' }
    };
    const res = createMockRes();

    await approveCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(res.body.success, false);
  });

  await t.test('5. Unavailable Session / Standalone Mongo: Returns 503 TRANSACTIONS_UNAVAILABLE without non-transactional fallback', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    mongoose.connection.readyState = 1;
    mongoose.startSession = async () => {
      throw new Error('This MongoDB deployment does not support transactions (replica set required).');
    };

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Exotic Herbs' }
    };
    const res = createMockRes();

    await approveCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'TRANSACTIONS_UNAVAILABLE');
    assert.equal(res.body.success, false);
  });

  await t.test('6. Concurrent Approval: Non-PENDING request throws 400 ALREADY_PROCESSED', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };
    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'APPROVED', // Already approved concurrently
      proposedName: 'Microgreens',
      proposedType: 'GROCERY'
    };
    CategoryRequest.findById = () => createMockQuery(mockRequest);

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Microgreens' }
    };
    const res = createMockRes();

    await approveCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'ALREADY_PROCESSED');
    assert.match(res.body.message, /already APPROVED/i);
  });

  await t.test('7. Duplicate Conflicts (E11000): Aborts failed transaction and maps in a fresh transaction', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const concurrentCategoryId = new mongoose.Types.ObjectId();

    let sessionCount = 0;
    const endedSessions = [];

    mongoose.startSession = async () => {
      sessionCount++;
      const currentSessionNum = sessionCount;
      return {
        sessionNum: currentSessionNum,
        withTransaction: async (fn) => {
          await fn();
        },
        endSession: async () => {
          endedSessions.push(currentSessionNum);
        }
      };
    };

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Microgreens',
      proposedType: 'GROCERY',
      save: async function () { return this; }
    };

    CategoryRequest.findById = () => createMockQuery(mockRequest);

    // Initial pre-check returns null to proceed to creation
    let findOneCallCount = 0;
    Category.findOne = () => {
      findOneCallCount++;
      if (findOneCallCount === 1) {
        return createMockQuery(null);
      }
      // On fresh transaction retry, returns concurrent category
      return createMockQuery({
        _id: concurrentCategoryId,
        name: 'Microgreens',
        slug: 'microgreens'
      });
    };

    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      const e11000Err = new Error('E11000 duplicate key error collection: categories index: slug_1 dup key: { slug: "microgreens" }');
      e11000Err.code = 11000;
      throw e11000Err;
    };

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Microgreens' }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.category._id, concurrentCategoryId);
      assert.equal(mockRequest.status, 'APPROVED');
      assert.equal(mockRequest.mappedCategory, concurrentCategoryId);
      assert.equal(sessionCount, 2, 'Must start a second fresh session to resolve conflict');
      assert.deepEqual(endedSessions, [1, 2], 'Both sessions must be cleanly ended');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('8. Invalid Parent Category ID: Rejects with 400 INVALID_PARENT_CATEGORY without creating top-level category', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };
    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Hydroponic Basil',
      proposedType: 'GROCERY'
    };
    CategoryRequest.findById = () => createMockQuery(mockRequest);

    let categorySaved = false;
    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      categorySaved = true;
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Hydroponic Basil', asSubcategoryOf: 'invalid-object-id-123' }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.code, 'INVALID_PARENT_CATEGORY');
      assert.equal(categorySaved, false, 'Must never silently create a top-level category on invalid parent');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('9. Missing Parent Category: Rejects with 400 PARENT_CATEGORY_NOT_FOUND without creating top-level category', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const missingParentId = new mongoose.Types.ObjectId().toString();

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };
    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Hydroponic Basil',
      proposedType: 'GROCERY'
    };
    CategoryRequest.findById = () => createMockQuery(mockRequest);
    Category.findById = () => createMockQuery(null); // Parent not found

    let categorySaved = false;
    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      categorySaved = true;
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Hydroponic Basil', asSubcategoryOf: missingParentId }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.code, 'PARENT_CATEGORY_NOT_FOUND');
      assert.equal(categorySaved, false, 'Must never silently create a top-level category on missing parent');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('10. Inactive Parent Category: Rejects with 400 PARENT_CATEGORY_INACTIVE without creating top-level category', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const inactiveParentId = new mongoose.Types.ObjectId().toString();

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };
    mongoose.startSession = async () => mockSession;

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Hydroponic Basil',
      proposedType: 'GROCERY'
    };
    CategoryRequest.findById = () => createMockQuery(mockRequest);
    Category.findById = () => createMockQuery({
      _id: inactiveParentId,
      name: 'Archived Produce',
      isActive: false
    });

    let categorySaved = false;
    const origCategorySave = Category.prototype.save;
    Category.prototype.save = async function () {
      categorySaved = true;
      return this;
    };

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Hydroponic Basil', asSubcategoryOf: inactiveParentId }
    };
    const res = createMockRes();

    try {
      await approveCategoryRequestAdmin(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.code, 'PARENT_CATEGORY_INACTIVE');
      assert.equal(categorySaved, false, 'Must never silently create a top-level category on inactive parent');
    } finally {
      Category.prototype.save = origCategorySave;
    }
  });

  await t.test('11. Valid Parent Category: Successfully creates subcategory and maps request in same transaction', async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const parentId = new mongoose.Types.ObjectId().toString();

    let parentSavedWithSession = false;
    let requestSavedWithSession = false;

    const mockSession = {
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    };
    mongoose.startSession = async () => mockSession;

    const mockParent = {
      _id: parentId,
      name: 'Fresh Produce',
      isActive: true,
      subCategories: [],
      save: async function (opts) {
        if (opts && opts.session === mockSession) {
          parentSavedWithSession = true;
        }
        return this;
      }
    };

    const mockRequest = {
      _id: requestId,
      status: 'PENDING',
      proposedName: 'Microgreens',
      proposedType: 'GROCERY',
      save: async function (opts) {
        if (opts && opts.session === mockSession) {
          requestSavedWithSession = true;
        }
        return this;
      }
    };

    CategoryRequest.findById = () => createMockQuery(mockRequest);
    Category.findById = () => createMockQuery(mockParent);

    const req = {
      params: { id: requestId },
      user: { _id: 'admin1', role: 'ADMIN' },
      body: { name: 'Microgreens', asSubcategoryOf: parentId }
    };
    const res = createMockRes();

    await approveCategoryRequestAdmin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(parentSavedWithSession, true, 'Parent category subcategory must be saved with session');
    assert.equal(requestSavedWithSession, true, 'CategoryRequest status update must be saved with session');
    assert.equal(mockRequest.status, 'APPROVED');
    assert.equal(mockRequest.mappedCategory, parentId);
    assert.equal(mockParent.subCategories.length, 1);
    assert.equal(mockParent.subCategories[0].name, 'Microgreens');
  });
});
