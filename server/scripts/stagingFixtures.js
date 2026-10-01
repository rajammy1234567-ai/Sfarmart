import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import Rider from '../models/Rider.js';
import User from '../models/User.js';

/**
 * Narrowly scoped, pinned staging fixture provisioning & cleanup script.
 *
 * Strict Guarantees:
 * 1. Host pinned strictly to farmart-staging.gxn3bfw.mongodb.net
 * 2. Database pinned strictly to farmart_test_disposable
 * 3. Protocol pinned to mongodb+srv:
 * 4. autoIndex: false, autoCreate: false (zero DDL operations)
 * 5. Explicit coordinates required (--lat=<num> --lng=<num> or TEST_BASE_LAT / TEST_BASE_LNG). Zero accepted; NaN/out-of-range rejected.
 * 6. Validates all documents against Mongoose models and password-login comparison behavior (.validate()).
 * 7. Safe --dry-run mode validates schemas and coordinates without DB connection or manifest writes.
 * 8. Preflight checks for existing phones and previous manifests before writing.
 * 9. Preallocates document IDs and persists a run manifest BEFORE insertions, tracking partial progress.
 * 10. Cleanup reconciles manifest preallocatedIds and insertedIds, deleting strictly by exact _id + fixtureRunId + isStagingFixture tag.
 * 11. Cleans app-created orders and carts linked to the fixture customer/vendor before deleting accounts.
 * 12. All error logging is sanitized to prevent credential/URI leakage.
 */

export const APPROVED_STAGING_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
export const APPROVED_DATABASE = 'farmart_test_disposable';
export const DEFAULT_MANIFEST_PATH = path.resolve(process.cwd(), 'server', 'scripts', 'staging-fixture-manifest.json');

export const FIXTURE_PHONES = Object.freeze({
  vendor: '9876543211',
  rider: '9876543220',
  customer: '9876543210'
});

export function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return '';
  return msg.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://[REDACTED_CREDENTIALS]@');
}

export function validateStagingUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('FAIL-CLOSED: STAGING_SETUP_MONGO_URI or MONGODB_URI is required.');
  }

  let parsed;
  try {
    parsed = new URL(rawUri);
  } catch {
    throw new Error('FAIL-CLOSED: Target URI cannot be parsed as a valid URL.');
  }

  if (parsed.protocol !== 'mongodb+srv:') {
    throw new Error(`FAIL-CLOSED: Target protocol must be "mongodb+srv:", got "${parsed.protocol}".`);
  }

  if (parsed.hostname.toLowerCase() !== APPROVED_STAGING_HOST) {
    throw new Error(`FAIL-CLOSED: Target host "${parsed.hostname}" does not match approved staging host "${APPROVED_STAGING_HOST}".`);
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (targetDb !== APPROVED_DATABASE) {
    throw new Error(`FAIL-CLOSED: Target database "${targetDb}" does not match approved staging database "${APPROVED_DATABASE}".`);
  }

  return rawUri;
}

export function validateCoordinates(lat, lng) {
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`FAIL-CLOSED: Invalid latitude: "${lat}". Latitude must be a finite number between -90 and 90.`);
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(`FAIL-CLOSED: Invalid longitude: "${lng}". Longitude must be a finite number between -180 and 180.`);
  }
  return { lat, lng };
}

export async function preflightChecks(db, manifestPath) {
  if (fs.existsSync(manifestPath)) {
    throw new Error(`FAIL-CLOSED: Existing manifest detected at "${manifestPath}". Run cleanup before creating new fixtures to prevent orphaned records.`);
  }

  const existingCustomer = await db.collection('users').findOne({ phone: FIXTURE_PHONES.customer });
  if (existingCustomer) {
    throw new Error(`FAIL-CLOSED: Preflight conflict. Customer account with phone "${FIXTURE_PHONES.customer}" already exists in users collection.`);
  }

  const existingVendor = await db.collection('vendors').findOne({ phone: FIXTURE_PHONES.vendor });
  if (existingVendor) {
    throw new Error(`FAIL-CLOSED: Preflight conflict. Vendor account with phone "${FIXTURE_PHONES.vendor}" already exists in vendors collection.`);
  }

  const existingRider = await db.collection('riders').findOne({ phone: FIXTURE_PHONES.rider });
  if (existingRider) {
    throw new Error(`FAIL-CLOSED: Preflight conflict. Rider account with phone "${FIXTURE_PHONES.rider}" already exists in riders collection.`);
  }
}

export async function createStagingFixtures(rawUri, options = {}) {
  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const { lat: baseLat, lng: baseLng } = validateCoordinates(options.lat, options.lng);

  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const fixtureRunId = options.runId || `sfix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  console.log(`[STAGING FIXTURES] Validating environment for Run "${fixtureRunId}" (dryRun=${dryRun})`);
  console.log(`[STAGING FIXTURES] Geo-Anchor: Lat ${baseLat.toFixed(5)}, Lng ${baseLng.toFixed(5)}`);

  // Preallocate all document IDs upfront
  const categoryId = new mongoose.Types.ObjectId();
  const vendorId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const riderId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const customerAddressId = new mongoose.Types.ObjectId();

  const commonHash = await bcrypt.hash('demo123', 10);

  // 1. Construct and validate Mongoose models BEFORE any database insert
  const categoryModel = new Category({
    _id: categoryId,
    name: `Staging Fresh Produce (${fixtureRunId})`,
    slug: `staging-produce-${fixtureRunId}`,
    type: 'GROCERY',
    icon: '🥦',
    image: '',
    subCategories: [],
    sortOrder: 0,
    isActive: true,
    isStagingFixture: true,
    fixtureRunId
  });
  await categoryModel.validate();

  const vendorModel = new Vendor({
    _id: vendorId,
    storeName: 'Sunita Home Restro & Sweets',
    ownerName: 'Sunita Sharma',
    phone: FIXTURE_PHONES.vendor,
    passwordHash: commonHash,
    storeType: 'HOME_CHEF',
    categories: [categoryId],
    description: 'Staging verification test kitchen',
    logo: '',
    banner: '',
    address: {
      line1: 'Staging Merchant Test Kitchen',
      city: 'Test City',
      state: 'Test State',
      pincode: '110001',
      location: {
        type: 'Point',
        coordinates: [baseLng, baseLat]
      }
    },
    isOpen: true,
    isApproved: true,
    isActive: true,
    avgPrepTimeMins: 15,
    deliveryRadiusKm: 10,
    minOrderValue: 49,
    rating: 4.8,
    totalOrders: 0,
    expoPushTokens: [],
    bank: {
      accountLast4: '4321',
      ifsc: 'SBIN0001234',
      payoutDay: 'WEDNESDAY'
    },
    isStagingFixture: true,
    fixtureRunId
  });
  await vendorModel.validate();

  const productModel = new Product({
    _id: productId,
    name: 'Special Punjabi Thali (Staging Test)',
    description: 'Staging verification test meal',
    image: '',
    vendor: vendorId,
    category: categoryId,
    subCategory: '',
    price: 180,
    mrp: 200,
    unit: '1 thali',
    stockQty: 50,
    inStock: true,
    isVeg: true,
    tags: ['thali', 'staging', 'test'],
    isActive: true,
    isStagingFixture: true,
    fixtureRunId
  });
  await productModel.validate();

  const riderLat = baseLat - 0.0018;
  const riderLng = baseLng - 0.0018;
  const riderModel = new Rider({
    _id: riderId,
    name: 'Gurmukh Singh',
    phone: FIXTURE_PHONES.rider,
    passwordHash: commonHash,
    vehicleType: 'bike',
    vehicleNumber: 'PB-10-AB-1234',
    status: 'OFFLINE',
    currentLocation: {
      type: 'Point',
      coordinates: [riderLng, riderLat]
    },
    locationUpdatedAt: new Date(),
    locationAccuracy: 10,
    activeOrderId: null,
    rating: 4.9,
    completedDeliveries: 0,
    kyc: {
      aadhaarVerified: true,
      drivingLicenseVerified: true,
      photoUrl: ''
    },
    bankDetails: {
      accountNumberHash: '**** **** 8821',
      ifsc: 'SBIN0001234'
    },
    todayEarningsPaise: 0,
    totalEarningsPaise: 0,
    deviceId: '',
    refreshTokenHash: '',
    isStagingFixture: true,
    fixtureRunId
  });
  await riderModel.validate();

  const custLat = baseLat + 0.003;
  const custLng = baseLng + 0.003;
  const userModel = new User({
    _id: customerId,
    name: 'Rajesh Kumar',
    phone: FIXTURE_PHONES.customer,
    passwordHash: commonHash,
    role: 'CUSTOMER',
    status: 'ACTIVE',
    isPhoneVerified: true,
    walletBalance: 25000,
    defaultAddressId: customerAddressId,
    addresses: [
      {
        _id: customerAddressId,
        label: 'Home',
        name: 'Rajesh Kumar',
        phone: FIXTURE_PHONES.customer,
        line1: 'Flat 302, Staging Test Residency',
        city: 'Test City',
        state: 'Test State',
        pincode: '110001',
        isDefault: true
      }
    ],
    isStagingFixture: true,
    fixtureRunId
  });
  await userModel.validate();

  // Verify password comparison matching customer, vendor and rider login logic
  const isCustomerPasswordValid = await bcrypt.compare('demo123', userModel.passwordHash);
  const isVendorPasswordValid = await bcrypt.compare('demo123', vendorModel.passwordHash);
  const isRiderPasswordValid = await bcrypt.compare('demo123', riderModel.passwordHash);
  if (!isCustomerPasswordValid || !isVendorPasswordValid || !isRiderPasswordValid) {
    throw new Error('FAIL-CLOSED: Password hash verification failed for staging credentials.');
  }

  // 2. Safe Dry-Run handling: Skip DB connection and manifest writes
  if (dryRun) {
    console.log(`[STAGING FIXTURES] [DRY-RUN] Schema validation succeeded for Category, Vendor, Product, Rider, User.`);
    console.log(`[STAGING FIXTURES] [DRY-RUN] Verified password hashing & comparison for customer, vendor and rider.`);
    console.log(`[STAGING FIXTURES] [DRY-RUN] Geo-Anchor coordinates validated: Lat ${baseLat.toFixed(5)}, Lng ${baseLng.toFixed(5)}.`);
    return {
      dryRun: true,
      fixtureRunId,
      manifestPath,
      baseCoordinates: { lat: baseLat, lng: baseLng },
      preallocatedIds: {
        categories: [categoryId.toString()],
        vendors: [vendorId.toString()],
        products: [productId.toString()],
        riders: [riderId.toString()],
        users: [customerId.toString()]
      },
      modelsValidated: ['Category', 'Vendor', 'Product', 'Rider', 'User']
    };
  }

  // 3. Live DB connection (only when NOT in dry-run mode)
  const uri = validateStagingUri(rawUri);

  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
      dbName: APPROVED_DATABASE
    });
  } catch (err) {
    throw new Error(`FAIL-CLOSED [CONNECT]: ${sanitizeErrorMessage(err.message)}`);
  }

  const db = mongoose.connection.db;

  try {
    // Preflight account and manifest checks
    await preflightChecks(db, manifestPath);

    // Persist manifest with status IN_PROGRESS before performing any insert
    const manifest = {
      fixtureRunId,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      baseCoordinates: { lat: baseLat, lng: baseLng },
      preallocatedIds: {
        categories: [categoryId.toString()],
        vendors: [vendorId.toString()],
        products: [productId.toString()],
        riders: [riderId.toString()],
        users: [customerId.toString()]
      },
      insertedIds: {
        categories: [],
        vendors: [],
        products: [],
        riders: [],
        users: []
      }
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Helper: Insert and track in manifest
    const recordInsert = async (col, doc, idStr) => {
      try {
        await db.collection(col).insertOne(doc);
        manifest.insertedIds[col].push(idStr);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      } catch (insertErr) {
        manifest.status = 'PARTIAL_FAILURE';
        manifest.failureReason = sanitizeErrorMessage(insertErr.message);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        throw new Error(`FAIL-CLOSED [INSERT:${col}]: ${sanitizeErrorMessage(insertErr.message)}`);
      }
    };

    // Extract validated plain documents for insertion
    const categoryDoc = categoryModel.toObject();
    const vendorDoc = vendorModel.toObject();
    vendorDoc.passwordHash = commonHash;
    const productDoc = productModel.toObject();
    const riderDoc = riderModel.toObject();
    riderDoc.passwordHash = commonHash;
    const customerDoc = userModel.toObject();
    customerDoc.passwordHash = commonHash;

    await recordInsert('categories', categoryDoc, categoryId.toString());
    await recordInsert('vendors', vendorDoc, vendorId.toString());
    await recordInsert('products', productDoc, productId.toString());
    await recordInsert('riders', riderDoc, riderId.toString());
    await recordInsert('users', customerDoc, customerId.toString());

    // Finalize manifest
    manifest.status = 'COMPLETED';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`[STAGING FIXTURES] SUCCESS: Run "${fixtureRunId}" fully provisioned.`);
    console.log(`[STAGING FIXTURES] Manifest finalized at "${manifestPath}".`);
    return manifest;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
}

export async function cleanupStagingFixtures(rawUri, options = {}) {
  const uri = validateStagingUri(rawUri);
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const targetRunId = options.runId;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`FAIL-CLOSED: Manifest file not found at "${manifestPath}". Cleanup requires an active run manifest to prevent unconstrained deletions.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`FAIL-CLOSED: Failed to parse manifest file at "${manifestPath}".`);
  }

  if (targetRunId && manifest.fixtureRunId !== targetRunId) {
    throw new Error(`FAIL-CLOSED: Target runId "${targetRunId}" does not match manifest runId "${manifest.fixtureRunId}". Manifest belongs to a different run; aborting cleanup.`);
  }

  const runIdToClean = manifest.fixtureRunId;
  const insertedIds = manifest.insertedIds || {};
  const preallocatedIds = manifest.preallocatedIds || {};

  // Reconcile manifest preallocatedIds and insertedIds to ensure partial progress is fully recoverable
  const getCandidateIds = (col) => {
    const pre = Array.isArray(preallocatedIds[col]) ? preallocatedIds[col] : [];
    const ins = Array.isArray(insertedIds[col]) ? insertedIds[col] : [];
    return Array.from(new Set([...pre, ...ins]));
  };

  console.log(`[STAGING CLEANUP] Starting scoped teardown for Run ID: "${runIdToClean}"`);

  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
      dbName: APPROVED_DATABASE
    });
  } catch (err) {
    throw new Error(`FAIL-CLOSED [CONNECT]: ${sanitizeErrorMessage(err.message)}`);
  }

  const db = mongoose.connection.db;

  try {
    let appCartsDeleted = 0;
    let appOrdersDeleted = 0;

    // 1. Clean app-created carts and orders linked to this run's customer/vendor FIRST
    const candidateUserIds = getCandidateIds('users');
    const candidateVendorIds = getCandidateIds('vendors');
    const customerIdStr = candidateUserIds[0];
    const vendorIdStr = candidateVendorIds[0];

    if (customerIdStr && mongoose.isValidObjectId(customerIdStr)) {
      const customerId = new mongoose.Types.ObjectId(customerIdStr);

      // Discover app-created carts
      const linkedCarts = await db.collection('carts').find({ user: customerId }).toArray();
      if (linkedCarts.length > 0) {
        const cartIds = linkedCarts.map(c => c._id);
        const rCarts = await db.collection('carts').deleteMany({
          _id: { $in: cartIds },
          user: customerId
        });
        appCartsDeleted = rCarts.deletedCount;
      }

      // Discover app-created orders linked to this customer and vendor
      if (vendorIdStr && mongoose.isValidObjectId(vendorIdStr)) {
        const vendorId = new mongoose.Types.ObjectId(vendorIdStr);
        const linkedOrders = await db.collection('orders').find({
          customer: customerId,
          vendor: vendorId
        }).toArray();

        if (linkedOrders.length > 0) {
          const orderIds = linkedOrders.map(o => o._id);
          const rOrders = await db.collection('orders').deleteMany({
            _id: { $in: orderIds },
            customer: customerId,
            vendor: vendorId
          });
          appOrdersDeleted = rOrders.deletedCount;
        }
      }
    }

    // 2. Clean fixture records using reconciled preallocatedIds against database records
    // Strictly matching _id + fixtureRunId + isStagingFixture: true
    const cleanCollection = async (col, idList) => {
      if (!Array.isArray(idList) || idList.length === 0) return 0;
      const objectIds = idList
        .filter(id => mongoose.isValidObjectId(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (objectIds.length === 0) return 0;

      const res = await db.collection(col).deleteMany({
        _id: { $in: objectIds },
        fixtureRunId: runIdToClean,
        isStagingFixture: true
      });
      return res.deletedCount;
    };

    const rProducts = await cleanCollection('products', getCandidateIds('products'));
    const rCategories = await cleanCollection('categories', getCandidateIds('categories'));
    const rVendors = await cleanCollection('vendors', getCandidateIds('vendors'));
    const rRiders = await cleanCollection('riders', getCandidateIds('riders'));
    const rUsers = await cleanCollection('users', getCandidateIds('users'));

    console.log(`[STAGING CLEANUP] Teardown complete for Run "${runIdToClean}":
      - App Orders removed: ${appOrdersDeleted}
      - App Carts removed: ${appCartsDeleted}
      - Products removed: ${rProducts}
      - Categories removed: ${rCategories}
      - Vendors removed: ${rVendors}
      - Riders removed: ${rRiders}
      - Users removed: ${rUsers}`);

    // Remove manifest only after successful teardown of the matching run
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }

    return {
      success: true,
      fixtureRunId: runIdToClean,
      deleted: {
        appOrders: appOrdersDeleted,
        appCarts: appCartsDeleted,
        products: rProducts,
        categories: rCategories,
        vendors: rVendors,
        riders: rRiders,
        users: rUsers
      }
    };
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
}

// Direct CLI execution guard (Do NOT execute real creation or cleanup automatically)
if (process.argv[1] && (process.argv[1].endsWith('stagingFixtures.js') || process.argv[1].includes('stagingFixtures'))) {
  const uri = process.env.STAGING_SETUP_MONGO_URI || process.env.MONGODB_URI;
  const isCleanup = process.argv.includes('--cleanup');
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun');

  const latArg = process.argv.find(a => a.startsWith('--lat='));
  const lngArg = process.argv.find(a => a.startsWith('--lng='));
  const runIdArg = process.argv.find(a => a.startsWith('--runId='));
  const manifestArg = process.argv.find(a => a.startsWith('--manifest='));

  const lat = latArg ? parseFloat(latArg.split('=')[1]) : (process.env.TEST_BASE_LAT !== undefined ? parseFloat(process.env.TEST_BASE_LAT) : undefined);
  const lng = lngArg ? parseFloat(lngArg.split('=')[1]) : (process.env.TEST_BASE_LNG !== undefined ? parseFloat(process.env.TEST_BASE_LNG) : undefined);
  const runId = runIdArg ? runIdArg.split('=')[1] : undefined;
  const manifestPath = manifestArg ? manifestArg.split('=')[1] : undefined;

  if (isCleanup) {
    cleanupStagingFixtures(uri, { runId, manifestPath })
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[STAGING CLEANUP ERROR]', sanitizeErrorMessage(err.message));
        process.exit(1);
      });
  } else {
    createStagingFixtures(uri, { lat, lng, runId, manifestPath, dryRun: isDryRun })
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[STAGING FIXTURES ERROR]', sanitizeErrorMessage(err.message));
        process.exit(1);
      });
  }
}
