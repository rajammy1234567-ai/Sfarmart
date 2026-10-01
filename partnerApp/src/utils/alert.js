import { Alert, Platform } from 'react-native';

/**
 * Universal safe alert utility for S-farmart Partner App.
 * Works seamlessly on Web, Android, and iOS without throwing ReferenceError.
 * Properly invokes button callbacks (including confirmation actions) on both Web and Native.
 */
export const showAlert = (title, message = '', buttons = []) => {
  try {
    const safeTitle = typeof title === 'string' ? title : String(title || 'Partner Alert');
    const safeMessage = message ? String(message) : '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const fullText = safeMessage ? `${safeTitle}\n\n${safeMessage}` : safeTitle;

      if (Array.isArray(buttons) && buttons.length > 0) {
        const hasCancel = buttons.some((b) => b?.style === 'cancel');
        const actionButton = buttons.find((b) => b?.style !== 'cancel') || buttons[buttons.length - 1];
        const cancelButton = buttons.find((b) => b?.style === 'cancel');

        if (hasCancel && typeof window.confirm === 'function') {
          const confirmed = window.confirm(fullText);
          if (confirmed) {
            if (typeof actionButton?.onPress === 'function') {
              actionButton.onPress();
            }
          } else if (typeof cancelButton?.onPress === 'function') {
            cancelButton.onPress();
          }
          return;
        }

        // Single button or non-cancel modal fallback
        if (typeof window.alert === 'function') {
          window.alert(fullText);
        }
        if (typeof actionButton?.onPress === 'function') {
          actionButton.onPress();
        }
        return;
      }

      if (typeof window.alert === 'function') {
        window.alert(fullText);
      }
      return;
    }

    if (Array.isArray(buttons) && buttons.length > 0) {
      Alert.alert(safeTitle, safeMessage, buttons);
    } else {
      Alert.alert(safeTitle, safeMessage);
    }
  } catch (err) {
    console.warn('SafeAlert partner fallback warning:', err);
  }
};

export default showAlert;
