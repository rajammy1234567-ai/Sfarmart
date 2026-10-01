/**
 * Side-effect-free test teardown helper.
 *
 * Guarantees:
 * - Does not register tests or hooks.
 * - Does not read credentials or environment variables.
 * - Does not import application startup or open connections.
 * - Shuts down Socket.IO before waiting for HTTP server close.
 * - Always attempts database cleanup and disconnect even if network shutdown fails.
 * - Sanitizes all error logging and surfaces teardown failures to the test runner.
 */

export async function executeTeardown({
  io,
  server,
  handshakePassed,
  mongooseConnection,
  trackedIds,
  isStagingMode,
  models
}) {
  let teardownError = null;

  // 1. Disconnect test socket clients and close Socket.IO before waiting for HTTP shutdown
  try {
    if (io) {
      try {
        io.disconnectSockets(true);
      } catch {}
      await new Promise((resolve, reject) => {
        io.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  } catch {
    teardownError = teardownError || new Error('FAIL-CLOSED [STAGE:SOCKET_SHUTDOWN]: Socket.IO close encountered an error.');
    console.error('Teardown warning [STAGE:SOCKET_SHUTDOWN]: Socket.IO close encountered an error.');
  }

  // 2. Close HTTP server; safely handle already-closed HTTP server
  try {
    if (server) {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((err) => {
            if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }
  } catch {
    teardownError = teardownError || new Error('FAIL-CLOSED [STAGE:HTTP_SHUTDOWN]: HTTP server close encountered an error.');
    console.error('Teardown warning [STAGE:HTTP_SHUTDOWN]: HTTP server close encountered an error.');
  }

  // 3. Always attempt database cleanup/disconnect even if network shutdown failed
  try {
    if (handshakePassed === true && mongooseConnection?.readyState === 1) {
      const activeDb = mongooseConnection.name;
      const expectedDb = isStagingMode ? 'farmart_test_disposable' : (/^farmart_delivery_test_/.test(activeDb) ? activeDb : null);
      if (!expectedDb || activeDb !== expectedDb) {
        throw new Error(`CRITICAL: Database identity mismatch before teardown cleanup. Active: "${activeDb}". Cleanup aborted.`);
      }

      const { Order, Product, Rider, Vendor, User } = models || {};
      if (trackedIds?.orders?.size > 0 && Order) {
        await Order.deleteMany({ _id: { $in: Array.from(trackedIds.orders) } });
      }
      if (trackedIds?.products?.size > 0 && Product) {
        await Product.deleteMany({ _id: { $in: Array.from(trackedIds.products) } });
      }
      if (trackedIds?.riders?.size > 0 && Rider) {
        await Rider.deleteMany({ _id: { $in: Array.from(trackedIds.riders) } });
      }
      if (trackedIds?.vendors?.size > 0 && Vendor) {
        await Vendor.deleteMany({ _id: { $in: Array.from(trackedIds.vendors) } });
      }
      if (trackedIds?.users?.size > 0 && User) {
        await User.deleteMany({ _id: { $in: Array.from(trackedIds.users) } });
      }
    }
  } catch {
    teardownError = teardownError || new Error('FAIL-CLOSED [STAGE:DB_CLEANUP]: Database cleanup failed.');
    console.error('Teardown error [STAGE:DB_CLEANUP]: Database cleanup failed.');
  } finally {
    if (mongooseConnection && mongooseConnection.readyState !== 0) {
      try {
        await mongooseConnection.close();
      } catch {
        teardownError = teardownError || new Error('FAIL-CLOSED [STAGE:DISCONNECT]: Mongoose disconnect failed.');
        console.error('Teardown error [STAGE:DISCONNECT]: Mongoose disconnect failed.');
      }
    }
  }

  // 4. Report shutdown/cleanup failures as test failures
  if (teardownError) {
    throw teardownError;
  }
}
