// server/scripts/diagnoseStagingConnection.js
// Strict READ-ONLY diagnostic probe for staging database connectivity.
// Classifies STAGE:CONNECT failures into:
// - AUTHENTICATION
// - DNS
// - NETWORK_TIMEOUT
// - TLS
// - ATLAS_IP_ACCESS
//
// ZERO writes, ZERO DDL. Credentials and connection strings are strictly sanitized.

import mongoose from 'mongoose';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';
import { classifyConnectionError } from './provisionStagingDb.js';

async function diagnose() {
  const uri = process.env.STAGING_SETUP_MONGO_URI || process.env.STAGING_MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('FAIL-CLOSED: Staging connection URI is required.');
    process.exit(1);
  }

  // Pre-validate host and database
  validateStagingUri(uri);

  let connectionAttempted = false;
  let exitCode = 0;

  console.log(`\n================ STAGING CONNECTION DIAGNOSTIC ================`);
  console.log(`Target Host:     ${APPROVED_STAGING_HOST}`);
  console.log(`Target Database: ${APPROVED_DATABASE}`);
  console.log(`Mode:            Read-only ping / probe (0 writes, 0 DDL)`);
  console.log(`---------------------------------------------------------------`);

  try {
    connectionAttempted = true;
    console.log(`Attempting connection (timeout: 8000ms)...`);

    await mongoose.connect(uri, {
      autoIndex: false,
      autoCreate: false,
      dbName: APPROVED_DATABASE,
      serverSelectionTimeoutMS: 8000
    });

    const activeDb = mongoose.connection.name;
    if (activeDb !== APPROVED_DATABASE) {
      throw new Error(`FAIL-CLOSED: Connected to unexpected database "${activeDb}".`);
    }

    // Ping cluster
    await mongoose.connection.db.admin().ping();

    console.log(`Status:          SUCCESS (Connection and Ping Verified)`);
    console.log(`Active DB:       ${activeDb}`);
    console.log(`Authentication:  PASSED`);
    console.log(`Network Access:  PASSED`);
    console.log(`===============================================================\n`);
  } catch (err) {
    exitCode = 1;
    const diag = classifyConnectionError(err);

    console.log(`Status:          FAILED`);
    console.log(`Error Name:      ${diag.name}`);
    console.log(`Error Code:      ${diag.code}`);
    console.log(`Error CodeName:  ${diag.codeName}`);
    console.log(`Classification:  ${diag.classification}`);
    console.log(`Diagnostic Hint: ${diag.hint}`);
    console.log(`---------------------------------------------------------------`);
    console.log(`Note: Credentials and connection strings have been sanitized.`);
    console.log(`===============================================================\n`);
  } finally {
    if (connectionAttempted && mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log('Database connection closed cleanly.');
      } catch (discErr) {
        console.error('Disconnect error:', discErr.message);
      }
    }
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
}

diagnose().catch((err) => {
  console.error('Fatal diagnostic error:', err.message);
  process.exit(1);
});
