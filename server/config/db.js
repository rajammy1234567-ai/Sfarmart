import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { boundedInteger } from '../utils/requestPolicy.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });

export const APPROVED_STAGING_HOST = 'farmart-staging.gxn3bfw.mongodb.net';
export const APPROVED_DATABASE = 'farmart_test_disposable';
export const APPROVED_PRODUCTION_DATABASE = 'farmart_production';

export function validateStagingUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') {
    throw new Error('FAIL-CLOSED: STAGING_MODE is active, but MONGODB_URI is missing or empty.');
  }

  let parsed;
  try {
    parsed = new URL(rawUri);
  } catch {
    throw new Error('FAIL-CLOSED: MONGODB_URI cannot be parsed as a valid URL in staging mode.');
  }

  if (parsed.protocol !== 'mongodb+srv:') {
    throw new Error(`FAIL-CLOSED: Staging mode requires protocol "mongodb+srv:", received "${parsed.protocol}".`);
  }

  if (parsed.hostname.toLowerCase() !== APPROVED_STAGING_HOST) {
    throw new Error(`FAIL-CLOSED: Staging host mismatch. Expected "${APPROVED_STAGING_HOST}", received "${parsed.hostname}".`);
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (targetDb !== APPROVED_DATABASE) {
    throw new Error(`FAIL-CLOSED: Staging database mismatch. Expected "${APPROVED_DATABASE}", received "${targetDb}".`);
  }

  return rawUri;
}

export function validateProductionUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new Error('FAIL-CLOSED: Production mode requires a valid MONGODB_URI in environment variables.');
  }

  let parsed;
  try {
    parsed = new URL(rawUri);
  } catch {
    throw new Error('FAIL-CLOSED: Production MONGODB_URI cannot be parsed as a valid URL.');
  }

  if (parsed.protocol !== 'mongodb+srv:' && parsed.protocol !== 'mongodb:') {
    throw new Error(`FAIL-CLOSED: Production mode requires protocol "mongodb+srv:" or "mongodb:", received "${parsed.protocol}".`);
  }

  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error('FAIL-CLOSED: Production mode cannot target a local host database.');
  }

  const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0].trim();
  if (!targetDb) {
    throw new Error(`FAIL-CLOSED: Production mode requires an explicit database name in MONGODB_URI. Expected "${APPROVED_PRODUCTION_DATABASE}".`);
  }

  if (targetDb === 'test') {
    throw new Error(`FAIL-CLOSED: Production mode strictly rejects default database "test". Expected "${APPROVED_PRODUCTION_DATABASE}".`);
  }

  if (targetDb === APPROVED_DATABASE) {
    throw new Error(`FAIL-CLOSED: Production mode strictly rejects staging database "${APPROVED_DATABASE}". Expected "${APPROVED_PRODUCTION_DATABASE}".`);
  }

  if (targetDb !== APPROVED_PRODUCTION_DATABASE) {
    throw new Error(`FAIL-CLOSED: Production database mismatch. Expected "${APPROVED_PRODUCTION_DATABASE}", received "${targetDb}".`);
  }

  return rawUri;
}


export function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return '';
  return msg.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://[REDACTED_CREDENTIALS]@');
}

export const connectionOptions = {
  maxPoolSize: boundedInteger(process.env.MONGO_MAX_POOL_SIZE, 30, 5, 100),
  minPoolSize: 0,
  maxConnecting: 2,
  waitQueueTimeoutMS: 5000,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  autoIndex: false,
  autoCreate: false,
  bufferCommands: false
};

const connectDB = async () => {
  try {
    const isStagingMode = process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
    const mongoUri = process.env.MONGODB_URI;

    if (isStagingMode) {
      if (!mongoUri || !mongoUri.trim()) {
        throw new Error('FAIL-CLOSED: STAGING_MODE is active, but MONGODB_URI is missing or empty.');
      }
      validateStagingUri(mongoUri);
      const conn = await mongoose.connect(mongoUri, {
        ...connectionOptions,
        dbName: APPROVED_DATABASE
      });
      console.log(`🍃 MongoDB Connected [STAGING MODE]: ${conn.connection.host}/${APPROVED_DATABASE} (autoIndex: false, autoCreate: false)`);

      // Verify replica set in staging mode
      try {
        const admin = conn.connection.db.admin();
        const hello = await admin.command({ hello: 1 });
        if (!hello.setName) {
          console.error('❌ FATAL: MongoDB is running as standalone (no replica set detected).');
          process.exit(1);
        }
        console.log(`🔒 MongoDB Replica Set Verified: ${hello.setName} (ACID Transactions Active)`);
      } catch (cmdErr) {
        console.warn('⚠️ Could not verify replica set status:', sanitizeErrorMessage(cmdErr.message));
      }

      return true;
    }

    // Normal (non-staging) mode
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      validateProductionUri(mongoUri);
    } else if (!mongoUri) {
      console.warn('⚠️ MONGODB_URI not found in environment variables. Falling back to memory mode.');
      return false;
    }

    const conn = await mongoose.connect(mongoUri, connectionOptions);
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);

    // Verify replica set for ACID multi-document transactions
    try {
      const admin = conn.connection.db.admin();
      const hello = await admin.command({ hello: 1 });
      if (!hello.setName) {
        console.error('❌ FATAL: MongoDB is running as standalone (no replica set detected).');
        console.error('S-farmart 24 requires a replica set for multi-document ACID transactions (switch-vendor, checkout, stock deduction, and refunds).');
        console.error('Please configure a replica set (e.g. MongoDB Atlas or run-rs).');
        process.exit(1);
      }
      console.log(`🔒 MongoDB Replica Set Verified: ${hello.setName} (ACID Transactions Active)`);
    } catch (cmdErr) {
      console.warn('⚠️ Could not verify replica set status:', sanitizeErrorMessage(cmdErr.message));
    }

    return true;
  } catch (error) {
    const cleanMsg = sanitizeErrorMessage(error.message);
    console.error(`❌ MongoDB Connection Failed: ${cleanMsg}`);
    process.exit(1);
  }
};

export default connectDB;
