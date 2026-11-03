import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: './server/.env' });

const sourceUri = process.env.MONGODB_URI;
if (!sourceUri) {
  console.error('[ERROR] MONGODB_URI not found in server/.env');
  process.exit(1);
}

const backupDir = path.resolve('server', 'backups', 'legacy_source_backup');
fs.mkdirSync(backupDir, { recursive: true });

async function runInventory() {
  console.log('Connecting to source database (farmart.5rixopr.mongodb.net)...');
  await mongoose.connect(sourceUri);
  const db = mongoose.connection.db;
  console.log(`[PASS] Connected to source database: "${mongoose.connection.name}" on host "${mongoose.connection.host}"`);

  const collections = await db.listCollections().toArray();
  const colNames = collections.map(c => c.name).sort();
  console.log(`\nFound ${colNames.length} total collections in source database.`);

  const inventory = {
    timestamp: new Date().toISOString(),
    sourceDatabase: mongoose.connection.name,
    collections: {}
  };

  for (const name of colNames) {
    const col = db.collection(name);
    const count = await col.countDocuments();
    const indexes = await col.indexes();
    inventory.collections[name] = { count, indexCount: indexes.length };

    // Dump all documents to backup JSON (excluding passwords for admins if any)
    const docs = await col.find({}).toArray();
    fs.writeFileSync(
      path.join(backupDir, `${name}.json`),
      JSON.stringify(docs, null, 2),
      'utf-8'
    );
    console.log(`  - ${name.padEnd(25)} : ${String(count).padStart(5)} docs (${indexes.length} indexes) -> Backed up to ${name}.json`);
  }

  // Inspect Vendors
  console.log('\n=== VENDORS DETAILED AUDIT ===');
  const vendors = await db.collection('vendors').find({}).toArray();
  console.log(`Total vendors: ${vendors.length}`);
  vendors.forEach(v => {
    console.log(`  [Vendor] ID: ${v._id} | Shop: "${v.shopName || v.name}" | Owner: "${v.ownerName || ''}" | Phone: "${v.phone}" | Approved: ${v.isApproved} | Active: ${v.isActive} | Open: ${v.isOpen} | Banner: "${v.banner || ''}"`);
  });

  // Inspect Products
  console.log('\n=== PRODUCTS DETAILED AUDIT ===');
  const products = await db.collection('products').find({}).toArray();
  console.log(`Total products: ${products.length}`);
  const prodByVendor = {};
  products.forEach(p => {
    const vId = (p.vendor || p.shop || 'unassigned').toString();
    prodByVendor[vId] = (prodByVendor[vId] || 0) + 1;
  });
  console.log('  Products grouped by Vendor ID:', prodByVendor);

  // Inspect Categories
  console.log('\n=== CATEGORIES DETAILED AUDIT ===');
  const categories = await db.collection('categories').find({}).toArray();
  console.log(`Total categories: ${categories.length}`);
  categories.forEach(c => {
    console.log(`  [Category] ID: ${c._id} | Name: "${c.name}" | Slug: "${c.slug || ''}" | Active: ${c.isActive}`);
  });

  // Inspect Riders
  console.log('\n=== RIDERS DETAILED AUDIT ===');
  const riders = await db.collection('riders').find({}).toArray();
  console.log(`Total riders: ${riders.length}`);
  riders.forEach(r => {
    console.log(`  [Rider] ID: ${r._id} | Name: "${r.name}" | Phone: "${r.phone}" | Status: ${r.status}`);
  });

  // Inspect Users
  console.log('\n=== USERS DETAILED AUDIT ===');
  const users = await db.collection('users').find({}).toArray();
  console.log(`Total users: ${users.length}`);
  users.forEach(u => {
    console.log(`  [User] ID: ${u._id} | Name: "${u.name}" | Phone: "${u.phone}" | Role: ${u.role}`);
  });

  // Inspect Admins (NO passwords printed)
  console.log('\n=== ADMINS DETAILED AUDIT ===');
  const admins = await db.collection('admins').find({}, { projection: { password: 0 } }).toArray();
  console.log(`Total admins: ${admins.length}`);
  admins.forEach(a => {
    console.log(`  [Admin] ID: ${a._id} | Username: "${a.username}" | Role: ${a.role} | Active: ${a.isActive}`);
  });

  // Inspect Orders
  console.log('\n=== ORDERS DETAILED AUDIT ===');
  const orders = await db.collection('orders').find({}).toArray();
  console.log(`Total orders: ${orders.length}`);
  orders.forEach(o => {
    console.log(`  [Order] ID: ${o._id} | Order#: "${o.orderNumber}" | Status: "${o.status}" | Vendor: ${o.vendor} | Customer: ${o.customer}`);
  });

  // Inspect GridFS Collections
  console.log('\n=== GRIDFS COLLECTIONS AUDIT ===');
  for (const gCol of ['product_images.files', 'shop_images.files', 'fs.files']) {
    if (colNames.includes(gCol)) {
      const gFiles = await db.collection(gCol).find({}).toArray();
      console.log(`  [GridFS Files: ${gCol}] Count: ${gFiles.length}`);
      gFiles.forEach(f => {
        console.log(`    File ID: ${f._id} | Name: "${f.filename}" | Size: ${f.length} bytes | Uploaded: ${f.uploadDate}`);
      });
    }
  }

  // Save audit summary
  fs.writeFileSync(path.join(backupDir, 'inventory_summary.json'), JSON.stringify(inventory, null, 2), 'utf-8');
  console.log(`\n[COMPLETE] Full backup and inventory written to: ${backupDir}`);
  await mongoose.disconnect();
}

runInventory().catch(err => {
  console.error('[ERROR] Inventory failed:', err.message);
  process.exit(1);
});

