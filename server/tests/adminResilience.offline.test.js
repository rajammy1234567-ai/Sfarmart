import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedClientOrigin } from '../utils/corsPolicy.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

describe('Admin CORS Policy Verification', () => {
  test('allows deployed and staging admin origins', () => {
    assert.equal(isAllowedClientOrigin('https://sfarmart-admin-staging.onrender.com'), true);
    assert.equal(isAllowedClientOrigin('https://farm-mart-admin.onrender.com'), true);
    assert.equal(isAllowedClientOrigin('https://farmart-admin.onrender.com'), true);
    assert.equal(isAllowedClientOrigin('https://farm-mart.onrender.com'), true);
    assert.equal(isAllowedClientOrigin('http://localhost:5173'), true);
    assert.equal(isAllowedClientOrigin('http://localhost:8081'), true);
  });

  test('rejects unauthorized external origins', () => {
    assert.equal(isAllowedClientOrigin('https://malicious-site.com'), false);
    assert.equal(isAllowedClientOrigin('https://farm-mart-admin.evil.com'), false);
    assert.equal(isAllowedClientOrigin('https://unlisted-render-app.onrender.com'), false);
    assert.equal(isAllowedClientOrigin('http://localhost:9999'), false);
  });

  test('allows null origin in development / mobile / curl contexts', () => {
    assert.equal(isAllowedClientOrigin(undefined), true);
    assert.equal(isAllowedClientOrigin(null), true);
  });
});

describe('Error Handler CORS Headers', () => {
  test('sets CORS headers on 500 error for allowed Admin origin', () => {
    const headers = {};
    const req = {
      headers: { origin: 'https://farm-mart-admin.onrender.com' },
      originalUrl: '/api/admin/data'
    };
    let statusCode = 0;
    let jsonBody = null;
    const res = {
      headersSent: false,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      header: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    const err = new Error('Database connection failed');
    errorHandler(err, req, res, () => {});

    assert.equal(statusCode, 500);
    assert.equal(headers['access-control-allow-origin'], 'https://farm-mart-admin.onrender.com');
    assert.equal(headers['access-control-allow-credentials'], 'true');
    assert.equal(headers['vary'], 'Origin');
    assert.equal(jsonBody.ok, false);
    assert.equal(jsonBody.code, 'SERVER_ERROR');
  });

  test('maps CORS error to 403 CORS_REJECTED with headers omitted for unallowed origin', () => {
    const headers = {};
    const req = {
      headers: { origin: 'https://evil-unauthorized.com' },
      originalUrl: '/api/admin/data'
    };
    let statusCode = 0;
    let jsonBody = null;
    const res = {
      headersSent: false,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      header: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    const err = new Error('Not allowed by CORS');
    errorHandler(err, req, res, () => {});

    assert.equal(statusCode, 403);
    assert.equal(headers['access-control-allow-origin'], undefined);
    assert.equal(jsonBody.code, 'CORS_REJECTED');
  });
});

describe('Auth Middleware CORS & Guard Verification', () => {
  test('returns 401 with CORS headers when Authorization header is missing', async () => {
    process.env.JWT_ACCESS_SECRET = 'unit-test-secret-key-12345';
    const headers = {};
    const req = {
      headers: { origin: 'https://farm-mart-admin.onrender.com' },
      cookies: {}
    };
    let statusCode = 0;
    let jsonBody = null;
    const res = {
      headersSent: false,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      header: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await requireAuth(req, res, () => {});

    assert.equal(statusCode, 401);
    assert.equal(headers['access-control-allow-origin'], 'https://farm-mart-admin.onrender.com');
    assert.equal(headers['access-control-allow-credentials'], 'true');
    assert.equal(jsonBody.code, 'AUTH_REQUIRED');
  });
});
