// server/tests/helpers/processManagementHelper.js
// Isolated child-process lifecycle, graceful shutdown, and port closure verification utilities.

import net from 'node:net';
import { spawn } from 'node:child_process';

/**
 * Wait until a TCP port is verified closed. Explicitly handles connect, error, and timeout events.
 */
export async function waitForPortClosed(port, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isClosed = await new Promise((resolve) => {
      let settled = false;
      const sock = new net.Socket();
      const finish = (closed) => {
        if (!settled) {
          settled = true;
          try { sock.destroy(); } catch {}
          resolve(closed);
        }
      };

      sock.setTimeout(400);
      sock.once('connect', () => finish(false));
      sock.once('timeout', () => finish(true)); // Explicit TCP timeout probe
      sock.once('error', () => finish(true));   // ECONNREFUSED indicates port is free

      try {
        sock.connect(port, '127.0.0.1');
      } catch (err) {
        finish(true);
      }
    });

    if (isClosed) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Evaluates whether a child process has terminated, accounting for signal termination.
 * In Node.js, signal-terminated processes have exitCode === null and signalCode set (e.g. 'SIGTERM').
 */
export function isProcessTerminated(proc) {
  if (!proc) return true;
  return (
    proc._exited === true ||
    proc.exitCode !== null ||
    proc.signalCode !== null
  );
}

/**
 * Stop backend child process, await actual exit, and FAIL if the port remains open.
 */
export async function stopBackend(proc, port, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  if (!proc || isProcessTerminated(proc)) {
    const closed = await waitForPortClosed(port, Math.min(timeoutMs, 4000));
    if (!closed) {
      throw new Error(`FAIL-CLOSED: Port ${port} remained open after process termination.`);
    }
    return;
  }

  const pid = proc.pid;

  await new Promise((resolve, reject) => {
    if (isProcessTerminated(proc)) {
      return resolve();
    }

    let settled = false;
    let forceKillTimer = null;
    let deadlineTimer = null;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        resolve();
      }
    };

    proc.once('exit', cleanup);
    proc.once('close', cleanup);

    try {
      proc.kill('SIGTERM');
    } catch {
      cleanup();
      return;
    }

    forceKillTimer = setTimeout(() => {
      if (!isProcessTerminated(proc)) {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }
    }, Math.floor(timeoutMs / 2));

    deadlineTimer = setTimeout(() => {
      if (!isProcessTerminated(proc)) {
        settled = true;
        if (forceKillTimer) clearTimeout(forceKillTimer);
        reject(new Error(`FAIL-CLOSED: Child process PID ${pid} did not exit within ${timeoutMs}ms.`));
      } else {
        cleanup();
      }
    }, timeoutMs);
  });

  // Verify proc has terminated via observed exit/close plus exitCode OR signalCode
  if (!isProcessTerminated(proc)) {
    throw new Error(
      `FAIL-CLOSED: Process PID ${pid} did not terminate (exitCode: ${proc.exitCode}, signalCode: ${proc.signalCode}, _exited: ${proc._exited}).`
    );
  }

  // Await port closed and FAIL if the port remains open
  const closed = await waitForPortClosed(port, timeoutMs);
  if (!closed) {
    throw new Error(`FAIL-CLOSED: Port ${port} remained open after stopping process PID ${pid}.`);
  }
}

/**
 * Spawn isolated backend process with staging recovery scope and wait for /api/health readiness
 */
export async function spawnBackend(port, recoveryScope = {}) {
  const env = {
    ...process.env,
    PORT: String(port),
    DISABLE_EXTERNAL_NOTIFICATIONS: 'true',
    STAGING_MODE: 'true',
    NODE_ENV: 'staging',
    ...(recoveryScope.fixturePrefix ? { RECOVERY_FIXTURE_PREFIX: recoveryScope.fixturePrefix } : {}),
    ...(recoveryScope.orderPrefix ? { RECOVERY_ORDER_SCOPE_PREFIX: recoveryScope.orderPrefix } : {}),
    ...(recoveryScope.riderPrefix ? { RECOVERY_RIDER_SCOPE_PREFIX: recoveryScope.riderPrefix } : {}),
    ...(recoveryScope.orderIds?.length ? { RECOVERY_ORDER_IDS: recoveryScope.orderIds.join(',') } : {}),
    ...(recoveryScope.riderIds?.length ? { RECOVERY_RIDER_IDS: recoveryScope.riderIds.join(',') } : {}),
    ...(recoveryScope.ticketPrefix ? { RECOVERY_TICKET_PREFIX: recoveryScope.ticketPrefix } : {}),
    ...(recoveryScope.ticketIds?.length ? { RECOVERY_TICKET_IDS: recoveryScope.ticketIds.join(',') } : {}),
    ...(recoveryScope.useReceiptStub ? { USE_RECEIPT_STUB: 'true' } : {}),
    ...(recoveryScope.stubConfig ? { EXPO_RECEIPT_STUB_CONFIG: typeof recoveryScope.stubConfig === 'string' ? recoveryScope.stubConfig : JSON.stringify(recoveryScope.stubConfig) } : {}),
    ...(recoveryScope.nodeOptions ? { NODE_OPTIONS: recoveryScope.nodeOptions } : {}),
    ...(recoveryScope.extraEnv || {})
  };

  const child = spawn('node', ['server/server.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  child._exited = false;
  child._exitCode = null;
  child._signalCode = null;
  child.ipcEvents = [];

  // Capture IPC telemetry immediately upon spawn, before readiness polling
  child.on('message', (msg) => {
    child.ipcEvents.push(msg);
  });
  if (typeof recoveryScope.onMessage === 'function') {
    child.on('message', recoveryScope.onMessage);
  }

  // Drain stdout and stderr to prevent OS pipe buffers from filling and deadlocking
  child.stdout?.on('data', (chunk) => {
    if (recoveryScope.captureOutput) {
      child._stdoutBuffer = (child._stdoutBuffer || '') + chunk.toString();
    }
  });
  child.stderr?.on('data', (chunk) => {
    if (recoveryScope.captureOutput) {
      child._stderrBuffer = (child._stderrBuffer || '') + chunk.toString();
    }
  });

  const markTerminated = (code, signal) => {
    child._exited = true;
    if (code !== null && code !== undefined) child._exitCode = code;
    if (signal !== null && signal !== undefined) child._signalCode = signal;
  };

  child.once('exit', markTerminated);
  child.once('close', markTerminated);

  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (isProcessTerminated(child)) {
      throw new Error(`Child backend process ${child.pid} exited prematurely with exitCode ${child.exitCode}, signalCode ${child.signalCode}`);
    }
    try {
      const resp = await fetch(`http://localhost:${port}/api/health`);
      if (resp.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!ready) {
    await stopBackend(child, port);
    throw new Error(`Child backend on port ${port} did not become healthy within timeout.`);
  }

  return child;
}
