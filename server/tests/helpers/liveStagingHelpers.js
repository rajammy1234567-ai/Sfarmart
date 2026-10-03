// server/tests/helpers/liveStagingHelpers.js
// Side-effect-free utilities shared by live-staging tests.
// Strict staging guards, verified API calls, auto-dispatch polling, and surgical ID teardown.

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from '../../models/User.js';
import Vendor from '../../models/Vendor.js';
import Rider from '../../models/Rider.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Category from '../../models/Category.js';
import PushReceipt from '../../models/PushReceipt.js';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE,
  sanitizeErrorMessage
} from '../../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
export const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
export const FIXTURE_PREFIX = `STAGE_FIXTURE_E2E_${Date.now()}`;

export function createFixtureTracker() {
  return {
    users: new Set(),
    vendors: new Set(),
    riders: new Set(),
    categories: new Set(),
    products: new Set(),
    orders: new Set(),
    clientOrderIds: new Set(),
    receipts: new Set(),
    tokens: new Set()
  };
}

// Default shared fixture ID tracker
export const createdFixtureIds = createFixtureTracker();

export const signToken = (payload) => {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || JWT_SECRET;
  if (!secret) {
    throw new Error('FAIL-CLOSED: JWT secret is required to sign token.');
  }
  return jwt.sign(payload, secret, { expiresIn: '30m' });
};

export const apiCall = async (method, endpoint, body = null, token = null) => {
  const targetBase = process.env.API_BASE || API_BASE;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${targetBase}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
};

/**
 * Validates preflight live staging guards:
 * 1. Explicit live-test opt-in
 * 2. Host & database pinning via validateStagingUri
 * 3. Explicit staging credentials in URI
 * 4. Required JWT secret
 */
export function validateLiveStagingGuards(env = process.env) {
  const optIn = env.ALLOW_LIVE_STAGING_TEST === 'true' || env.ALLOW_STAGING_ATLAS_TEST === 'true';
  if (!optIn) {
    throw new Error('FAIL-CLOSED: Live staging test requires explicit opt-in via ALLOW_LIVE_STAGING_TEST=true.');
  }

  const uri = env.STAGING_MONGO_URI || env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error('FAIL-CLOSED: MONGODB_URI or STAGING_MONGO_URI is required for live staging tests.');
  }

  validateStagingUri(uri);

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('FAIL-CLOSED: Target URI cannot be parsed as a valid URL.');
  }

  if (parsed.protocol !== 'mongodb+srv:') {
    throw new Error(`FAIL-CLOSED: Staging mode requires protocol "mongodb+srv:", received "${parsed.protocol}".`);
  }

  if (parsed.hostname.toLowerCase() !== APPROVED_STAGING_HOST) {
    throw new Error(`FAIL-CLOSED: Staging host mismatch. Expected "${APPROVED_STAGING_HOST}", received "${parsed.hostname}".`);
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (targetDb !== APPROVED_DATABASE) {
    throw new Error(`FAIL-CLOSED: Staging database mismatch. Expected "${APPROVED_DATABASE}", received "${targetDb}".`);
  }

  if (!parsed.username || !parsed.password) {
    throw new Error('FAIL-CLOSED: Explicit staging database credentials (username and password) are required in URI.');
  }

  const jwtSecret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error('FAIL-CLOSED: JWT_ACCESS_SECRET is required for live staging tests.');
  }

  return { uri, host: parsed.hostname, database: targetDb, username: parsed.username };
}

/**
 * Verifies that the target API server is alive and querying the approved staging environment.
 * Uses a disposable probe category to verify cross-system database parity.
 */
export async function verifyTargetApiStagingEnvironment(apiBase = API_BASE, probeData = null) {
  let healthRes;
  try {
    healthRes = await fetch(`${apiBase}/health`);
  } catch (err) {
    throw new Error(`FAIL-CLOSED: Target API server is unreachable at ${apiBase}: ${err.message}`);
  }
  if (!healthRes.ok) {
    throw new Error(`FAIL-CLOSED: Target API server health check failed with status ${healthRes.status}`);
  }

  if (probeData && probeData.categorySlug) {
    let probeRes;
    try {
      probeRes = await fetch(`${apiBase}/categories/${probeData.categorySlug}`);
    } catch (err) {
      throw new Error(`FAIL-CLOSED: Failed to query probe category on target API server: ${err.message}`);
    }
    if (!probeRes.ok) {
      throw new Error(`FAIL-CLOSED: Target API server at ${apiBase} cannot find disposable staging probe category "${probeData.categorySlug}". Target API server is not connected to approved staging database "${APPROVED_DATABASE}".`);
    }
    const json = await probeRes.json().catch(() => null);
    if (!json?.success || String(json?.category?._id) !== String(probeData.categoryId)) {
      throw new Error('FAIL-CLOSED: Target API server returned mismatched category data. Target API server environment does not match approved staging database.');
    }
  }
}

/**
 * Bounded poll for automatic rider-dispatch offer:
 * - Polls Order document until an offer is placed on currentOffer
 * - Fails closed if no offer arrives within timeoutMs
 */
export async function waitForAutoDispatchedOffer(orderId, expectedRiderId = null, timeoutMs = 10000, pollIntervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const order = await Order.findById(orderId);
    if (order?.currentOffer?.rider) {
      if (!expectedRiderId || order.currentOffer.rider.toString() === expectedRiderId.toString()) {
        return order;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`FAIL-CLOSED: Auto-dispatch timed out after ${timeoutMs}ms: no offer arrived for order ${orderId}${expectedRiderId ? ` targeting rider ${expectedRiderId}` : ''}`);
}

/**
 * Surgical teardown guarantee:
 * - Recovers this run's orders by unique clientOrderId if a committed request lost response
 * - Attempts ALL cleanup operations independently (one failure does not abort remaining)
 * - Always disconnects from database in finally
 * - Reports failure if any deletion fails or run-owned fixtures remain in database
 */
export async function performTeardown(fixturePrefix = FIXTURE_PREFIX, tracker = createdFixtureIds) {
  const cleanupErrors = [];
  const remainingFixtures = [];

  try {
    if (mongoose.connection.readyState === 1) {
      // 1. Recover this run's orders by unique clientOrderId in case committed request lost response
      try {
        const orderQuery = {
          $or: [
            { _id: { $in: Array.from(tracker.orders) } },
            { clientOrderId: { $in: Array.from(tracker.clientOrderIds) } },
            { clientOrderId: { $regex: `^${fixturePrefix}` } },
            { customer: { $in: Array.from(tracker.users) } },
            { vendor: { $in: Array.from(tracker.vendors) } }
          ]
        };
        const foundOrders = await Order.find(orderQuery).select('_id');
        for (const ord of foundOrders) {
          tracker.orders.add(ord._id.toString());
        }
      } catch (recErr) {
        cleanupErrors.push(new Error(`Failed to recover orders: ${recErr.message}`));
      }

      // 2. Attempt ALL cleanup operations independently so failure of one does not abort others
      const cleanupTasks = [
        { name: 'receipts', model: PushReceipt, ids: tracker.receipts },
        { name: 'orders', model: Order, ids: tracker.orders },
        { name: 'products', model: Product, ids: tracker.products },
        { name: 'categories', model: Category, ids: tracker.categories },
        { name: 'riders', model: Rider, ids: tracker.riders },
        { name: 'vendors', model: Vendor, ids: tracker.vendors },
        { name: 'users', model: User, ids: tracker.users }
      ];

      for (const task of cleanupTasks) {
        if (task.ids && task.ids.size > 0) {
          try {
            await task.model.deleteMany({ _id: { $in: Array.from(task.ids) } });
          } catch (delErr) {
            cleanupErrors.push(new Error(`Failed to delete ${task.name}: ${delErr.message}`));
          }
        }
      }

      // 2b. Pull tracked tokens if any
      if (tracker.tokens && tracker.tokens.size > 0) {
        for (const token of tracker.tokens) {
          try {
            await Promise.allSettled([
              User.updateMany({ 'expoPushTokens.token': token }, { $pull: { expoPushTokens: { token } } }),
              User.updateMany({ expoPushTokens: token }, { $pull: { expoPushTokens: token } }),
              Rider.updateMany({ 'expoPushTokens.token': token }, { $pull: { expoPushTokens: { token } } }),
              Rider.updateMany({ expoPushTokens: token }, { $pull: { expoPushTokens: token } }),
              Vendor.updateMany({ expoPushTokens: token }, { $pull: { expoPushTokens: token } })
            ]);
          } catch (tokErr) {
            cleanupErrors.push(new Error(`Failed to pull token ${token}: ${tokErr.message}`));
          }
        }
      }

      // 3. Verify if run-owned fixtures remain in database
      for (const task of cleanupTasks) {
        if (task.ids && task.ids.size > 0 && typeof task.model.countDocuments === 'function') {
          try {
            const count = await task.model.countDocuments({ _id: { $in: Array.from(task.ids) } });
            if (count > 0) {
              remainingFixtures.push(`${count} run-owned ${task.name} still remain in database`);
            }
          } catch (countErr) {
            cleanupErrors.push(new Error(`Failed to verify remaining ${task.name}: ${countErr.message}`));
          }
        }
      }

      try {
        if (typeof Order.countDocuments === 'function') {
          const prefixCount = await Order.countDocuments({ clientOrderId: { $regex: `^${fixturePrefix}` } });
          if (prefixCount > 0) {
            remainingFixtures.push(`${prefixCount} orders matching prefix "${fixturePrefix}" still remain in database`);
          }
        }
        if (typeof PushReceipt.countDocuments === 'function') {
          const prefixReceipts = await PushReceipt.countDocuments({ ticketId: { $regex: `^${fixturePrefix}` } });
          if (prefixReceipts > 0) {
            remainingFixtures.push(`${prefixReceipts} push receipts matching prefix "${fixturePrefix}" still remain in database`);
          }
        }
      } catch (prefixCountErr) {
        cleanupErrors.push(new Error(`Failed to verify remaining prefix documents: ${prefixCountErr.message}`));
      }
    }
  } catch (unexpectedErr) {
    cleanupErrors.push(new Error(`Unexpected error during teardown: ${unexpectedErr.message}`));
  } finally {
    // Teardown must ALWAYS disconnect regardless of cleanup results or errors
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (discErr) {
        cleanupErrors.push(new Error(`Failed to disconnect from database: ${discErr.message}`));
      }
    }
  }

  // Report failure if deletion fails or run-owned fixtures remain
  if (cleanupErrors.length > 0 || remainingFixtures.length > 0) {
    const errorDetails = [
      ...cleanupErrors.map((e) => e.message),
      ...remainingFixtures
    ].join('; ');
    throw new Error(`FAIL-CLOSED: Teardown failed: ${errorDetails}`);
  }
}
