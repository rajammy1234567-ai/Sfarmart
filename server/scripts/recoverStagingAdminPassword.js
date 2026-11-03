// recoverStagingAdminPassword.js – Targeted password recovery for staging administrator
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import { pathToFileURL } from 'url';
import Admin from '../models/Admin.js';
import { validateStagingUri, sanitizeErrorMessage } from './setupStagingCategories.js';

export async function recoverStagingAdminPassword(options = {}) {
  const targetUsername = (options.username || process.env.STAGING_ADMIN_TARGET_USERNAME || 'superadmin').trim();
  const newPassword = options.newPassword || process.env.STAGING_ADMIN_NEW_PASSWORD;
  const rawUri =
    options.uri ||
    process.env.STAGING_MONGO_URI ||
    process.env.STAGING_SETUP_MONGO_URI;

  if (!targetUsername) {
    throw new Error('FAIL-CLOSED: Target username cannot be empty.');
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('FAIL-CLOSED: New password must be provided with at least 8 characters.');
  }

  if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('FAIL-CLOSED: Staging MongoDB URI not provided in environment (STAGING_MONGO_URI).');
  }

  // Pin check: host must match farmart-staging.gxn3bfw.mongodb.net and db must match farmart_test_disposable
  validateStagingUri(rawUri);
  console.log('[PASS] Pinned staging host and database verified.');

  let connected = false;
  try {
    await mongoose.connect(rawUri, {
      autoIndex: false,
      autoCreate: false,
      dbName: 'farmart_test_disposable',
      serverSelectionTimeoutMS: 10000
    });
    connected = true;
    console.log('[PASS] Connected to staging database "farmart_test_disposable".');

    const escaped = targetUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingAdmin = await Admin.findOne({
      username: { $regex: new RegExp(`^${escaped}$`, 'i') }
    });

    if (!existingAdmin) {
      throw new Error(`FAIL-CLOSED: Administrator account with username "${targetUsername}" does not exist in staging database.`);
    }

    console.log(`[INFO] Found administrator account "${existingAdmin.username}" (Role: ${existingAdmin.role || 'subadmin'}).`);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await Admin.updateOne(
      { _id: existingAdmin._id },
      { $set: { password: hashedPassword } }
    );

    console.log(`[SUCCESS] Password for staging administrator "${existingAdmin.username}" updated successfully.`);
    return {
      success: true,
      username: existingAdmin.username,
      role: existingAdmin.role,
      access: existingAdmin.access
    };
  } catch (err) {
    const sanitized = sanitizeErrorMessage(err.message || String(err));
    console.error('[ERROR] Password recovery failed:', sanitized);
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
  recoverStagingAdminPassword()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', sanitizeErrorMessage(err?.message || String(err)));
      process.exit(1);
    });
}
