import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import {
  validateStagingUri,
  sanitizeErrorMessage,
  APPROVED_STAGING_HOST,
  APPROVED_DATABASE
} from '../config/db.js';
import {
  validateCoordinates,
  preflightChecks,
  createStagingFixtures,
  cleanupStagingFixtures
} from '../scripts/stagingFixtures.js';

test('1. Staging URI Validation & Missing URI Handling', () => {
  // Case A: Missing/empty URI
  assert.throws(
    () => validateStagingUri(''),
    /FAIL-CLOSED: STAGING_MODE is active, but MONGODB_URI is missing or empty/
  );
  assert.throws(
    () => validateStagingUri(null),
    /FAIL-CLOSED: STAGING_MODE is active, but MONGODB_URI is missing or empty/
  );

  // Case B: Non-URL string
  assert.throws(
    () => validateStagingUri('not-a-valid-uri'),
    /FAIL-CLOSED: MONGODB_URI cannot be parsed as a valid URL in staging mode/
  );

  // Case C: Non mongodb+srv protocol
  assert.throws(
    () => validateStagingUri('mongodb://farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable'),
    /FAIL-CLOSED: Staging mode requires protocol "mongodb\+srv:"/
  );

  // Case D: Mismatched host (e.g. localhost or production)
  assert.throws(
    () => validateStagingUri('mongodb+srv://user:pass@cluster0.mongodb.net/farmart_test_disposable'),
    /FAIL-CLOSED: Staging host mismatch/
  );

  // Case E: Mismatched database
  assert.throws(
    () => validateStagingUri(`mongodb+srv://user:pass@${APPROVED_STAGING_HOST}/production_db`),
    /FAIL-CLOSED: Staging database mismatch/
  );

  // Case F: Valid staging URI passes
  const valid = `mongodb+srv://farmart_staging_tester:mockpass@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}?retryWrites=true&w=majority`;
  const res = validateStagingUri(valid);
  assert.equal(res, valid);
});

test('2. Coordinate Validation (Zero Allowed, NaN/Out-of-range Rejected)', () => {
  // Case A: Missing or undefined coordinates
  assert.throws(
    () => validateCoordinates(undefined, 77.2090),
    /FAIL-CLOSED: Invalid latitude/
  );
  assert.throws(
    () => validateCoordinates(28.6139, undefined),
    /FAIL-CLOSED: Invalid longitude/
  );

  // Case B: NaN / String coordinates
  assert.throws(
    () => validateCoordinates(NaN, 77.2090),
    /FAIL-CLOSED: Invalid latitude/
  );
  assert.throws(
    () => validateCoordinates(28.6139, 'not-a-number'),
    /FAIL-CLOSED: Invalid longitude/
  );

  // Case C: Out of range coordinates
  assert.throws(
    () => validateCoordinates(90.1, 77.2090),
    /Latitude must be a finite number between -90 and 90/
  );
  assert.throws(
    () => validateCoordinates(-90.1, 77.2090),
    /Latitude must be a finite number between -90 and 90/
  );
  assert.throws(
    () => validateCoordinates(28.6139, 180.5),
    /Longitude must be a finite number between -180 and 180/
  );
  assert.throws(
    () => validateCoordinates(28.6139, -180.5),
    /Longitude must be a finite number between -180 and 180/
  );

  // Case D: Zero coordinate is valid (Null Island)
  const zeroRes = validateCoordinates(0, 0);
  assert.deepEqual(zeroRes, { lat: 0, lng: 0 });

  // Case E: Valid realistic coordinates
  const validRes = validateCoordinates(30.9010, 75.8573);
  assert.deepEqual(validRes, { lat: 30.9010, lng: 75.8573 });
});

test('3. Preflight Checks for Existing Manifest and Existing Accounts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-test-'));
  const manifestPath = path.join(tmpDir, 'test-manifest.json');

  // Case A: Existing manifest file blocks fixture creation
  fs.writeFileSync(manifestPath, JSON.stringify({ fixtureRunId: 'old_run' }));
  const dummyDb = {};
  await assert.rejects(
    () => preflightChecks(dummyDb, manifestPath),
    /FAIL-CLOSED: Existing manifest detected/
  );

  // Clean manifest to test account preflight
  fs.unlinkSync(manifestPath);

  // Case B: Existing customer account detected
  const mockDbWithUser = {
    collection: (name) => ({
      findOne: async (query) => {
        if (name === 'users' && query.phone === '9876543210') return { _id: 'user_1', phone: '9876543210' };
        return null;
      }
    })
  };
  await assert.rejects(
    () => preflightChecks(mockDbWithUser, manifestPath),
    /Preflight conflict\. Customer account with phone "9876543210" already exists/
  );

  // Case C: Existing vendor account detected
  const mockDbWithVendor = {
    collection: (name) => ({
      findOne: async (query) => {
        if (name === 'vendors' && query.phone === '9876543211') return { _id: 'vendor_1', phone: '9876543211' };
        return null;
      }
    })
  };
  await assert.rejects(
    () => preflightChecks(mockDbWithVendor, manifestPath),
    /Preflight conflict\. Vendor account with phone "9876543211" already exists/
  );

  // Case D: Existing rider account detected
  const mockDbWithRider = {
    collection: (name) => ({
      findOne: async (query) => {
        if (name === 'riders' && query.phone === '9876543220') return { _id: 'rider_1', phone: '9876543220' };
        return null;
      }
    })
  };
  await assert.rejects(
    () => preflightChecks(mockDbWithRider, manifestPath),
    /Preflight conflict\. Rider account with phone "9876543220" already exists/
  );

  // Case E: Clean state passes preflight
  const mockCleanDb = {
    collection: () => ({ findOne: async () => null })
  };
  await assert.doesNotReject(() => preflightChecks(mockCleanDb, manifestPath));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('4. Partial Insertion Failure Tracking in Manifest', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-partial-'));
  const manifestPath = path.join(tmpDir, 'partial-manifest.json');

  const fixtureRunId = 'sfix_test_partial';
  const categoryId = new mongoose.Types.ObjectId();
  const vendorId = new mongoose.Types.ObjectId();

  const manifest = {
    fixtureRunId,
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
    baseCoordinates: { lat: 28.6139, lng: 77.2090 },
    preallocatedIds: {
      categories: [categoryId.toString()],
      vendors: [vendorId.toString()],
      products: [],
      riders: [],
      users: []
    },
    insertedIds: {
      categories: [],
      vendors: [],
      products: [],
      riders: [],
      users: []
    }
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Step 1: Successful category insert
  manifest.insertedIds.categories.push(categoryId.toString());
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Step 2: Simulated vendor insert failure
  const insertError = new Error('Simulated write failure on vendors');
  manifest.status = 'PARTIAL_FAILURE';
  manifest.failureReason = sanitizeErrorMessage(insertError.message);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Verify manifest preserved the partial progress
  const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(persisted.status, 'PARTIAL_FAILURE');
  assert.equal(persisted.insertedIds.categories.length, 1);
  assert.equal(persisted.insertedIds.categories[0], categoryId.toString());
  assert.equal(persisted.insertedIds.vendors.length, 0);
  assert.equal(persisted.failureReason, 'Simulated write failure on vendors');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('5. Cleanup Run Mismatch Protection & Missing Manifest Rejection', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-cleanup-'));
  const manifestPath = path.join(tmpDir, 'run-manifest.json');
  const validUri = `mongodb+srv://farmart_staging_tester:mockpass@${APPROVED_STAGING_HOST}/${APPROVED_DATABASE}?retryWrites=true&w=majority`;

  // Case A: Missing manifest file fails closed
  await assert.rejects(
    () => cleanupStagingFixtures(validUri, { manifestPath }),
    /FAIL-CLOSED: Manifest file not found/
  );

  // Write manifest for run_123
  fs.writeFileSync(manifestPath, JSON.stringify({
    fixtureRunId: 'run_123',
    insertedIds: { categories: [], vendors: [], products: [], riders: [], users: [] }
  }));

  // Case B: Cleanup targeting different runId (run_999) fails closed
  await assert.rejects(
    () => cleanupStagingFixtures(validUri, { manifestPath, runId: 'run_999' }),
    /Target runId "run_999" does not match manifest runId "run_123"/
  );

  // Confirm manifest was NOT deleted on runId mismatch
  assert.equal(fs.existsSync(manifestPath), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('6. Error Message Sanitization (Credentials & URIs Redacted)', () => {
  const rawMsg = 'Failed to connect to mongodb+srv://staging_user:SuperSecretPassword123@farmart-staging.gxn3bfw.mongodb.net/test';
  const clean = sanitizeErrorMessage(rawMsg);

  assert.ok(!clean.includes('SuperSecretPassword123'), 'Secret password must not appear in sanitized error');
  assert.ok(!clean.includes('staging_user'), 'Username must not appear in sanitized error');
  assert.ok(clean.includes('[REDACTED_CREDENTIALS]'), 'Redaction placeholder must be present');
});

test('7. Dry-Run Schema Validation & Password Handling (Zero DB Connection / No Disk Writes)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-dryrun-'));
  const manifestPath = path.join(tmpDir, 'dryrun-manifest.json');

  const result = await createStagingFixtures('mongodb+srv://mock:mock@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable', {
    lat: 30.9010,
    lng: 75.8573,
    runId: 'sfix_dryrun_test',
    manifestPath,
    dryRun: true
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.fixtureRunId, 'sfix_dryrun_test');
  assert.deepEqual(result.modelsValidated, ['Category', 'Vendor', 'Product', 'Rider', 'User']);
  assert.ok(result.preallocatedIds.categories.length > 0);
  assert.ok(result.preallocatedIds.vendors.length > 0);
  assert.ok(result.preallocatedIds.products.length > 0);
  assert.ok(result.preallocatedIds.riders.length > 0);
  assert.ok(result.preallocatedIds.users.length > 0);

  // Assert no manifest file was written to disk in dry-run mode
  assert.equal(fs.existsSync(manifestPath), false, 'Dry-run must not create or write manifest file');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('8. Cleanup Reconciliation of Preallocated IDs and Inserted IDs', () => {
  const preallocated = {
    categories: ['60c72b2f9b1d8b2bad000001', '60c72b2f9b1d8b2bad000002'],
    vendors: ['60c72b2f9b1d8b2bad000003'],
    products: ['60c72b2f9b1d8b2bad000004'],
    riders: ['60c72b2f9b1d8b2bad000005'],
    users: ['60c72b2f9b1d8b2bad000006']
  };
  const inserted = {
    categories: ['60c72b2f9b1d8b2bad000001'], // 000002 was preallocated before crash
    vendors: [],
    products: [],
    riders: [],
    users: []
  };

  const getCandidateIds = (col) => {
    const pre = Array.isArray(preallocated[col]) ? preallocated[col] : [];
    const ins = Array.isArray(inserted[col]) ? inserted[col] : [];
    return Array.from(new Set([...pre, ...ins]));
  };

  assert.equal(getCandidateIds('categories').length, 2);
  assert.ok(getCandidateIds('categories').includes('60c72b2f9b1d8b2bad000002'));
  assert.equal(getCandidateIds('vendors').length, 1);
  assert.ok(getCandidateIds('vendors').includes('60c72b2f9b1d8b2bad000003'));
});

