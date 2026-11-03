import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  APPROVED_STAGING_HOST,
  APPROVED_PRODUCTION_DATABASE,
  validateProductionUri,
  sanitizeErrorMessage
} from '../config/db.js';
import { REQUIRED_SCHEMA, findMatchingIndex } from './provisionStagingDb.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

/**
 * GridFS Schema Definitions
 */
export const GRIDFS_SCHEMA = Object.freeze({
  'product_images.files': Object.freeze({
    indexes: Object.freeze([
      { keys: { filename: 1, uploadDate: 1 }, options: { name: 'filename_1_uploadDate_1' } }
    ])
  }),
  'product_images.chunks': Object.freeze({
    indexes: Object.freeze([
      { keys: { files_id: 1, n: 1 }, options: { unique: true, name: 'files_id_1_n_1' } }
    ])
  }),
  'shop_images.files': Object.freeze({
    indexes: Object.freeze([
      { keys: { filename: 1, uploadDate: 1 }, options: { name: 'filename_1_uploadDate_1' } }
    ])
  }),
  'shop_images.chunks': Object.freeze({
    indexes: Object.freeze([
      { keys: { files_id: 1, n: 1 }, options: { unique: true, name: 'files_id_1_n_1' } }
    ])
  })
});

/**
 * Admin portal collections (applications, jobapplications, contactinquiries)
 */
export const ADMIN_CONTENT_SCHEMA = Object.freeze({
  applications: Object.freeze({
    indexes: Object.freeze([])
  }),
  jobapplications: Object.freeze({
    indexes: Object.freeze([])
  }),
  contactinquiries: Object.freeze({
    indexes: Object.freeze([])
  })
});

/**
 * Full Production Schema (Core App + GridFS + Admin Content)
 */
export const FULL_PRODUCTION_SCHEMA = Object.freeze({
  ...REQUIRED_SCHEMA,
  ...GRIDFS_SCHEMA,
  ...ADMIN_CONTENT_SCHEMA
});

/**
 * Provision and verify collections and indexes on target database
 */
export async function provisionProductionDatabase(db) {
  const existingCollections = await db.listCollections().toArray();
  const existingColNames = new Set(existingCollections.map(c => c.name));

  const results = {
    collectionsCreated: [],
    collectionsExisting: [],
    indexesCreated: [],
    indexesExisting: [],
    repairedIndexes: []
  };

  // 1. Ensure all collections exist
  for (const colName of Object.keys(FULL_PRODUCTION_SCHEMA)) {
    if (!existingColNames.has(colName)) {
      await db.createCollection(colName);
      results.collectionsCreated.push(colName);
    } else {
      results.collectionsExisting.push(colName);
    }
  }

  // 2. Ensure all indexes exist, repairing affected target indexes if obsolete
  for (const [colName, { indexes }] of Object.entries(FULL_PRODUCTION_SCHEMA)) {
    const col = db.collection(colName);
    let existingIndexes = await col.indexes();

    for (const required of indexes) {
      // Targeted repair: if target users collection has obsolete sparse email_1 index
      if (colName === 'users' && required.options.name === 'email_1') {
        const existingEmailIdx = existingIndexes.find(i => i.name === 'email_1');
        if (existingEmailIdx) {
          const hasPfe = Boolean(existingEmailIdx.partialFilterExpression && existingEmailIdx.partialFilterExpression.email);
          if (!hasPfe || existingEmailIdx.sparse) {
            console.log('[REPAIR] Obsolete email_1 index found on target users collection. Cleaning blank emails and replacing index...');
            await col.updateMany({ email: { $in: ['', null] } }, { $unset: { email: '' } });
            await col.dropIndex('email_1');
            results.repairedIndexes.push('users.email_1');
            existingIndexes = await col.indexes();
          }
        }
      }

      const match = findMatchingIndex(existingIndexes, required);
      if (match.status === 'MATCH') {
        results.indexesExisting.push(`${colName}.${required.options.name || JSON.stringify(required.keys)}`);
        continue;
      }
      if (match.status === 'CONFLICT') {
        throw new Error(
          `FAIL-CLOSED: Conflicting index on "${colName}": ${match.reason}.`
        );
      }

      await col.createIndex(required.keys, required.options);
      results.indexesCreated.push(`${colName}.${required.options.name || JSON.stringify(required.keys)}`);
    }
  }

  return results;
}

/**
 * Helper to compute SHA256 of GridFS chunks
 */
export async function computeFileSha256(db, bucket, fileId) {
  const chunks = await db.collection(`${bucket}.chunks`).find({ files_id: fileId }).sort({ n: 1 }).toArray();
  if (!chunks || chunks.length === 0) return null;
  const buffers = chunks.map(c => c.data.buffer ? Buffer.from(c.data.buffer) : Buffer.from(c.data));
  const fileBuffer = Buffer.concat(buffers);
  return {
    sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
    length: fileBuffer.length
  };
}

/**
 * Migrate validated real business records from source to target
 * Safe & Idempotent: Uses findOne checks, preserves existing documents and exact ObjectIds.
 */
export async function migrateBusinessRecords(sourceDb, targetDb) {
  const migrationResults = {
    categories: { copied: 0, skipped: 0 },
    vendors: { copied: 0, skipped: 0 },
    products: { copied: 0, skipped: 0 },
    users: { copied: 0, skipped: 0 },
    applications: { copied: 0, skipped: 0 },
    jobapplications: { copied: 0, skipped: 0 },
    contactinquiries: { copied: 0, skipped: 0 },
    gridfsFiles: { copied: 0, skipped: 0 },
    gridfsChunks: { copied: 0, skipped: 0 }
  };

  // 1. Categories Migration (All 8 core categories)
  const sourceCats = await sourceDb.collection('categories').find({}).toArray();
  const targetCatCol = targetDb.collection('categories');
  for (const cat of sourceCats) {
    const existing = await targetCatCol.findOne({ _id: cat._id });
    if (!existing) {
      await targetCatCol.insertOne(cat);
      migrationResults.categories.copied++;
    } else {
      migrationResults.categories.skipped++;
    }
  }

  // 2. Krishna's Shop Migration (Vendor: 6ae461e7b53a14b178ef76c4)
  const krishnaId = new mongoose.Types.ObjectId('6ae461e7b53a14b178ef76c4');
  const sourceKrishna = await sourceDb.collection('vendors').findOne({ _id: krishnaId });
  const targetVendorCol = targetDb.collection('vendors');

  if (sourceKrishna) {
    const existing = await targetVendorCol.findOne({ _id: krishnaId });
    if (!existing) {
      const cleanDoc = { ...sourceKrishna, isStagingFixture: false, fixtureRunId: null };
      await targetVendorCol.insertOne(cleanDoc);
      migrationResults.vendors.copied++;
    } else {
      migrationResults.vendors.skipped++;
    }
  }

  // 3. Krishna's Products Migration
  const sourceProds = await sourceDb.collection('products').find({
    vendor: krishnaId
  }).toArray();
  const targetProdCol = targetDb.collection('products');

  for (const prod of sourceProds) {
    const existing = await targetProdCol.findOne({ _id: prod._id });
    if (!existing) {
      const cleanProd = { ...prod, isStagingFixture: false, fixtureRunId: null };
      await targetProdCol.insertOne(cleanProd);
      migrationResults.products.copied++;
    } else {
      migrationResults.products.skipped++;
    }
  }

  // 4. Users Migration (Customer accounts)
  const sourceUsers = await sourceDb.collection('users').find({}).toArray();
  const targetUserCol = targetDb.collection('users');

  // Verify non-empty email duplicates before insertion
  const emailCounts = new Map();
  for (const u of sourceUsers) {
    if (u.email && typeof u.email === 'string' && u.email.trim() !== '') {
      const normalized = u.email.trim().toLowerCase();
      emailCounts.set(normalized, (emailCounts.get(normalized) || 0) + 1);
    }
  }
  for (const [emailVal, count] of emailCounts.entries()) {
    if (count > 1) {
      throw new Error(`FAIL-CLOSED: Conflicting duplicate non-empty email "${emailVal}" found on ${count} source accounts. Will not overwrite or merge.`);
    }
  }

  for (const u of sourceUsers) {
    const existing = await targetUserCol.findOne({ _id: u._id });
    if (!existing) {
      const cleanUser = { ...u, isStagingFixture: false };
      // Treat blank/whitespace emails as absent (do not invent emails)
      if (typeof cleanUser.email === 'string' && cleanUser.email.trim() === '') {
        delete cleanUser.email;
      } else if (typeof cleanUser.email === 'string') {
        cleanUser.email = cleanUser.email.trim().toLowerCase();
      }
      await targetUserCol.insertOne(cleanUser);
      migrationResults.users.copied++;
    } else {
      // Clean up target doc if it was inserted with blank email in a previous partial attempt
      if (existing.email === '' || existing.email === null) {
        await targetUserCol.updateOne({ _id: u._id }, { $unset: { email: '' } });
      }
      migrationResults.users.skipped++;
    }
  }

  // 5. Partner Applications Migration (47)
  const sourceApps = await sourceDb.collection('applications').find({}).toArray();
  const targetAppCol = targetDb.collection('applications');
  for (const app of sourceApps) {
    const existing = await targetAppCol.findOne({ _id: app._id });
    if (!existing) {
      await targetAppCol.insertOne(app);
      migrationResults.applications.copied++;
    } else {
      migrationResults.applications.skipped++;
    }
  }

  // 6. Job Applications Migration (48)
  const sourceJobApps = await sourceDb.collection('jobapplications').find({}).toArray();
  const targetJobCol = targetDb.collection('jobapplications');
  for (const job of sourceJobApps) {
    const existing = await targetJobCol.findOne({ _id: job._id });
    if (!existing) {
      await targetJobCol.insertOne(job);
      migrationResults.jobapplications.copied++;
    } else {
      migrationResults.jobapplications.skipped++;
    }
  }

  // 7. Contact Inquiries Migration (14)
  const sourceInq = await sourceDb.collection('contactinquiries').find({}).toArray();
  const targetInqCol = targetDb.collection('contactinquiries');
  for (const inq of sourceInq) {
    const existing = await targetInqCol.findOne({ _id: inq._id });
    if (!existing) {
      await targetInqCol.insertOne(inq);
      migrationResults.contactinquiries.copied++;
    } else {
      migrationResults.contactinquiries.skipped++;
    }
  }

  // 8. GridFS Migration for Shop Cover Image
  if (sourceKrishna && sourceKrishna.banner) {
    const match = sourceKrishna.banner.match(/([a-f0-9]{24})/i);
    if (match) {
      const fileId = new mongoose.Types.ObjectId(match[1]);
      const sFile = await sourceDb.collection('shop_images.files').findOne({ _id: fileId });
      if (sFile) {
        const tFile = await targetDb.collection('shop_images.files').findOne({ _id: fileId });
        if (!tFile) {
          await targetDb.collection('shop_images.files').insertOne(sFile);
          migrationResults.gridfsFiles.copied++;

          const sChunks = await sourceDb.collection('shop_images.chunks').find({ files_id: fileId }).toArray();
          for (const chunk of sChunks) {
            await targetDb.collection('shop_images.chunks').replaceOne(
              { files_id: chunk.files_id, n: chunk.n },
              chunk,
              { upsert: true }
            );
            migrationResults.gridfsChunks.copied++;
          }
        } else {
          migrationResults.gridfsFiles.skipped++;
        }
      }
    }
  }

  // 9. GridFS Migration for Product Images
  for (const prod of sourceProds) {
    if (prod.image) {
      const match = prod.image.match(/([a-f0-9]{24})/i);
      if (match) {
        const fileId = new mongoose.Types.ObjectId(match[1]);
        const sFile = await sourceDb.collection('product_images.files').findOne({ _id: fileId });
        if (sFile) {
          const tFile = await targetDb.collection('product_images.files').findOne({ _id: fileId });
          if (!tFile) {
            await targetDb.collection('product_images.files').insertOne(sFile);
            migrationResults.gridfsFiles.copied++;

            const sChunks = await sourceDb.collection('product_images.chunks').find({ files_id: fileId }).toArray();
            for (const chunk of sChunks) {
              await targetDb.collection('product_images.chunks').replaceOne(
                { files_id: chunk.files_id, n: chunk.n },
                chunk,
                { upsert: true }
              );
              migrationResults.gridfsChunks.copied++;
            }
          } else {
            migrationResults.gridfsFiles.skipped++;
          }
        }
      }
    }
  }

  return migrationResults;
}

/**
 * Verify target data integrity, relational consistency, and GridFS image checksums
 */
export async function verifyTargetIntegrity(sourceDb, targetDb) {
  const verification = {
    collectionsChecked: 0,
    recordsVerified: {},
    relationalChecks: [],
    imageIntegrity: []
  };

  const collections = await targetDb.listCollections().toArray();
  const colMap = new Map(collections.map(c => [c.name, c]));

  for (const colName of Object.keys(FULL_PRODUCTION_SCHEMA)) {
    if (colMap.has(colName)) {
      verification.collectionsChecked++;
    }
  }

  // 1. Verify Vendor (Only Krishna's shop, demo vendors excluded)
  const krishnaId = new mongoose.Types.ObjectId('6ae461e7b53a14b178ef76c4');
  const vendor = await targetDb.collection('vendors').findOne({ _id: krishnaId });
  if (!vendor) {
    throw new Error('FAIL-CLOSED: Krishna\'s shop not found in target database after migration.');
  }
  const totalVendors = await targetDb.collection('vendors').countDocuments();
  if (totalVendors !== 1) {
    throw new Error(`FAIL-CLOSED: Expected exactly 1 vendor (Krishna's shop) in production, found ${totalVendors}.`);
  }
  verification.recordsVerified.vendor = { id: vendor._id.toString(), storeName: vendor.storeName, totalCount: totalVendors };

  // 2. Verify Categories (8 canonical)
  const catCount = await targetDb.collection('categories').countDocuments();
  if (catCount !== 8) {
    throw new Error(`FAIL-CLOSED: Expected 8 categories in target, found ${catCount}.`);
  }
  verification.recordsVerified.categories = catCount;

  // 3. Verify Product and Foreign Key Relationship (Only Krishna's product, demo products excluded)
  const totalProducts = await targetDb.collection('products').countDocuments();
  if (totalProducts !== 1) {
    throw new Error(`FAIL-CLOSED: Expected exactly 1 product in production, found ${totalProducts}.`);
  }
  const prod = await targetDb.collection('products').findOne({ vendor: krishnaId });
  if (!prod) {
    throw new Error('FAIL-CLOSED: Krishna\'s shop product not found in target database.');
  }
  // Relational check: Product vendor must match Vendor _id
  if (!prod.vendor.equals(vendor._id)) {
    throw new Error(`FAIL-CLOSED: Product vendor mismatch: ${prod.vendor} !== ${vendor._id}`);
  }
  // Relational check: Product category must exist in categories collection
  const categoryExists = await targetDb.collection('categories').findOne({ _id: new mongoose.Types.ObjectId(prod.category) });
  if (!categoryExists) {
    throw new Error(`FAIL-CLOSED: Product category foreign key broken: ${prod.category} not found.`);
  }
  verification.relationalChecks.push({ check: 'products.vendor -> vendors._id', status: 'VERIFIED' });
  verification.relationalChecks.push({ check: 'products.category -> categories._id', status: 'VERIFIED' });
  verification.recordsVerified.products = totalProducts;

  // 4. Verify Exclusion of Demo Fixtures (0 orders, 0 riders)
  const orderCount = await targetDb.collection('orders').countDocuments();
  if (orderCount !== 0) {
    throw new Error(`FAIL-CLOSED: Expected 0 orders in production (demo orders must be excluded), found ${orderCount}.`);
  }
  const riderCount = await targetDb.collection('riders').countDocuments();
  if (riderCount !== 0) {
    throw new Error(`FAIL-CLOSED: Expected 0 riders in production (demo riders must be excluded), found ${riderCount}.`);
  }
  verification.recordsVerified.demoOrdersExcluded = orderCount;
  verification.recordsVerified.demoRidersExcluded = riderCount;

  // 5. Verify Admin Applications / Jobs / Inquiries / Users
  const appCount = await targetDb.collection('applications').countDocuments();
  if (appCount !== 47) {
    throw new Error(`FAIL-CLOSED: Expected 47 partner applications, found ${appCount}.`);
  }
  const jobCount = await targetDb.collection('jobapplications').countDocuments();
  if (jobCount !== 48) {
    throw new Error(`FAIL-CLOSED: Expected 48 job applications, found ${jobCount}.`);
  }
  // Verify resumeName attachments preserved on job applications
  const sampleJobWithResume = await targetDb.collection('jobapplications').findOne({ resumeName: { $regex: /\.pdf$/i } });
  if (!sampleJobWithResume) {
    throw new Error('FAIL-CLOSED: Job CV resume attachment references missing in jobapplications.');
  }

  const inqCount = await targetDb.collection('contactinquiries').countDocuments();
  if (inqCount !== 14) {
    throw new Error(`FAIL-CLOSED: Expected 14 contact inquiries, found ${inqCount}.`);
  }
  const userCount = await targetDb.collection('users').countDocuments();
  if (userCount !== 21) {
    throw new Error(`FAIL-CLOSED: Expected 21 customer accounts, found ${userCount}.`);
  }

  // Verify no blank emails exist in target
  const blankEmails = await targetDb.collection('users').countDocuments({ email: '' });
  if (blankEmails !== 0) {
    throw new Error(`FAIL-CLOSED: Found ${blankEmails} users with blank email in target database.`);
  }

  // Verify valid non-empty email
  const validEmailUser = await targetDb.collection('users').findOne({ email: 'rajesh.kumar@example.com' });
  if (!validEmailUser) {
    throw new Error('FAIL-CLOSED: User with valid email "rajesh.kumar@example.com" not found in target database.');
  }

  // Verify target index specification on users.email_1
  const userIndexes = await targetDb.collection('users').indexes();
  const emailIdx = userIndexes.find(i => i.name === 'email_1');
  if (!emailIdx || !emailIdx.partialFilterExpression || !emailIdx.partialFilterExpression.email) {
    throw new Error('FAIL-CLOSED: email_1 index on target users is missing required partialFilterExpression.');
  }

  verification.recordsVerified.applications = appCount;
  verification.recordsVerified.jobapplications = { count: jobCount, cvAttachmentsVerified: true };
  verification.recordsVerified.contactinquiries = inqCount;
  verification.recordsVerified.users = { count: userCount, blankEmails: 0, partialIndexVerified: true };

  // 6. Verify GridFS Images bit-for-bit with Source DB
  for (const bucket of ['shop_images', 'product_images']) {
    const tFiles = await targetDb.collection(`${bucket}.files`).find({}).toArray();
    for (const f of tFiles) {
      const targetHash = await computeFileSha256(targetDb, bucket, f._id);
      if (!targetHash) {
        throw new Error(`FAIL-CLOSED: Target file ${f._id} in ${bucket} has 0 chunks.`);
      }

      if (sourceDb) {
        const sourceHash = await computeFileSha256(sourceDb, bucket, f._id);
        if (sourceHash && targetHash.sha256 !== sourceHash.sha256) {
          throw new Error(`FAIL-CLOSED: Checksum mismatch on ${bucket} file ${f._id}: target ${targetHash.sha256} !== source ${sourceHash.sha256}`);
        }
      }

      verification.imageIntegrity.push({
        bucket,
        fileId: f._id.toString(),
        filename: f.filename,
        length: targetHash.length,
        sha256: targetHash.sha256,
        valid: true
      });
    }
  }

  return verification;
}

/**
 * Main execution runner
 */
export async function runProductionMigration(targetUri) {
  const sourceUri = process.env.MONGODB_URI;
  if (!sourceUri) {
    throw new Error('FAIL-CLOSED: Source MONGODB_URI missing from server/.env.');
  }

  validateProductionUri(targetUri);

  console.log('[PASS] Production target URI validation passed.');
  console.log(`Connecting to target production database (${APPROVED_PRODUCTION_DATABASE})...`);

  // Target connection (farmart_production)
  const targetConn = await mongoose.createConnection(targetUri, {
    dbName: APPROVED_PRODUCTION_DATABASE
  }).asPromise();
  const targetDb = targetConn.db;

  console.log('[PASS] Connected to target database: "farmart_production".');

  // Source connection (read-only mode)
  console.log('Connecting to legacy source database (read-only)...');
  const sourceConn = await mongoose.createConnection(sourceUri, {
    autoIndex: false,
    autoCreate: false
  }).asPromise();
  const sourceDb = sourceConn.db;
  console.log(`[PASS] Connected to source database: "${sourceConn.name}" on host "${sourceConn.host}".`);

  try {
    // 1. Provision collections & indexes
    console.log('\n--- STEP 1: PROVISIONING TARGET COLLECTIONS & INDEXES ---');
    const provisionResults = await provisionProductionDatabase(targetDb);
    console.log(`Collections created: ${provisionResults.collectionsCreated.length}, existing: ${provisionResults.collectionsExisting.length}`);
    console.log(`Indexes created: ${provisionResults.indexesCreated.length}, existing: ${provisionResults.indexesExisting.length}`);
    if (provisionResults.repairedIndexes.length > 0) {
      console.log(`Indexes repaired: ${provisionResults.repairedIndexes.join(', ')}`);
    }

    // 2. Migrate business records
    console.log('\n--- STEP 2: MIGRATING REAL BUSINESS RECORDS ---');
    const migrationResults = await migrateBusinessRecords(sourceDb, targetDb);
    console.log('Migration summary:', JSON.stringify(migrationResults, null, 2));

    // 3. Verify target integrity
    console.log('\n--- STEP 3: VERIFYING TARGET INTEGRITY & IMAGE CHECKSUMS ---');
    const verification = await verifyTargetIntegrity(sourceDb, targetDb);
    console.log('Verification summary:', JSON.stringify(verification, null, 2));

    console.log('\n================================================');
    console.log('   MIGRATION PASS: ALL TARGET CHECKS VERIFIED   ');
    console.log('================================================');
    return {
      status: 'PASS',
      provisionResults,
      migrationResults,
      verification
    };
  } finally {
    await targetConn.close();
    await sourceConn.close();
  }
}

// Direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('migrateProductionData.js')) {
  const targetUri = process.env.PROD_SETUP_MONGO_URI;
  if (!targetUri) {
    console.error('[ERROR] PROD_SETUP_MONGO_URI not set in process environment.');
    process.exit(1);
  }

  runProductionMigration(targetUri)
    .then(res => {
      console.log('\nMigration completed successfully with status:', res.status);
      process.exit(0);
    })
    .catch(err => {
      console.error('\n[ERROR] Migration failed:', sanitizeErrorMessage(err.message));
      process.exit(1);
    });
}
