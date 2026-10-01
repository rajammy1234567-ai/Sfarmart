import io from 'socket.io-client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const results = [];

function recordTest(name, passed, details = '') {
  results.push({ name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon}: ${name} ${details ? `(${details})` : ''}`);
}

async function runTests() {
  console.log('\n=========================================');
  console.log('🌾 FARMART PRODUCTION ACCEPTANCE TEST SUITE');
  console.log('=========================================\n');

  try {
    // 1. Categories API
    const catRes = await fetch(`${API_BASE}/categories`).then((r) => r.json());
    recordTest(
      'TC-01: Category Listing API returns exactly 8 seeded categories',
      catRes.success && catRes.count === 8,
      `Found ${catRes.count} categories`
    );

    // 2. Vendors API
    const vendRes = await fetch(`${API_BASE}/vendors`).then((r) => r.json());
    recordTest(
      'TC-02: Vendor Listing API returns 3 active vendors',
      vendRes.success && vendRes.count >= 3,
      `Found ${vendRes.count} vendors: ${vendRes.vendors?.map((v) => v.storeName).join(', ')}`
    );

    const sunita = vendRes.vendors.find((v) => v.phone === '9876543211');
    const sukhwinder = vendRes.vendors.find((v) => v.phone === '9876543212');

    // 3. Customer Authentication
    const custLogin = await fetch(`${API_BASE}/auth/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', password: 'password123' })
    }).then((r) => r.json());

    recordTest(
      'TC-03: Customer Login (Rajesh Kumar: 9876543210)',
      custLogin.success && !!custLogin.token,
      `Token generated, customer: ${custLogin.user?.name}`
    );

    // 4. Vendor Authentication
    const vendLogin = await fetch(`${API_BASE}/auth/vendor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543211', password: 'password123' })
    }).then((r) => r.json());

    recordTest(
      'TC-04: Vendor Login (Sunita Home Restro: 9876543211)',
      vendLogin.success && !!vendLogin.token,
      `Token generated, vendor: ${vendLogin.vendor?.storeName}`
    );

    // 5. Vendor Products Listing
    const sunitaProds = await fetch(`${API_BASE}/vendors/${sunita._id}/products`).then((r) =>
      r.json()
    );
    const sukhwinderProds = await fetch(`${API_BASE}/vendors/${sukhwinder._id}/products`).then(
      (r) => r.json()
    );

    recordTest(
      'TC-05: Vendor Catalog separation',
      sunitaProds.count > 0 && sukhwinderProds.count > 0,
      `Sunita: ${sunitaProds.count} items, Sukhwinder: ${sukhwinderProds.count} items`
    );

    const sunitaItem = sunitaProds.products.find(p => p.price >= 60 && p.stockQty >= 5) || sunitaProds.products.find(p => p.stockQty >= 5) || sunitaProds.products[0];
    const sukhwinderItem = sukhwinderProds.products[0];

    // 6. 🔴 STRICT RULE: Single-Vendor Cart Enforcement on Server
    const multiVendorRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custLogin.token}`
      },
      body: JSON.stringify({
        items: [
          { productId: sunitaItem._id, qty: 1 },
          { productId: sukhwinderItem._id, qty: 1 }
        ],
        address: { name: 'Rajesh', phone: '9876543210', line1: 'Model Town' }
      })
    });
    const multiVendorData = await multiVendorRes.json();

    recordTest(
      'TC-06: 🔴 Server Rejects Multi-Vendor Cart with HTTP 400 (MULTI_VENDOR_CART)',
      multiVendorRes.status === 400 && multiVendorData.code === 'MULTI_VENDOR_CART',
      `HTTP ${multiVendorRes.status}: ${multiVendorData.message}`
    );

    // 7. Check Minimum Order Value Rejection
    const minOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custLogin.token}`
      },
      body: JSON.stringify({
        items: [{ productId: sunitaItem._id, qty: 0.1 }], // very low amount
        address: { name: 'Rajesh', phone: '9876543210', line1: 'Model Town' }
      })
    });
    const minOrderData = await minOrderRes.json();
    recordTest(
      'TC-07: Minimum Order Value constraint enforcement',
      minOrderRes.status === 400,
      `Code: ${minOrderData.code || 'REJECTED'}`
    );

    // 8. 🔴 Real-Time Socket Connection & Notification Verification
    let socketReceivedOrder = null;
    const vendorSocket = io(SOCKET_URL, {
      auth: { token: vendLogin.token },
      transports: ['websocket']
    });

    await new Promise((resolve) => {
      vendorSocket.on('connect', () => {
        vendorSocket.emit('join:vendor', sunita._id);
        resolve();
      });
    });

    vendorSocket.on('order:new', (orderData) => {
      socketReceivedOrder = orderData;
    });

    // 9. Valid Single-Vendor Order Creation & Stock Lock
    const initialStock = sunitaItem.stockQty;
    const orderQty = 2;

    const validOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custLogin.token}`
      },
      body: JSON.stringify({
        clientOrderId: `test-ord-${Date.now()}`,
        vendorId: sunita._id,
        items: [{ productId: sunitaItem._id, qty: orderQty }],
        address: { name: 'Rajesh Kumar', phone: '9876543210', line1: 'Flat 302, Green Avenue' },
        paymentMethod: 'COD'
      })
    });
    const validOrderData = await validOrderRes.json();
    if (!validOrderData.success) {
      console.error('validOrderRes status:', validOrderRes.status, 'body:', validOrderData);
    }
    const createdOrder = validOrderData.order;

    recordTest(
      'TC-08: Valid Single-Vendor Order Creation (HTTP 201)',
      validOrderRes.status === 201 && validOrderData.success,
      `Order #${createdOrder?.orderNumber}, Grand Total: ₹${createdOrder?.pricing?.grandTotal}`
    );

    // Check Atomic Stock Decrement
    const updatedSunitaProd = await fetch(`${API_BASE}/products/${sunitaItem._id}`).then((r) =>
      r.json()
    );
    const newStock = updatedSunitaProd.product.stockQty;

    recordTest(
      'TC-09: Atomic Stock Decrement ($inc: -qty)',
      newStock === initialStock - orderQty,
      `Initial: ${initialStock}, Ordered: ${orderQty}, Remaining: ${newStock}`
    );

    // Wait a moment for socket delivery
    await new Promise((r) => setTimeout(r, 600));

    recordTest(
      'TC-10: 🔴 Real-time Socket Event (order:new) received by Vendor in < 1 sec',
      socketReceivedOrder !== null && socketReceivedOrder.orderNumber === createdOrder.orderNumber,
      socketReceivedOrder ? `Received order: #${socketReceivedOrder.orderNumber}` : 'Socket timeout'
    );

    vendorSocket.disconnect();

    // 10. Order State Machine Transition: NEW_ORDER -> ACCEPTED -> PREPARING -> READY_FOR_RIDER -> DELIVERED
    const acceptRes = await fetch(`${API_BASE}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ status: 'ACCEPTED' })
    }).then((r) => r.json());

    const prepRes = await fetch(`${API_BASE}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ status: 'PREPARING' })
    }).then((r) => r.json());

    const readyRes = await fetch(`${API_BASE}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ status: 'READY_FOR_RIDER' })
    }).then((r) => r.json());

    const deliverRes = await fetch(`${API_BASE}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ status: 'DELIVERED' })
    }).then((r) => r.json());

    recordTest(
      'TC-11: Order State Machine Transitions (NEW -> ACCEPTED -> PREP -> READY -> DELIVERED)',
      acceptRes.order?.status === 'ACCEPTED' &&
        prepRes.order?.status === 'PREPARING' &&
        readyRes.order?.status === 'READY_FOR_RIDER' &&
        deliverRes.order?.status === 'DELIVERED',
      `Final status: ${deliverRes.order?.status}`
    );

    // 11. Stock Rollback on Order Rejection
    const rollItem = sunitaItem;
    const freshRollItem = (await fetch(`${API_BASE}/products/${rollItem._id}`).then((r) => r.json())).product;
    const stockBefore = freshRollItem.stockQty;

    const rejectOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custLogin.token}`
      },
      body: JSON.stringify({
        vendorId: sunita._id,
        items: [{ productId: rollItem._id, qty: 2 }],
        address: { name: 'Rajesh', phone: '9876543210', line1: 'Model Town' }
      })
    });
    const rejectTestOrder = await rejectOrderRes.json();
    if (!rejectTestOrder.success) {
      console.error('rejectTestOrder failed:', rejectTestOrder);
    }

    // Stock should be deducted
    const stockDuring = (await fetch(`${API_BASE}/products/${rollItem._id}`).then((r) => r.json()))
      .product.stockQty;

    // Reject order
    await fetch(`${API_BASE}/orders/${rejectTestOrder.order._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Kitchen closed' })
    });

    const stockAfterReject = (
      await fetch(`${API_BASE}/products/${rollItem._id}`).then((r) => r.json())
    ).product.stockQty;

    recordTest(
      'TC-12: Stock Rollback on Rejection ($inc: +qty)',
      stockDuring === stockBefore - 2 && stockAfterReject === stockBefore,
      `Before: ${stockBefore}, During: ${stockDuring}, Rolled-back: ${stockAfterReject}`
    );

    // 12. Vendor Store Toggle
    const toggleOff = await fetch(`${API_BASE}/vendors/toggle-store`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ isOpen: false })
    }).then((r) => r.json());

    // Ordering from closed store must be rejected
    const closedOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custLogin.token}`
      },
      body: JSON.stringify({
        vendorId: sunita._id,
        items: [{ productId: sunitaItem._id, qty: 2 }],
        address: { name: 'Rajesh', phone: '9876543210', line1: 'Model Town' }
      })
    });
    const closedOrderData = await closedOrderRes.json();

    // Toggle store back on
    await fetch(`${API_BASE}/vendors/toggle-store`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({ isOpen: true })
    });

    recordTest(
      'TC-13: Vendor Closed Store Rejection (VENDOR_CLOSED)',
      closedOrderRes.status === 400 && closedOrderData.code === 'VENDOR_CLOSED',
      `Closed response code: ${closedOrderData.code}`
    );

    // 13. Vendor Stats Calculation
    const statsRes = await fetch(`${API_BASE}/vendors/me/stats`, {
      headers: { Authorization: `Bearer ${vendLogin.token}` }
    }).then((r) => r.json());

    recordTest(
      'TC-14: Vendor Dashboard Stats Computation',
      statsRes.success && statsRes.stats?.todayOrdersCount > 0,
      `Today Orders: ${statsRes.stats?.todayOrdersCount}, Delivered Revenue: ₹${statsRes.stats?.todaySales}`
    );

    // 14. Vendor Add / Delete Product in MongoDB
    const newProdRes = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vendLogin.token}`
      },
      body: JSON.stringify({
        name: `Test Fresh Item ${Date.now()}`,
        price: 150,
        unit: '1 kg',
        stockQty: 20,
        category: 'home-thali'
      })
    }).then((r) => r.json());

    const createdProdId = newProdRes.product?._id;

    const delRes = await fetch(`${API_BASE}/products/${createdProdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vendLogin.token}` }
    }).then((r) => r.json());

    recordTest(
      'TC-15: Vendor Catalog Management (Add & Delete Product)',
      newProdRes.success && delRes.success,
      `Created: ${newProdRes.product?.name}, Deleted: ${delRes.deletedProductId}`
    );

    // 15. Rider Dual-Token Authentication
    const riderLoginRes = await fetch(`${API_BASE}/rider/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543220', password: 'demo123' })
    }).then((r) => r.json());

    recordTest(
      'TC-16: Rider Dual-Token Login (Gurmukh Singh: 9876543220)',
      riderLoginRes.success && !!riderLoginRes.token && !!riderLoginRes.refreshToken,
      `Rider: ${riderLoginRes.rider?.name}, Plate: ${riderLoginRes.rider?.vehicleNumber || riderLoginRes.rider?.vehicle?.plateNumber}`
    );

    // 16. Rider Refresh Token Rotation
    const riderRefreshRes = await fetch(`${API_BASE}/rider/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: riderLoginRes.refreshToken })
    }).then((r) => r.json());

    recordTest(
      'TC-17: Rider Token Rotation & Refresh Endpoint',
      riderRefreshRes.success && !!riderRefreshRes.token && !!riderRefreshRes.refreshToken,
      `New Token issued, session valid`
    );

    const activeRiderToken = riderRefreshRes.token || riderLoginRes.token;

    // 17. Rider Duty Status Toggle (ONLINE_IDLE)
    const dutyRes = await fetch(`${API_BASE}/rider/duty/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeRiderToken}`
      },
      body: JSON.stringify({ status: 'ONLINE_IDLE' })
    }).then((r) => r.json());

    recordTest(
      'TC-18: Rider Duty Status Switch (ONLINE_IDLE)',
      dutyRes.success && dutyRes.rider?.status === 'ONLINE_IDLE',
      `Duty status: ${dutyRes.rider?.status}`
    );

    // 18. Rider Rate-Limited Location Beacon
    const locRes = await fetch(`${API_BASE}/rider/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeRiderToken}`
      },
      body: JSON.stringify({ lat: 30.9010, lng: 75.8573, heading: 90, speed: 18 })
    }).then((r) => r.json());

    recordTest(
      'TC-19: Rider Live Location Telemetry Beacon',
      locRes.success,
      `Location registered: 30.9010, 75.8573`
    );

    // 19. Rider Earnings Ledger Endpoint
    const earningsRes = await fetch(`${API_BASE}/rider/earnings`, {
      headers: { Authorization: `Bearer ${activeRiderToken}` }
    }).then((r) => r.json());

    recordTest(
      'TC-20: Rider Earnings & Settlement Ledger',
      earningsRes.success && typeof earningsRes.todayEarnings === 'number',
      `Today: ₹${earningsRes.todayEarnings}, Total: ₹${earningsRes.totalEarnings}`
    );

    console.log('\n=========================================');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
    console.log('=========================================\n');

    return { total: results.length, passed: passedCount, failed: results.length - passedCount };
  } catch (err) {
    console.error('Fatal test error:', err);
    throw err;
  }
}

runTests().then((res) => {
  if (res.failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
