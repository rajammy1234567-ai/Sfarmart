import { Alert, Platform } from 'react-native';

/**
 * Universal safe alert utility for S-farmart 24.
 * Works seamlessly on Web, Android (Hermes), and iOS without throwing ReferenceError.
 */
export const showAlert = (title, message = '') => {
  try {
    const safeTitle = typeof title === 'string' ? title : String(title || 'Notice');
    const safeMessage = message ? String(message) : '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log(`[Alert] ${safeTitle}: ${safeMessage}`);
      // Show non-blocking web alert after unrolling execution stack
      setTimeout(() => {
        try {
          if (typeof window.alert === 'function') {
            window.alert(safeMessage ? `${safeTitle}\n\n${safeMessage}` : safeTitle);
          }
        } catch (e) {}
      }, 50);
      return;
    }

    Alert.alert(safeTitle, safeMessage);
  } catch (err) {
    console.warn('SafeAlert fallback warning:', err);
  }
};

export default showAlert;
