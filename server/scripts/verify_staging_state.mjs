import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('server/.env') });
dotenv.config({ path: path.resolve('.env') });

const APPROVED_STAGING_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
const APPROVED_DATABASE = 'farmart_test_disposable';
const RUN_PREFIX = 'STAGE_FIXTURE_E2E_1791019779048';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.STAGING_MONGO_URI;
  if (!uri) {
    console.error('No MONGODB_URI found.');
    process.exit(1);
  }

  const parsed = new URL(uri);
  if (parsed.hostname.toLowerCase() !== APPROVED_STAGING_HOST) {
    console.error(`Host mismatch: expected ${APPROVED_STAGING_HOST}, got ${parsed.hostname}`);
    process.exit(1);
  }

  console.log(`Connecting read-only to staging database: ${APPROVED_DATABASE}...`);
  await mongoose.connect(uri, {
    dbName: APPROVED_DATABASE,
    autoIndex: false,
    autoCreate: false
  });

  const db = mongoose.connection.db;

  // 1. List collections
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map((c) => c.name);
  console.log('\n--- Existing Collections ---');
  console.log(collectionNames.join(', '));

  const hasPushReceipts = collectionNames.includes('pushreceipts');
  console.log(`\npushreceipts collection exists: ${hasPushReceipts}`);

  if (hasPushReceipts) {
    try {
      const indexes = await db.collection('pushreceipts').indexes();
      console.log('\n--- pushreceipts Indexes ---');
      console.log(JSON.stringify(indexes, null, 2));
    } catch (idxErr) {
      console.log(`Could not retrieve indexes for pushreceipts: ${idxErr.message}`);
    }
  }

  // Check privileges / permissions on pushreceipts by attempting find
  console.log('\n--- Testing Read-Only Query Privileges on pushreceipts ---');
  try {
    const count = await db.collection('pushreceipts').countDocuments({});
    console.log(`Successfully queried pushreceipts. Document count: ${count}`);
  } catch (err) {
    console.log(`Failed to query pushreceipts: ${err.message} (Code: ${err.code}, CodeName: ${err.codeName})`);
  }

  // 2. Check for leftover fixtures from run prefix
  console.log(`\n--- Leftover Fixtures for Prefix: ${RUN_PREFIX} ---`);
  const checkCollections = ['users', 'riders', 'vendors', 'orders', 'pushreceipts', 'categories', 'products'];
  let totalRemaining = 0;
  const remainingDetails = {};

  for (const colName of checkCollections) {
    if (!collectionNames.includes(colName)) continue;
    const col = db.collection(colName);
    let docs = [];
    try {
      if (colName === 'users') {
        docs = await col.find({
          $or: [
            { name: { $regex: RUN_PREFIX } },
            { fixtureRunId: RUN_PREFIX },
            { 'expoPushTokens.token': { $regex: RUN_PREFIX } }
          ]
        }).toArray();
      } else if (colName === 'pushreceipts') {
        docs = await col.find({
          $or: [
            { ticketId: { $regex: RUN_PREFIX } },
            { token: { $regex: RUN_PREFIX } }
          ]
        }).toArray();
      } else {
        docs = await col.find({
          $or: [
            { name: { $regex: RUN_PREFIX } },
            { orderNumber: { $regex: RUN_PREFIX } },
            { clientOrderId: { $regex: RUN_PREFIX } }
          ]
        }).toArray();
      }
    } catch (err) {
      console.log(`Could not query ${colName}: ${err.message}`);
      continue;
    }

    if (docs.length > 0) {
      remainingDetails[colName] = docs.map((d) => ({
        _id: d._id?.toString(),
        name: d.name,
        ticketId: d.ticketId,
        orderNumber: d.orderNumber
      }));
      totalRemaining += docs.length;
    }
    console.log(`Collection "${colName}": ${docs.length} remaining fixtures.`);
  }

  console.log(`\nTotal remaining fixtures for ${RUN_PREFIX}: ${totalRemaining}`);
  if (totalRemaining > 0) {
    console.log('Details:', JSON.stringify(remainingDetails, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
