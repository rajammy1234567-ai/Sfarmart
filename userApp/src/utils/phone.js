/**
 * Utility functions for Indian phone number normalization and validation.
 */

export const normalizeIndianPhone = (raw) => {
  if (!raw) return '';
  let cleaned = String(raw).trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
};

export const isValidIndianMobile = (phone) => {
  const normalized = normalizeIndianPhone(phone);
  return /^[6-9]\d{9}$/.test(normalized);
};

export default {
  normalizeIndianPhone,
  isValidIndianMobile
};

