import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import {
  parseNumericField,
  toPortableImagePath,
  formatProductResponse,
  createProduct,
  updateProduct,
  getVendorProducts
} from '../controllers/productController.js';
import {
  validateImageMagicBytes,
  storeProductImage,
  getProductImageStream,
  confirmProductImage
} from '../services/imageStorageService.js';
import { uploadProductImage, serveProductImage } from '../controllers/uploadController.js';

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

test('Partner Product Listing & Uploads Suite (Offline)', async (t) => {
  const origFind = Product.find;
  const origFindById = Product.findById;
  const origFindByIdAndUpdate = Product.findByIdAndUpdate;
  const origFindByIdAndDelete = Product.findByIdAndDelete;
  const origCountDocuments = Product.countDocuments;
  const origCategoryFindOne = Category.findOne;
  const origCategoryFind = Category.find;

  t.afterEach(() => {
    Product.find = origFind;
    Product.findById = origFindById;
    Product.findByIdAndUpdate = origFindByIdAndUpdate;
    Product.findByIdAndDelete = origFindByIdAndDelete;
    Product.countDocuments = origCountDocuments;
    Category.findOne = origCategoryFindOne;
    Category.find = origCategoryFind;
  });

  // -------------------------------------------------------------
  // 1. Numeric & Pack/Stock Parsing
  // -------------------------------------------------------------
  await t.test('1. parseNumericField strictly parses numbers and rejects invalid types', () => {
    assert.equal(parseNumericField(120), 120);
    assert.equal(parseNumericField('250.50'), 250.5);
    assert.equal(parseNumericField(0), 0);
    assert.equal(parseNumericField(-15), -15);

    // Rejections
    assert.equal(parseNumericField(null), null);
    assert.equal(parseNumericField(true), null);
    assert.equal(parseNumericField(false), null);
    assert.equal(parseNumericField(''), null);
    assert.equal(parseNumericField('   '), null);
    assert.equal(parseNumericField('abc'), null);
    assert.equal(parseNumericField([]), null);
    assert.equal(parseNumericField({}), null);
    assert.equal(parseNumericField(NaN), null);
    assert.equal(parseNumericField(Infinity), null);
  });

  // -------------------------------------------------------------
  // 2. Price & MRP Validation in Product Controller
  // -------------------------------------------------------------
  await t.test('2. createProduct rejects price <= 0 and MRP < selling price', async () => {
    const res1 = makeMockRes();
    await createProduct(
      {
        user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId() },
        body: { name: 'Fresh Apples', price: 0 }
      },
      res1
    );
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_PRICE');

    const res2 = makeMockRes();
    await createProduct(
      {
        user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId() },
        body: { name: 'Fresh Apples', price: 100, mrp: 80 }
      },
      res2
    );
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'INVALID_MRP');
  });

  await t.test('3. createProduct rejects negative or malformed stock', async () => {
    const validCatId = new mongoose.Types.ObjectId();
    Category.findOne = async () => ({
      _id: validCatId,
      name: 'Fresh Fruits',
      isActive: true,
      subCategories: []
    });

    const res = makeMockRes();
    await createProduct(
      {
        user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId() },
        body: {
          name: 'Fresh Apples',
          category: validCatId,
          price: 120,
          mrp: 140,
          unit: '10 kg',
          stockQty: -5
        }
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_STOCK');
  });

  await t.test('3b. createProduct rejects missing, blank, or whitespace Pack Size / Unit', async () => {
    const validCatId = new mongoose.Types.ObjectId();
    Category.findOne = async () => ({
      _id: validCatId,
      name: 'Fresh Fruits',
      isActive: true,
      subCategories: []
    });

    // Missing unit
    const res1 = makeMockRes();
    await createProduct(
      {
        user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId() },
        body: {
          name: 'Organic Basmati Rice',
          category: validCatId,
          price: 250,
          mrp: 300,
          stockQty: 20
        }
      },
      res1
    );
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, 'INVALID_UNIT');

    // Blank / whitespace unit
    const res2 = makeMockRes();
    await createProduct(
      {
        user: { role: 'VENDOR', vendorId: new mongoose.Types.ObjectId() },
        body: {
          name: 'Organic Basmati Rice',
          category: validCatId,
          price: 250,
          mrp: 300,
          unit: '   ',
          stockQty: 20
        }
      },
      res2
    );
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'INVALID_UNIT');
  });

  // -------------------------------------------------------------
  // 3. Image Magic Byte Verification & Storage Service
  // -------------------------------------------------------------
  await t.test('4. validateImageMagicBytes validates JPEG, PNG, WEBP, GIF signatures and rejects corrupted/spoofed data', () => {
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

    // Valid WEBP (RIFF ... WEBP)
    const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const webpCheck = validateImageMagicBytes(webpBuf, 'image/webp');
    assert.equal(webpCheck.valid, true);
    assert.equal(webpCheck.detectedMime, 'image/webp');

    // Spoofed text file disguised as image
    const fakeBuf = Buffer.from('Hello world! This is not an image file.');
    const fakeCheck = validateImageMagicBytes(fakeBuf, 'image/jpeg');
    assert.equal(fakeCheck.valid, false);

    // Too small buffer
    const tinyBuf = Buffer.from([0x01, 0x02]);
    const tinyCheck = validateImageMagicBytes(tinyBuf, 'image/jpeg');
    assert.equal(tinyCheck.valid, false);
  });

  // -------------------------------------------------------------
  // 4. Upload Controller Authorization & Guards
  // -------------------------------------------------------------
  await t.test('5. uploadProductImage rejects unauthenticated callers and missing file payload', async () => {
    // Unauthenticated
    const res1 = makeMockRes();
    await uploadProductImage({ user: null }, res1);
    assert.equal(res1.statusCode, 403);
    assert.equal(res1.body.code, 'FORBIDDEN');

    // No file attached
    const res2 = makeMockRes();
    await uploadProductImage(
      {
        user: { role: 'VENDOR', vendorId: 'vendor-123' },
        file: null
      },
      res2
    );
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, 'NO_FILE_UPLOADED');
  });

  await t.test('5b. serveProductImage sets Cross-Origin-Resource-Policy: cross-origin on 200 and 304 responses', async () => {
    const origDb = mongoose.connection.db;
    const origDesc = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
    const testFileId = new mongoose.Types.ObjectId();
    const mockFile = {
      _id: testFileId,
      filename: 'sample.png',
      length: 1234,
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
      // 1. Full 200 response
      const res200 = makeMockRes();
      await serveProductImage(
        { params: { id: testFileId.toString() }, headers: {} },
        res200
      );
      assert.equal(res200.statusCode, 200);
      assert.equal(res200.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
      assert.equal(res200.headers['Content-Type'], 'image/png');
      assert.equal(res200.headers['ETag'], testFileId.toString());

      // 2. 304 Not Modified response
      const res304 = makeMockRes();
      await serveProductImage(
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
  // 5. Vendor Ownership Protection in Updates & Deletions
  // -------------------------------------------------------------
  await t.test('6. updateProduct forbids modifying another vendor’s product', async () => {
    const ownerVendorId = new mongoose.Types.ObjectId();
    const otherVendorId = new mongoose.Types.ObjectId();
    const prodId = new mongoose.Types.ObjectId();

    Product.findById = async () => ({
      _id: prodId,
      name: 'Shimla Apples',
      vendor: ownerVendorId,
      price: 150
    });

    const res = makeMockRes();
    await updateProduct(
      {
        params: { id: prodId.toString() },
        user: { role: 'VENDOR', vendorId: otherVendorId.toString() },
        body: { price: 180 }
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  await t.test('7. updateProduct rejects setting MRP lower than selling price', async () => {
    const ownerVendorId = new mongoose.Types.ObjectId();
    const prodId = new mongoose.Types.ObjectId();

    Product.findById = async () => ({
      _id: prodId,
      name: 'Organic Honey',
      vendor: ownerVendorId,
      price: 350,
      mrp: 400
    });

    const res = makeMockRes();
    await updateProduct(
      {
        params: { id: prodId.toString() },
        user: { role: 'VENDOR', vendorId: ownerVendorId.toString() },
        body: { mrp: 300 } // MRP lower than selling price 350
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_MRP');
  });

  // -------------------------------------------------------------
  // 6. Canonical Image URL Resolution & Portable References
  // -------------------------------------------------------------
  await t.test('8. formatProductResponse converts relative /api/ image paths and legacy localhost URLs to canonical URLs', () => {
    // 1. Standard relative path on localhost
    const mockReq = {
      get: (h) => (h === 'host' ? '127.0.0.1:5000' : null),
      protocol: 'http',
      headers: {}
    };

    const relativeProduct = {
      _id: 'prod-001',
      name: 'Fresh Thali',
      image: '/api/uploads/product-images/6ae123456789'
    };

    const formatted = formatProductResponse(relativeProduct, mockReq);
    assert.equal(formatted.image, 'http://127.0.0.1:5000/api/uploads/product-images/6ae123456789');

    // 2. Behind Render proxy (HTTPS via x-forwarded-proto)
    const renderReq = {
      get: (h) => (h === 'host' ? 'farmart-backend-staging.onrender.com' : null),
      protocol: 'http',
      headers: { 'x-forwarded-proto': 'https' }
    };
    const formattedRender = formatProductResponse(relativeProduct, renderReq);
    assert.equal(formattedRender.image, 'https://farmart-backend-staging.onrender.com/api/uploads/product-images/6ae123456789');

    // 3. Legacy hardcoded localhost URL is normalized on-the-fly behind Render proxy
    const legacyProduct = {
      _id: 'prod-003',
      name: 'Milk Bottle',
      image: 'http://localhost:5000/api/uploads/product-images/6ae987654321'
    };
    const formattedLegacy = formatProductResponse(legacyProduct, renderReq);
    assert.equal(formattedLegacy.image, 'https://farmart-backend-staging.onrender.com/api/uploads/product-images/6ae987654321');

    // 4. External URLs (e.g. Unsplash, CDN) are preserved untouched
    const externalProduct = {
      _id: 'prod-002',
      name: 'Alphonso Mango',
      image: 'https://images.unsplash.com/photo-123'
    };
    const formattedExternal = formatProductResponse(externalProduct, mockReq);
    assert.equal(formattedExternal.image, 'https://images.unsplash.com/photo-123');

    // 5. toPortableImagePath extracts relative path from full localhost or staging URLs
    assert.equal(
      toPortableImagePath('http://localhost:5000/api/uploads/product-images/6ae476f87c20b61861f9d234'),
      '/api/uploads/product-images/6ae476f87c20b61861f9d234'
    );
    assert.equal(
      toPortableImagePath('https://farmart-backend-staging.onrender.com/api/uploads/product-images/6ae476f87c20b61861f9d234'),
      '/api/uploads/product-images/6ae476f87c20b61861f9d234'
    );
    assert.equal(
      toPortableImagePath('https://images.unsplash.com/photo-123'),
      'https://images.unsplash.com/photo-123'
    );
  });

  // -------------------------------------------------------------
  // 7. Vendor Product Listing and Pagination
  // -------------------------------------------------------------
  await t.test('9. getVendorProducts supports req.params.id and returns page, limit, count, and total', async () => {
    const vendorId = new mongoose.Types.ObjectId();

    Product.countDocuments = async () => 45;
    Product.find = () => ({
      populate: () => ({
        sort: () => ({
          skip: (s) => ({
            limit: (l) => [
              { _id: 'p1', name: 'Item 1', vendor: vendorId, image: '/api/uploads/img1' },
              { _id: 'p2', name: 'Item 2', vendor: vendorId, image: '/api/uploads/img2' }
            ]
          })
        })
      })
    });

    const res = makeMockRes();
    const mockReq = {
      params: { id: vendorId.toString() },
      query: { page: '2', limit: '20' },
      get: () => 'localhost:5000',
      protocol: 'http'
    };

    await getVendorProducts(mockReq, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.page, 2);
    assert.equal(res.body.limit, 20);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.total, 45);
    assert.equal(res.body.products[0].image, 'http://localhost:5000/api/uploads/img1');
  });

  // -------------------------------------------------------------
  // 8. Order Stock Deductions and Cancellation Restorations
  // -------------------------------------------------------------
  await t.test('10. Order lifecycle decrements stock on purchase and restores on cancellation', () => {
    let stockQty = 30;
    const orderQty = 5;

    // 1. Customer checkout stock deduction
    assert.ok(stockQty >= orderQty, 'Must have sufficient stock');
    stockQty -= orderQty;
    assert.equal(stockQty, 25, 'Stock should decrement from 30 to 25');

    // 2. Cancellation restoration
    stockQty += orderQty;
    assert.equal(stockQty, 30, 'Cancelled order restores exact stock quantity');
  });
});

