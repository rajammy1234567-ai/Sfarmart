import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

function validateEnv() {
  const isStaging =
    process.env.STAGING_MODE === 'true' ||
    process.env.NODE_ENV === 'staging';

  const baseRequired = [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  const razorpayRequired = [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET'
  ];

  const required = isStaging
    ? baseRequired
    : [...baseRequired, ...razorpayRequired];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    console.error('❌ Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}
validateEnv();
import connectDB from './config/db.js';
import { seedAdmin } from './controllers/adminController.js';
import { initSocket } from './socket/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { recoverPendingPushReceipts, startPushReceiptWorker, stopPushReceiptWorker } from './services/notify.js';
import { recoverPendingDispatches } from './services/riderAssignmentService.js';

import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import riderRoutes from './routes/riderRoutes.js';

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.io
const io = initSocket(httpServer);

// ---- Security & CORS middleware ----
app.use(helmet());

// CORS with allowlist (placed before body parsing & routes so OPTIONS preflight resolves immediately)
const clientOrigins = process.env.CLIENT_ORIGINS
  ? process.env.CLIENT_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const isDevOrStaging =
  process.env.NODE_ENV !== 'production' ||
  process.env.STAGING_MODE === 'true' ||
  process.env.NODE_ENV === 'staging';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile native apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In development / staging: allow local admin web (Vite on 5173-5179) and local apps (8081-8085)
      if (isDevOrStaging) {
        if (/^http:\/\/(localhost|127\.0\.0\.1):(517[3-9]|808[1-5])$/.test(origin)) {
          return callback(null, true);
        }
      }

      // Explicitly configured client origins (production and custom staging domains)
      if (clientOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Reject all other origins
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});
app.use(mongoSanitize());
app.set('trust proxy', 1);

// Rate limiting per route
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    ok: false,
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many login attempts, please try later.',
  },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: {
    ok: false,
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many OTP attempts, please try later.',
  },
});
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: {
    ok: false,
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many payment requests, please try later.',
  },
});

const jobContactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    ok: false,
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many job/contact requests, please try later.'
  }
});

// Apply limiters to specific routes after they are mounted



// Initialize Database Connection
connectDB().then((isConnected) => {
  const isStaging =
    process.env.STAGING_MODE === 'true' ||
    process.env.NODE_ENV === 'staging';

  if (isConnected && !isStaging) {
    seedAdmin();
  }
});

// Health Check Endpoints
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Farmart MERN Production Backend Operational with Real-Time Sockets',
    timestamp: new Date()
  });
});

// Apply limiters before mounting routes
// Login limiters on actual routes
app.use('/api/auth/customer/login', loginLimiter);
app.use('/api/auth/vendor/login', loginLimiter);
app.use('/api/rider/auth/login', loginLimiter);
app.use('/api/admin/login', loginLimiter);
// OTP limiters on actual routes
app.use('/api/auth/otp/request', otpLimiter);
app.use('/api/auth/otp/verify', otpLimiter);
// Payment limiter on payment routes
app.use('/api/create-order', paymentLimiter);
app.use('/api/verify-payment', paymentLimiter);
app.use('/api/payment/create-order', paymentLimiter);
app.use('/api/payment/verify-payment', paymentLimiter);
app.use('/api/apply-job', jobContactLimiter);
app.use('/api/contact', jobContactLimiter);
// Mount Routes
// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', categoryRoutes);
app.use('/api', vendorRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', paymentRoutes);
app.use('/api', applicationRoutes);
app.use('/api', contactRoutes);
app.use('/api', jobRoutes);


app.use('/api', userRoutes);
app.use('/api', cartRoutes);

// Global Error Handling Middleware
app.use(errorHandler);

// Global Process Error Traps (Prevents Node.js server crash on unhandled errors)
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception trapped:', err.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection trapped at:', promise, 'reason:', reason);
});

// Graceful Shutdown hooks
function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  stopPushReceiptWorker();
}
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Start Server with Socket.IO
httpServer.listen(PORT, () => {
  console.log(`🌾 Farmart Real-Time Backend running on http://localhost:${PORT}`);
  // Background recovery worker for pending push delivery receipts across server restarts
  startPushReceiptWorker({
    intervalMs: Number(process.env.RECEIPT_WORKER_INTERVAL_MS) || 2000
  });
  // Background recovery of pending rider offers and redispatches across server restarts
  recoverPendingDispatches().catch((err) => console.error('[RiderAssignment] Error during startup recovery:', err));
});

export { app, httpServer, io };
