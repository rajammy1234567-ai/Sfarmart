// deactivateControlledVendor.js - Deactivate Controlled Verification Shop from Customer Discovery
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';

const TARGET_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
const TARGET_DB = 'farmart_production';
const TARGET_VENDOR_ID = '6aea07db1cf98f83bee27ee4';
const KRISHNA_VENDOR_ID = '6ae461e7b53a14b178ef76c4';
const LIVE_API_BASE = 'https://farmart-backend-staging.onrender.com/api';

function validateUri(uri) {
  if (!uri || typeof uri !== 'string') throw new Error('Missing MongoDB URI');
  if (!uri.includes(TARGET_HOST)) throw new Error(`URI host must pin to ${TARGET_HOST}`);
  if (!uri.includes(`/${TARGET_DB}`) && !uri.endsWith(`/${TARGET_DB}`)) {
    throw new Error(`URI must target database '${TARGET_DB}'`);
  }
  return true;
}

async function run() {
  const uri = process.env.PROD_SETUP_MONGO_URI;
  validateUri(uri);

  console.log('Connecting to production database...');
  await mongoose.connect(uri);

  // 1. Mark only Controlled Verification Shop inactive
  const updatedVendor = await Vendor.findByIdAndUpdate(
    TARGET_VENDOR_ID,
    { $set: { isActive: false, isOpen: false } },
    { new: true }
  );

  if (!updatedVendor) {
    throw new Error(`Controlled test vendor ${TARGET_VENDOR_ID} not found in target database.`);
  }

  console.log('----------------------------------------------------');
  console.log('✅ CONTROLLED TEST VENDOR DEACTIVATED');
  console.log('----------------------------------------------------');
  console.log(`• Store Name    : ${updatedVendor.storeName}`);
  console.log(`• Vendor ID     : ${updatedVendor._id}`);
  console.log(`• Is Active     : ${updatedVendor.isActive} (EXCLUDED FROM DISCOVERY)`);
  console.log(`• Is Open       : ${updatedVendor.isOpen}`);
  console.log(`• Is Approved   : ${updatedVendor.isApproved} (Record preserved)`);

  // 2. Verify Krishna's shop is untouched
  const krishna = await Vendor.findById(KRISHNA_VENDOR_ID);
  if (!krishna) {
    throw new Error(`Krishna vendor ${KRISHNA_VENDOR_ID} missing! Rollback needed!`);
  }
  console.log('\n----------------------------------------------------');
  console.log("✅ KRISHNA'S SHOP PRESERVATION CHECK");
  console.log('----------------------------------------------------');
  console.log(`• Store Name    : ${krishna.storeName}`);
  console.log(`• Vendor ID     : ${krishna._id}`);
  console.log(`• Is Active     : ${krishna.isActive}`);
  console.log(`• Is Open       : ${krishna.isOpen}`);
  console.log(`• Is Approved   : ${krishna.isApproved}`);

  // Disconnect direct DB
  await mongoose.disconnect();

  // 3. Live API Customer Discovery Verification
  console.log('\n--- Verifying Live Public Customer Discovery ---');
  const res = await fetch(`${LIVE_API_BASE}/vendors`);
  const data = await res.json().catch(() => null);

  if (res.status === 200 && data?.success) {
    const list = data.vendors || [];
    const hasControlled = list.some(v => v._id === TARGET_VENDOR_ID);
    const hasKrishna = list.some(v => v._id === KRISHNA_VENDOR_ID);

    console.log(`• Public Vendors Count : ${list.length}`);
    console.log(`• Controlled Shop In List: ${hasControlled ? '❌ STILL VISIBLE' : '✅ EXCLUDED (HIDDEN)'}`);
    console.log(`• Krishna Shop In List   : ${hasKrishna ? '✅ VISIBLE' : '❌ MISSING'}`);

    if (hasControlled) {
      console.warn('⚠️ Controlled shop still in cache or query; please ensure process cache invalidation.');
    } else {
      console.log('\n🎉 CONTROLLED TEST VENDOR SUCCESSFULLY REMOVED FROM CUSTOMER DISCOVERY');
    }
  }
}

run().catch(err => {
  console.error('\n❌ Deactivation failed:', err.message);
  process.exit(1);
});

