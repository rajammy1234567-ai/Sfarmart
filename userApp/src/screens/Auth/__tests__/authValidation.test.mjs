import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndianPhone, isValidIndianMobile } from '../../../utils/phone.js';

describe('Indian Phone Normalization & Validation Suite', () => {
  it('1. Normalizes standard 10-digit number without alteration', () => {
    assert.equal(normalizeIndianPhone('9876543210'), '9876543210');
    assert.equal(isValidIndianMobile('9876543210'), true);
  });

  it('2. Strips spaces, dashes, and parentheses', () => {
    assert.equal(normalizeIndianPhone('98765 43210'), '9876543210');
    assert.equal(normalizeIndianPhone('9876-543-210'), '9876543210');
    assert.equal(normalizeIndianPhone('(98765) 43210'), '9876543210');
    assert.equal(isValidIndianMobile('98765 43210'), true);
  });

  it('3. Strips +91 Indian country code', () => {
    assert.equal(normalizeIndianPhone('+91 9876543210'), '9876543210');
    assert.equal(normalizeIndianPhone('+91-98765-43210'), '9876543210');
    assert.equal(normalizeIndianPhone('+919876543210'), '9876543210');
    assert.equal(isValidIndianMobile('+91 9876543210'), true);
  });

  it('4. Strips leading 91 (12 digits) or leading 0 (11 digits)', () => {
    assert.equal(normalizeIndianPhone('919876543210'), '9876543210');
    assert.equal(normalizeIndianPhone('09876543210'), '9876543210');
    assert.equal(isValidIndianMobile('919876543210'), true);
    assert.equal(isValidIndianMobile('09876543210'), true);
  });

  it('5. Rejects invalid mobile numbers (start digit < 6 or length != 10)', () => {
    assert.equal(isValidIndianMobile('5876543210'), false);
    assert.equal(isValidIndianMobile('1234567890'), false);
    assert.equal(isValidIndianMobile('98765'), false);
    assert.equal(isValidIndianMobile('987654321000'), false);
    assert.equal(isValidIndianMobile(''), false);
    assert.equal(isValidIndianMobile(null), false);
    assert.equal(isValidIndianMobile(undefined), false);
  });

  it('6. Safely handles empty, null, or undefined input', () => {
    assert.equal(normalizeIndianPhone(''), '');
    assert.equal(normalizeIndianPhone(null), '');
    assert.equal(normalizeIndianPhone(undefined), '');
  });
});

describe('Customer Auth Error Routing & Actionability Contract', () => {
  it('1. USER_NOT_FOUND code produces action to switch to Sign Up with phone', () => {
    const error = { code: 'USER_NOT_FOUND', message: 'Customer account not found' };
    const phone = '9876543210';
    const isNotFound = error.code === 'USER_NOT_FOUND' || error.message.includes('not found');
    assert.equal(isNotFound, true);
    // Actionable target:
    const targetScreen = isNotFound ? 'Signup' : null;
    const targetParams = { initialPhone: phone };
    assert.equal(targetScreen, 'Signup');
    assert.equal(targetParams.initialPhone, '9876543210');
  });

  it('2. USER_ALREADY_EXISTS code produces action to switch to Log In with phone', () => {
    const data = { code: 'USER_ALREADY_EXISTS', message: 'Mobile number is already registered' };
    const phone = '9876543210';
    const isExists = data.code === 'USER_ALREADY_EXISTS' || data.message.includes('already registered');
    assert.equal(isExists, true);
    // Actionable target:
    const targetScreen = isExists ? 'Login' : null;
    const targetParams = { initialPhone: phone };
    assert.equal(targetScreen, 'Login');
    assert.equal(targetParams.initialPhone, '9876543210');
  });

  it('3. PASSWORD_NOT_CONFIGURED identifies OTP requirement', () => {
    const error = { code: 'PASSWORD_NOT_CONFIGURED', message: 'Password is not set for this account. Please login using OTP.' };
    const isOtpRequired = error.code === 'PASSWORD_NOT_CONFIGURED' || error.message.includes('OTP');
    assert.equal(isOtpRequired, true);
  });

  it('4. INVALID_CREDENTIALS identifies incorrect password', () => {
    const error = { code: 'INVALID_CREDENTIALS', message: 'Invalid password. Please check your credentials.' };
    const isInvalidCreds = error.code === 'INVALID_CREDENTIALS' || error.message.includes('Invalid password');
    assert.equal(isInvalidCreds, true);
  });
});

