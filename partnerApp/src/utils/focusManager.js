import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Safely removes focus from the currently active DOM element on Web.
 * This prevents the browser from emitting:
 * "Blocked aria-hidden on an element because its descendant retained focus."
 * when modals open or when navigating between screens.
 */
export const safeBlurActiveElement = () => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const activeEl = document.activeElement;
      if (activeEl && typeof activeEl.blur === 'function' && activeEl !== document.body) {
        activeEl.blur();
      }
    } catch {
      // Ignore errors in non-standard web environments
    }
  }
};

/**
 * Hook to manage focus lifecycle for modals on Web:
 * 1. Upon modal open: blurs background elements so the background container can be aria-hidden.
 * 2. Upon modal close: blurs any active modal descendant before the modal portal is hidden/removed.
 *
 * @param {boolean} isOpen - Whether the modal is currently open/visible
 */
export const useModalFocus = (isOpen) => {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (isOpen) {
      // Modal just opened: blur any element in the background that had focus
      safeBlurActiveElement();
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      // Modal just closed: blur any element inside the modal that had focus
      safeBlurActiveElement();
      wasOpenRef.current = false;
    }

    return () => {
      if (Platform.OS === 'web' && wasOpenRef.current) {
        safeBlurActiveElement();
      }
    };
  }, [isOpen]);
};
