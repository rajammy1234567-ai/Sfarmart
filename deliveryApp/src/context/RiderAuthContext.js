import {sendCurrentLocation,startBackgroundLocation,stopBackgroundLocation} from '../services/location';
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import storage from '../services/storage';
import { riderApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const RiderAuthContext = createContext();

export const RiderAuthProvider = ({ children }) => {
  const [rider, setRider] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore authenticated session from persistent storage on boot
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedRider = await storage.getRider();
        const token = await storage.getToken();

        if (storedRider && token) {
          setRider(storedRider);
          // Connect socket in background
          connectSocket();

          // Refresh fresh profile from server in background
          riderApi
            .getProfile()
            .then((res) => {
              if (res.data?.success && res.data?.rider) {
                setRider(res.data.rider);
                storage.setRider(res.data.rider);
              }
            })
            .catch((e) => {
              console.warn('[RiderAuth] Profile refresh error:', e.message);
            });
        }
      } catch (err) {
        console.warn('[RiderAuth] Session restore error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (phone, password) => {
    const res = await riderApi.login(phone, password);
    const { token, refreshToken, rider: riderData } = res.data;

    disconnectSocket();
    await stopBackgroundLocation().catch(()=>{});
    await storage.setToken(token);
    if (refreshToken) await storage.setRefreshToken(refreshToken);
    await storage.setRider(riderData);

    setRider(riderData);
    await connectSocket();
    return riderData;
  };

  const logout = async () => {
    try {
      await riderApi.logout();
    } catch {
      // Ignore network errors on logout
    }
    await stopBackgroundLocation().catch(()=>{});
    await storage.clearAuth();
    disconnectSocket();
    setRider(null);
  };

  const toggleDutyStatus = async () => {
    if (!rider) return;
    const targetStatus = rider.status === 'OFFLINE' ? 'ONLINE_IDLE' : 'OFFLINE';
    try {
      if(targetStatus==='ONLINE_IDLE')await sendCurrentLocation();
      const res = await riderApi.toggleDuty(targetStatus);
      if (res.data?.success) {
        const updated = { ...rider, status: res.data.status };
        setRider(updated);
        await storage.setRider(updated);
        if(targetStatus==='ONLINE_IDLE')await startBackgroundLocation().catch(()=>false);
        else await stopBackgroundLocation().catch(()=>{});
        return updated;
      }
    } catch (err) {
      console.warn('[RiderAuth] Error toggling duty:', err.message);
      throw err;
    }
  };

  const updateRiderProfile = useCallback(async (fields) => {
    setRider((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...fields };
      storage.setRider(updated);
      return updated;
    });
  }, []);

  return (
    <RiderAuthContext.Provider
      value={{
        rider,
        isAuthenticated: !!rider,
        isLoading,
        login,
        logout,
        toggleDutyStatus,
        updateRiderProfile
      }}
    >
      {children}
    </RiderAuthContext.Provider>
  );
};

export const useRiderAuth = () => {
  const context = useContext(RiderAuthContext);
  if (!context) {
    throw new Error('useRiderAuth must be used within a RiderAuthProvider');
  }
  return context;
};

export default RiderAuthContext;
