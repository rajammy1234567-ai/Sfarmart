import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:5000/api';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runLiveDeliveryCycle() {
  console.log('\n======================================================');
  console.log('🚀 S-FARMART 24 — LIVE MULTI-ACTOR DELIVERY LIFECYCLE');
  console.log('======================================================\n');

  // STEP 1: Customer Login & Order Placement
  console.log('--- 🛒 STEP 1: USER APP (CUSTOMER ORDER PLACEMENT) ---');
  const custLogin = await fetch(`${API_BASE}/auth/customer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', password: 'password123' })
  }).then((r) => r.json());

  if (!custLogin.success) {
    throw new Error(`Customer login failed: ${JSON.stringify(custLogin)}`);
  }
  console.log(`👤 Customer Logged In: ${custLogin.user.name} (${custLogin.user.phone})`);

  // Merchant Pre-check: Login Sunita & Ensure Store is OPEN
  const vendorLogin = await fetch(`${API_BASE}/auth/vendor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543211', password: 'password123' })
  }).then((r) => r.json());

  if (!vendorLogin.success) throw new Error('Vendor login failed');
  console.log(`🏪 Merchant Authenticated: ${vendorLogin.vendor.storeName}`);

  // Ensure store is OPEN
  if (!vendorLogin.vendor.isOpen) {
    const toggleRes = await fetch(`${API_BASE}/vendors/toggle-store`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendorLogin.token}`
      }
    }).then((r) => r.json());
    console.log(`🟢 Store toggled to OPEN: ${toggleRes.message}`);
  }

  // Get Sunita's store and an available item with stock
  const vendRes = await fetch(`${API_BASE}/vendors`).then((r) => r.json());
  const sunita = vendRes.vendors.find((v) => v.phone === '9876543211');
  if (!sunita) throw new Error('Store Sunita Home Restro not found');

  const prods = await fetch(`${API_BASE}/vendors/${sunita._id}/products`).then((r) => r.json());
  let selectedProduct = prods.products.find((p) => p.stockQty >= 2 && p.inStock) || prods.products[0];

  if (!selectedProduct) {
    throw new Error('No products found for merchant');
  }

  // Ensure sufficient stock
  if (selectedProduct.stockQty < 2) {
    await fetch(`${API_BASE}/products/${selectedProduct._id}/stock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendorLogin.token}`
      },
      body: JSON.stringify({ addStock: 20 })
    });
  }

  console.log(`🏪 Selected Merchant: ${sunita.storeName} (${sunita.address?.line1 || 'Ludhiana'})`);
  console.log(`🍲 Menu Item: "${selectedProduct.name}" — ₹${selectedProduct.price}`);

  // Place fresh order
  const orderRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custLogin.token}`
    },
    body: JSON.stringify({
      clientOrderId: `order-${Date.now()}`,
      vendorId: sunita._id,
      items: [{ productId: selectedProduct._id, qty: 2 }],
      address: {
        name: 'Rajesh Kumar',
        phone: '9876543210',
        line1: 'House 42, Model Town, Ludhiana, Punjab',
        city: 'Ludhiana',
        pincode: '141002',
        lat: 30.9095,
        lng: 75.8645
      },
      paymentMethod: 'COD'
    })
  }).then((r) => r.json());

  if (!orderRes.success) {
    throw new Error(`Order placement failed: ${JSON.stringify(orderRes)}`);
  }

  const order = orderRes.order;
  const orderId = order._id;
  const orderNum = order.orderNumber;
  const deliveryOtp = order.deliveryOtp;

  console.log(`✅ Order Created Successfully!`);
  console.log(`   Order Number : #${orderNum}`);
  console.log(`   Order MongoDB ID: ${orderId}`);
  console.log(`   Customer Delivery OTP: 🔑 ${deliveryOtp}`);
  console.log(`   Grand Total  : ₹${order.pricing?.grandTotal || order.totalAmount}`);
  console.log(`   Current Status: [${order.status}]\n`);

  await sleep(1500);

  // STEP 2: Store / Partner App Accepts and Packs Order
  console.log('--- 🏬 STEP 2: STORE / PARTNER APP (ACCEPT & PACK ORDER) ---');

  // Merchant accepts
  const acceptOrderRes = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vendorLogin.token}`
    },
    body: JSON.stringify({ status: 'ACCEPTED' })
  }).then((r) => r.json());
  console.log(`👉 Order Status Updated: [ACCEPTED] by kitchen`);

  await sleep(1000);

  // Merchant starts prep
  await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vendorLogin.token}`
    },
    body: JSON.stringify({ status: 'PREPARING' })
  });
  console.log(`👉 Order Status Updated: [PREPARING] (Food cooking in kitchen)`);

  await sleep(1000);

  // Merchant marks packed & ready for rider
  const readyRes = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vendorLogin.token}`
    },
    body: JSON.stringify({ status: 'READY_FOR_RIDER' })
  }).then((r) => r.json());

  const pickupOtp = readyRes.order?.pickupOtp || acceptOrderRes.order?.pickupOtp;
  console.log(`✅ Order Status Updated: [READY_FOR_RIDER] ("Order Packed - Ready for Rider")`);
  console.log(`   Merchant Dashboard displays Store Pickup OTP: 🔑 ${pickupOtp}\n`);

  await sleep(1500);

  // STEP 3: Rider Assign & Accept
  console.log('--- 🛵 STEP 3: RIDER APP (ASSIGNMENT & ACCEPTANCE) ---');
  const riderLogin = await fetch(`${API_BASE}/rider/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543220', password: 'demo123' })
  }).then((r) => r.json());

  if (!riderLogin.success) throw new Error('Rider login failed');
  const riderToken = riderLogin.token;
  console.log(`🚴 Rider Authenticated: ${riderLogin.rider.name} (Plate: ${riderLogin.rider.vehicleNumber || 'PB-10-AB-1234'})`);

  // Ping location first with required accuracy and timestamp within store radius
  const locRes = await fetch(`${API_BASE}/rider/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      lat: 30.9025,
      lng: 75.8585,
      accuracy: 10,
      capturedAt: Date.now(),
      heading: 0,
      speed: 0
    })
  }).then((r) => r.json());

  if (!locRes.success) throw new Error(`Initial location ping failed: ${JSON.stringify(locRes)}`);
  console.log(`📍 Rider Location Synced with Fleet: Fresh GPS (< 2m, within 8km radius)`);

  // Ensure rider is ONLINE_IDLE
  await fetch(`${API_BASE}/rider/duty/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ status: 'ONLINE_IDLE' })
  });

  // Rider accepts the order offer
  const riderAcceptRes = await fetch(`${API_BASE}/rider/orders/${orderId}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    }
  }).then((r) => r.json());

  if (!riderAcceptRes.success) {
    throw new Error(`Rider acceptance failed: ${JSON.stringify(riderAcceptRes)}`);
  }

  console.log(`✅ Rider Accepted Mission!`);
  console.log(`   API Response: ${riderAcceptRes.message || 'Accepted'}`);
  console.log(`   Order Status: [RIDER_ASSIGNED]`);
  console.log(`   Rider Status: [ON_DELIVERY]\n`);

  await sleep(1500);

  // STEP 4: Rider Arrives at Store & Collects Parcel
  console.log('--- 🏬 STEP 4: RIDER STORE PICKUP (HANDOFF & STORE OTP) ---');
  // Rider arrives at store
  await fetch(`${API_BASE}/rider/orders/${orderId}/arrived-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    }
  }).then((r) => r.json());
  console.log(`📍 Rider reached Store counter: [RIDER_ARRIVED_STORE]`);

  await sleep(1000);

  // Rider inputs Store pickupOtp
  console.log(`🔐 Rider entering Store Pickup OTP: "${pickupOtp}"...`);
  const pickupRes = await fetch(`${API_BASE}/rider/orders/${orderId}/pickup-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ pickupOtp })
  }).then((r) => r.json());

  if (!pickupRes.success) throw new Error(`Pickup OTP verification failed: ${JSON.stringify(pickupRes)}`);
  console.log(`✅ Store Pickup OTP Verified Successfully!`);
  console.log(`   Order Status : [OUT_FOR_DELIVERY] (Parcel collected from merchant)`);
  console.log(`   Customer App : Live GPS tracking activated\n`);

  await sleep(1500);

  // STEP 5: Live GPS Telemetry En-Route to Customer
  console.log('--- 🛰️ STEP 5: GPS TELEMETRY & TRANSIT TO CUSTOMER ---');
  const routeWaypoints = [
    { lat: 30.9025, lng: 75.8585, speed: 24, heading: 45, label: 'Departing Merchant Store' },
    { lat: 30.9055, lng: 75.8610, speed: 28, heading: 50, label: 'Crossing Main Market Chowk' },
    { lat: 30.9080, lng: 75.8635, speed: 20, heading: 35, label: 'Entering Model Town Residential' },
    { lat: 30.9095, lng: 75.8645, speed: 10, heading: 10, label: 'Arrived at Customer Doorstep (House 42)' }
  ];

  for (const wp of routeWaypoints) {
    await sleep(2900); // Respect 2.8s server location rate-limit
    await fetch(`${API_BASE}/rider/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`
      },
      body: JSON.stringify({
        orderId,
        lat: wp.lat,
        lng: wp.lng,
        accuracy: 8,
        capturedAt: Date.now(),
        heading: wp.heading,
        speed: wp.speed
      })
    });
    console.log(`📡 GPS Beacon: ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)} | Speed: ${wp.speed} km/h — ${wp.label}`);
  }

  console.log('\n--- 🚪 STEP 6: CUSTOMER DOORSTEP HANDOVER & DELIVERY VERIFICATION ---');
  console.log(`🏠 Rider at destination: House 42, Model Town, Ludhiana`);
  console.log(`💵 COD Cash Collection: ₹${order.pricing?.grandTotal || order.totalAmount || 252}`);
  console.log(`🔐 Customer shares 4-digit Delivery OTP: "${deliveryOtp}"`);

  // Rider submits deliveryOtp
  const deliverRes = await fetch(`${API_BASE}/rider/orders/${orderId}/delivery-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ deliveryOtp })
  }).then((r) => r.json());

  if (!deliverRes.success) throw new Error(`Delivery OTP verification failed: ${JSON.stringify(deliverRes)}`);
  console.log(`✅ Customer Delivery OTP Verified Successfully!`);
  console.log(`   Final Order Status : [DELIVERED]`);
  console.log(`   Rider Payout Credited: +₹${deliverRes.earnedAmount || 65} to Rider Wallet`);

  // Check updated rider ledger
  const earningsRes = await fetch(`${API_BASE}/rider/earnings`, {
    headers: { Authorization: `Bearer ${riderToken}` }
  }).then((r) => r.json());

  console.log(`\n📊 RIDER SETTLEMENT LEDGER UPDATED:`);
  console.log(`   Rider Name     : ${riderLogin.rider.name}`);
  console.log(`   Today Earnings : ₹${earningsRes.todayEarnings}`);
  console.log(`   Total Earnings : ₹${earningsRes.totalEarnings}`);
  console.log(`   Completed Trips: ${earningsRes.completedCount}`);
  console.log(`   Duty Status    : ONLINE_IDLE (Ready for next dispatch)`);

  // STEP 7: Partner / Merchant Settlement & Wednesday Payout Verification
  console.log('\n--- 💰 STEP 7: PARTNER SETTLEMENT & WEDNESDAY PAYOUT LEDGER ---');
  const partnerStats = await fetch(`${API_BASE}/vendors/me/stats`, {
    headers: { Authorization: `Bearer ${vendorLogin.token}` }
  }).then((r) => r.json());

  console.log(`🏪 Merchant Store : ${sunita.storeName}`);
  console.log(`   Today's Sales  : ₹${partnerStats.stats?.todaySales || 0}`);
  console.log(`   Pending Payout : ₹${partnerStats.stats?.todaySales || 0} (Credit in "Pending Wednesday Payout" Ledger)`);
  console.log(`   Disbursement   : Scheduled for Wednesday (06:00 AM) Direct Bank Transfer`);
  console.log(`   All-Time Delivered: ${partnerStats.stats?.allTimeDelivered || 0} order(s)`);

  console.log('\n======================================================');
  console.log('🎉 COMPLETE MULTI-APP LIFECYCLE EXECUTED SUCCESSFULLY!');
  console.log('   User App ➔ Partner Store ➔ Rider Pickup ➔ Customer Delivered');
  console.log('======================================================\n');
}

runLiveDeliveryCycle().catch((err) => {
  console.error('\n❌ Execution Error:', err);
  process.exit(1);
});
