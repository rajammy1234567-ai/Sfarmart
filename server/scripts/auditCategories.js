// auditCategories.js – Read‑only audit of staging categories
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import { REQUIRED_UNIQUE_INDEXES, CANONICAL_PLATFORM_CATEGORIES, validateStagingUri } from './setupStagingCategories.js';
import { pathToFileURL } from 'url';
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

/**
 * Run a read‑only audit of the staging `categories` collection.
 * Uses only environment credentials (STAGING_SETUP_MONGO_URI) – no command‑line flags.
 */
export async function runCategoryAudit() {
  const rawUri = process.env.STAGING_SETUP_MONGO_URI;
  if (!rawUri) {
    throw new Error('FAIL-CLOSED: STAGING_SETUP_MONGO_URI not available in environment.');
  }

  // Validate URI before any connection (fails fast)
  validateStagingUri(rawUri);
  console.log('[PASS] Staging URI validated.');

  let connectionAttempted = false;
  try {
    connectionAttempted = true;
    await mongoose.connect(rawUri, {
      autoIndex: false,
      autoCreate: false,
      dbName: 'farmart_test_disposable'
    });
    console.log('[PASS] Connected (read‑only).');

    const db = mongoose.connection.db;
    const catCol = db.collection('categories');
    const existingIdx = await catCol.indexes();

    const report = {
      indexes: [],
      categories: [],
      canonicalConflicts: [],
      legacyIssues: []
    };

    // ---- Index verification (order and options) --------------------------
    for (const req of REQUIRED_UNIQUE_INDEXES) {
      const match = existingIdx.find(idx => {
        const reqKeys = Object.entries(req.keys);
        const idxKeys = Object.entries(idx.key || {});
        if (reqKeys.length !== idxKeys.length) return false;
        // exact order match
        return reqKeys.every(([k, v], i) => {
          const [ik, iv] = idxKeys[i];
          return ik === k && iv === v;
        });
      });
      const optionsMatch = match
        ? Boolean(match.unique) === Boolean(req.options.unique) &&
          Boolean(match.sparse) === Boolean(req.options.sparse) &&
          JSON.stringify(match.partialFilterExpression || {}) ===
            JSON.stringify(req.options.partialFilterExpression || {})
        : false;
      report.indexes.push({ required: req, present: !!match, optionsCorrect: optionsMatch, details: match || null });
    }

    // ---- Gather categories and linked counts --------------------------------
    const allCategories = await Category.find({}).lean();
    for (const cat of allCategories) {
      const productCount = await Product.countDocuments({ category: cat._id });
      const vendorCount = await Vendor.countDocuments({ _id: cat.vendor }); // may be undefined
      const isFixture = Boolean(cat.isStagingFixture);
      const homeVisibility = Boolean(cat.homeVisibility);
      report.categories.push({
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        isActive: cat.isActive,
        homeVisibility,
        isFixture,
        productCount,
        vendorCount
      });
    }

    // ---- Canonical conflict detection ---------------------------------------
    for (const canon of CANONICAL_PLATFORM_CATEGORIES) {
      const normName = canon.name.trim().replace(/\s+/g, ' ').toLowerCase();
      const slugMatch = allCategories.find(c => c.slug === canon.slug);
      const nameMatch = allCategories.find(c => {
        if (c.nameNormalized) return c.nameNormalized === normName;
        return c.name && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === normName;
      });
      if (slugMatch && nameMatch && String(slugMatch._id) !== String(nameMatch._id)) {
        report.canonicalConflicts.push({ canonical: canon, slugRecordId: slugMatch._id, nameRecordId: nameMatch._id });
      }
    }

    // ---- Legacy issues (e.g., Organic Hydroponics) --------------------------
    const organic = allCategories.find(c => c.slug === 'organic' || (c.name && /organic/i.test(c.name)));
    if (organic) {
      report.legacyIssues.push({ type: 'Organic Hydroponics', record: organic });
    }

    return report;
  } catch (err) {
    // Sanitize potential credential leakage
    const sanitized = err.message?.replace(/mongodb\+srv:\/\/[^@]+@/i, 'mongodb+srv://[REDACTED]@');
    throw new Error(sanitized || 'Audit failed.');
  } finally {
    if (connectionAttempted) {
      try {
        await mongoose.disconnect();
        console.log('[INFO] Disconnected from staging database.');
      } catch (discErr) {
        console.error('[WARN] Disconnect error:', discErr.message);
      }
    }
  }
}

// Proper ESM entry guard – executes when run directly via `node`
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log('\n=== STARTING CATEGORY AUDIT ===');
  runCategoryAudit()
    .then(report => {
      console.log('\n=== CATEGORY AUDIT REPORT ===');
      console.dir(report, { depth: null, colors: true });
      process.exit(0);
    })
    .catch(err => {
      console.error('[FATAL]', err.message);
      process.exit(1);
    });
}
