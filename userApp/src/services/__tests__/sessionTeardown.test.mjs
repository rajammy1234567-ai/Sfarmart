import assert from 'node:assert/strict';
import test from 'node:test';

// Test Suite: Session Teardown, Deletion/Logout Lifecycle, and Recovery
test('Session Teardown & Deletion Request Lifecycle', async (t) => {
  // Mock In-Memory State
  let sessionEpoch = 0;
  let isSessionTerminated = false;
  let isTeardownSuspended = false;
  let inFlightRefreshPromise = null;
  let storageTokens = {
    accessToken: 'initial_access_token_123',
    refreshToken: 'initial_refresh_token_456',
    deviceId: 'device_test_789'
  };
  let apiClientDefaults = {
    headers: {
      common: {
        Authorization: 'Bearer initial_access_token_123'
      }
    }
  };
  let socketState = {
    connected: true,
    isIntentionalDisconnect: false,
    reconnectCount: 0,
    disconnectCount: 0
  };

  const suspendSessionForTeardown = () => {
    isTeardownSuspended = true;
    sessionEpoch += 1;
    inFlightRefreshPromise = null;
    // CRITICAL: We intentionally PRESERVE apiClientDefaults and storage tokens
    // so the outgoing delete/logout request contains the valid Bearer token!
  };

  const resumeSession = () => {
    isTeardownSuspended = false;
    isSessionTerminated = false;
    sessionEpoch += 1;
  };

  const finalizeSessionTermination = async () => {
    isSessionTerminated = true;
    isTeardownSuspended = false;
    sessionEpoch += 1;
    inFlightRefreshPromise = null;
    delete apiClientDefaults.headers.common['Authorization'];
    storageTokens = { accessToken: null, refreshToken: null, deviceId: null };
  };

  const refreshAuthToken = (mockNetworkLatencyMs = 30, mockSuccess = true) => {
    if (isSessionTerminated || isTeardownSuspended) {
      const err = new Error('Session terminated or teardown in progress');
      err.code = isSessionTerminated ? 'SESSION_TERMINATED' : 'TEARDOWN_SUSPENDED';
      return Promise.reject(err);
    }

    if (inFlightRefreshPromise) {
      return inFlightRefreshPromise;
    }

    const currentEpoch = sessionEpoch;

    inFlightRefreshPromise = (async () => {
      try {
        const storedRefreshToken = storageTokens.refreshToken;
        if (!storedRefreshToken || isSessionTerminated || isTeardownSuspended || sessionEpoch !== currentEpoch) {
          const err = new Error('No refresh token available');
          err.code = isSessionTerminated ? 'SESSION_TERMINATED' : isTeardownSuspended ? 'TEARDOWN_SUSPENDED' : 'NO_REFRESH_TOKEN';
          throw err;
        }

        await new Promise((resolve) => setTimeout(resolve, mockNetworkLatencyMs));

        if (isSessionTerminated || isTeardownSuspended || sessionEpoch !== currentEpoch) {
          return null; // Discard late refresh result
        }

        if (!mockSuccess) {
          throw new Error('401 Unauthorized');
        }

        const newAccessToken = 'new_access_token_' + currentEpoch;
        storageTokens.accessToken = newAccessToken;
        apiClientDefaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        return newAccessToken;
      } finally {
        if (sessionEpoch === currentEpoch) {
          inFlightRefreshPromise = null;
        }
      }
    })();

    return inFlightRefreshPromise;
  };

  // Mock Socket Actions
  const socketDisconnect = (isIntentional = true) => {
    if (isIntentional) {
      socketState.isIntentionalDisconnect = true;
    }
    socketState.connected = false;
    socketState.disconnectCount += 1;
  };

  const socketRestore = () => {
    socketState.isIntentionalDisconnect = false;
    if (!isSessionTerminated && !isTeardownSuspended) {
      socketState.connected = true;
      socketState.reconnectCount += 1;
    }
  };

  const handleSocketDisconnect = async (reason) => {
    socketState.connected = false;
    if (socketState.isIntentionalDisconnect || isSessionTerminated || isTeardownSuspended || !storageTokens.accessToken) {
      return; // Suppressed
    }

    if (reason === 'io server disconnect') {
      try {
        const freshToken = await refreshAuthToken(10, true);
        if (freshToken && !socketState.isIntentionalDisconnect && !isSessionTerminated && !isTeardownSuspended) {
          socketState.connected = true;
          socketState.reconnectCount += 1;
        }
      } catch (e) {
        // Suppress teardown / intentional errors
      }
    }
  };

  // Mock API Service Delete & Logout
  const mockDeleteAccountApi = async (mockBackendBehavior = 'SUCCESS') => {
    suspendSessionForTeardown();

    // Verify what headers the request carries
    const outgoingHeaders = {
      Authorization: apiClientDefaults.headers.common['Authorization'] || `Bearer ${storageTokens.accessToken}`
    };

    try {
      if (mockBackendBehavior === 'SUCCESS') {
        const responseData = { ok: true, success: true, code: 'ACCOUNT_DELETED' };
        await finalizeSessionTermination();
        return { data: responseData, outgoingHeaders };
      }

      if (mockBackendBehavior === 'ACTIVE_ORDER_EXISTS') {
        const err = new Error('Cannot delete account while an order is currently active.');
        err.code = 'ACTIVE_ORDER_EXISTS';
        err.status = 409;
        throw err;
      }

      if (mockBackendBehavior === 'NETWORK_ERROR') {
        const err = new Error('Network timeout');
        err.isNetworkError = true;
        err.code = 'NETWORK_ERROR';
        throw err;
      }
    } catch (err) {
      resumeSession();
      err.outgoingHeaders = outgoingHeaders;
      throw err;
    }
  };

  const mockLogoutApi = async () => {
    suspendSessionForTeardown();
    const outgoingHeaders = {
      Authorization: apiClientDefaults.headers.common['Authorization'] || `Bearer ${storageTokens.accessToken}`
    };
    try {
      // Simulate /auth/logout request
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      await finalizeSessionTermination();
    }
    return { ok: true, outgoingHeaders };
  };

  // --- ASSERTION 1: delete/logout requests contain the Authorization header ---
  await t.test('delete/logout requests contain the valid Bearer Authorization header', async () => {
    // Setup authenticated state
    isSessionTerminated = false;
    isTeardownSuspended = false;
    storageTokens.accessToken = 'valid_jwt_token_xyz';
    apiClientDefaults.headers.common['Authorization'] = 'Bearer valid_jwt_token_xyz';

    // Test Delete Account
    const deleteResult = await mockDeleteAccountApi('SUCCESS');
    assert.equal(
      deleteResult.outgoingHeaders.Authorization,
      'Bearer valid_jwt_token_xyz',
      'DELETE request must transmit valid Bearer token'
    );

    // Re-setup for Logout
    isSessionTerminated = false;
    isTeardownSuspended = false;
    storageTokens.accessToken = 'valid_jwt_token_logout';
    apiClientDefaults.headers.common['Authorization'] = 'Bearer valid_jwt_token_logout';

    const logoutResult = await mockLogoutApi();
    assert.equal(
      logoutResult.outgoingHeaders.Authorization,
      'Bearer valid_jwt_token_logout',
      'LOGOUT request must transmit valid Bearer token'
    );
  });

  // --- ASSERTION 2: ACTIVE_ORDER_EXISTS preserves the usable session ---
  await t.test('ACTIVE_ORDER_EXISTS rejection preserves the usable session and restores socket', async () => {
    // Setup authenticated state
    isSessionTerminated = false;
    isTeardownSuspended = false;
    storageTokens.accessToken = 'customer_token_active';
    storageTokens.refreshToken = 'customer_refresh_active';
    apiClientDefaults.headers.common['Authorization'] = 'Bearer customer_token_active';
    socketState.connected = true;
    socketState.isIntentionalDisconnect = false;

    // Simulate user clicking Delete Account
    socketDisconnect(true);
    assert.equal(socketState.connected, false);
    assert.equal(socketState.isIntentionalDisconnect, true);

    // Call deleteAccount which gets rejected due to active orders
    let caughtError = null;
    try {
      await mockDeleteAccountApi('ACTIVE_ORDER_EXISTS');
    } catch (e) {
      caughtError = e;
      // ProfileWalletScreen recovery handler:
      socketRestore();
    }

    assert.ok(caughtError, 'Should throw rejection error');
    assert.equal(caughtError.code, 'ACTIVE_ORDER_EXISTS');
    assert.equal(caughtError.outgoingHeaders.Authorization, 'Bearer customer_token_active');

    // VERIFY SESSION IS FULLY USABLE
    assert.equal(isSessionTerminated, false, 'Session must not be terminated');
    assert.equal(isTeardownSuspended, false, 'Teardown must be resumed/aborted');
    assert.equal(storageTokens.accessToken, 'customer_token_active', 'Access token preserved in storage');
    assert.equal(storageTokens.refreshToken, 'customer_refresh_active', 'Refresh token preserved in storage');
    assert.equal(apiClientDefaults.headers.common['Authorization'], 'Bearer customer_token_active', 'Header preserved');

    // VERIFY SOCKET IS RESTORED
    assert.equal(socketState.isIntentionalDisconnect, false, 'Intentional disconnect flag cleared');
    assert.equal(socketState.connected, true, 'Socket connection restored');

    // VERIFY REFRESH AND RECONNECT STILL WORK ON FUTURE SERVER DISCONNECT
    await handleSocketDisconnect('io server disconnect');
    assert.equal(socketState.connected, true, 'Socket reconnected on server token refresh');
  });

  // --- ASSERTION 3: Ambiguous network failure preserves safe retry behavior ---
  await t.test('Ambiguous network failure preserves credentials and allows safe retry', async () => {
    isSessionTerminated = false;
    isTeardownSuspended = false;
    storageTokens.accessToken = 'retry_token_abc';
    apiClientDefaults.headers.common['Authorization'] = 'Bearer retry_token_abc';

    // 1st attempt fails with Network Timeout
    let networkErr = null;
    try {
      await mockDeleteAccountApi('NETWORK_ERROR');
    } catch (e) {
      networkErr = e;
      socketRestore();
    }

    assert.ok(networkErr);
    assert.equal(networkErr.isNetworkError, true);
    assert.equal(isSessionTerminated, false, 'Must not finalize termination on network failure');
    assert.equal(storageTokens.accessToken, 'retry_token_abc', 'Tokens preserved for retry');

    // 2nd attempt (Retry) succeeds
    const retryResult = await mockDeleteAccountApi('SUCCESS');
    assert.equal(retryResult.outgoingHeaders.Authorization, 'Bearer retry_token_abc');
    assert.equal(retryResult.data.code, 'ACCOUNT_DELETED');
    assert.equal(isSessionTerminated, true, 'Now permanently terminated');
  });

  // --- ASSERTION 4: Successful deletion prevents reconnect and late token restoration ---
  await t.test('Successful deletion prevents socket reconnect and discards late in-flight token refresh', async () => {
    // Setup active session
    isSessionTerminated = false;
    isTeardownSuspended = false;
    storageTokens.accessToken = 'pre_delete_token';
    storageTokens.refreshToken = 'pre_delete_refresh';
    apiClientDefaults.headers.common['Authorization'] = 'Bearer pre_delete_token';
    socketState.connected = true;
    socketState.isIntentionalDisconnect = false;

    // 1. Launch a background in-flight token refresh (50ms latency)
    const lateRefreshPromise = refreshAuthToken(50, true);

    // 2. Mid-flight, user deletes account successfully
    socketDisconnect(true);
    const deleteResult = await mockDeleteAccountApi('SUCCESS');
    assert.equal(deleteResult.data.code, 'ACCOUNT_DELETED');

    // Session is terminated and credentials wiped
    assert.equal(isSessionTerminated, true);
    assert.equal(storageTokens.accessToken, null);
    assert.equal(apiClientDefaults.headers.common['Authorization'], undefined);

    // 3. Await late in-flight refresh response
    const lateTokenResult = await lateRefreshPromise;

    // Late token must be discarded (null) and MUST NOT restore tokens or headers
    assert.equal(lateTokenResult, null, 'In-flight refresh response must be discarded');
    assert.equal(storageTokens.accessToken, null, 'Late refresh must NOT restore token to storage');
    assert.equal(apiClientDefaults.headers.common['Authorization'], undefined, 'Late refresh must NOT restore Authorization header');

    // 4. Server fires disconnect on socket
    const initialReconnectCount = socketState.reconnectCount;
    await handleSocketDisconnect('io server disconnect');

    assert.equal(socketState.connected, false, 'Socket must remain disconnected');
    assert.equal(socketState.reconnectCount, initialReconnectCount, 'Socket must NOT attempt reconnection');
  });
});
