import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import storage from '../services/storage';
import { useApp } from '../context/AppContext';
import { AuthModal } from '../components/AuthModal';

const PENDING_INTENT_KEY = 'pending_intent';
const PENDING_INTENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const INTENT_COPY_MAP = {
  CHECKOUT: {
    title: 'Order place karne ke liye login karein',
    subtitle: 'Aapka cart surakshit hai. Login ke baad seedha checkout hoga.'
  },
  ORDERS: {
    title: 'Apne orders dekhne ke liye login karein',
    subtitle: 'Apne saare purane aur live orders ka hisaab dekhein.'
  },
  TRACKING: {
    title: 'Delivery track karne ke liye login karein',
    subtitle: 'Live order status aur delivery partner ki location dekhein.'
  },
  WALLET: {
    title: 'Wallet balance ke liye login karein',
    subtitle: 'Apne Farmart wallet se 1-click payment karein.'
  },
  ADDRESS: {
    title: 'Address save karne ke liye login karein',
    subtitle: 'Apna delivery address permanently save karein.'
  },
  REVIEW: {
    title: 'Review likhne ke liye login karein',
    subtitle: 'Apna feedback share karne ke liye login zaroori hai.'
  },
  FAVOURITES: {
    title: 'Favourites save karne ke liye login karein',
    subtitle: 'Apne manpasand items ko baad ke liye save karein.'
  },
  REORDER: {
    title: 'Dobara order karne ke liye login karein',
    subtitle: 'Pichle order ko 1-tap me repeat karein.'
  },
  DEFAULT: {
    title: 'Aage badhne ke liye login karein',
    subtitle: 'S-farmart 24 ki sabhi services use karne ke liye login karein.'
  }
};

const AuthGateContext = createContext();

export const AuthGateProvider = ({ children }) => {
  const { isAuthenticated } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingIntent, setPendingIntent] = useState(null);
  const [pendingCallback, setPendingCallback] = useState(null);

  // Restore pending intent on mount
  useEffect(() => {
    const loadIntent = async () => {
      try {
        const raw = await storage.getItem(PENDING_INTENT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - (parsed.at || 0) < PENDING_INTENT_TTL_MS) {
            setPendingIntent(parsed);
          } else {
            await storage.removeItem(PENDING_INTENT_KEY);
          }
        }
      } catch (e) {
        console.warn('Could not load pending intent:', e);
      }
    };
    loadIntent();
  }, []);

  // Save intent to storage
  const savePendingIntent = useCallback(async (intent) => {
    try {
      const intentWithTime = { ...intent, at: Date.now() };
      setPendingIntent(intentWithTime);
      await storage.setItem(PENDING_INTENT_KEY, JSON.stringify(intentWithTime));
    } catch (e) {
      console.warn('Could not save pending intent:', e);
    }
  }, []);

  // Clear intent from storage
  const clearPendingIntent = useCallback(async () => {
    try {
      setPendingIntent(null);
      setPendingCallback(null);
      await storage.removeItem(PENDING_INTENT_KEY);
    } catch (e) {
      console.warn('Could not clear pending intent:', e);
    }
  }, []);

  // Primary gate function
  const requireLogin = useCallback(
    async (intent = { type: 'DEFAULT' }, callback = null) => {
      if (isAuthenticated) {
        if (callback) callback();
        return true;
      }

      // Guest: Store intent & open contextual modal
      await savePendingIntent(intent);
      if (callback) {
        setPendingCallback(() => callback);
      }
      setModalVisible(true);
      return false;
    },
    [isAuthenticated, savePendingIntent]
  );

  // Resume intent after login
  const resumePendingIntent = useCallback(
    (onResumed) => {
      if (pendingCallback) {
        pendingCallback();
      }
      if (onResumed && pendingIntent) {
        onResumed(pendingIntent);
      }
      clearPendingIntent();
    },
    [pendingCallback, pendingIntent, clearPendingIntent]
  );

  const handleModalClose = () => {
    setModalVisible(false);
    // Keep pending intent intact for 15 mins in case they re-open, but dismiss modal
  };

  const handleModalSuccess = async (user) => {
    setModalVisible(false);
    // Resume callback
    if (pendingCallback) {
      pendingCallback();
    }
    await clearPendingIntent();
  };

  const intentType = pendingIntent?.type || 'DEFAULT';
  const copyConfig = INTENT_COPY_MAP[intentType] || INTENT_COPY_MAP.DEFAULT;

  return (
    <AuthGateContext.Provider
      value={{
        requireLogin,
        resumePendingIntent,
        clearPendingIntent,
        pendingIntent,
        isAuthModalVisible: modalVisible
      }}
    >
      {children}
      <AuthModal
        visible={modalVisible}
        title={copyConfig.title}
        subtitle={copyConfig.subtitle}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </AuthGateContext.Provider>
  );
};

export const useAuthGate = () => {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error('useAuthGate must be used within an AuthGateProvider');
  }
  return ctx;
};

export default useAuthGate;
