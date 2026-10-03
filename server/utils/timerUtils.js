export const MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1 (~24.85 days)

/**
 * Schedules a callback after a given delay in milliseconds, supporting
 * arbitrarily long delays (> 24.85 days) without 32-bit integer overflow.
 *
 * Automatically chains timeouts of at most MAX_TIMEOUT_MS until the
 * total remaining delay has elapsed.
 *
 * @param {Function} callback - Function to execute when delay elapses
 * @param {number} delay - Delay in milliseconds
 * @returns {{ clear: Function, unref: Function, ref: Function }} Timer control handle
 */
export function scheduleLongTimeout(callback, delay) {
  if (typeof callback !== 'function') {
    throw new TypeError('Callback must be a function');
  }

  const targetDelay = Number(delay);
  if (!Number.isFinite(targetDelay) || targetDelay <= 0) {
    const immediate = setTimeout(callback, 0);
    return {
      clear: () => clearTimeout(immediate),
      unref: () => { if (immediate.unref) immediate.unref(); },
      ref: () => { if (immediate.ref) immediate.ref(); },
      _currentTimer: immediate
    };
  }

  let currentTimer = null;
  let remaining = targetDelay;
  let isCleared = false;

  function step() {
    if (isCleared) return;

    if (remaining <= MAX_TIMEOUT_MS) {
      currentTimer = setTimeout(() => {
        currentTimer = null;
        if (!isCleared) {
          callback();
        }
      }, remaining);
    } else {
      currentTimer = setTimeout(() => {
        remaining -= MAX_TIMEOUT_MS;
        step();
      }, MAX_TIMEOUT_MS);
    }
  }

  step();

  return {
    clear: () => {
      isCleared = true;
      if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = null;
      }
    },
    unref: () => {
      if (currentTimer && typeof currentTimer.unref === 'function') {
        currentTimer.unref();
      }
    },
    ref: () => {
      if (currentTimer && typeof currentTimer.ref === 'function') {
        currentTimer.ref();
      }
    },
    get _currentTimer() {
      return currentTimer;
    }
  };
}
