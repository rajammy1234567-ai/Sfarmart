import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../customerLogin.js', import.meta.url), 'utf8');
const { requestCustomerLogin } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('login preserves the password and uses exactly one bounded primary POST', async () => {
  let calls = 0;
  const response = await requestCustomerLogin({post: async (url, body, options) => {
    calls++; assert.equal(url, '/auth/customer/login'); assert.equal(body.password, ' password ');
    assert.equal(options.timeout, 60000);
    return {data: {success: true, user: {_id: 'customer'}, token: 'token'}};
  }}, '9876543210', ' password ', 'device');
  assert.equal(calls, 1); assert.equal(response.data.token, 'token');
});
for (const failure of [{status: 401, message: 'Incorrect password'}, {code: 'NETWORK_ERROR', message: 'No connection'}]) {
  test(`login does not replay on ${failure.status || failure.code}`, async () => {
    let calls = 0;
    await assert.rejects(requestCustomerLogin({post: async () => {calls++;throw failure;}}, '', '', ''), e => e === failure);
    assert.equal(calls, 1);
  });
}
test('a malformed success response cannot authenticate a customer', async () => {
  await assert.rejects(requestCustomerLogin({post: async () => ({data: {success: true, user: {_id: 'customer'}}})}, '', '', ''), {code: 'INVALID_RESPONSE'});
});
test('the actual AppContext login callback preserves server failure messages', async () => {
  const contextSource = await fs.readFile(new URL('../../context/AppContext.js', import.meta.url), 'utf8');
  const begin = contextSource.indexOf('const loginUser = useCallback(') + 'const loginUser = useCallback('.length;
  const end = contextSource.indexOf('\n  }, []);', begin) + '\n  }'.length;
  const scope = {authEpochRef: {current: 0}, initializeSession() {}, apiService: {customerLogin: async () => ({success: false, message: 'Account inactive'})}, console: {warn() {}}};
  const login = vm.runInNewContext('(' + contextSource.slice(begin,end) + ')', scope);
  await assert.rejects(login('9876543210', 'password'), /Account inactive/);
});
