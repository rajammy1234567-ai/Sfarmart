import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import storage from '../services/storage';
import { refreshAuthToken, isCurrentSessionTerminated, isSessionTeardownSuspended } from '../services/api';

import { API_BASE_URL } from '../config/env';

const SOCKET_SERVER_URL = API_BASE_URL
  ? API_BASE_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

const SocketContext = createContext();

export const SocketProvider = ({ children, token, userId }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeOrderUpdate, setActiveOrderUpdate] = useState(null);
  const [riderLocationUpdate, setRiderLocationUpdate] = useState(null);
  const [productStockUpdate, setProductStockUpdate] = useState(null);
  const socketRef = useRef(null);
  const trackedOrderRef=useRef(null);
  const isIntentionalDisconnectRef = useRef(false);

  const [reconnectCount, setReconnectCount] = useState(0);

  const disconnectSocket = useCallback((isIntentional = true) => {
    if (isIntentional) {
      isIntentionalDisconnectRef.current = true;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  }, []);

  const restoreSocket = useCallback(() => {
    isIntentionalDisconnectRef.current = false;
    if (socketRef.current && !isCurrentSessionTerminated() && !isSessionTeardownSuspended()) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
    }
  }, []);

  useEffect(() => {
    setActiveOrderUpdate(null);
    setRiderLocationUpdate(null);
    setIsConnected(false);

    if (token) {
      isIntentionalDisconnectRef.current = false;
    }

    try {
      const socket = io(SOCKET_SERVER_URL, {
        auth: async (cb) => {
          try {
            if (isIntentionalDisconnectRef.current || isCurrentSessionTerminated() || isSessionTeardownSuspended()) {
              cb({ token: null });
              return;
            }
            const tok = await storage.getAccessToken();
            cb({ token: tok });
          } catch {
            cb({ token: null });
          }
        },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 15,
        reconnectionDelay: 2000
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('⚡ Customer Socket connected:', socket.id);
        setIsConnected(true);
        setReconnectCount((c) => c + 1);

        if (trackedOrderRef.current) {
          socket.emit('join:order', trackedOrderRef.current, (ack) => {
            if (ack && !ack.ok) {
              console.warn('⚡ [CustomerSocket] Room join denied for order:', trackedOrderRef.current);
            } else if (ack?.snapshot?.riderLocation) {
              setRiderLocationUpdate({
                orderId: trackedOrderRef.current,
                riderId: ack.snapshot.rider?._id || ack.snapshot.rider,
                lat: ack.snapshot.riderLocation.lat,
                lng: ack.snapshot.riderLocation.lng,
                heading: ack.snapshot.riderLocation.heading || 0,
                speed: ack.snapshot.riderLocation.speed || 0,
                at: ack.snapshot.riderLocation.at || new Date().toISOString(),
                isSnapshot: true,
                deliveryRoute: ack.snapshot.deliveryRoute
              });
            }
          });
        }
        if (userId) {
          socket.emit('join:customer', userId);
        }
      });

      socket.on('disconnect', async (reason) => {
        console.log('🔌 Customer Socket disconnected:', reason);
        setIsConnected(false);

        // Intentional logout/deletion or teardown suspension check
        if (
          isIntentionalDisconnectRef.current ||
          isCurrentSessionTerminated() ||
          isSessionTeardownSuspended() ||
          !token
        ) {
          console.log('⚡ [CustomerSocket] Intentional disconnect/teardown in progress; skipping refresh and reconnect.');
          return;
        }

        if (reason === 'io server disconnect') {
          // Server explicitly disconnected us (e.g. token expired or kicked).
          // Do NOT blindly reconnect with the old expired token! Use the single-flight refresh mutex.
          try {
            const storedRefreshToken = await storage.getRefreshToken();
            if (
              !storedRefreshToken ||
              isIntentionalDisconnectRef.current ||
              isCurrentSessionTerminated() ||
              isSessionTeardownSuspended()
            ) {
              console.log('⚡ [CustomerSocket] No refresh token or session terminated/suspended; skipping refresh.');
              return;
            }

            console.log('⚡ [CustomerSocket] Disconnected by server. Executing single-flight token refresh...');
            const freshAccessToken = await refreshAuthToken();
            if (
              freshAccessToken &&
              !isIntentionalDisconnectRef.current &&
              !isCurrentSessionTerminated() &&
              !isSessionTeardownSuspended()
            ) {
              console.log('⚡ [CustomerSocket] Token refreshed successfully via single-flight mutex. Reconnecting socket...');
              socket.connect();
            }
          } catch (e) {
            if (
              isIntentionalDisconnectRef.current ||
              isCurrentSessionTerminated() ||
              isSessionTeardownSuspended() ||
              e?.code === 'SESSION_TERMINATED' ||
              e?.code === 'TEARDOWN_SUSPENDED' ||
              e?.code === 'NO_REFRESH_TOKEN'
            ) {
              return;
            }
            console.warn('⚡ [CustomerSocket] Single-flight refresh failed on disconnect:', e.message || e);
          }
        }
      });

      socket.on('order:status', (data) => {
        console.log('📦 Live order status update received:', data);
        setActiveOrderUpdate(data);
      });

      socket.on('order:rider_location', (data) => {
        setRiderLocationUpdate(data);
      });

      socket.on('product:stock', (data) => {
        console.log('⚡ Live product:stock update received:', data);
        setProductStockUpdate(data);
      });

      return () => {
        isIntentionalDisconnectRef.current = true;
        socket.disconnect();
      };
    } catch (e) {
      console.warn('Socket client init failed:', e);
    }
  }, [token, userId]);

  const trackOrder = useCallback((orderId) => {
    if (!orderId) return;
    const strId = String(orderId);
    if (trackedOrderRef.current === strId) {
      return;
    }
    if (trackedOrderRef.current && trackedOrderRef.current !== strId) {
      socketRef.current?.emit('leave:order', trackedOrderRef.current);
    }
    trackedOrderRef.current = strId;
    setRiderLocationUpdate(null);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join:order', strId, (ack) => {
        if (ack?.snapshot?.riderLocation) {
          setRiderLocationUpdate({
            orderId: strId,
            riderId: ack.snapshot.rider?._id || ack.snapshot.rider,
            lat: ack.snapshot.riderLocation.lat,
            lng: ack.snapshot.riderLocation.lng,
            heading: ack.snapshot.riderLocation.heading || 0,
            speed: ack.snapshot.riderLocation.speed || 0,
            at: ack.snapshot.riderLocation.at || new Date().toISOString(),
            isSnapshot: true,
            deliveryRoute: ack.snapshot.deliveryRoute
          });
        }
      });
      console.log('Joined live order tracking:', strId);
    }
  }, []);

  // Expose a leaveOrder helper for cleanup, optionally specifying the orderId to leave
  const leaveOrder = useCallback((orderId) => {
    const targetId = orderId ? String(orderId) : trackedOrderRef.current;
    if (targetId && trackedOrderRef.current === targetId) {
      socketRef.current?.emit('leave:order', targetId);
      console.log('Left live order tracking:', targetId);
      trackedOrderRef.current = null;
      setRiderLocationUpdate(null);
    }
  }, []);

  const contextValue = useMemo(() => ({
    isConnected,
    reconnectCount,
    activeOrderUpdate,
    riderLocationUpdate,
    productStockUpdate,
    trackOrder,
    leaveOrder,
    disconnectSocket,
    restoreSocket
  }), [
    isConnected,
    reconnectCount,
    activeOrderUpdate,
    riderLocationUpdate,
    productStockUpdate,
    trackOrder,
    leaveOrder,
    disconnectSocket,
    restoreSocket
  ]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export const useCustomerSocket = () => useContext(SocketContext);
