import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { apiService, setAuthToken, setForceLogoutHandler, setTokenChangedHandler, terminateSession, finalizeSessionTermination, initializeSession } from '../services/api';
import storage from '../services/storage';
import { showAlert } from '../utils/alert';

const AppContext = createContext();

const INITIAL_FARMER_LISTINGS = [
  {
    id: 'fl-1',
    cropName: 'Organic Red Vine Tomatoes',
    quantity: '250 kg',
    expectedPrice: 35,
    status: 'ACTIVE_LISTING',
    hubAssigned: 'Tarn Taran Village Hub'
  },
  {
    id: 'fl-2',
    cropName: 'Fresh Punjab Green Spinach (Palak)',
    quantity: '120 kg',
    expectedPrice: 22,
    status: 'PROCURED',
    hubAssigned: 'Model Town Hub'
  },
  {
    id: 'fl-3',
    cropName: 'Kinnow Mandarin Citrus',
    quantity: '500 kg',
    expectedPrice: 65,
    status: 'IN_TRANSIT',
    hubAssigned: 'Abohar Hub'
  }
];

export const AppProvider = ({ children }) => {
  const [activeRole, setActiveRole] = useState('customer');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [token, setToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Farmer portal listings state
  const [farmerListings, setFarmerListings] = useState(INITIAL_FARMER_LISTINGS);

  const addFarmerListing = useCallback((newListing) => {
    setFarmerListings((prev) => [
      {
        id: `fl-${Date.now()}`,
        status: 'SUBMITTED',
        hubAssigned: 'Ludhiana Central Hub',
        ...newListing
      },
      ...prev
    ]);
  }, []);

  // Shared force logout helper (for session expiry)
  const forceLogout = useCallback(async (reason = 'Session expired. Please login again.') => {
    await finalizeSessionTermination();
    setAuthToken(null);
    setToken(null);
    setUserProfile(null);
    setIsAuthenticated(false);
    if (reason) {
      setTimeout(() => {
        showAlert('Logged Out', reason);
      }, 100);
    }
  }, []);

  // Register force logout with api client interceptor
  useEffect(() => {
    setForceLogoutHandler(forceLogout);
    setTokenChangedHandler(setToken);
    return()=>{setForceLogoutHandler(null);setTokenChangedHandler(null);};
  }, [forceLogout]);

  // Fetch fresh profile from /api/auth/me
  const refreshUser = useCallback(async () => {
    try {
      const res = await apiService.getMe();
      if (res && res.success && res.user) {
        setUserProfile(res.user);
        setIsAuthenticated(true);
        return res.user;
      }
    } catch (err) {
      console.warn('refreshUser failed:', err);
    }
    return null;
  }, []);

  // Update profile
  const updateProfile = useCallback(async (data) => {
    try {
      const res = await apiService.updateProfile(data);
      if (res && res.success && res.user) {
        setUserProfile(res.user);
        return { success: true, user: res.user };
      }
      return { success: false, message: res?.message || 'Update failed' };
    } catch (err) {
      return { success: false, message: err.message || 'Update failed' };
    }
  }, []);

  // Login method
  const loginUser = useCallback(async (userOrPhone, password) => {
    initializeSession();
    if (typeof userOrPhone === 'object' && userOrPhone !== null) {
      const accessToken=await storage.getAccessToken();
      if(!accessToken)return null;
      setToken(accessToken);setAuthToken(accessToken);
      setUserProfile(userOrPhone);
      setIsAuthenticated(true);
      return userOrPhone;
    }

    try {
      const res = await apiService.customerLogin(userOrPhone, password);
      if (res && (res.success || res.ok) && res.user) {
        setUserProfile(res.user);
        const tok = res.accessToken || res.token;
        if (tok) {
          setToken(tok);
          setAuthToken(tok);
        }
        setIsAuthenticated(true);
        return res.user;
      }
      return null;
    } catch (e) {
      console.warn('Customer login API error:', e);
      return null;
    }
  }, []);

  // Explicit User Logout
  const logoutUser = useCallback(async () => {
    try {
      await apiService.logout();
    } catch (e) {
      console.warn('Logout API error:', e);
    } finally {
      await finalizeSessionTermination();
      setAuthToken(null);
      setToken(null);
      setUserProfile(null);
      setIsAuthenticated(false);
    }
  }, []);

  // App Bootstrapping: Restore session from storage & call /api/auth/me
  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        const storedAccessToken = await storage.getAccessToken();
        const storedRefreshToken = await storage.getRefreshToken();

        if (storedAccessToken || storedRefreshToken) {
          initializeSession();
          if (storedAccessToken) {
            setAuthToken(storedAccessToken);
            setToken(storedAccessToken);
          }
          const profile = await refreshUser();
          if (profile) {
            setIsAuthenticated(true);
            return;
          }
          // No valid session stored -> Stay unauthenticated for Guest Browsing (FLOW 3)
          terminateSession();
          setIsAuthenticated(false);
        } else {
          terminateSession();
        }
      } catch (err) {
        console.warn('Session bootstrap error:', err);
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrapSession();
  }, [loginUser, refreshUser]);

  return (
    <AppContext.Provider
      value={{
        activeRole,
        setActiveRole,
        isRoleModalOpen,
        setIsRoleModalOpen,
        isAuthenticated,
        isBootstrapping,
        user: userProfile,
        userProfile,
        setUserProfile,
        token,
        login: loginUser,
        loginUser,
        logout: logoutUser,
        logoutUser,
        forceLogout,
        refreshUser,
        updateProfile,
        farmerListings,
        addFarmerListing
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
export default AppContext;
