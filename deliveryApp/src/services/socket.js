import { Platform } from 'react-native';
import storage from './storage';

let socket = null;
let connecting = null;
let generation = 0;
let ioModule = null;

// Dynamically import socket.io-client to prevent web bundler crashes if resolving
const getIO = () => {
  if (ioModule) return ioModule;
  try {
    ioModule = require('socket.io-client');
    return ioModule.default || ioModule;
  } catch (e) {
    console.warn('[delivery:socket] socket.io-client not loaded yet:', e.message);
    return null;
  }
};

export const getSocketUrl = () => {
  if(process.env.EXPO_PUBLIC_API_URL)return process.env.EXPO_PUBLIC_API_URL.replace(/\/api\/?$/, '');
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      return `http://${window.location.hostname}:5000`;
    }
    return process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://farm-mart-api.onrender.com';
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace('/api', '');
  }

  if (!__DEV__) {
    return 'https://farm-mart-api.onrender.com';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return 'http://localhost:5000';
};

export const connectSocket = () => {
  if (socket) return Promise.resolve(socket);
  if (connecting) return connecting;
  const epoch = generation;
  const pending = openSocket(epoch).finally(() => { if (connecting === pending) connecting = null; });
  connecting = pending;
  return pending;
};

const openSocket = async (epoch) => {
  const io = getIO();
  if (!io) return null;

  if (socket) return socket;

  const token = await storage.getToken();
  if (epoch !== generation) return null;
  if (socket) return socket;
  const url = getSocketUrl();

  // If no token is available, skip socket connection to avoid unauthenticated requests
  if (!token) {
    console.warn('[delivery:socket] No auth token found, skipping socket connection');
    return null;
  }

  socket = io(url, {
    transports: ['websocket', 'polling'],
    // Dynamically retrieve the latest token from storage on every handshake/reconnect
    auth: async (callback) => {
      try {
        const currentToken = await storage.getToken();
        callback({ token: currentToken });
      } catch {
        callback({ token: null });
      }
    },
    reconnection: true,
    reconnectionAttempts: 20,
    // Exponential backoff settings
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  const activeSocket = socket;
  let serverKicks = 0;
  socket.on('connect', () => {
    console.log(`⚡ [delivery:socket] Connected to ${url} (socket: ${socket.id})`);
  });

  socket.on('disconnect', async (reason) => {
    console.log(`🔌 [delivery:socket] Disconnected: ${reason}`);
    if (reason === 'io server disconnect') {
      if (epoch !== generation || ++serverKicks > 3) return;
      await new Promise((resolve) => setTimeout(resolve, serverKicks * 1000 + Math.floor(Math.random() * 1000)));
      if (epoch !== generation || socket !== activeSocket) return;
      // Server disconnected socket due to token expiry or kick.
      // Refresh token first before reconnecting to prevent reading an expired token.
      try {
        const { refreshRiderAuthToken } = require('./api');
        const freshToken = await refreshRiderAuthToken();
        if (freshToken && epoch === generation && socket === activeSocket) {
          console.log('⚡ [delivery:socket] Reconnecting socket with freshly refreshed rider token...');
          socket?.connect();
        }
      } catch (e) {
        console.warn('⚠️ [delivery:socket] Rider token refresh failed on disconnect:', e.message);
      }
    }
  });

  socket.on('connect_error', (err) => {
    console.warn(`⚠️ [delivery:socket] Connection error:`, err.message);
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  generation += 1;
  connecting = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default {
  connectSocket,
  getSocket,
  disconnectSocket
};
