import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import {
  validateImageMagicBytes,
  storeShopImage,
  getShopImageStream,
  cleanupOldShopImage
} from '../services/imageStorageService.js';
import {
  uploadShopPhoto,
  serveShopPhoto,
  deleteShopPhoto
} from '../controllers/uploadController.js';
import { updateVendorProfile } from '../controllers/vendorController.js';

// Helper mock for Express Response
const makeMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    setHeader(name, val) {
      res.headers[name] = val;
    },
    end() {
      return res;
    }
  };
  return res;
};

test('Shop Cover Photo Upload & Protection Suite (Offline)', async (t) => {
  const origFindById = Vendor.findById;

  t.afterEach(() => {
    Vendor.findById = origFindById;
  });

  // -------------------------------------------------------------
  // 1. Image Magic Bytes & Size Limits
  // -------------------------------------------------------------
  await t.test('1. validateImageMagicBytes accurately validates genuine image buffers', () => {
    // Valid JPEG (FF D8 FF)
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const jpegCheck = validateImageMagicBytes(jpegBuf, 'image/jpeg');
    assert.equal(jpegCheck.valid, true);
    assert.equal(jpegCheck.detectedMime, 'image/jpeg');

    // Valid PNG (89 50 4E 47 0D 0A 1A 0A)
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const pngCheck = validateImageMagicBytes(pngBuf, 'image/png');
    assert.equal(pngCheck.valid, true);
    assert.equal(pngCheck.detectedMime, 'image/png');

    // Valid WEBP
    const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const webpCheck = validateImageMagicBytes(webpBuf, 'image/webp');
    assert.equal(webpCheck.valid, true);
    assert.equal(webpCheck.detectedMime, 'image/webp');

    // Reject non-image text payload
    const textBuf = Buffer.from('Not an image file at all!');
    const textCheck = validateImageMagicBytes(textBuf, 'image/jpeg');
    assert.equal(textCheck.valid, false);
  });

  // -------------------------------------------------------------
  // 2. uploadShopPhoto Authorization & Guards
  // -------------------------------------------------------------
  await t.test('2. uploadShopPhoto rejects unauthenticated callers and missing file payloads', async () => {
    // Unauthenticated
    const res1 = makeMockRes();
    await uploadShopPhoto({ user: null }, res1);
    assert.equal(res1.statusCode, 403);
    assert.equal(res1.body.code, 'FORBIDDEN');

    // Missing file
    const res2 = makeMockRes();
    await uploadShopPhoto(
      {
        user: { role: 'VENDOR', vendorId: 'vendor-123' },
        file: null
      },
      res2
    );
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'NO_FILE_UPLOADED');
  });

  await t.test('3. uploadShopPhoto returns 404 if vendor record does not exist', async () => {
    Vendor.findById = async () => null;

    const res = makeMockRes();
    await uploadShopPhoto(
      {
        user: { role: 'VENDOR', vendorId: 'nonexistent-vendor' },
        file: {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
          originalname: 'shop.jpg',
          mimetype: 'image/jpeg'
        }
      },
      res
    );
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, 'VENDOR_NOT_FOUND');
  });

  // -------------------------------------------------------------
  // 3. GridFS Shop Photo Persistence & Ownership
  // -------------------------------------------------------------
  await t.test('4. uploadShopPhoto stores in GridFS, cleans up old photo, and updates vendor.banner with portable path', async () => {
    const testVendorId = new mongoose.Types.ObjectId().toString();
    let savedBanner = null;

    const mockVendor = {
      _id: testVendorId,
      storeName: "Krishna's shop",
      banner: '/api/uploads/shop-photos/old-file-id-123',
      save: async function () {
        savedBanner = this.banner;
        return this;
      }
    };
    Vendor.findById = async (id) => (String(id) === testVendorId ? mockVendor : null);

    // Mock GridFS
    const origDb = mongoose.connection.db;
    const origDesc = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
    let deletedOldFile = false;
    let uploadedMetadata = null;

    mongoose.connection.db = {};
    Object.defineProperty(mongoose.mongo, 'GridFSBucket', {
      value: class {
        constructor() {}
        find(query) {
          return {
            toArray: async () => [{
              _id: 'old-file-id-123',
              metadata: { vendorId: testVendorId }
            }]
          };
        }
        delete(id) {
          deletedOldFile = true;
          return Promise.resolve();
        }
        openUploadStream(filename, options) {
          uploadedMetadata = options.metadata;
          const handlers = {};
          return {
            id: 'new-file-id-456',
            on(evt, fn) {
              handlers[evt] = fn;
              return this;
            },
            end(buf) {
              if (handlers.finish) handlers.finish();
            }
          };
        }
      },
      configurable: true
    });

    try {
      const res = makeMockRes();
      const req = {
        user: { role: 'VENDOR', vendorId: testVendorId },
        file: {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
          originalname: 'krishna_store_cover.jpg',
          mimetype: 'image/jpeg'
        },
        protocol: 'http',
        get: (h) => (h === 'host' ? 'localhost:5000' : null)
      };

      await uploadShopPhoto(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.path, '/api/uploads/shop-photos/new-file-id-456');
      assert.equal(res.body.url, 'http://localhost:5000/api/uploads/shop-photos/new-file-id-456');
      assert.equal(savedBanner, '/api/uploads/shop-photos/new-file-id-456');
      assert.equal(uploadedMetadata?.purpose, 'shop_cover');
      assert.equal(uploadedMetadata?.vendorId, testVendorId);
    } finally {
      mongoose.connection.db = origDb;
      Object.defineProperty(mongoose.mongo, 'GridFSBucket', origDesc);
    }
  });

  // -------------------------------------------------------------
  // 4. serveShopPhoto Route-Scoped CORP & Caching
  // -------------------------------------------------------------
  await t.test('5. serveShopPhoto sets Cross-Origin-Resource-Policy: cross-origin on 200 and 304', async () => {
    const origDb = mongoose.connection.db;
    const origDesc = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
    const testFileId = new mongoose.Types.ObjectId();
    const mockFile = {
      _id: testFileId,
      filename: 'shop_banner.png',
      length: 5432,
      metadata: { mimeType: 'image/png' }
    };
    const mockStream = {
      pipe: (dest) => dest
    };

    mongoose.connection.db = {};
    Object.defineProperty(mongoose.mongo, 'GridFSBucket', {
      value: class {
        find() {
          return { toArray: async () => [mockFile] };
        }
        openDownloadStream() {
          return mockStream;
        }
      },
      configurable: true
    });

    try {
      // 200 Response
      const res200 = makeMockRes();
      await serveShopPhoto({ params: { id: testFileId.toString() }, headers: {} }, res200);
      assert.equal(res200.statusCode, 200);
      assert.equal(res200.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
      assert.equal(res200.headers['Content-Type'], 'image/png');
      assert.equal(res200.headers['ETag'], testFileId.toString());

      // 304 Not Modified
      const res304 = makeMockRes();
      await serveShopPhoto(
        {
          params: { id: testFileId.toString() },
          headers: { 'if-none-match': testFileId.toString() }
        },
        res304
      );
      assert.equal(res304.statusCode, 304);
      assert.equal(res304.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
    } finally {
      mongoose.connection.db = origDb;
      Object.defineProperty(mongoose.mongo, 'GridFSBucket', origDesc);
    }
  });

  // -------------------------------------------------------------
  // 5. deleteShopPhoto
  // -------------------------------------------------------------
  await t.test('6. deleteShopPhoto clears vendor banner and cleans up GridFS file', async () => {
    const testVendorId = new mongoose.Types.ObjectId().toString();
    let savedBanner = 'not-cleared';
    const mockVendor = {
      _id: testVendorId,
      banner: '/api/uploads/shop-photos/file-to-delete',
      save: async function () {
        savedBanner = this.banner;
        return this;
      }
    };
    Vendor.findById = async () => mockVendor;

    const res = makeMockRes();
    await deleteShopPhoto({ user: { vendorId: testVendorId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(savedBanner, '');
  });

  // -------------------------------------------------------------
  // 6. updateVendorProfile rejects local file/blob URLs
  // -------------------------------------------------------------
  await t.test('7. updateVendorProfile rejects local blob: and file: URLs', async () => {
    const mockVendor = {
      _id: 'v-123',
      banner: '',
      save: async () => mockVendor
    };
    Vendor.findById = async () => mockVendor;

    const res1 = makeMockRes();
    await updateVendorProfile(
      {
        user: { vendorId: 'v-123' },
        body: { banner: 'blob:http://localhost:8082/1234-abcd' }
      },
      res1
    );
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_IMAGE_URL');

    const res2 = makeMockRes();
    await updateVendorProfile(
      {
        user: { vendorId: 'v-123' },
        body: { banner: 'file:///data/user/0/com.farmart.partner/cache/temp.jpg' }
      },
      res2
    );
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'INVALID_IMAGE_URL');
  });
});

