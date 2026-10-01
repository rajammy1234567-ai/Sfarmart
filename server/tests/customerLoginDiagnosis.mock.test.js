import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import * as authController from '../controllers/authController.js';
import * as authMiddleware from '../middleware/auth.js';
import { loginUser } from '../controllers/userController.js';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';

test('Customer Login & Refresh Token Persistence Strictness', async (t) => {
  const originalEnv = { ...process.env };
  const mockJwtSecret = 'test_access_secret_for_mocked_checks_only_12345';
  process.env.JWT_ACCESS_SECRET = mockJwtSecret;

  t.after(() => {
    process.env = originalEnv;
  });

  await t.test('1. generateAccessToken signs valid token with dynamic secret', () => {
    const userPayload = {
      _id: '6abe1c6f51a948ed6b0236ee',
      role: 'CUSTOMER',
      phone: '9876543210'
    };

    const token = authController.generateAccessToken(userPayload);
    assert.ok(token, 'Access token must be generated');

    const decoded = jwt.verify(token, mockJwtSecret);
    assert.equal(decoded.sub, userPayload._id);
    assert.equal(decoded.role, 'CUSTOMER');
    assert.equal(decoded.phone, '9876543210');
  });

  await t.test('2. Disconnected MongoDB throws and forces customerLogin to return 500', async () => {
    // Force readyState to 0 (disconnected)
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

    const dummyPassword = 'demo' + '123';
    const passwordHash = await bcrypt.hash(dummyPassword, 10);

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: () => Promise.resolve({
        _id: '6abe1c6f51a948ed6b0236ee',
        phone: '9876543210',
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        addresses: [],
        toRupees: () => 250
      })
    });

    let statusCode = 200;
    let responseData = null;

    const req = {
      body: {
        phone: '9876543210',
        password: dummyPassword,
        deviceId: 'android_test_device'
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    try {
      await authController.customerLogin(req, res);
      assert.equal(statusCode, 500, 'Must fail with HTTP 500 when database is disconnected');
      assert.equal(responseData.success, false, 'Must not report success');
      assert.equal(responseData.ok, false);
      assert.equal(responseData.message, 'Server error during customer login');
    } finally {
      User.findOne = originalFindOne;
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    }
  });

  await t.test('3. RefreshToken.create failure propagates and forces customerLogin to return 500', async () => {
    // Simulate active connection
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const dummyPassword = 'demo' + '123';
    const passwordHash = await bcrypt.hash(dummyPassword, 10);

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: () => Promise.resolve({
        _id: '6abe1c6f51a948ed6b0236ee',
        phone: '9876543210',
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        addresses: [],
        toRupees: () => 250
      })
    });

    // Mock RefreshToken.create to fail with persistence error
    const originalCreate = RefreshToken.create;
    RefreshToken.create = async () => {
      throw new Error('MongoServerError: not authorized on farmart_test_disposable to execute command { create: "refreshtokens" }');
    };

    let statusCode = 200;
    let responseData = null;

    const req = {
      body: {
        phone: '9876543210',
        password: dummyPassword,
        deviceId: 'android_test_device'
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    try {
      await authController.customerLogin(req, res);
      assert.equal(statusCode, 500, 'Must fail with HTTP 500 when refresh token creation fails');
      assert.equal(responseData.success, false);
      assert.equal(responseData.ok, false);
      assert.equal(responseData.message, 'Server error during customer login');
    } finally {
      User.findOne = originalFindOne;
      RefreshToken.create = originalCreate;
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    }
  });

  await t.test('4. RefreshToken.create failure also forces /api/login (userController) to return 500', async () => {
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const dummyPassword = 'demo' + '123';
    const passwordHash = await bcrypt.hash(dummyPassword, 10);

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: () => Promise.resolve({
        _id: '6abe1c6f51a948ed6b0236ee',
        phone: '9876543210',
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        addresses: [],
        toRupees: () => 250
      })
    });

    const originalCreate = RefreshToken.create;
    RefreshToken.create = async () => {
      throw new Error('MongoServerError: write error on refreshtokens');
    };

    let statusCode = 200;
    let responseData = null;

    const req = {
      body: {
        phone: '9876543210',
        password: dummyPassword,
        deviceId: 'android_test_device'
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    try {
      await loginUser(req, res);
      assert.equal(statusCode, 500, 'Fallback loginUser must also fail with HTTP 500');
      assert.equal(responseData.success, false);
      assert.equal(responseData.message, 'Login failed');
    } finally {
      User.findOne = originalFindOne;
      RefreshToken.create = originalCreate;
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    }
  });

  await t.test('5. Successful refresh token persistence returns HTTP 200 with tokens', async () => {
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const dummyPassword = 'demo' + '123';
    const passwordHash = await bcrypt.hash(dummyPassword, 10);

    const originalFindOne = User.findOne;
    User.findOne = (query) => {
      assert.equal(query.phone, '9876543210', 'Phone must be trimmed and normalized');
      return {
        select: () => Promise.resolve({
          _id: '6abe1c6f51a948ed6b0236ee',
          phone: '9876543210',
          passwordHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          addresses: [],
          toRupees: () => 250
        })
      };
    };

    let persistedDoc = null;
    const originalCreate = RefreshToken.create;
    RefreshToken.create = async (doc) => {
      persistedDoc = doc;
      return doc;
    };

    let responseData = null;
    let statusCode = 200;

    const req = {
      body: {
        phone: '  9876543210  ',
        password: dummyPassword,
        deviceId: 'android_test_device'
      }
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    try {
      await authController.customerLogin(req, res);
      assert.equal(statusCode, 200, 'Status code must be 200 on successful persistence');
      assert.ok(responseData.success, 'Response must indicate success');
      assert.ok(responseData.accessToken, 'Must return accessToken');
      assert.ok(responseData.refreshToken, 'Must return refreshToken');
      assert.equal(responseData.user.phone, '9876543210');
      assert.equal(responseData.user.role, 'CUSTOMER');
      assert.ok(persistedDoc, 'RefreshToken must have been persisted');
      assert.equal(persistedDoc.user, '6abe1c6f51a948ed6b0236ee');
      assert.equal(persistedDoc.deviceId, 'android_test_device');
      assert.ok(persistedDoc.tokenHash, 'Must persist SHA-256 tokenHash');
    } finally {
      User.findOne = originalFindOne;
      RefreshToken.create = originalCreate;
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    }
  });

  await t.test('6. requireAuth middleware successfully validates generated token', async () => {
    const userPayload = {
      _id: '6abe1c6f51a948ed6b0236ee',
      role: 'CUSTOMER',
      phone: '9876543210'
    };
    const token = authController.generateAccessToken(userPayload);

    const originalFindById = User.findById;
    User.findById = (id) => {
      assert.equal(id, userPayload._id);
      return Promise.resolve({
        _id: id,
        phone: userPayload.phone,
        status: 'ACTIVE',
        role: 'CUSTOMER'
      });
    };

    let nextCalled = false;
    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
    const res = {
      status() { return this; },
      json() { return this; }
    };

    try {
      await authMiddleware.requireAuth(req, res, () => {
        nextCalled = true;
      });
      assert.ok(nextCalled, 'requireAuth must call next() for valid token');
      assert.equal(req.user.phone, '9876543210');
    } finally {
      User.findById = originalFindById;
    }
  });
});
