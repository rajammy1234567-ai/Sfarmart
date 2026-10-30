import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import Order from '../models/Order.js';
import Application from '../models/Application.js';
import { registerVendor, vendorLogin } from '../controllers/authController.js';
import { getAdminData, updateApplicationStatus } from '../controllers/adminController.js';
import { getAllVendors } from '../controllers/vendorController.js';
import { getActiveDeliveryOrder } from '../controllers/riderController.js';
import { storePoint, canAccessOrder } from '../utils/deliveryPolicy.js';

// Mock response helper
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('1. registerVendor rejects missing or invalid ownerName', async () => {
  const req = { body: { ownerName: 'A' } };
  const res = createMockRes();
  await registerVendor(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_OWNER_NAME');
});

test('2. registerVendor normalizes Indian phone numbers and rejects malformed phones', async () => {
  // Test invalid phone
  const req1 = { body: { ownerName: 'Rajesh Kumar', phone: '12345' } };
  const res1 = createMockRes();
  await registerVendor(req1, res1);
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.code, 'INVALID_PHONE');

  // Test non-Indian phone (starts with 1)
  const req2 = { body: { ownerName: 'Rajesh Kumar', phone: '1234567890' } };
  const res2 = createMockRes();
  await registerVendor(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.code, 'INVALID_PHONE');
});

test('3. registerVendor rejects short password (< 6 chars)', async () => {
  const req = { body: { ownerName: 'Rajesh Kumar', phone: '9876543210', password: '123' } };
  const res = createMockRes();
  await registerVendor(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_PASSWORD');
});

test('4. registerVendor rejects unlisted store types', async () => {
  const req = {
    body: {
      ownerName: 'Rajesh Kumar',
      phone: '9876543210',
      password: 'password123',
      storeName: 'Kumar Superstore',
      storeType: 'ILLEGAL_TYPE'
    }
  };
  const res = createMockRes();
  await registerVendor(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_STORE_TYPE');
});

test('5. registerVendor rejects missing address line1 or invalid pincode', async () => {
  const req = {
    body: {
      ownerName: 'Rajesh Kumar',
      phone: '9876543210',
      password: 'password123',
      storeName: 'Kumar Superstore',
      storeType: 'KIRANA',
      address: { line1: '', pincode: '123' }
    }
  };
  const res = createMockRes();
  await registerVendor(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_ADDRESS_LINE');

  const req2 = {
    body: {
      ownerName: 'Rajesh Kumar',
      phone: '9876543210',
      password: 'password123',
      storeName: 'Kumar Superstore',
      storeType: 'KIRANA',
      address: { line1: 'Shop #42, Main Bazaar', pincode: 'abc' }
    }
  };
  const res2 = createMockRes();
  await registerVendor(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.code, 'INVALID_PINCODE');
});

test('6. registerVendor validates coordinate ranges and permits legitimate zero coordinates', async () => {
  // Out of range latitude > 90
  const req1 = {
    body: {
      ownerName: 'Rajesh Kumar',
      phone: '9876543210',
      password: 'password123',
      storeName: 'Kumar Superstore',
      storeType: 'KIRANA',
      address: { line1: 'Shop #42, Main Bazaar', pincode: '141001' },
      coordinates: [75.85, 95] // lat = 95 > 90
    }
  };
  const res1 = createMockRes();
  await registerVendor(req1, res1);
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.body.code, 'INVALID_COORDINATES');

  // Out of range longitude > 180
  const req2 = {
    body: {
      ownerName: 'Rajesh Kumar',
      phone: '9876543210',
      password: 'password123',
      storeName: 'Kumar Superstore',
      storeType: 'KIRANA',
      address: { line1: 'Shop #42, Main Bazaar', pincode: '141001' },
      coordinates: [185, 30.9] // lng = 185 > 180
    }
  };
  const res2 = createMockRes();
  await registerVendor(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.code, 'INVALID_COORDINATES');
});

test('7. registerVendor creates pending unapproved account with strict allowlisting and persists [lng, lat]', async () => {
  const origFindOne = Vendor.findOne;
  const origCreate = Vendor.create;

  let createdPayload = null;
  Vendor.findOne = async () => null; // Phone not found
  Vendor.create = async (doc) => {
    createdPayload = doc;
    return {
      _id: 'mock_vendor_id_123',
      createdAt: new Date(),
      ...doc
    };
  };

  try {
    const req = {
      body: {
        ownerName: '  Amit Sharma  ',
        phone: '+91 98123 45678', // with +91 and spaces
        password: 'securePassword123',
        storeName: '  Sharma Farm Organics  ',
        storeType: 'farmer', // case insensitive normalized
        address: {
          line1: 'Farmhouse #12, GT Road',
          city: 'Ludhiana',
          state: 'Punjab',
          pincode: '141002'
        },
        coordinates: [75.8573, 30.9010], // [lng, lat]
        // Privilege escalation attack payload:
        isApproved: true,
        isActive: true,
        isOpen: true,
        role: 'ADMIN',
        deliveryRadiusKm: 100,
        minOrderValue: 0
      }
    };
    const res = createMockRes();
    await registerVendor(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.code, 'REGISTRATION_PENDING_APPROVAL');
    // Ensure NO JWT token is issued for pending registration
    assert.equal(res.body.token, undefined);

    // Verify created document in DB
    assert.ok(createdPayload);
    assert.equal(createdPayload.ownerName, 'Amit Sharma');
    assert.equal(createdPayload.phone, '9812345678'); // Normalized
    assert.equal(createdPayload.storeName, 'Sharma Farm Organics');
    assert.equal(createdPayload.storeType, 'FARMER');

    // Verify GeoJSON coordinates [lng, lat]
    assert.equal(createdPayload.address.location.type, 'Point');
    assert.deepEqual(createdPayload.address.location.coordinates, [75.8573, 30.9010]);

    // Verify privilege fields were stripped and forced to safe defaults
    assert.equal(createdPayload.isApproved, false, 'Account must not be auto-approved');
    assert.equal(createdPayload.isActive, false, 'Account must not be active');
    assert.equal(createdPayload.isOpen, false, 'Store must not be open');
    assert.equal(createdPayload.deliveryRadiusKm, 7);
    assert.equal(createdPayload.minOrderValue, 99);

    // Verify password was hashed with bcrypt
    assert.notEqual(createdPayload.passwordHash, 'securePassword123');
    const isPassValid = await bcrypt.compare('securePassword123', createdPayload.passwordHash);
    assert.equal(isPassValid, true);
  } finally {
    Vendor.findOne = origFindOne;
    Vendor.create = origCreate;
  }
});

test('8. registerVendor blocks duplicate phone numbers and handles Mongo E11000', async () => {
  const origFindOne = Vendor.findOne;
  const origCreate = Vendor.create;

  try {
    // 8a. Pre-check finds existing phone
    Vendor.findOne = async () => ({ _id: 'existing_id', phone: '9812345678' });
    const req = {
      body: {
        ownerName: 'Amit Sharma',
        phone: '9812345678',
        password: 'securePassword123',
        storeName: 'Sharma Farm',
        storeType: 'FARMER',
        address: { line1: 'Farmhouse #12', pincode: '141002' },
        coordinates: [75.85, 30.9]
      }
    };
    const res = createMockRes();
    await registerVendor(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'PHONE_ALREADY_REGISTERED');

    // 8b. Concurrent collision (code 11000)
    Vendor.findOne = async () => null;
    Vendor.create = async () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    };
    const res2 = createMockRes();
    await registerVendor(req, res2);
    assert.equal(res2.statusCode, 409);
    assert.equal(res2.body.code, 'PHONE_ALREADY_REGISTERED');
  } finally {
    Vendor.findOne = origFindOne;
    Vendor.create = origCreate;
  }
});

test('9. Unapproved vendor remains blocked from login; approved vendor can log in', async () => {
  const origFindOne = Vendor.findOne;
  process.env.JWT_ACCESS_SECRET = 'test_secret_for_offline_suite_12345';

  try {
    const passwordHash = await bcrypt.hash('secretPass123', 10);

    // 9a. Unapproved vendor (isApproved: false)
    Vendor.findOne = () => ({
      select: () => ({
        populate: async () => ({
          _id: 'vendor_unapproved',
          phone: '9876543210',
          passwordHash,
          isActive: false,
          isApproved: false
        })
      })
    });

    const req1 = { body: { phone: '9876543210', password: 'secretPass123' } };
    const res1 = createMockRes();
    await vendorLogin(req1, res1);
    assert.equal(res1.statusCode, 401);
    assert.equal(res1.body.success, false);

    // 9b. Approved vendor (isApproved: true, isActive: true)
    Vendor.findOne = () => ({
      select: () => ({
        populate: async () => ({
          _id: 'vendor_approved_123',
          phone: '9876543210',
          passwordHash,
          storeName: 'Approved Kirana Store',
          ownerName: 'Vikas',
          storeType: 'KIRANA',
          isActive: true,
          isApproved: true,
          isOpen: true,
          avgPrepTimeMins: 20,
          minOrderValue: 99,
          rating: 4.8,
          categories: [],
          address: { line1: 'Market 1', location: { coordinates: [75.8, 30.9] } }
        })
      })
    });

    const req2 = { body: { phone: '9876543210', password: 'secretPass123' } };
    const res2 = createMockRes();
    await vendorLogin(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.body.success, true);
    assert.ok(typeof res2.body.token === 'string');
    assert.equal(res2.body.vendor.storeName, 'Approved Kirana Store');
  } finally {
    Vendor.findOne = origFindOne;
  }
});

test('10. Order pickup location consistency: new order snapshot remains unchanged after Vendor address edits', () => {
  // Vendor initial address
  const vendorAtOrderTime = {
    _id: 'vendor_snap_123',
    storeName: 'Original Store Name',
    phone: '9812345678',
    address: {
      line1: 'Original Shop 1',
      city: 'Ludhiana',
      pincode: '141001',
      location: {
        type: 'Point',
        coordinates: [75.8500, 30.9000] // [lng, lat]
      }
    }
  };

  // Order created with snapshot
  const order = {
    orderNumber: 'ORD-SNAP-001',
    vendor: vendorAtOrderTime,
    pickupAddress: {
      vendorId: vendorAtOrderTime._id,
      storeName: vendorAtOrderTime.storeName,
      phone: vendorAtOrderTime.phone,
      line1: vendorAtOrderTime.address.line1,
      city: vendorAtOrderTime.address.city,
      pincode: vendorAtOrderTime.address.pincode,
      location: {
        type: 'Point',
        coordinates: [75.8500, 30.9000]
      }
    }
  };

  // Vendor subsequently changes their address in the database
  const vendorAfterAddressChange = {
    ...vendorAtOrderTime,
    storeName: 'New Relocated Store',
    address: {
      line1: 'Relocated Mall 99',
      city: 'Delhi',
      pincode: '110001',
      location: {
        type: 'Point',
        coordinates: [77.2090, 28.6139] // New Delhi coordinates
      }
    }
  };

  // The order still retains the original vendor reference when populated:
  order.vendor = vendorAfterAddressChange;

  // storePoint on order.pickupAddress returns the immutable original coordinates!
  const coordsFromSnapshot = storePoint(order.pickupAddress);
  assert.equal(coordsFromSnapshot.lat, 30.9000);
  assert.equal(coordsFromSnapshot.lng, 75.8500);

  // Even if passed the order root object:
  const coordsFromOrder = storePoint(order);
  assert.equal(coordsFromOrder.lat, 30.9000);
  assert.equal(coordsFromOrder.lng, 75.8500);
});

test('11. Legacy order backward compatibility: storePoint falls back to vendor.address when pickupAddress is absent', () => {
  const legacyOrder = {
    orderNumber: 'ORD-LEGACY-001',
    vendor: {
      storeName: 'Legacy Shop',
      address: {
        line1: 'Legacy Street 5',
        location: {
          type: 'Point',
          coordinates: [75.8700, 30.9200]
        }
      }
    }
  };

  const point = storePoint(legacyOrder.pickupAddress || legacyOrder.vendor);
  assert.equal(point.lat, 30.9200);
  assert.equal(point.lng, 75.8700);
});

test('12. canAccessOrder strictly prevents cross-vendor product & order leakage', () => {
  const orderOfVendorA = {
    _id: 'order_1',
    vendor: 'vendor_A_123',
    customer: 'cust_1'
  };

  // Vendor A accessing their order
  const userVendorA = { role: 'VENDOR', id: 'vendor_A_123' };
  assert.equal(canAccessOrder(userVendorA, orderOfVendorA), true);

  // Vendor B attempting to access Vendor A's order
  const userVendorB = { role: 'VENDOR', id: 'vendor_B_456' };
  assert.equal(canAccessOrder(userVendorB, orderOfVendorA), false);
});


test('13. getAdminData includes unapproved and approved vendors in the partner review applications list', async () => {
  const origVendorFind = Vendor.find;
  const origAppFind = Application.find;
  try {
    Application.find = () => ({
      sort: async () => []
    });
    Vendor.find = () => ({
      sort: async () => [
        {
          _id: new mongoose.Types.ObjectId('660000000000000000000001'),
          ownerName: 'Sunil Verma',
          storeName: 'Verma Dairy',
          phone: '9876543210',
          storeType: 'DAIRY',
          isApproved: false,
          isActive: false,
          isOpen: false,
          address: { city: 'Ludhiana', state: 'Punjab' }
        }
      ]
    });

    const req = { user: { adminRole: 'superadmin', access: ['partners'] }, query: { module: 'partners' } };
    const res = createMockRes();
    await getAdminData(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.applications));
    const dairyApp = res.body.data.applications.find(a => a.phone === '9876543210');
    assert.ok(dairyApp, 'Newly registered vendor should appear in partner applications review');
    assert.equal(dairyApp.status, 'RECEIVED');
    assert.equal(dairyApp.isApproved, false);
  } finally {
    Vendor.find = origVendorFind;
    Application.find = origAppFind;
  }
});

test('14. updateApplicationStatus sets isApproved:true, isActive:true and preserves isOpen:false upon approval', async () => {
  const origFindById = Vendor.findById;
  try {
    const mockVendor = {
      _id: new mongoose.Types.ObjectId('660000000000000000000002'),
      storeName: 'Kaur Kitchen',
      isApproved: false,
      isActive: false,
      isOpen: false,
      saved: false,
      async save() {
        this.saved = true;
        return this;
      }
    };
    Vendor.findById = async () => mockVendor;

    const req = {
      user: { adminRole: 'superadmin', access: ['partners'] },
      body: {
        id: '660000000000000000000002',
        type: 'partner',
        status: 'APPROVED'
      }
    };
    const res = createMockRes();
    await updateApplicationStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(mockVendor.isApproved, true, 'Vendor must be approved');
    assert.equal(mockVendor.isActive, true, 'Vendor must be active');
    assert.equal(mockVendor.isOpen, false, 'Store must NOT automatically open before merchant opens it');
    assert.equal(mockVendor.saved, true);
  } finally {
    Vendor.findById = origFindById;
  }
});

test('15. updateApplicationStatus with REJECTED keeps vendor inactive and unapproved', async () => {
  const origFindById = Vendor.findById;
  try {
    const mockVendor = {
      _id: new mongoose.Types.ObjectId('660000000000000000000003'),
      storeName: 'Rejected Store',
      isApproved: false,
      isActive: false,
      isOpen: false,
      async save() { return this; }
    };
    Vendor.findById = async () => mockVendor;

    const req = {
      user: { adminRole: 'superadmin', access: ['partners'] },
      body: {
        id: '660000000000000000000003',
        type: 'partner',
        status: 'REJECTED'
      }
    };
    const res = createMockRes();
    await updateApplicationStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(mockVendor.isApproved, false);
    assert.equal(mockVendor.isActive, false);
    assert.equal(mockVendor.isOpen, false);
  } finally {
    Vendor.findById = origFindById;
  }
});

test('16. getAllVendors excludes unapproved or inactive shops from customer discovery', async () => {
  const origFind = Vendor.find;
  let executedQuery = null;
  try {
    Vendor.find = (q) => {
      executedQuery = q;
      return {
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: async () => []
            })
          })
        })
      };
    };

    const req = { query: {} };
    const res = createMockRes();
    await getAllVendors(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(executedQuery, 'Vendor query must be executed');
    assert.equal(executedQuery.isActive, true);
    assert.equal(executedQuery.isApproved, true, 'Customer query must require isApproved: true');
  } finally {
    Vendor.find = origFind;
  }
});

test('17. getActiveDeliveryOrder returns pickupAddress in rider task payload', async () => {
  const origFindOne = Order.findOne;
  try {
    const mockOrder = {
      _id: 'ord_active_123',
      orderNumber: 'ORD-ACT-123',
      status: 'RIDER_ASSIGNED',
      pickupAddress: {
        vendorId: 'vendor_abc',
        storeName: 'Verma Farm Store',
        phone: '9812345678',
        line1: 'Shop #5, Market Rd',
        city: 'Ludhiana',
        location: {
          type: 'Point',
          coordinates: [75.85, 30.90]
        }
      },
      vendor: { storeName: 'Verma Farm Store' },
      customer: { name: 'Customer A' },
      address: { line1: 'Sector 32' },
      items: [],
      pricing: { grandTotal: 150 },
      payment: { method: 'COD' }
    };

    Order.findOne = () => ({
      populate: () => ({
        populate: async () => mockOrder
      })
    });

    const req = { user: { id: 'rider_123' } };
    const res = createMockRes();
    await getActiveDeliveryOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasActiveOrder, true);
    assert.ok(res.body.order.pickupAddress, 'Active order must include pickupAddress snapshot');
    assert.equal(res.body.order.pickupAddress.storeName, 'Verma Farm Store');
    assert.deepEqual(res.body.order.pickupAddress.location.coordinates, [75.85, 30.90]);
  } finally {
    Order.findOne = origFindOne;
  }
});
