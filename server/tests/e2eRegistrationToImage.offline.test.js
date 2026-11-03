import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Writable, Readable } from 'node:stream';
import Vendor from '../models/Vendor.js';
import Application from '../models/Application.js';
import { registerVendor, vendorLogin, getMe } from '../controllers/authController.js';
import { getAdminData, updateApplicationStatus } from '../controllers/adminController.js';
import { uploadProductImage, serveProductImage, uploadShopPhoto, serveShopPhoto } from '../controllers/uploadController.js';

// Setup mock response helper extending Writable stream so .pipe() works naturally
const makeMockRes = () => {
  const res = new Writable({
    write(chunk, encoding, callback) {
      res.chunks.push(chunk);
      callback();
    }
  });
  res.chunks = [];
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    res.body = data;
    return res;
  };
  res.setHeader = function (name, val) {
    res.headers[name] = val;
  };
  return res;
};

// Genuine PNG and JPEG test buffers with valid magic bytes
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60
]);

test('Full Lifecycle: Registration -> Admin Pending -> Approval -> Partner Login -> Shop & Product Images', async (t) => {
  const origVendorCreate = Vendor.create;
  const origVendorFindOne = Vendor.findOne;
  const origVendorFindById = Vendor.findById;
  const origVendorFind = Vendor.find;
  const origAppFind = Application.find;
  const origDb = mongoose.connection.db;
  const origDesc = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
  const origJwtSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'offline_jwt_secret_for_e2e_testing_123456';

  // In-memory vendor state simulating real document persistence
  const simulatedVendorId = new mongoose.Types.ObjectId('660000000000000000000099');
  let persistedVendorDoc = null;
  let vendorToken = null;

  t.after(() => {
    Vendor.create = origVendorCreate;
    Vendor.findOne = origVendorFindOne;
    Vendor.findById = origVendorFindById;
    Vendor.find = origVendorFind;
    Application.find = origAppFind;
    mongoose.connection.db = origDb;
    process.env.JWT_ACCESS_SECRET = origJwtSecret;
    if (origDesc) {
      Object.defineProperty(mongoose.mongo, 'GridFSBucket', origDesc);
    }
  });

  await t.test('1. Partner submits registration -> receives 201 with unapproved and closed state', async () => {
    Vendor.findOne = async () => null; // No duplicate phone
    Vendor.create = async (doc) => {
      persistedVendorDoc = {
        _id: simulatedVendorId,
        id: String(simulatedVendorId),
        ...doc,
        save: async function () {
          return this;
        }
      };
      return persistedVendorDoc;
    };

    const req = {
      body: {
        storeName: 'Fresh Organics Farm',
        ownerName: 'Harpreet Singh',
        phone: '9876543210',
        password: 'SecurePartnerPass!123',
        storeType: 'FARMER',
        address: {
          line1: 'Farm Road 4',
          city: 'Ludhiana',
          state: 'Punjab',
          pincode: '141001'
        },
        coordinates: [75.8573, 30.9010]
      }
    };
    const res = makeMockRes();

    await registerVendor(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.code, 'REGISTRATION_PENDING_APPROVAL');
    assert.equal(res.body.vendor.isApproved, false, 'New store must start unapproved');
    assert.equal(res.body.vendor.isActive, false, 'New store must start inactive');
    assert.equal(res.body.vendor.isOpen, false, 'Duty switch must start OFF');
  });

  await t.test('2. Unapproved partner attempts login -> blocked with 401 until admin approves', async () => {
    Vendor.findOne = () => ({
      select: () => ({
        populate: async () => ({
          ...persistedVendorDoc,
          passwordHash: persistedVendorDoc.passwordHash
        })
      })
    });

    const req = {
      body: {
        phone: '9876543210',
        password: 'SecurePartnerPass!123'
      }
    };
    const res = makeMockRes();

    await vendorLogin(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Valid merchant credentials are required.');
    assert.equal(res.body.token, undefined, 'No auth token should be issued to pending vendor');
  });

  await t.test('3. Admin checks partners module -> vendor appears in pending review queue with RECEIVED status', async () => {
    Application.find = () => ({
      sort: () => []
    });
    Vendor.find = () => ({
      sort: () => [persistedVendorDoc]
    });

    const req = {
      user: { adminRole: 'superadmin', access: ['partners'] },
      query: { module: 'partners' }
    };
    const res = makeMockRes();

    await getAdminData(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.applications));

    const targetRow = res.body.data.applications.find(a => String(a.id) === String(simulatedVendorId));
    assert.ok(targetRow, 'Registered partner must appear in Admin applications review list');
    assert.equal(targetRow.originType, 'VENDOR_ACCOUNT');
    assert.equal(targetRow.isLoginAccount, true);
    assert.equal(targetRow.status, 'RECEIVED', 'Unapproved partner must show status RECEIVED');
  });

  await t.test('4. Admin approves the partner store -> updates isApproved:true, isActive:true, preserves isOpen:false', async () => {
    Vendor.findById = (id) => {
      const match = String(id) === String(simulatedVendorId) ? persistedVendorDoc : null;
      return {
        ...match,
        populate: async () => match,
        then: (resolve) => resolve(match)
      };
    };

    const req = {
      user: { adminRole: 'superadmin', access: ['partners'] },
      body: {
        id: String(simulatedVendorId),
        type: 'vendor',
        status: 'APPROVED'
      }
    };
    const res = makeMockRes();

    await updateApplicationStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isLoginAccount, true);
    assert.equal(persistedVendorDoc.isApproved, true);
    assert.equal(persistedVendorDoc.isActive, true);
    assert.equal(persistedVendorDoc.isOpen, false, 'Duty switch must remain false upon approval');
  });

  await t.test('5. Approved partner logs in -> receives 200 with JWT token and verified vendor profile', async () => {
    Vendor.findOne = () => ({
      select: () => ({
        populate: async () => ({
          ...persistedVendorDoc,
          passwordHash: persistedVendorDoc.passwordHash
        })
      })
    });

    const req = {
      body: {
        phone: '9876543210',
        password: 'SecurePartnerPass!123'
      }
    };
    const res = makeMockRes();

    await vendorLogin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'Must return JWT token upon approved login');
    assert.equal(String(res.body.vendor._id), String(simulatedVendorId));
    assert.equal(res.body.vendor.isOpen, false);

    vendorToken = res.body.token;
  });

  await t.test('6. Partner reloads session (GET /api/auth/me) -> preserves authenticated vendor session', async () => {
    Vendor.findById = (id) => {
      const match = String(id) === String(simulatedVendorId) ? persistedVendorDoc : null;
      return {
        populate: async () => match,
        then: (resolve) => resolve(match)
      };
    };

    const decoded = jwt.decode(vendorToken);
    const req = {
      user: decoded
    };
    const res = makeMockRes();

    await getMe(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.role, 'VENDOR');
    assert.equal(String(res.body.vendor._id), String(simulatedVendorId));
    assert.equal(res.body.vendor.isApproved, true);
    assert.equal(res.body.vendor.isActive, true);
    assert.equal(res.body.vendor.isOpen, false);
  });

  // Setup mock GridFS for image storage tests
  const storedFiles = new Map();
  mongoose.connection.db = {};
  Object.defineProperty(mongoose.mongo, 'GridFSBucket', {
    value: class {
      constructor(db, options) {
        this.bucketName = options?.bucketName || 'fs';
      }
      find(query) {
        const fileId = query._id ? String(query._id) : null;
        const file = fileId ? storedFiles.get(fileId) : null;
        return {
          toArray: async () => (file ? [file] : [])
        };
      }
      delete(id) {
        storedFiles.delete(String(id));
        return Promise.resolve();
      }
      openUploadStream(filename, options) {
        const fileId = new mongoose.Types.ObjectId();
        const handlers = {};
        return {
          id: fileId,
          on(evt, fn) {
            handlers[evt] = fn;
            return this;
          },
          end(buf) {
            storedFiles.set(String(fileId), {
              _id: fileId,
              filename,
              length: buf ? buf.length : 0,
              contentType: options?.contentType || 'image/png',
              metadata: options?.metadata || {},
              buffer: buf
            });
            if (handlers.finish) handlers.finish();
          }
        };
      }
      openDownloadStream(id) {
        const file = storedFiles.get(String(id));
        return Readable.from(file?.buffer || Buffer.alloc(0));
      }
    },
    configurable: true
  });

  let createdProductFileId = null;

  await t.test('7. Partner uploads product image -> stored in GridFS, returns canonical URL and fileId', async () => {
    const req = {
      user: { vendorId: simulatedVendorId, role: 'VENDOR' },
      file: {
        buffer: VALID_PNG_BUFFER,
        originalname: 'organic_apples.png',
        mimetype: 'image/png'
      },
      protocol: 'https',
      get(header) {
        if (header === 'host') return 'farmart-backend.onrender.com';
        return null;
      }
    };
    const res = makeMockRes();

    await uploadProductImage(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.fileId);
    assert.equal(res.body.url, `https://farmart-backend.onrender.com/api/uploads/product-images/${res.body.fileId}`);
    assert.equal(res.body.path, `/api/uploads/product-images/${res.body.fileId}`);

    createdProductFileId = String(res.body.fileId);
  });

  await t.test('8. Public can fetch uploaded product image -> returns 200 and Cross-Origin-Resource-Policy header', async () => {
    const req = {
      params: { id: createdProductFileId },
      headers: {}
    };
    const res = makeMockRes();

    await serveProductImage(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.equal(res.headers['Content-Length'], VALID_PNG_BUFFER.length);
  });

  let createdShopFileId = null;

  await t.test('9. Partner uploads shop cover banner photo -> stored in GridFS and updates vendor.banner', async () => {
    Vendor.findById = (id) => {
      const match = String(id) === String(simulatedVendorId) ? persistedVendorDoc : null;
      return {
        ...match,
        populate: async () => match,
        then: (resolve) => resolve(match)
      };
    };

    const req = {
      user: { vendorId: simulatedVendorId, role: 'VENDOR' },
      file: {
        buffer: VALID_JPEG_BUFFER,
        originalname: 'store_front.jpg',
        mimetype: 'image/jpeg'
      },
      protocol: 'https',
      get(header) {
        if (header === 'host') return 'farmart-backend.onrender.com';
        return null;
      }
    };
    const res = makeMockRes();

    await uploadShopPhoto(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.fileId);
    assert.equal(res.body.url, `https://farmart-backend.onrender.com/api/uploads/shop-photos/${res.body.fileId}`);
    assert.equal(persistedVendorDoc.banner, `/api/uploads/shop-photos/${res.body.fileId}`, 'Vendor banner field must be updated with GridFS path');

    createdShopFileId = String(res.body.fileId);
  });

  await t.test('10. Public can fetch uploaded shop cover photo -> returns 200 with cross-origin headers', async () => {
    const req = {
      params: { id: createdShopFileId },
      headers: {}
    };
    const res = makeMockRes();

    await serveShopPhoto(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
    assert.equal(res.headers['Content-Type'], 'image/jpeg');
    assert.equal(res.headers['Content-Length'], VALID_JPEG_BUFFER.length);
  });
});
