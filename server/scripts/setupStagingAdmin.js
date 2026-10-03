// setupStagingAdmin.js – Staging-only administrator provisioning script
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import { pathToFileURL } from 'url';
import Admin from '../models/Admin.js';
import { validateStagingUri, sanitizeErrorMessage } from './setupStagingCategories.js';

/**
 * Granular Role and Privilege Specifications for Staging:
 * - Provisioning & Account Setup (officialfarmmart_db_user):
 *     Needs collection & index provisioning plus account insertion:
 *     Actions: createCollection, createIndex, insert on farmart_test_disposable.admins
 * - Runtime Backend Application (farmart_staging_tester):
 *     Needs read access for authentication and authoritative session lookup:
 *     Actions: find on farmart_test_disposable.admins (for adminLogin & auth middleware)
 *     (Only needs insert/update on admins if runtime subadmin management endpoints are actively used)
 * - Database-wide readWrite or dbOwner roles are NOT recommended or required for runtime.
 */
export const STAGING_ADMIN_ROLE_PERMISSIONS = Object.freeze({
  database: 'farmart_test_disposable',
  collection: 'admins',
  setupUserPermissions: {
    user: 'officialfarmmart_db_user',
    purpose: 'Database provisioning and one-time administrator account creation',
    requiredActions: ['createCollection', 'createIndex', 'insert', 'find'],
    target: 'farmart_test_disposable.admins'
  },
  runtimeUserPermissions: {
    user: 'farmart_staging_tester',
    purpose: 'Runtime authentication, admin login, and authoritative token verification',
    requiredActions: ['find'],
    target: 'farmart_test_disposable.admins',
    additionalOptionalRuntimeActions: {
      subAdminCreation: 'insert on farmart_test_disposable.admins (only if POST /api/admin/create-subadmin is used at runtime)',
      subAdminUpdates: 'update on farmart_test_disposable.admins (only if subadmin permissions are modified at runtime)'
    }
  },
  requiredIndex: {
    keys: { username: 1 },
    name: 'username_1',
    unique: true
  }
});

export const STAGING_RECEIPT_ROLE_PERMISSIONS = Object.freeze({
  database: 'farmart_test_disposable',
  collection: 'pushreceipts',
  setupUserPermissions: {
    user: 'officialfarmmart_db_user',
    purpose: 'Database provisioning, pushreceipts collection creation, and index provisioning',
    requiredActions: ['createCollection', 'createIndex', 'find', 'insert'],
    target: 'farmart_test_disposable.pushreceipts'
  },
  runtimeUserPermissions: {
    user: 'farmart_staging_tester',
    purpose: 'Live staging durable push-receipt recovery testing (ticket persistence, atomic lease claims, recovery polling, surgical teardown)',
    requiredActions: ['find', 'insert', 'update', 'remove'],
    target: 'farmart_test_disposable.pushreceipts'
  }
});

/**
 * Provisions an administrator account in the staging database.
 * Pre-conditions & Safeguards:
 * 1. Pinned staging host (farmart-staging.gxn3bfw.mongodb.net) and database (farmart_test_disposable).
 * 2. Explicit flag: --create-staging-admin (dry-run plan mode if omitted).
 * 3. Verified collection and index provisioning: admins collection and username_1 unique index MUST exist.
 * 4. Refuses execution if any admin account already exists (or username conflict).
 * 5. Rejects empty username and enforces private password input with bcrypt hashing (saltRounds=10).
 * 6. Keeps autoIndex: false and autoCreate: false.
 */
export async function runStagingAdminSetup(options = {}) {
  let connected = false;

  try {
    const args = process.argv.slice(2);
    const hasCreationFlag = args.includes('--create-staging-admin') || Boolean(options.createStagingAdmin);
    const rawUri =
      options.uri ||
      process.env.STAGING_MONGO_URI ||
      process.env.STAGING_SETUP_MONGO_URI ||
      process.env.MONGODB_URI;

    if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
      throw new Error('FAIL-CLOSED: Staging MongoDB URI not provided in environment (STAGING_MONGO_URI or STAGING_SETUP_MONGO_URI).');
    }

    // 1. Host & database pin validation
    validateStagingUri(rawUri);
    console.log('[PASS] Host pinning verified: farmart-staging.gxn3bfw.mongodb.net / farmart_test_disposable');

    // 2. Creation flag validation (dry-run if omitted)
    if (!hasCreationFlag) {
      console.log('\n[PLAN MODE / DRY RUN] Missing explicit flag "--create-staging-admin".');
      console.log('No modifications will be made. Showing required permissions and configuration:');
      console.log(JSON.stringify(STAGING_ADMIN_ROLE_PERMISSIONS, null, 2));
      console.log('\nTo execute account creation once confirmed:');
      console.log('node server/scripts/setupStagingAdmin.js --create-staging-admin\n');
      return { executed: false, reason: 'DRY_RUN' };
    }

    // 3. Username validation (reject empty username)
    const rawUsername = process.env.STAGING_ADMIN_USERNAME !== undefined
      ? process.env.STAGING_ADMIN_USERNAME
      : (options.username !== undefined ? options.username : 'staging_superadmin');

    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    if (!username) {
      throw new Error('FAIL-CLOSED: STAGING_ADMIN_USERNAME cannot be empty.');
    }

    // 4. Password input validation (must be provided via environment variable, never hardcoded)
    const password = process.env.STAGING_ADMIN_PASSWORD || options.password;
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('FAIL-CLOSED: STAGING_ADMIN_PASSWORD must be provided in environment with at least 8 characters.');
    }

    // Connect with autoIndex and autoCreate disabled
    await mongoose.connect(rawUri, {
      autoIndex: false,
      autoCreate: false,
      dbName: 'farmart_test_disposable'
    });
    connected = true;
    console.log('[PASS] Connected (autoIndex=false, autoCreate=false).');

    const db = mongoose.connection.db;

    // 5. Verify the admins collection exists BEFORE attempting account creation
    const collections = await db.listCollections({ name: 'admins' }).toArray();
    if (collections.length === 0) {
      throw new Error(
        'FAIL-CLOSED: Provisioning missing: Collection "admins" does not exist in staging database "farmart_test_disposable". Run provisionStagingDb.js first.'
      );
    }

    // 6. Verify the username unique index is correct BEFORE attempting account creation
    const adminCol = db.collection('admins');
    const existingIndexes = await adminCol.indexes();
    const hasUsernameUniqueIndex = existingIndexes.some((idx) => {
      const keys = Object.entries(idx.key || {});
      return keys.length === 1 && keys[0][0] === 'username' && keys[0][1] === 1 && Boolean(idx.unique);
    });

    if (!hasUsernameUniqueIndex) {
      throw new Error(
        'FAIL-CLOSED: Provisioning missing: Unique index on { username: 1 } is missing or not unique in "admins" collection. Run provisionStagingDb.js first.'
      );
    }
    console.log('[PASS] Verified "admins" collection exists with unique index on { username: 1 }.');

    // 7. Refusal to overwrite existing accounts
    const existingCount = await Admin.countDocuments();
    if (existingCount > 0) {
      const existingUsers = await Admin.find({}, { username: 1, role: 1, _id: 0 }).lean();
      const usernames = existingUsers.map((u) => `${u.username} (${u.role})`).join(', ');
      throw new Error(
        `FAIL-CLOSED: Refusing to create account. ${existingCount} admin account(s) already exist in staging database: [${usernames}]. Overwrite is strictly forbidden.`
      );
    }

    const existingUser = await Admin.findOne({ username });
    if (existingUser) {
      throw new Error(`FAIL-CLOSED: Username "${username}" already exists in the database. Refusing overwrite.`);
    }

    // 8. Password hashing adhering to server/controllers/adminController.js
    console.log('[INFO] Hashing administrator password with bcrypt (saltRounds=10)...');
    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      id: `admin-${Date.now()}`,
      username,
      password: hashedPassword,
      role: 'superadmin',
      name: process.env.STAGING_ADMIN_NAME || options.name || 'Staging Administrator',
      access: ['users', 'partners', 'riders', 'jobs', 'categories']
    });

    await newAdmin.save();
    console.log(`[SUCCESS] Staging superadmin account "${username}" provisioned successfully.`);

    return {
      executed: true,
      username,
      role: 'superadmin',
      id: newAdmin.id
    };
  } catch (err) {
    const sanitized = sanitizeErrorMessage(err.message || String(err));
    console.error('[ERROR] Staging admin setup aborted:', sanitized);
    throw new Error(sanitized);
  } finally {
    if (connected || mongoose.connection?.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log('[PASS] Database connection closed.');
      } catch (closeErr) {
        console.warn('[WARN] Error during disconnect:', sanitizeErrorMessage(closeErr.message));
      }
    }
  }
}

// CLI entry point
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runStagingAdminSetup()
    .then((res) => process.exit(res?.executed ? 0 : 2))
    .catch((err) => {
      console.error('[FATAL]', sanitizeErrorMessage(err?.message || String(err)));
      process.exit(1);
    });
}
