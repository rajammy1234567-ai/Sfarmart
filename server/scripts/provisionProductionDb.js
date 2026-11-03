import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import {
  APPROVED_STAGING_HOST,
  APPROVED_PRODUCTION_DATABASE,
  validateProductionUri,
  sanitizeErrorMessage
} from '../config/db.js';
import {
  REQUIRED_SCHEMA,
  findMatchingIndex
} from './provisionStagingDb.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

/**
 * Narrowly scoped, fail-closed provisioning script for farmart_production.
 *
 * Preconditions:
 * - Environment variable PROD_SETUP_MONGO_URI or MONGODB_URI must be provided.
 * - Host must match approved Atlas cluster host (farmart-staging.gxn3bfw.mongodb.net).
 * - Target database must explicitly match APPROVED_PRODUCTION_DATABASE (farmart_production).
 * - Requires explicit CLI flag --provision-production-db to execute writes.
 * - Without the flag, operates in safe dry-run inspection mode.
 * - Never drops or overwrites existing collections or indexes.
 * - Never prints credentials, hashes, or connection strings.
 */

export async function executeProductionProvisioningPlan(db, isDryRun = true) {
  const existingCollections = await db.listCollections().toArray();
  const existingColNames = new Set(existingCollections.map(c => c.name));

  const state = {};
  for (const colName of Object.keys(REQUIRED_SCHEMA)) {
    if (existingColNames.has(colName)) {
      const col = db.collection(colName);
      state[colName] = await col.indexes();
    } else {
      state[colName] = null;
    }
  }

  const plannedCreations = []; // Array of { colName, required }
  const missingCollections = [];

  for (const [colName, { indexes }] of Object.entries(REQUIRED_SCHEMA)) {
    if (!existingColNames.has(colName)) {
      missingCollections.push(colName);
    }

    const existingIndexes = state[colName];
    if (!existingIndexes) {
      for (const required of indexes) {
        plannedCreations.push({ colName, required });
      }
      continue;
    }

    for (const required of indexes) {
      const result = findMatchingIndex(existingIndexes, required);
      if (result.status === 'MATCH') {
        continue;
      }
      if (result.status === 'CONFLICT') {
        throw new Error(
          `FAIL-CLOSED [STAGE:CONFLICT_CHECK]: Conflicting index detected on "${colName}": ${result.reason}. Will not overwrite or delete existing index.`
        );
      }
      if (result.status === 'MISSING') {
        plannedCreations.push({ colName, required });
      }
    }
  }

  if (isDryRun) {
    console.log('\n================ PRODUCTION PROVISIONING DRY RUN ================');
    console.log(`Database Target: ${APPROVED_PRODUCTION_DATABASE}`);
    console.log(`Missing Collections (${missingCollections.length}):`, missingCollections);
    console.log(`Missing Indexes to Create (${plannedCreations.length}):`);
    plannedCreations.forEach(({ colName, required }, idx) => {
      console.log(`  ${idx + 1}. [${colName}] ${required.options.name} => ${JSON.stringify(required.keys)}`);
    });
    console.log('\n[PLAN MODE / DRY RUN] No database writes were performed.');
    console.log('To apply these changes, rerun with flag: --provision-production-db');
    console.log('=================================================================\n');
    return {
      success: true,
      dryRun: true,
      missingCollectionsCount: missingCollections.length,
      missingIndexesCount: plannedCreations.length
    };
  }

  // --- Stage C: Create missing collections & missing indexes ---
  console.log(`\n[PRODUCTION PROVISION] Executing schema creation on database "${APPROVED_PRODUCTION_DATABASE}"...`);
  for (const colName of missingCollections) {
    console.log(`[PRODUCTION PROVISION] Creating empty collection: ${colName}`);
    await db.createCollection(colName);
  }

  for (const { colName, required } of plannedCreations) {
    console.log(`[PRODUCTION PROVISION] Creating index on ${colName}: ${required.options.name} ...`);
    const col = db.collection(colName);
    await col.createIndex(required.keys, required.options);
  }

  // --- Stage D: Re-read and verify final index state ---
  for (const [colName, { indexes }] of Object.entries(REQUIRED_SCHEMA)) {
    const col = db.collection(colName);
    const finalIndexes = await col.indexes();
    for (const required of indexes) {
      const result = findMatchingIndex(finalIndexes, required);
      if (result.status !== 'MATCH') {
        throw new Error(
          `FAIL-CLOSED [STAGE:VERIFY]: Verification failed on "${colName}" for index "${required.options.name}". Expected MATCH, got ${result.status}.`
        );
      }
    }
  }

  console.log(`[PASS] Verified all ${Object.keys(REQUIRED_SCHEMA).length} collections and required indexes in "${APPROVED_PRODUCTION_DATABASE}".`);

  return {
    success: true,
    dryRun: false,
    createdCollectionsCount: missingCollections.length,
    createdIndexesCount: plannedCreations.length
  };
}

export async function runProductionProvisioning() {
  const isExecuteMode = process.argv.includes('--provision-production-db');
  const rawUri = process.env.PROD_SETUP_MONGO_URI || process.env.MONGODB_URI;

  if (!rawUri || !rawUri.trim()) {
    console.error('FAIL-CLOSED: PROD_SETUP_MONGO_URI or MONGODB_URI is required.');
    process.exit(1);
  }

  try {
    validateProductionUri(rawUri);
  } catch (validationErr) {
    console.error(validationErr.message);
    process.exit(1);
  }

  console.log('[PASS] Validated production database target: farmart_production');
  console.log(`[MODE] ${isExecuteMode ? 'LIVE PROVISIONING EXECUTION' : 'DRY RUN INSPECTION'}`);

  let conn = null;
  try {
    conn = await mongoose.connect(rawUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
      dbName: APPROVED_PRODUCTION_DATABASE
    });

    const db = conn.connection.db;
    const result = await executeProductionProvisioningPlan(db, !isExecuteMode);

    if (result.success) {
      console.log('[SUCCESS] Production database provisioning plan completed successfully.');
    }
  } catch (err) {
    console.error('FAIL-CLOSED: Error during production provisioning:', sanitizeErrorMessage(err.message));
    process.exit(1);
  } finally {
    if (conn) {
      await mongoose.disconnect();
      console.log('[PASS] Database connection closed.');
    }
  }
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('provisionProductionDb.js') ||
  process.argv[1].endsWith('provisionProductionDb')
);

if (isDirectRun) {
  runProductionProvisioning().catch(err => {
    console.error('[Fatal Error]', sanitizeErrorMessage(err.message));
    process.exit(1);
  });
}
