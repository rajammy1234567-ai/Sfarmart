import * as Location from 'expo-location';
import {locationPayload} from '../services/location';
import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { useRiderAuth } from './RiderAuthContext';
import { riderApi } from '../services/api';
import { getSocket, connectSocket, disconnectSocket } from '../services/socket';
import storage from '../services/storage';

const DeliveryContext = createContext();

export const DeliveryProvider = ({ children }) => {
  const { rider, isAuthenticated, updateRiderProfile, logout } = useRiderAuth();
  const [currentTask, setCurrentTask] = useState(null);
  const [pendingOffer, setPendingOffer] = useState(null);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [earnings, setEarnings] = useState({
    todayEarnings: 0,
    totalEarnings: 0,
    completedCount: 0,
    recentTrips: []
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentCoords,setCurrentCoords]=useState(null);
  const [locationError,setLocationError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
useEffect(() => {
  (async () => {
    try {
      const token = await storage.getToken();
      const refresh = await storage.getRefreshToken?.();
      if (!token || !refresh) {
        await logout();
      }
    } catch (e) {
      console.warn('[DeliveryContext] Token guard error:', e.message);
    }
  })();
}, []);
  // Fetch active order and earnings
  const refreshActiveOrder = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await riderApi.getActiveOrder();
      if (!alive.current) return;
      if (res.data?.success && res.data?.hasActiveOrder) {
        setCurrentTask(res.data.order);
      } else {
        setCurrentTask(null);
      }
    } catch (err) {
      console.warn('[DeliveryContext] Active order fetch error:', err.message);
      if (err.response?.status === 401 || err.message?.includes('No refresh token')) {
        logout();
      }
    }
  }, [isAuthenticated, logout]);

  const refreshEarnings = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await riderApi.getEarnings();
      if (!alive.current) return;
      if (res.data?.success) {
        setEarnings({
          todayEarnings: res.data.todayEarnings || 0,
          totalEarnings: res.data.totalEarnings || 0,
          completedCount: res.data.completedCount || 0,
          recentTrips: res.data.recentTrips || []
        });
      }
    } catch (err) {
      console.warn('[DeliveryContext] Earnings fetch error:', err.message);
      if (err.response?.status === 401 || err.message?.includes('No refresh token')) {
        logout();
      }
    }
  }, [isAuthenticated, logout]);

  const fetchAvailablePool = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await riderApi.getPendingDeliveryOrders();
      if (!alive.current) return;
      if (res.data?.success && Array.isArray(res.data.orders)) {
        setAvailableOrders(res.data.orders);
      }
    } catch (err) {
      // Ignore pool error but handle auth issues
      if (err.response?.status === 401 || err.message?.includes('No refresh token')) {
        logout();
      }
    }
  }, [isAuthenticated, logout]);

  // Initial load on authentication
  useEffect(() => {
    if (isAuthenticated) {
      refreshActiveOrder();
      refreshEarnings();
      fetchAvailablePool();

      const pollInterval = setInterval(() => {
        refreshActiveOrder();
        fetchAvailablePool();
      }, 12000);

      return () => clearInterval(pollInterval);
    } else {
      // Cleanup on unauthenticated: clear state and disconnect socket
      setCurrentTask(null);
      setPendingOffer(null);
      setAvailableOrders([]);
      disconnectSocket();
    }
  }, [isAuthenticated, refreshActiveOrder, refreshEarnings, fetchAvailablePool]);

  // WebSocket event listeners for order:offer and order:status_updated
  useEffect(() => {
    if (!isAuthenticated) return;

    let cleanup = null;

    connectSocket().then((socket) => {
      if (!socket || !alive.current) return;

      const handleOffer = (offer) => {
        console.log('🔔 [DeliveryContext] Incoming order offer received:', offer);
        setPendingOffer(offer);
      };

      const handleStatus = (updatedOrder) => {
        console.log('📦 [DeliveryContext] Order status update received:', updatedOrder);
        if (currentTask && currentTask.id === updatedOrder._id) {
          setCurrentTask((prev) => (prev ? { ...prev, status: updatedOrder.status } : null));
        }
        refreshActiveOrder();
        fetchAvailablePool();
      };

      socket.on('order:offer', handleOffer);
      socket.on('order:status_updated', handleStatus);
      socket.on('order:status', handleStatus);

      cleanup = () => {
        socket.off('order:offer', handleOffer);
        socket.off('order:status_updated', handleStatus);
        socket.off('order:status', handleStatus);
      };
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isAuthenticated, currentTask, refreshActiveOrder, fetchAvailablePool]);

  useEffect(()=>{
    if(!isAuthenticated || rider?.status==='OFFLINE')return;
    let cancelled=false,watch,lastSent=0,sending=false;
    const start=async()=>{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(cancelled)return;
      if(permission.status!=='granted')throw new Error('Allow location access to share your live position.');
      watch=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:5000,distanceInterval:5},async position=>{
        if(cancelled)return;
        try{
          const fix=locationPayload(position);setCurrentCoords(fix);
          if(sending || Date.now()-lastSent<3000)return;
          sending=true;lastSent=Date.now();
          await riderApi.sendLocation(fix);
          if(!cancelled)setLocationError('');
        }catch(e){if(!cancelled)setLocationError(e.response?.data?.message || e.message);}
        finally{sending=false;}
      },reason=>{if(!cancelled)setLocationError(String(reason));});
      if(cancelled)watch.remove();
    };
    start().catch(e=>{if(!cancelled)setLocationError(e.message);});
    return()=>{cancelled=true;watch?.remove();};
  },[isAuthenticated,rider?._id,rider?.status]);

  // Rider Actions
  const acceptOffer = async (orderId) => {
    try {
      const res = await riderApi.acceptOffer(orderId);
      if (!alive.current) return;
      if (res.data?.success) {
        setPendingOffer(null);
        await refreshActiveOrder();
        updateRiderProfile({ status: 'ON_DELIVERY' });
        return { success: true };
      }
      return { success: false, message: res.data?.message };
    } catch (err) {
      if (err.response?.status === 401) {
        // Auth error – force logout to stop auth loops
        logout();
      }
      return { success: false, message: err.response?.data?.message || err.message };
    }
  };

  const declineOffer = async (orderId) => {
    try {
      await riderApi.declineOffer(orderId);
      setPendingOffer(null);
      return { success: true };
    } catch (err) {
      setPendingOffer(null);
      return { success: false, message: err.message };
    }
  };

  const markArrivedAtStore = async (orderId) => {
    try {
      const res = await riderApi.arrivedAtStore(orderId);
      if (!alive.current) return;
      if (res.data?.success) {
        setCurrentTask((prev) => (prev ? { ...prev, status: 'RIDER_ARRIVED_STORE' } : null));
        return { success: true };
      }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message };
    }
  };

  const verifyPickup = async (orderId, pickupOtp) => {
    try {
      const res = await riderApi.verifyPickup(orderId, pickupOtp);
      if (!alive.current) return;
      if (res.data?.success) {
        setCurrentTask((prev) => (prev ? { ...prev, status: 'OUT_FOR_DELIVERY' } : null));
        return { success: true };
      }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message };
    }
  };

  const verifyDelivery = async (orderId, deliveryOtp) => {
    try {
      const res = await riderApi.verifyDelivery(orderId, deliveryOtp);
      if (!alive.current) return;
      if (res.data?.success) {
        setCurrentTask(null);
        await refreshEarnings();
        updateRiderProfile({ status: 'ONLINE_IDLE' });
        return { success: true, earnedAmount: res.data?.earnedAmount || 65 };
      }
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message };
    }
  };

  return (
    <DeliveryContext.Provider
      value={{
        currentTask,
        pendingOffer,
        availableOrders,
        earnings,
        isRefreshing,
        currentCoords,
        locationError,
        acceptOffer,
        declineOffer,
        markArrivedAtStore,
        verifyPickup,
        verifyDelivery,
        refreshActiveOrder,
        refreshEarnings,
        fetchAvailablePool,
        clearPendingOffer: () => setPendingOffer(null)
      }}
    >
      {children}
    </DeliveryContext.Provider>
  );
};

export const useDelivery = () => {
  const context = useContext(DeliveryContext);
  if (!context) {
    throw new Error('useDelivery must be used within a DeliveryProvider');
  }
  return context;
};

export default DeliveryContext;
