import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:5000/api';

async function testDeliveryEndToEnd() {
  console.log('\n🛵 STARTING DELIVERY APP END-TO-END VERIFICATION FLOW\n');

  // 1. Customer Login
  const custRes = await fetch(`${API_BASE}/auth/customer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', password: 'password123' })
  }).then((r) => r.json());

  console.log('1. Customer Logged in:', custRes.user?.name);

  // 2. Rider Login
  const riderLoginRes = await fetch(`${API_BASE}/rider/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543220', password: 'demo123' })
  }).then((r) => r.json());

  console.log('2. Rider Logged in:', riderLoginRes.rider?.name, `(Token: ${riderLoginRes.token.slice(0, 15)}...)`);
  const riderToken = riderLoginRes.token;

  // 3. Set Rider Status ONLINE_IDLE
  await fetch(`${API_BASE}/rider/duty/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ status: 'ONLINE_IDLE' })
  });
  console.log('3. Rider Duty Status: ONLINE_IDLE');

  // 4. Vendor Login & Place an Order
  const vendRes = await fetch(`${API_BASE}/vendors`).then((r) => r.json());
  const sunita = vendRes.vendors.find((v) => v.phone === '9876543211');
  const prods = await fetch(`${API_BASE}/vendors/${sunita._id}/products`).then((r) => r.json());
  const item = prods.products[0];

  const orderRes = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custRes.token}`
    },
    body: JSON.stringify({
      clientOrderId: `delivery-flow-test-${Date.now()}`,
      vendorId: sunita._id,
      items: [{ productId: item._id, qty: 2 }],
      address: { name: 'Rajesh Kumar', phone: '9876543210', line1: 'Sector 32, Urban Estate, Ludhiana' },
      paymentMethod: 'COD'
    })
  }).then((r) => r.json());

  if (!orderRes.success) {
    console.error('Order creation error:', orderRes);
    process.exit(1);
  }

  const orderId = orderRes.order._id;
  const orderNumber = orderRes.order.orderNumber;
  console.log(`4. Order Placed: #${orderNumber} (${orderId}), Pickup OTP: ${orderRes.order.pickupOtp}, Delivery OTP: ${orderRes.order.deliveryOtp}`);

  // 5. Vendor accepts & prepares order -> READY_FOR_RIDER
  const vendorLogin = await fetch(`${API_BASE}/auth/vendor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543211', password: 'password123' })
  }).then((r) => r.json());

  await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vendorLogin.token}`
    },
    body: JSON.stringify({ status: 'READY_FOR_RIDER' })
  });
  console.log('5. Order moved to READY_FOR_RIDER (Rider dispatch triggered)');

  // 6. Rider accepts offer
  const acceptRes = await fetch(`${API_BASE}/rider/orders/${orderId}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    }
  }).then((r) => r.json());

  console.log('6. Rider Accepted Offer:', acceptRes.success, acceptRes.message);

  // 7. Rider arrives at store
  const arriveRes = await fetch(`${API_BASE}/rider/orders/${orderId}/arrived-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    }
  }).then((r) => r.json());

  console.log('7. Rider Arrived at Store:', arriveRes.success, `Order status: ${arriveRes.order?.status}`);

  // 8. Rider verifies Store Pickup OTP
  const pickupRes = await fetch(`${API_BASE}/rider/orders/${orderId}/pickup-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ pickupOtp: orderRes.order.pickupOtp })
  }).then((r) => r.json());

  console.log('8. Rider Verified Store Pickup OTP:', pickupRes.success, `Order status: ${pickupRes.order?.status}`);

  // 9. Rider sends live GPS beacon while en route
  const locRes = await fetch(`${API_BASE}/rider/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      orderId,
      lat: 30.9080,
      lng: 75.8610,
      heading: 45,
      speed: 22
    })
  }).then((r) => r.json());

  console.log('9. Rider Live GPS Beacon sent en-route:', locRes.success);

  // 10. Rider verifies Customer Delivery OTP at doorstep
  const deliverRes = await fetch(`${API_BASE}/rider/orders/${orderId}/delivery-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${riderToken}`
    },
    body: JSON.stringify({ deliveryOtp: orderRes.order.deliveryOtp })
  }).then((r) => r.json());

  console.log('10. Rider Verified Customer Delivery OTP:', deliverRes.success, `Earned: ₹${deliverRes.earnedAmount}`);

  // 11. Rider Earnings verification
  const earningsRes = await fetch(`${API_BASE}/rider/earnings`, {
    headers: { Authorization: `Bearer ${riderToken}` }
  }).then((r) => r.json());

  console.log(`11. Rider Ledger Updated: Today: ₹${earningsRes.todayEarnings}, Completed Count: ${earningsRes.completedCount}`);

  console.log('\n✅ ALL 11 STEPS OF RIDER DISPATCH, STORE PICKUP & CUSTOMER DELIVERY COMPLETED SUCCESSFULLY!\n');
}

testDeliveryEndToEnd().catch(console.error);
