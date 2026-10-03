// server/scripts/inspectStagingFixtures.js
// Strict READ-ONLY inspection of staging database to report exact remaining document counts
// for test fixture prefixes across all tracked collections (orders, users, vendors, riders, categories, products, pushreceipts).
// NO DELETIONS, NO WRITES, NO DDL.

import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Rider from '../models/Rider.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import PushReceipt from '../models/PushReceipt.js';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';

export const REQUIRED_RECEIPT_INDEXES = Object.freeze([
  {
    name: 'ticketId_1',
    keys: { ticketId: 1 },
    unique: true
  },
  {
    name: 'nextCheckAt_1',
    keys: { nextCheckAt: 1 }
  },
  {
    name: 'status_1',
    keys: { status: 1 }
  },
  {
    name: 'cleanupStatus_1',
    keys: { cleanupStatus: 1 }
  },
  {
    name: 'leaseToken_1',
    keys: { leaseToken: 1 }
  },
  {
    name: 'leaseExpiresAt_1',
    keys: { leaseExpiresAt: 1 }
  },
  {
    name: 'createdAt_1',
    keys: { createdAt: 1 },
    expireAfterSeconds: 604800
  }
]);

async function inspectFixtures() {
  const uri = process.env.STAGING_MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('FAIL-CLOSED: MONGODB_URI is required.');
    process.exit(1);
  }

  // 1. Validate host AND database using shared staging validator
  validateStagingUri(uri);

  let connectionAttempted = false;
  let exitCode = 0;

  try {
    connectionAttempted = true;
    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
      dbName: APPROVED_DATABASE
    });

    if (mongoose.connection.name !== APPROVED_DATABASE) {
      throw new Error(`FAIL-CLOSED: Connected to unexpected database "${mongoose.connection.name}", expected "${APPROVED_DATABASE}".`);
    }

    console.log(`\n🔍 Connected read-only to staging database: ${APPROVED_DATABASE}@${APPROVED_STAGING_HOST}`);

    // 2. Verify pushreceipts collection and all seven receipt indexes (including unique and TTL options)
    const existingCollections = await mongoose.connection.db.listCollections().toArray();
    const colNames = existingCollections.map((c) => c.name);
    const hasPushReceipts = colNames.includes('pushreceipts');
    console.log(`\n📋 Collection "pushreceipts" exists: ${hasPushReceipts}`);

    let indexVerificationPassed = true;
    if (hasPushReceipts) {
      try {
        const indexes = await mongoose.connection.db.collection('pushreceipts').indexes();
        console.log('   Existing indexes on pushreceipts:');
        for (const idx of indexes) {
          const uniquePart = idx.unique ? ', unique: true' : '';
          const ttlPart = idx.expireAfterSeconds !== undefined ? `, expireAfterSeconds: ${idx.expireAfterSeconds}` : '';
          console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}${uniquePart}${ttlPart}`);
        }

        for (const req of REQUIRED_RECEIPT_INDEXES) {
          const found = indexes.find(
            (i) => i.name === req.name || JSON.stringify(i.key) === JSON.stringify(req.keys)
          );
          if (!found) {
            console.log(`   ❌ Missing required index: "${req.name}" with keys ${JSON.stringify(req.keys)}`);
            indexVerificationPassed = false;
            continue;
          }
          if (req.unique && !found.unique) {
            console.log(`   ❌ Index "${req.name}" missing required option: { unique: true }`);
            indexVerificationPassed = false;
          }
          if (req.expireAfterSeconds !== undefined && found.expireAfterSeconds !== req.expireAfterSeconds) {
            console.log(`   ❌ Index "${req.name}" TTL mismatch: expected expireAfterSeconds=${req.expireAfterSeconds}, got ${found.expireAfterSeconds}`);
            indexVerificationPassed = false;
          }
        }

        if (indexVerificationPassed) {
          console.log('   ✅ All 7 required pushreceipts indexes verified with matching unique and TTL options.');
        } else {
          console.log('   ❌ One or more required pushreceipts indexes failed verification.');
          exitCode = 1;
        }
      } catch (idxErr) {
        console.log(`   ❌ Could not read indexes on pushreceipts: ${idxErr.message}`);
        indexVerificationPassed = false;
        exitCode = 1;
      }
    } else {
      console.log('   ❌ pushreceipts collection is MISSING from database. Run provisionStagingDb.js first.');
      indexVerificationPassed = false;
      exitCode = 1;
    }

    console.log('\nScanning for test fixture documents across tracked collections...\n');

    const prefixRegex = /^(STAGE_FIXTURE_E2E_\d+|STG_LIVE_\d+)/;

    // 3. Define collection inspection tasks with vendors.storeName check
    const collectionTasks = [
      {
        name: 'orders',
        model: Order,
        query: {
          $or: [
            { clientOrderId: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { orderNumber: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } }
          ]
        },
        select: '_id clientOrderId orderNumber status createdAt',
        extractPrefix: (o) => (o.clientOrderId || o.orderNumber || '').match(prefixRegex)?.[1],
        matchesPrefix: (o, p) => (o.clientOrderId || o.orderNumber || '').includes(p),
        formatDetail: (o) => `${o._id} (orderNumber: ${o.orderNumber || 'none'}, clientOrderId: ${o.clientOrderId || 'none'})`
      },
      {
        name: 'users',
        model: User,
        query: {
          $or: [
            { name: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { fixtureRunId: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } }
          ]
        },
        select: '_id name phone role createdAt',
        extractPrefix: (u) => (u.name || '').match(prefixRegex)?.[1],
        matchesPrefix: (u, p) => (u.name || '').includes(p),
        formatDetail: (u) => `${u._id} (name: ${u.name})`
      },
      {
        name: 'vendors',
        model: Vendor,
        query: {
          $or: [
            { storeName: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { name: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } }
          ]
        },
        select: '_id storeName name phone createdAt',
        extractPrefix: (v) => (v.storeName || v.name || '').match(prefixRegex)?.[1],
        matchesPrefix: (v, p) => (v.storeName || v.name || '').includes(p),
        formatDetail: (v) => `${v._id} (storeName: "${v.storeName || v.name}")`
      },
      {
        name: 'riders',
        model: Rider,
        query: {
          name: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ }
        },
        select: '_id name phone status createdAt',
        extractPrefix: (r) => (r.name || '').match(prefixRegex)?.[1],
        matchesPrefix: (r, p) => (r.name || '').includes(p),
        formatDetail: (r) => `${r._id} (name: ${r.name})`
      },
      {
        name: 'categories',
        model: Category,
        query: {
          $or: [
            { name: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { fixtureRunId: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { isStagingFixture: true }
          ]
        },
        select: '_id name slug fixtureRunId isStagingFixture createdAt',
        extractPrefix: (c) => (c.fixtureRunId || c.name || '').match(prefixRegex)?.[1],
        matchesPrefix: (c, p) => (c.fixtureRunId || c.name || '').includes(p),
        formatDetail: (c) => `${c._id} (name: "${c.name}", fixtureRunId: "${c.fixtureRunId || 'none'}")`
      },
      {
        name: 'products',
        model: Product,
        query: {
          name: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ }
        },
        select: '_id name price vendor createdAt',
        extractPrefix: (p) => (p.name || '').match(prefixRegex)?.[1],
        matchesPrefix: (p, pfx) => (p.name || '').includes(pfx),
        formatDetail: (p) => `${p._id} (name: "${p.name}")`
      },
      {
        name: 'pushreceipts',
        model: PushReceipt,
        query: {
          $or: [
            { ticketId: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } },
            { token: { $regex: /STAGE_FIXTURE_E2E_|STG_LIVE_/ } }
          ]
        },
        select: '_id ticketId token status cleanupStatus nextCheckAt createdAt',
        extractPrefix: (r) => (r.ticketId || r.token || '').match(prefixRegex)?.[1],
        matchesPrefix: (r, p) => (r.ticketId || r.token || '').includes(p),
        formatDetail: (r) => `${r._id} (ticketId: "${r.ticketId}", status: ${r.status})`
      }
    ];

    // 4. Query each collection independently, capturing individual failures
    const queryResults = {};
    let hasQueryErrors = false;

    await Promise.all(
      collectionTasks.map(async (task) => {
        try {
          const docs = await task.model.find(task.query).select(task.select).lean();
          queryResults[task.name] = { ok: true, docs, error: null };
        } catch (err) {
          queryResults[task.name] = { ok: false, docs: [], error: err.message };
          hasQueryErrors = true;
          console.error(`❌ [QUERY ERROR] Failed to query collection "${task.name}": ${err.message}`);
        }
      })
    );

    if (hasQueryErrors) {
      exitCode = 1;
    }

    // Aggregate all prefixes observed in successfully queried documents
    const allPrefixes = new Set();
    for (const task of collectionTasks) {
      const res = queryResults[task.name];
      if (res.ok) {
        for (const doc of res.docs) {
          const p = task.extractPrefix(doc);
          if (p) allPrefixes.add(p);
        }
      }
    }

    // Always include target run prefix in reporting
    const targetPrefix = process.env.TARGET_RUN_PREFIX || 'STAGE_FIXTURE_E2E_1791019779048';
    allPrefixes.add(targetPrefix);

    const prefixList = Array.from(allPrefixes).sort();

    console.log('------------------------------------------------------------');
    console.log('Collection counts matching test fixture prefixes:');
    for (const task of collectionTasks) {
      const res = queryResults[task.name];
      if (res.ok) {
        console.log(`- ${task.name.padEnd(14)}: ${res.docs.length}`);
      } else {
        console.log(`- ${task.name.padEnd(14)}: UNKNOWN (Query failed: ${res.error})`);
      }
    }
    console.log('------------------------------------------------------------\n');

    let anyRemainingOrUnknown = false;

    for (const prefix of prefixList) {
      const isTarget = prefix === targetPrefix;
      console.log(`📦 Fixture Prefix: ${prefix}${isTarget ? ' (TARGET RUN PREFIX)' : ''}`);

      let prefixHasUnknown = false;
      let prefixTotal = 0;

      for (const task of collectionTasks) {
        const res = queryResults[task.name];
        if (!res.ok) {
          prefixHasUnknown = true;
          console.log(`   - ${task.name.padEnd(12)}: UNKNOWN (Query failed)`);
        } else {
          const matching = res.docs.filter((d) => task.matchesPrefix(d, prefix));
          prefixTotal += matching.length;
          const details = matching.length > 0 ? ` (IDs: ${matching.map(task.formatDetail).join(', ')})` : '';
          console.log(`   - ${task.name.padEnd(12)}: ${matching.length}${details}`);
        }
      }

      if (prefixHasUnknown) {
        anyRemainingOrUnknown = true;
        exitCode = 1;
        console.log('   - Total Remaining: UNKNOWN (Failed collection queries prevent clean verification)');
        console.log(`   ❌ CANNOT CONFIRM CLEANUP: 1 or more collection queries failed. Fixtures may remain undetected.\n`);
      } else if (prefixTotal > 0) {
        anyRemainingOrUnknown = true;
        exitCode = 1;
        console.log(`   - Total Remaining: ${prefixTotal}`);
        console.log(`   ⚠️ Leftover fixtures exist for ${prefix}.\n`);
      } else {
        console.log(`   - Total Remaining: 0`);
        console.log(`   ✅ Clean: ZERO remaining fixture documents for ${prefix}.\n`);
      }
    }

    if (hasQueryErrors) {
      console.error('FAIL-CLOSED: One or more collections could not be inspected due to query errors. Exiting non-zero.');
      exitCode = 1;
    }
    if (!indexVerificationPassed) {
      console.error('FAIL-CLOSED: pushreceipts index verification failed. Exiting non-zero.');
      exitCode = 1;
    }
  } catch (fatalErr) {
    console.error('Fatal inspection failure:', fatalErr.message);
    exitCode = 1;
  } finally {
    // 5. Always disconnect cleanly in finally block
    if (connectionAttempted && mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log('Database connection closed cleanly.');
      } catch (discErr) {
        console.error('Error disconnecting from database:', discErr.message);
        exitCode = 1;
      }
    }
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
}

// Direct CLI execution guard
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('inspectStagingFixtures.js') ||
   process.argv[1].endsWith('inspectStagingFixtures'));

if (isDirectExecution) {
  inspectFixtures().catch((err) => {
    console.error('Inspection failed:', err.message);
    process.exit(1);
  });
}

export { inspectFixtures };
