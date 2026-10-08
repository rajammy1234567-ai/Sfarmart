import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('startup waits for DB and SIGTERM drains an accepted HTTP request before disconnecting DB', { timeout: 8000 }, async t => {
  const fixture = `
    import mongoose from './server/node_modules/mongoose/index.js';
    import Order from './server/models/Order.js';
    let connected = false;
    mongoose.connect = async () => {
      await new Promise(r => setTimeout(r, 50));
      connected = true;
      Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
      return { connection: { host: 'offline-mock', db: { admin: () => ({ command: async () => ({ setName: 'offline-replica' }) }) } } };
    };
    mongoose.disconnect = async () => console.log('OFFLINE_DB_DISCONNECTED');
    Order.find = () => ({ populate: async () => [] });
    const { app, httpServer } = await import('./server/server.js');
    process.on('message', message => { if (message?.type === 'shutdown-test') process.emit('SIGTERM'); });
    app.get('/offline-drain-test', (_req, res) => {
      process.send({ type: 'draining' });
      setTimeout(() => res.json({ success: true }), 150);
    });
    const ready = () => process.send({ type: 'ready', port: httpServer.address().port, connected });
    if (httpServer.listening) ready(); else httpServer.once('listening', ready);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture], {
    cwd: new URL('../..', import.meta.url),
    env: { PATH: process.env.PATH, NODE_ENV: 'test', STAGING_MODE: 'true', PORT: '0',
      MONGODB_URI: 'mongodb+srv://offline:offline@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable',
      JWT_ACCESS_SECRET: 'offline-access-secret', JWT_REFRESH_SECRET: 'offline-refresh-secret',
      DISABLE_EXTERNAL_NOTIFICATIONS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const message = type => new Promise((resolve, reject) => {
    const onMessage = value => { if (value.type === type) { child.off('message', onMessage); resolve(value); } };
    child.on('message', onMessage);
    child.once('error', reject); child.once('exit', (code, signal) => reject(new Error('Child exited before ' + type + ': code=' + code + ', signal=' + signal + '\n' + output)));
  });
  const ready = await message('ready');
  assert.equal(ready.connected, true);
  const draining = message('draining');
  const request = fetch(`http://127.0.0.1:${ready.port}/offline-drain-test`);
  await draining;
  if (process.platform === 'win32') child.send({ type: 'shutdown-test' }); else child.kill('SIGTERM');
  assert.deepEqual(await (await request).json(), { success: true });
  const result = await exited;
  assert.equal(result.code, 0, output);
  assert.match(output, /OFFLINE_DB_DISCONNECTED/);
});
