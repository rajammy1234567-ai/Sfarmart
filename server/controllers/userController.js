import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken, formatUserResponse } from './authController.js';

const memoryUsers = [];

/**
 * POST /api/register
 * Handles customer registration, assigns ₹250 wallet balance, and issues JWT tokens.
 */
export const registerUser = async (req, res) => {
  const { name, phone, password, city, address } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, ok: false, message: 'Please provide name and phone number' });
  }

  const cleanPhone = phone.trim();

  try {
    let existingUser = await User.findOne({ phone: cleanPhone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        ok: false,
        code: 'USER_ALREADY_EXISTS',
        message: 'Mobile number is already registered. Please log in with your password.'
      });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const newUser = await User.create({
      id: `USER-${Date.now()}`,
      name,
      phone: cleanPhone,
      passwordHash: hashedPassword,
      password: hashedPassword,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      isPhoneVerified: true,
      walletBalance: 25000, // ₹250
      city: city || 'Ludhiana',
      district: 'Ludhiana',
      villageHub: 'Village Hub - Rural',
      referralCode: `FMT-${name.substring(0, 3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`,
      referralEarnings: 0,
      addresses: [
        {
          label: 'Home',
          name,
          phone: cleanPhone,
          line1: address || 'Flat 302, Green Avenue, Model Town',
          city: city || 'Ludhiana',
          state: 'Punjab',
          pincode: '141001',
          isDefault: true
        }
      ]
    });

    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateRefreshToken(newUser, req.body.deviceId || 'web');

    return res.status(201).json({
      success: true,
      ok: true,
      message: 'Registration successful! Logged in.',
      token: accessToken,
      accessToken,
      refreshToken,
      user: formatUserResponse(newUser)
    });
  } catch (error) {
    console.error('registerUser error:', error);
    return res.status(500).json({ success: false, ok: false, message: 'Registration failed', error: error.message });
  }
};

/**
 * POST /api/login
 * Handles customer login, verifies password against hash, prevents duplicate/unregistered logins.
 */
export const loginUser = async (req, res) => {
  const { phone, password } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, ok: false, message: 'Phone number is required' });
  }

  const cleanPhone = phone.trim();

  try {
    let user = await User.findOne({ phone: cleanPhone }).select('+passwordHash +password');

    if (!user) {
      return res.status(401).json({
        success: false,
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'Account not found with this phone number. Please register on the Sign Up tab.'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        ok: false,
        code: 'ACCOUNT_INACTIVE',
        message: `Your account is ${user.status.toLowerCase()}. Please contact support.`
      });
    }

    const storedHash = user.passwordHash || user.password;
    if (storedHash && password) {
      const isMatch = await bcrypt.compare(password, storedHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          ok: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid password. Please check your credentials.'
        });
      }
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, req.body.deviceId || 'web');

    return res.json({
      success: true,
      ok: true,
      message: 'Login successful',
      token: accessToken,
      accessToken,
      refreshToken,
      user: formatUserResponse(user)
    });
  } catch (error) {
    console.error('loginUser error:', error);
    return res.status(500).json({ success: false, ok: false, message: 'Login failed', error: error.message });
  }
};

export const getMemoryUsers = () => memoryUsers;
