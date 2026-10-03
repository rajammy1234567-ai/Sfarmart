import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  validateStagingUri,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';
import { REQUIRED_SCHEMA, classifyConnectionError } from '../scripts/provisionStagingDb.js';
import { REQUIRED_RECEIPT_INDEXES } from '../scripts/inspectStagingFixtures.js';

test('1. PushReceipts Provisioning Schema: All 7 required indexes defined with correct unique and TTL options', () => {
  const pushReceiptsSchema = REQUIRED_SCHEMA.pushreceipts;
  assert.ok(pushReceiptsSchema, 'pushreceipts must be defined in REQUIRED_SCHEMA');
  assert.equal(pushReceiptsSchema.indexes.length, 7, 'pushreceipts must have exactly 7 defined indexes');

  // Verify ticketId_1 is unique
  const ticketIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'ticketId_1');
  assert.ok(ticketIdx, 'ticketId_1 index must exist');
  assert.deepEqual(ticketIdx.keys, { ticketId: 1 });
  assert.equal(ticketIdx.options.unique, true, 'ticketId_1 must be unique');

  // Verify nextCheckAt_1
  const nextCheckIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'nextCheckAt_1');
  assert.ok(nextCheckIdx, 'nextCheckAt_1 index must exist');
  assert.deepEqual(nextCheckIdx.keys, { nextCheckAt: 1 });

  // Verify status_1
  const statusIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'status_1');
  assert.ok(statusIdx, 'status_1 index must exist');
  assert.deepEqual(statusIdx.keys, { status: 1 });

  // Verify cleanupStatus_1
  const cleanupIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'cleanupStatus_1');
  assert.ok(cleanupIdx, 'cleanupStatus_1 index must exist');
  assert.deepEqual(cleanupIdx.keys, { cleanupStatus: 1 });

  // Verify leaseToken_1
  const leaseTokenIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'leaseToken_1');
  assert.ok(leaseTokenIdx, 'leaseToken_1 index must exist');
  assert.deepEqual(leaseTokenIdx.keys, { leaseToken: 1 });

  // Verify leaseExpiresAt_1
  const leaseExpIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'leaseExpiresAt_1');
  assert.ok(leaseExpIdx, 'leaseExpiresAt_1 index must exist');
  assert.deepEqual(leaseExpIdx.keys, { leaseExpiresAt: 1 });

  // Verify createdAt_1 TTL index (7 days = 604800 seconds)
  const ttlIdx = pushReceiptsSchema.indexes.find((i) => i.options.name === 'createdAt_1');
  assert.ok(ttlIdx, 'createdAt_1 index must exist');
  assert.deepEqual(ttlIdx.keys, { createdAt: 1 });
  assert.equal(ttlIdx.options.expireAfterSeconds, 7 * 24 * 60 * 60, 'createdAt_1 must expire after 7 days');
});

test('2. Inspection Index Spec: Matches provisioning schema index requirements exactly', () => {
  assert.equal(REQUIRED_RECEIPT_INDEXES.length, 7, 'Inspection must verify all 7 receipt indexes');

  const ticketReq = REQUIRED_RECEIPT_INDEXES.find((i) => i.name === 'ticketId_1');
  assert.ok(ticketReq && ticketReq.unique === true, 'Inspection must require ticketId_1 unique');

  const ttlReq = REQUIRED_RECEIPT_INDEXES.find((i) => i.name === 'createdAt_1');
  assert.ok(ttlReq && ttlReq.expireAfterSeconds === 604800, 'Inspection must require createdAt_1 7-day TTL');
});

test('3. Host and Database Pinning Guard: Rejects non-staging targets and unpinned databases', () => {
  assert.throws(
    () => validateStagingUri('mongodb+srv://user:pass@production.mongodb.net/farmart_test_disposable'),
    /FAIL-CLOSED: Staging host mismatch/
  );

  assert.throws(
    () => validateStagingUri(`mongodb+srv://user:pass@${APPROVED_STAGING_HOST}/production_live_db`),
    /FAIL-CLOSED: Staging database mismatch/
  );

  const validUri = `mongodb+srv://officialfarmmart_db_user:mock_pass@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}?retryWrites=true&w=majority`;
  assert.equal(validateStagingUri(validUri), validUri);
});

test('4. Provisioning Launcher Script: Contains required guards and setup configuration', () => {
  const scriptContent = fs.readFileSync('server/scripts/provisionPushReceipts.ps1', 'utf-8');

  // Must use officialfarmmart_db_user setup account
  assert.match(scriptContent, /officialfarmmart_db_user/, 'Must use officialfarmmart_db_user');

  // Must pin approved staging host and database
  assert.match(scriptContent, /farmart-staging\.gxn3bfw\.mongodb\.net/, 'Must pin staging host');
  assert.match(scriptContent, /farmart_test_disposable/, 'Must pin staging database');

  // Must set process-scoped setup variable
  assert.match(scriptContent, /STAGING_SETUP_MONGO_URI/, 'Must set STAGING_SETUP_MONGO_URI');

  // Must pre-validate URI with shared staging validator before connecting
  assert.match(scriptContent, /validateStagingUri/, 'Must invoke validateStagingUri');

  // Must restore environment in finally
  assert.match(scriptContent, /finally\s*\{/, 'Must have finally block');
  assert.match(scriptContent, /SetEnvironmentVariable/, 'Must restore environment variables');
});

test('5. Inspection Launcher Script: Contains pre-validation and propagates non-zero exit codes', () => {
  const scriptContent = fs.readFileSync('server/scripts/inspectStagingFixtures.ps1', 'utf-8');

  // Must use farmart_staging_tester runtime account
  assert.match(scriptContent, /farmart_staging_tester/, 'Must use farmart_staging_tester');

  // Must validate host AND database using shared validator
  assert.match(scriptContent, /validateStagingUri/, 'Must invoke validateStagingUri');

  // Must capture exit code and propagate
  assert.match(scriptContent, /Start-Process.*ExitCode|\$LASTEXITCODE/, 'Must capture exit code');
  assert.match(scriptContent, /exit \$exitCode/, 'Must propagate exit code');
});

test('6. Inspection Script Implementation: Checks vendors.storeName and reports UNKNOWN on query failure', () => {
  const inspectContent = fs.readFileSync('server/scripts/inspectStagingFixtures.js', 'utf-8');

  // Must check vendors.storeName
  assert.match(inspectContent, /storeName/, 'Must query and check storeName on vendors');

  // Must report UNKNOWN when collection query fails
  assert.match(inspectContent, /UNKNOWN/, 'Must report UNKNOWN when query fails');
  assert.match(inspectContent, /exitCode = 1/, 'Must set non-zero exit code on failure');

  // Must always disconnect in finally
  assert.match(inspectContent, /finally\s*\{[\s\S]*disconnect\(\)/, 'Must disconnect in finally');
});

test('7. STAGE:CONNECT Sanitized Diagnostics & Classification: Correctly classifies error categories', () => {
  // 1. Authentication
  const authErr1 = new Error('bad auth : authentication failed');
  authErr1.name = 'MongoServerError';
  authErr1.code = 8000;
  authErr1.codeName = 'AtlasError';
  const diagAuth1 = classifyConnectionError(authErr1);
  assert.equal(diagAuth1.classification, 'AUTHENTICATION');
  assert.equal(diagAuth1.code, '8000');
  assert.equal(diagAuth1.codeName, 'AtlasError');
  assert.match(diagAuth1.hint, /Authentication failed/);

  const authErr2 = new Error('AuthenticationFailed');
  authErr2.name = 'MongoServerError';
  authErr2.code = 18;
  authErr2.codeName = 'AuthenticationFailed';
  const diagAuth2 = classifyConnectionError(authErr2);
  assert.equal(diagAuth2.classification, 'AUTHENTICATION');

  // 2. DNS
  const dnsErr = new Error('querySrv ENOTFOUND _mongodb._tcp.farmart-staging.gxn3bfw.mongodb.net');
  dnsErr.code = 'ENOTFOUND';
  dnsErr.syscall = 'querySrv';
  const diagDns = classifyConnectionError(dnsErr);
  assert.equal(diagDns.classification, 'DNS');
  assert.match(diagDns.hint, /DNS resolution failed/);

  // 3. TLS / SSL
  const tlsErr = new Error('certificate has expired');
  tlsErr.code = 'CERT_HAS_EXPIRED';
  const diagTls = classifyConnectionError(tlsErr);
  assert.equal(diagTls.classification, 'TLS');
  assert.match(diagTls.hint, /TLS\/SSL handshake/);

  // 4. Atlas IP Access
  const ipAccessErr1 = new Error('Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you\'re trying to access the database from an IP that isn\'t whitelisted');
  ipAccessErr1.name = 'MongoServerSelectionError';
  const diagIp1 = classifyConnectionError(ipAccessErr1);
  assert.equal(diagIp1.classification, 'ATLAS_IP_ACCESS');
  assert.match(diagIp1.hint, /Atlas Network Access list/);

  const ipAccessErr2 = new Error('connection <monitor> to 34.194.2.1:27017 closed');
  ipAccessErr2.name = 'MongoServerSelectionError';
  const diagIp2 = classifyConnectionError(ipAccessErr2);
  assert.equal(diagIp2.classification, 'ATLAS_IP_ACCESS');

  // 5. Network Timeout
  const timeoutErr = new Error('connection timed out after 30000ms');
  timeoutErr.code = 'ETIMEDOUT';
  const diagTimeout = classifyConnectionError(timeoutErr);
  assert.equal(diagTimeout.classification, 'NETWORK_TIMEOUT');
  assert.match(diagTimeout.hint, /Connection timed out/);
});

test('8. STAGE:CONNECT Sanitization: Diagnostics never expose raw URIs or secrets', () => {
  const secretUri = 'mongodb+srv://officialfarmmart_db_user:SUPER_SECRET_PASS_12345@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
  const leakErr = new Error(`MongoServerError: connection to ${secretUri} failed`);
  leakErr.name = 'MongoServerError';
  leakErr.code = 8000;
  leakErr.codeName = 'AtlasError';

  const diag = classifyConnectionError(leakErr);
  const formatted = JSON.stringify(diag);

  assert.equal(formatted.includes('SUPER_SECRET_PASS_12345'), false, 'Diagnostic output must never leak password');
  assert.equal(formatted.includes('officialfarmmart_db_user:'), false, 'Diagnostic output must never leak connection string');
  assert.equal(diag.classification, 'AUTHENTICATION');
});
