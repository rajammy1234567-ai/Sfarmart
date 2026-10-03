// server/tests/childProcessTermination.offline.test.js
// Focused offline test suite for child-process exit handling, termination detection, and port closure.
// Covers:
// 1. Normal exit (exitCode: 0, signalCode: null).
// 2. Signal exit (exitCode: null, signalCode: 'SIGTERM' / 'SIGKILL').
// 3. Process timeout / fail-closed deadline handling.
// 4. Port closure verification and failure on occupied port.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

import {
  isProcessTerminated,
  stopBackend
} from './helpers/processManagementHelper.js';

test('Child Process Termination Offline Suite', async (t) => {
  await t.test('1. Normal Exit: detects termination with exitCode=0 and signalCode=null', async () => {
    const child = spawn('node', ['-e', 'process.exit(0)'], {
      stdio: 'ignore'
    });

    child._exited = false;
    child._exitCode = null;
    child._signalCode = null;
    const markTerminated = (code, signal) => {
      child._exited = true;
      if (code !== null && code !== undefined) child._exitCode = code;
      if (signal !== null && signal !== undefined) child._signalCode = signal;
    };
    child.once('exit', markTerminated);
    child.once('close', markTerminated);

    // Await natural exit
    await new Promise((resolve) => child.once('exit', resolve));

    // Stop process (already terminated) - must resolve cleanly without delay
    await stopBackend(child, 64991, { timeoutMs: 3000 });

    assert.ok(isProcessTerminated(child), 'Process must be reported as terminated');
    assert.equal(child.exitCode, 0, 'exitCode must be 0 for normal exit');
    assert.equal(child.signalCode, null, 'signalCode must be null for normal exit');
  });

  await t.test('2. Signal Exit: detects termination with exitCode=null and signalCode set (SIGTERM)', async () => {
    const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore'
    });

    child._exited = false;
    child._exitCode = null;
    child._signalCode = null;
    const markTerminated = (code, signal) => {
      child._exited = true;
      if (code !== null && code !== undefined) child._exitCode = code;
      if (signal !== null && signal !== undefined) child._signalCode = signal;
    };
    child.once('exit', markTerminated);
    child.once('close', markTerminated);

    const start = Date.now();
    await stopBackend(child, 64992, { timeoutMs: 5000 });
    const elapsed = Date.now() - start;

    assert.ok(isProcessTerminated(child), 'Process must be reported as terminated');
    // In Node.js, signal termination produces exitCode=null and signalCode='SIGTERM'
    assert.equal(child.exitCode, null, 'exitCode must be null on signal termination');
    assert.ok(
      child.signalCode === 'SIGTERM' || child.signalCode === 'SIGKILL',
      `signalCode must be set on signal termination, got: ${child.signalCode}`
    );
    assert.ok(elapsed < 4000, `Process should terminate promptly without waiting for deadline, took: ${elapsed}ms`);
  });

  await t.test('3. Timeout Handling: fails closed when child does not terminate within deadline', async () => {
    // Mock child process that does not exit on kill
    const mockChild = {
      pid: 99999,
      exitCode: null,
      signalCode: null,
      _exited: false,
      kill: () => {}, // no-op, ignores kill
      once: () => {}  // never emits exit or close
    };

    await assert.rejects(
      async () => {
        await stopBackend(mockChild, 64993, { timeoutMs: 300 });
      },
      /FAIL-CLOSED: Child process PID 99999 did not exit within 300ms\./
    );
  });

  await t.test('4. Occupied Port Check: fails closed if port remains listening after termination', async () => {
    const testPort = 64994;
    // Start an independent HTTP server holding the port
    const server = http.createServer((req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(testPort, '127.0.0.1', resolve));

    // A dummy terminated child
    const dummyChild = {
      pid: 88888,
      exitCode: 0,
      signalCode: null,
      _exited: true,
      kill: () => {},
      once: () => {}
    };

    try {
      await assert.rejects(
        async () => {
          await stopBackend(dummyChild, testPort, { timeoutMs: 500 });
        },
        /FAIL-CLOSED: Port 64994 remained open after process termination\./
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
