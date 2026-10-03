// checkAdminAccounts.js – Read-only check of admin accounts in staging database
import mongoose from 'mongoose';
import path from 'path';
import { pathToFileURL } from 'url';
import Admin from '../models/Admin.js';
import { validateStagingUri, sanitizeErrorMessage } from './setupStagingCategories.js';

/**
 * Execute a strictly read-only check of the `admins` collection on pinned staging database.
 * Never reads, projects, or prints password hashes or sensitive tokens.
 */
export async function runAdminAccountCheck(overrideUri) {
  let connected = false;

  try {
    const rawUri =
      overrideUri ||
      process.env.STAGING_MONGO_URI ||
      process.env.STAGING_SETUP_MONGO_URI ||
      process.env.MONGODB_URI;

    if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
      throw new Error('FAIL-CLOSED: Staging MongoDB URI not provided in environment (STAGING_MONGO_URI).');
    }

    // Pin check: host must match farmart-staging.gxn3bfw.mongodb.net and db must match farmart_test_disposable
    validateStagingUri(rawUri);
    console.log('[PASS] Pinned staging host and database verified.');

    await mongoose.connect(rawUri, {
      autoIndex: false,
      autoCreate: false,
      dbName: 'farmart_test_disposable'
    });
    connected = true;
    console.log('[PASS] Connected (read-only mode, autoIndex=false, autoCreate=false).');

    // Query admin documents excluding password field entirely
    const count = await Admin.countDocuments();
    const accounts = await Admin.find({}, { password: 0, __v: 0 }).lean();

    const safeReport = {
      timestamp: new Date().toISOString(),
      database: 'farmart_test_disposable',
      adminAccountCount: count,
      accounts: accounts.map((acc) => ({
        id: acc.id || acc._id?.toString(),
        username: acc.username,
        role: acc.role || 'subadmin',
        name: acc.name || 'N/A',
        access: Array.isArray(acc.access) ? acc.access : [],
        isActive: acc.isActive !== false
      }))
    };

    console.log('\n================ ADMIN ACCOUNT REPORT ================');
    console.log(`Total Admin Accounts Found: ${safeReport.adminAccountCount}`);
    if (safeReport.accounts.length === 0) {
      console.log('No administrator accounts exist in the staging database.');
    } else {
      console.table(safeReport.accounts);
    }
    console.log('======================================================\n');

    return safeReport;
  } catch (err) {
    const sanitized = sanitizeErrorMessage(err.message || String(err));
    console.error('[ERROR] Failed admin account check:', sanitized);
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
  runAdminAccountCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', sanitizeErrorMessage(err?.message || String(err)));
      process.exit(1);
    });
}
