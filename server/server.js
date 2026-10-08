import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { createAdmissionGate, boundedInteger, validateRequestShape } from './utils/requestPolicy.js';

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
let shuttingDown = false;
app.set('trust proxy', boundedInteger(process.env.TRUST_PROXY_HOPS, 1, 0, 5));
httpServer.requestTimeout = 30000;
httpServer.headersTimeout = 15000;
httpServer.keepAliveTimeout = 5000;

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

// IP quota is a coarse abuse guard, not the per-account quota. High enough for shared mobile NATs.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, no-transform');
  next();
});
app.use('/api', rateLimit({
  windowMs: 60000, limit: boundedInteger(process.env.API_IP_REQUESTS_PER_MINUTE, 3000, 100, 100000),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please retry shortly.' }
}));
const admit = createAdmissionGate({
  maxInFlight: boundedInteger(process.env.HTTP_MAX_IN_FLIGHT, 200, 10, 1000),
  ready: () => !shuttingDown && mongoose.connection.readyState === 1
});
app.use('/api', (req, res, next) => req.path === '/health' ? next() : admit(req, res, next));

app.use(
  express.json({
    limit: '100kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use((req, res, next) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});
app.use(validateRequestShape);
app.use(mongoSanitize());

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



// Health Check Endpoints
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

app.get('/api/health', (req, res) => {
  res.status(!shuttingDown && mongoose.connection.readyState === 1 ? 200 : 503).json({
    status: !shuttingDown && mongoose.connection.readyState === 1 ? 'OK' : 'NOT_READY',
    message: 'Farmart MERN Production Backend Operational with Real-Time Sockets',
    timestamp: new Date()
  });
});

// Apply limiters before mounting routes
// Login limiters on actual routes
app.use('/api/auth/customer/login', loginLimiter);
app.use('/api/auth/vendor/login', loginLimiter);
app.use('/api/rider/auth/login', loginLimiter);
app.use('/api/auth/refresh', loginLimiter);
app.use('/api/rider/auth/refresh', loginLimiter);
app.use('/api/admin/login', loginLimiter);
app.use('/api/login', loginLimiter);
app.use('/api/register', loginLimiter);
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

// Drain accepted HTTP requests before closing the database. A process manager must restart fatal failures.
let shutdownStarted = false;
async function handleShutdown(signal, exitCode = 0) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  shuttingDown = true;
  console.log(`[Shutdown] ${signal}`);
  stopPushReceiptWorker();
  const deadline = setTimeout(() => process.exit(exitCode || 1), 25000);
  deadline.unref();
  await new Promise(resolve => {
    httpServer.close(resolve);
    httpServer.closeIdleConnections?.();
    io.disconnectSockets(true);
  });
  await new Promise(resolve => io.close(resolve));
  await mongoose.disconnect();
  clearTimeout(deadline);
  process.exit(exitCode);
}
process.on('SIGTERM', () => { handleShutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { handleShutdown('SIGINT').catch(() => process.exit(1)); });
process.on('uncaughtException', err => {
  console.error('[Fatal] uncaughtException:', err);
  handleShutdown('uncaughtException', 1).catch(() => process.exit(1));
});
process.on('unhandledRejection', reason => {
  console.error('[Fatal] unhandledRejection:', reason);
  handleShutdown('unhandledRejection', 1).catch(() => process.exit(1));
});

// Do not accept requests or start recovery workers before the database is connected.
async function startServer() {
  const connected = await connectDB();
  if (!connected) throw new Error('Database required to start backend');
  const isStaging = process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
  if (!isStaging) await seedAdmin();
  httpServer.listen(PORT, () => {
    console.log(`Farmart backend listening on port ${PORT}`);
    startPushReceiptWorker({ intervalMs: Number(process.env.RECEIPT_WORKER_INTERVAL_MS) || 2000 });
    recoverPendingDispatches().catch(err => console.error('[RiderAssignment] Startup recovery failed:', err));
  });
}
startServer().catch(err => {
  console.error('[Startup] Failed:', err.message);
  process.exit(1);
});

export { app, httpServer, io };
