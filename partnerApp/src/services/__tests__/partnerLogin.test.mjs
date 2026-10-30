import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../partnerLogin.js', import.meta.url), 'utf8');
const { requestPartnerLogin, requestPartnerRegister, loginErrorMessage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
test('valid login validates session and uses one bounded POST', async () => {
  let calls = 0;
  const result = await requestPartnerLogin('https://example.test/api', '9876543210', 'test', async (url, options, policy) => {
    calls++; assert.equal(url, 'https://example.test/api/auth/vendor/login');
    assert.equal(options.method, 'POST'); assert.equal(policy.timeoutMs, 60000);
    return response(200, { success: true, vendor: { _id: 'vendor' }, token: 'token' });
  });
  assert.equal(calls, 1); assert.equal(result.token, 'token');
});
test('rejected credentials retain the server explanation', async () => {
  const result = await requestPartnerLogin('', '', '', async () => response(401, { message: 'Incorrect password' }));
  assert.deepEqual(result, { success: false, message: 'Incorrect password' });
});
test('malformed successful response cannot create a partial session', async () => {
  await assert.rejects(requestPartnerLogin('', '', '', async () => response(200, { success: true })), { code: 'INVALID_RESPONSE' });
});
test('timeout is actionable and credentials are never replayed', async () => {
  let calls = 0;
  await assert.rejects(requestPartnerLogin('', '', '', async () => { calls++; throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); }));
  assert.equal(calls, 1); assert.match(loginErrorMessage({ code: 'ETIMEDOUT' }), /timed out/);
  assert.match(loginErrorMessage({ status: 429 }), /wait/);
});
test('login no longer toggles the application loading gate that unmounts the form', async () => {
  const context = await readFile(new URL('../../context/PartnerContext.js', import.meta.url), 'utf8');
  const login = context.slice(context.indexOf('  const loginVendor ='), context.indexOf('  // Partner Registration'));
  assert.doesNotMatch(login, /setIsLoading\(/);
});
test('requestPartnerRegister handles 201 pending approval without issuing credentials', async () => {
  let calls = 0;
  const result = await requestPartnerRegister(
    'https://example.test/api',
    {
      ownerName: 'Amit Sharma',
      phone: '9812345678',
      password: 'password123',
      storeName: 'Sharma Farm',
      storeType: 'FARMER',
      address: { line1: 'Main Road', pincode: '141001' },
      coordinates: [75.85, 30.9]
    },
    async (url, options, policy) => {
      calls++;
      assert.equal(url, 'https://example.test/api/auth/vendor/register');
      assert.equal(options.method, 'POST');
      assert.equal(policy.timeoutMs, 60000);
      const parsedBody = JSON.parse(options.body);
      assert.equal(parsedBody.storeName, 'Sharma Farm');
      return response(201, {
        ok: true,
        success: true,
        code: 'REGISTRATION_PENDING_APPROVAL',
        message: 'Partner registration submitted successfully. Your store account is pending admin approval before you can log in.',
        vendor: { _id: 'vendor_123', isApproved: false, isActive: false }
      });
    }
  );
  assert.equal(calls, 1);
  assert.equal(result.success, true);
  assert.equal(result.pendingApproval, true);
  assert.equal(result.vendor.isApproved, false);
});
test('requestPartnerRegister reports duplicate phone 409 accurately', async () => {
  const result = await requestPartnerRegister(
    'https://example.test/api',
    { phone: '9812345678' },
    async () => response(409, {
      ok: false,
      success: false,
      code: 'PHONE_ALREADY_REGISTERED',
      message: 'This mobile number is already registered as a partner store.'
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.code, 'PHONE_ALREADY_REGISTERED');
  assert.match(result.message, /already registered/);
});
