import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { apiService } from '../../services/api';

export const RazorpayCheckoutWebView = ({ route, navigation }) => {
  const { orderId, onSuccess, onFailure } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!orderId) {
        Alert.alert('Payment Init Failed', 'Order ID is missing.');
        setLoading(false);
        navigation.goBack();
        if (onFailure) onFailure();
        return;
      }
      try {
        const data = await apiService.createPaymentOrder(orderId);
        if (!data.success) {
          throw new Error(data.message || 'Could not start payment');
        }
        setOrderDetails(data);
      } catch (e) {
        Alert.alert('Payment Init Failed', e?.message || 'Unable to start payment.');
        navigation.goBack();
        if (onFailure) onFailure();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [orderId]);

  if (loading || !orderDetails) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ flex: 1, justifyContent: 'center' }}
        />
      </SafeAreaView>
    );
  }

  const razorpayHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { background-color: #ffffff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif;}
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #16a34a; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            p { margin-top: 20px; color: #64748b; font-size: 14px; }
            .container { text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="loader"></div>
            <p>Initializing Secure Payment...</p>
        </div>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <script>
            var options = {
                "key": "${orderDetails.key_id}",
                "amount": "${orderDetails.amount}",
                "currency": "INR",
                "name": "S-farmart",
                "description": "Order Payment",
                "order_id": "${orderDetails.razorpay_order_id}",
                "handler": function (response) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    event: 'success',
                    data: {
                      razorpay_payment_id: response.razorpay_payment_id,
                      razorpay_order_id: response.razorpay_order_id,
                      razorpay_signature: response.razorpay_signature
                    }
                  }));
                },
                "modal": {
                    "ondismiss": function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'dismissed' }));
                    }
                },
                "theme": {
                    "color": "#16a34a"
                }
            };
            var rzp1 = new Razorpay(options);
            
            // Auto open the checkout
            setTimeout(function() {
                rzp1.open();
            }, 1000);
            
        </script>
    </body>
    </html>
  `;

  const handleMessage = (event) => {
    try {
      const parsedData = JSON.parse(event.nativeEvent.data);

      if (parsedData.event === 'success') {
        navigation.goBack();
        if (onSuccess) onSuccess(parsedData.data);
      } else if (parsedData.event === 'dismissed') {
        navigation.goBack();
        if (onFailure) onFailure();
      }
    } catch (error) {
      console.error('Failed to parse Razorpay response:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => { navigation.goBack(); if(onFailure) onFailure(); }}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <WebView
        source={{ html: razorpayHtml }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center'
  }
});
