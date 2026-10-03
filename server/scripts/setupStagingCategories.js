import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

import Category from '../models/Category.js';

export const APPROVED_STAGING_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
export const APPROVED_DATABASE = 'farmart_test_disposable';

export const REQUIRED_UNIQUE_INDEXES = Object.freeze([
  {
    collection: 'categories',
    keys: { slug: 1 },
    options: { unique: true, name: 'slug_1' }
  },
  {
    collection: 'categories',
    keys: { nameNormalized: 1 },
    options: { unique: true, sparse: true, name: 'nameNormalized_1' }
  },
  {
    collection: 'categories',
    keys: { type: 1, sortOrder: 1 },
    options: { name: 'type_1_sortOrder_1' }
  }
]);

export const CANONICAL_PLATFORM_CATEGORIES = Object.freeze([
  {
    name: 'Fresh Fruits & Vegetables',
    slug: 'fruits-vegetables',
    type: 'GROCERY',
    icon: '🥦',
    image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=500&auto=format&fit=crop&q=60',
    sortOrder: 1,
    subCategories: [
      { name: 'Fresh Vegetables', slug: 'fresh-vegetables' },
      { name: 'Fresh Fruits', slug: 'fresh-fruits' },
      { name: 'Exotic & Organic', slug: 'organic' }
    ]
  },
  {
    name: 'Dairy, Bread & Eggs',
    slug: 'dairy-milk',
    type: 'GROCERY',
    icon: '🥛',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60',
    sortOrder: 2,
    subCategories: [
      { name: 'Milk & Butter', slug: 'milk-butter' },
      { name: 'Paneer & Curd', slug: 'paneer-curd' },
      { name: 'Bread & Pav', slug: 'bread' }
    ]
  },
  {
    name: 'Atta, Rice & Dal',
    slug: 'atta-rice-dal',
    type: 'GROCERY',
    icon: '🌾',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60',
    sortOrder: 3,
    subCategories: [
      { name: 'Atta & Flours', slug: 'atta-flours' },
      { name: 'Rice & Grains', slug: 'rice' },
      { name: 'Dals & Pulses', slug: 'dals' }
    ]
  },
  {
    name: 'Oil, Ghee & Masala',
    slug: 'oil-ghee-masala',
    type: 'GROCERY',
    icon: '🫙',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60',
    sortOrder: 4,
    subCategories: [
      { name: 'Cooking Oils', slug: 'oils' },
      { name: 'Desi Ghee', slug: 'ghee' },
      { name: 'Spices & Masalas', slug: 'spices' }
    ]
  },
  {
    name: 'Ghar Ka Khana / Home Thali',
    slug: 'home-thali',
    type: 'FOOD',
    icon: '🍛',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
    sortOrder: 5,
    subCategories: [
      { name: 'Punjabi Thali', slug: 'thali' },
      { name: 'Parathas & Rolls', slug: 'parathas' },
      { name: 'Sabzi & Curries', slug: 'curries' }
    ]
  },
  {
    name: 'Mithai & Bakery',
    slug: 'sweets-bakery',
    type: 'FOOD',
    icon: '🍰',
    image: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=500&auto=format&fit=crop&q=60',
    sortOrder: 6,
    subCategories: [
      { name: 'Desi Mithai', slug: 'desi-mithai' },
      { name: 'Cakes & Pastries', slug: 'cakes' },
      { name: 'Cookies & Rusk', slug: 'cookies' }
    ]
  },
  {
    name: 'Snacks & Munchies',
    slug: 'snacks-namkeen',
    type: 'GROCERY',
    icon: '🍿',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281223?w=500&auto=format&fit=crop&q=60',
    sortOrder: 7,
    subCategories: [
      { name: 'Namkeen & Mixtures', slug: 'namkeen' },
      { name: 'Chips & Crisps', slug: 'chips' },
      { name: 'Healthy Snacks', slug: 'healthy-snacks' }
    ]
  },
  {
    name: 'Cold Drinks & Juices',
    slug: 'beverages',
    type: 'GROCERY',
    icon: '🧃',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60',
    sortOrder: 8,
    subCategories: [
      { name: 'Fresh Juices', slug: 'fresh-juices' },
      { name: 'Soft Drinks', slug: 'soft-drinks' },
      { name: 'Lassi & Buttermilk', slug: 'lassi' }
    ]
  }
]);

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
    throw new Error(
      `FAIL-CLOSED: Target host "${parsed.hostname}" does not match approved staging host "${APPROVED_STAGING_HOST}".`
    );
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (targetDb !== APPROVED_DATABASE) {
    throw new Error(
      `FAIL-CLOSED: Target database "${targetDb}" does not match approved staging database "${APPROVED_DATABASE}".`
    );
  }

  return rawUri;
}

export async function runStagingCategorySetup(options = {}) {
  const isDryRun = Boolean(options.dryRun);
  const rawUri =
    options.uri ||
    process.env.STAGING_SETUP_MONGO_URI ||
    process.env.MONGODB_URI ||
    (isDryRun ? `mongodb+srv://staging_dryrun_tester:masked@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}` : null);

  console.log('=== Farmart Staging Category Setup ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no database connection or writes)' : 'LIVE SETUP'}`);

  // 1. Host & Database Validation
  validateStagingUri(rawUri);
  console.log(`[PASS] Pinned Host Verification: ${APPROVED_STAGING_HOST}`);
  console.log(`[PASS] Pinned Database Verification: ${APPROVED_DATABASE}`);

  // 2. Identify Required Unique Indexes
  console.log('\n--- Required Unique Indexes ---');
  for (const idx of REQUIRED_UNIQUE_INDEXES) {
    console.log(`* Collection: ${idx.collection} -> Index: ${JSON.stringify(idx.keys)} (options: ${JSON.stringify(idx.options)})`);
  }

  // 3. In-memory Mongoose schema validation for all 8 categories (no DB connection/writes)
  console.log('\n--- In-Memory Mongoose Schema Validation (Canonical Categories) ---');
  for (const cat of CANONICAL_PLATFORM_CATEGORIES) {
    const normalizedName = cat.name.trim().replace(/\s+/g, ' ');
    const doc = new Category({
      ...cat,
      name: normalizedName,
      nameNormalized: normalizedName.toLowerCase()
    });
    await doc.validate();
    console.log(`* [VALIDATED] [${cat.type}] ${cat.name} (slug: "${cat.slug}", sortOrder: ${cat.sortOrder}, icon: "${cat.icon}")`);
  }
  console.log('[PASS] In-memory Mongoose schema validation succeeded for all 8 canonical categories.');

  if (isDryRun) {
    console.log('\n[SUCCESS] Dry-run validation completed successfully. Zero database connections opened and zero writes performed.');
    return {
      success: true,
      dryRun: true,
      categoriesCount: CANONICAL_PLATFORM_CATEGORIES.length,
      indexesCount: REQUIRED_UNIQUE_INDEXES.length
    };
  }

  // 4. Live execution: fail-closed preflights and safe non-destructive upserts
  console.log('\nConnecting to staging MongoDB (autoIndex: false, autoCreate: false)...');
  await mongoose.connect(rawUri, {
    autoIndex: false,
    autoCreate: false,
    dbName: APPROVED_DATABASE
  });
  console.log('[PASS] Connected to staging database.');

  try {
    const db = mongoose.connection.db;
    const catCol = db.collection('categories');

    // Preflight 4A: Verify required indexes in live database
    console.log('\n--- Preflighting Required Indexes in Collection "categories" ---');
    const existingIndexes = await catCol.indexes();
    for (const reqIdx of REQUIRED_UNIQUE_INDEXES) {
      const found = existingIndexes.find(idx => {
        const reqKeys = Object.entries(reqIdx.keys);
        const idxKeys = Object.entries(idx.key || {});
        if (reqKeys.length !== idxKeys.length) return false;
        return reqKeys.every(([k, v]) => idx.key[k] === v);
      });

      if (!found) {
        throw new Error(
          `FAIL-CLOSED [MISSING_INDEX]: Required index ${JSON.stringify(reqIdx.keys)} on collection "${reqIdx.collection}" is not present. Run provisionStagingDb.js first.`
        );
      }
      if (reqIdx.options.unique && !found.unique) {
        throw new Error(
          `FAIL-CLOSED [INDEX_CONFLICT]: Index ${JSON.stringify(reqIdx.keys)} exists but is not marked unique.`
        );
      }
      console.log(`* [VERIFIED] Index on ${JSON.stringify(reqIdx.keys)} (${found.name}) is active.`);
    }

    // Preflight 4B: Query all existing categories and preflight cross-conflicts (including legacy records without nameNormalized)
    console.log('\n--- Preflighting Existing Categories & Conflict Detection ---');
    const existingCategories = await Category.find({});
    console.log(`Found ${existingCategories.length} existing categories in staging database.`);

    for (const catData of CANONICAL_PLATFORM_CATEGORIES) {
      const normalizedName = catData.name.trim().replace(/\s+/g, ' ');
      const normNameLower = normalizedName.toLowerCase();

      // Check match by slug
      const matchBySlug = existingCategories.find(c => c.slug === catData.slug);

      // Check match by normalized name (accounting for legacy records without nameNormalized!)
      const matchByName = existingCategories.find(c => {
        if (c.nameNormalized) {
          return c.nameNormalized === normNameLower;
        }
        if (c.name && typeof c.name === 'string') {
          return c.name.trim().replace(/\s+/g, ' ').toLowerCase() === normNameLower;
        }
        return false;
      });

      // Cross-conflict check: slug belongs to document A, but name belongs to document B
      if (matchBySlug && matchByName && String(matchBySlug._id) !== String(matchByName._id)) {
        throw new Error(
          `FAIL-CLOSED [PREFLIGHT_CONFLICT]: Canonical category "${catData.name}" has conflicting records: slug "${catData.slug}" matches ID ${matchBySlug._id}, but name matches ID ${matchByName._id}. Manual DBA cleanup required.`
        );
      }
    }
    console.log('[PASS] Preflight checks passed. Zero cross-conflicts detected.');

    // Step 5: Safe insertion and non-destructive backfill
    console.log('\n--- Executing Safe Non-Destructive Category Setup ---');
    const results = [];
    for (const catData of CANONICAL_PLATFORM_CATEGORIES) {
      const normalizedName = catData.name.trim().replace(/\s+/g, ' ');
      const normNameLower = normalizedName.toLowerCase();

      const existing = existingCategories.find(c =>
        c.slug === catData.slug ||
        (c.nameNormalized ? c.nameNormalized === normNameLower : (c.name && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === normNameLower))
      );

      if (existing) {
        // PRESERVE existing document, _id, user modifications, and intentional deactivations
        let needsSave = false;

        // Only backfill nameNormalized if legacy document was missing it
        if (!existing.nameNormalized) {
          existing.nameNormalized = (existing.name || normalizedName).trim().replace(/\s+/g, ' ').toLowerCase();
          needsSave = true;
        }

        if (needsSave) {
          await existing.save();
          console.log(`[BACKFILLED] Backfilled nameNormalized for category "${existing.name}" (ID: ${existing._id})`);
        } else {
          console.log(`[PRESERVED] Preserved existing category "${existing.name}" (${existing.slug}) -> ID: ${existing._id} (isActive: ${existing.isActive})`);
        }

        results.push({ action: 'PRESERVED', id: existing._id, slug: existing.slug, isActive: existing.isActive });
      } else {
        // New canonical category creation
        const created = await Category.create({
          ...catData,
          name: normalizedName,
          nameNormalized: normNameLower,
          isActive: true
        });
        console.log(`[CREATED] Category "${catData.name}" (${catData.slug}) -> ID: ${created._id}`);
        results.push({ action: 'CREATED', id: created._id, slug: catData.slug, isActive: true });
      }
    }

    console.log(`\n[SUCCESS] Setup verified. ${results.length} canonical categories accounted for in staging database.`);
    return {
      success: true,
      dryRun: false,
      results
    };
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from staging database.');
  }
}

// CLI runner
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('setupStagingCategories.js')) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  runStagingCategorySetup({ dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[FATAL]', sanitizeErrorMessage(err.message));
      process.exit(1);
    });
}
