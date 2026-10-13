import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../partnerLogin.js', import.meta.url), 'utf8');
const { requestPartnerLogin, loginErrorMessage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
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
  const login = context.slice(context.indexOf('  const loginVendor ='), context.indexOf('  // Initial load:'));
  assert.doesNotMatch(login, /setIsLoading\(/);
});
