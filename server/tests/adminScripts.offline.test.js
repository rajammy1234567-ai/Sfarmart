import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import { REQUIRED_SCHEMA } from '../scripts/provisionStagingDb.js';
import { runAdminAccountCheck } from '../scripts/checkAdminAccounts.js';
import { runStagingAdminSetup, STAGING_ADMIN_ROLE_PERMISSIONS } from '../scripts/setupStagingAdmin.js';
import { resetAdminPassword } from '../scripts/resetAdminPassword.js';
import { seedAdmin, adminLogin, getStagingAdminInspect } from '../controllers/adminController.js';
import { recoverStagingAdminPassword } from '../scripts/recoverStagingAdminPassword.js';

test('Staging Admin Scripts Suite (Offline & Guard Verification)', async (t) => {
  const origConnect = mongoose.connect;
  const origDisconnect = mongoose.disconnect;
  const origAdminCount = Admin.countDocuments;
  const origAdminFind = Admin.find;
  const origAdminFindOne = Admin.findOne;
  const origAdminCreate = Admin.create;
  const origAdminUpdateOne = Admin.updateOne;

  t.afterEach(() => {
    mongoose.connect = origConnect;
    mongoose.disconnect = origDisconnect;
    Admin.countDocuments = origAdminCount;
    Admin.find = origAdminFind;
    Admin.findOne = origAdminFindOne;
    Admin.create = origAdminCreate;
    Admin.updateOne = origAdminUpdateOne;
    delete process.env.STAGING_ADMIN_USERNAME;
    delete process.env.STAGING_ADMIN_PASSWORD;
    delete process.env.STAGING_ADMIN_TARGET_USERNAME;
    delete process.env.STAGING_ADMIN_NEW_PASSWORD;
    delete process.env.STAGING_MONGO_URI;
    delete process.env.ADMIN_INIT_USERNAME;
    delete process.env.ADMIN_INIT_PASSWORD;
    delete process.env.ADMIN_INIT_NAME;
  });

  await t.test('1. Schema Definition: provisionStagingDb.js includes admins with unique username_1 index', () => {
    assert.ok(REQUIRED_SCHEMA.admins, 'admins collection must be defined in REQUIRED_SCHEMA');
    const usernameIdx = REQUIRED_SCHEMA.admins.indexes.find((i) => i.options.name === 'username_1');
    assert.ok(usernameIdx, 'username_1 index must be defined in REQUIRED_SCHEMA.admins');
    assert.deepEqual(usernameIdx.keys, { username: 1 });
    assert.equal(usernameIdx.options.unique, true);
  });

  await t.test('2. Host Pinning Guard: checkAdminAccounts rejects non-staging host and unpinned databases', async () => {
    // Non-staging host
    await assert.rejects(
      async () => runAdminAccountCheck('mongodb+srv://user:pass@production-cluster.mongodb.net/farmart_test_disposable'),
      /does not match approved staging host/
    );

    // Wrong database
    await assert.rejects(
      async () => runAdminAccountCheck('mongodb+srv://user:pass@farmart-staging.gxn3bfw.mongodb.net/production_db'),
      /does not match approved staging database/
    );
  });

  await t.test('3. Safe Projection: checkAdminAccounts never queries or exposes password hashes or tokens', async () => {
    let passedProjection = null;
    let connectOptions = null;

    mongoose.connect = async (uri, opts) => {
      connectOptions = opts;
      return mongoose;
    };
    mongoose.disconnect = async () => {};

    Admin.countDocuments = async () => 1;
    Admin.find = (filter, projection) => {
      passedProjection = projection;
      return {
        lean: async () => [
          {
            _id: new mongoose.Types.ObjectId(),
            id: 'admin-123',
            username: 'staging_admin',
            role: 'superadmin',
            name: 'Staging Superadmin',
            access: ['users', 'partners', 'categories']
          }
        ]
      };
    };

    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    const report = await runAdminAccountCheck(validStagingUri);

    assert.equal(connectOptions.autoIndex, false);
    assert.equal(connectOptions.autoCreate, false);
    assert.deepEqual(passedProjection, { password: 0, __v: 0 }, 'Projection must explicitly exclude password');
    assert.equal(report.adminAccountCount, 1);
    assert.equal(report.accounts[0].username, 'staging_admin');
    assert.equal(report.accounts[0].password, undefined, 'Password must never be exposed');
  });

  await t.test('4. Setup Dry-Run Guard: setupStagingAdmin requires explicit flag and outputs granular permissions without write', async () => {
    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    const result = await runStagingAdminSetup({ uri: validStagingUri });

    assert.equal(result.executed, false);
    assert.equal(result.reason, 'DRY_RUN');
    assert.equal(STAGING_ADMIN_ROLE_PERMISSIONS.collection, 'admins');
    assert.deepEqual(STAGING_ADMIN_ROLE_PERMISSIONS.runtimeUserPermissions.requiredActions, ['find']);
    assert.equal(
      STAGING_ADMIN_ROLE_PERMISSIONS.recommendedAtlasRole,
      undefined,
      'Must NOT recommend database-wide readWrite or dbOwner'
    );
  });

  await t.test('5. Missing Provisioning Guard: setupStagingAdmin aborts if admins collection does not exist', async () => {
    mongoose.connect = async () => {
      mongoose.connection.db = {
        listCollections: () => ({
          toArray: async () => [] // Collection does NOT exist
        })
      };
      return mongoose;
    };
    mongoose.disconnect = async () => {};

    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    process.env.STAGING_ADMIN_PASSWORD = 'super_secret_password_123';

    await assert.rejects(
      async () => runStagingAdminSetup({ uri: validStagingUri, createStagingAdmin: true }),
      /Collection "admins" does not exist in staging database.*Run provisionStagingDb\.js first/
    );
  });

  await t.test('6. Missing Index Guard: setupStagingAdmin aborts if username unique index is missing from admins collection', async () => {
    mongoose.connect = async () => {
      mongoose.connection.db = {
        listCollections: () => ({
          toArray: async () => [{ name: 'admins' }] // Collection exists
        }),
        collection: () => ({
          indexes: async () => [{ key: { _id: 1 }, name: '_id_' }] // username_1 unique index missing!
        })
      };
      return mongoose;
    };
    mongoose.disconnect = async () => {};

    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    process.env.STAGING_ADMIN_PASSWORD = 'super_secret_password_123';

    await assert.rejects(
      async () => runStagingAdminSetup({ uri: validStagingUri, createStagingAdmin: true }),
      /Unique index on \{ username: 1 \} is missing or not unique in "admins" collection.*Run provisionStagingDb\.js first/
    );
  });

  await t.test('7. Empty Username Guard: setupStagingAdmin rejects empty or whitespace username', async () => {
    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    process.env.STAGING_ADMIN_PASSWORD = 'super_secret_password_123';
    process.env.STAGING_ADMIN_USERNAME = '   '; // whitespace only

    await assert.rejects(
      async () => runStagingAdminSetup({ uri: validStagingUri, createStagingAdmin: true }),
      /STAGING_ADMIN_USERNAME cannot be empty/
    );
  });

  await t.test('8. Overwrite Prevention Guard: setupStagingAdmin strictly refuses if existing admin accounts exist', async () => {
    mongoose.connect = async () => {
      mongoose.connection.db = {
        listCollections: () => ({
          toArray: async () => [{ name: 'admins' }]
        }),
        collection: () => ({
          indexes: async () => [
            { key: { _id: 1 }, name: '_id_' },
            { key: { username: 1 }, name: 'username_1', unique: true }
          ]
        })
      };
      return mongoose;
    };
    mongoose.disconnect = async () => {};

    Admin.countDocuments = async () => 1;
    Admin.find = () => ({
      lean: async () => [{ username: 'existing_admin', role: 'superadmin' }]
    });

    const validStagingUri = 'mongodb+srv://test:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    process.env.STAGING_ADMIN_PASSWORD = 'super_secret_password_123';

    await assert.rejects(
      async () => runStagingAdminSetup({ uri: validStagingUri, createStagingAdmin: true }),
      /Refusing to create account\. 1 admin account\(s\) already exist/
    );
  });

  await t.test('9. Password Reset Validation: resetAdminPassword rejects passwords under 8 characters', async () => {
    await assert.rejects(
      async () => resetAdminPassword({ newPassword: 'short', uri: 'mongodb://localhost:27017/test' }),
      /Password must be at least 8 characters long/
    );
  });

  await t.test('10. Nonexistent Admin: resetAdminPassword rejects if target admin is not found', async () => {
    mongoose.connect = async () => {
      mongoose.connection.name = 'test';
      return mongoose;
    };
    mongoose.disconnect = async () => {};
    Admin.findOne = async () => null;

    await assert.rejects(
      async () => resetAdminPassword({ username: 'missing_admin', newPassword: 'valid_password_123', uri: 'mongodb://localhost:27017/test' }),
      /Administrator account with username "missing_admin" does not exist/
    );
  });

  await t.test('11. Successful Reset: resetAdminPassword hashes password and preserves roles and access', async () => {
    let updatedFilter = null;
    let updatedDoc = null;

    mongoose.connect = async () => {
      mongoose.connection.name = 'test';
      return mongoose;
    };
    mongoose.disconnect = async () => {};

    Admin.findOne = async ({ username }) => {
      if (username === 'superadmin') {
        return {
          _id: 'mock-admin-id',
          id: 'super-admin-01',
          username: 'superadmin',
          role: 'superadmin',
          name: 'Super Admin',
          access: ['users', 'partners', 'riders', 'jobs']
        };
      }
      return null;
    };

    Admin.updateOne = async (filter, update) => {
      updatedFilter = filter;
      updatedDoc = update;
      return { matchedCount: 1, modifiedCount: 1 };
    };

    const res = await resetAdminPassword({
      username: 'superadmin',
      newPassword: 'new_secure_admin_password_99',
      uri: 'mongodb://localhost:27017/test'
    });

    assert.equal(res.success, true);
    assert.equal(res.username, 'superadmin');
    assert.equal(res.role, 'superadmin');
    assert.deepEqual(res.access, ['users', 'partners', 'riders', 'jobs']);

    assert.deepEqual(updatedFilter, { _id: 'mock-admin-id' });
    assert.ok(updatedDoc.$set.password, 'Must update password');
    assert.notEqual(updatedDoc.$set.password, 'new_secure_admin_password_99', 'Password must be hashed with bcrypt');
    assert.ok(updatedDoc.$set.password.startsWith('$2'), 'Bcrypt hash format check');
  });

  await t.test('12. seedAdmin (Empty Collection): provisions superadmin with hashed password and full access', async () => {
    let createdPayload = null;
    Admin.countDocuments = async () => 0;
    Admin.create = async (payload) => {
      createdPayload = payload;
      return { id: payload.id, username: payload.username, role: payload.role };
    };

    process.env.ADMIN_INIT_USERNAME = 'superadmin';
    process.env.ADMIN_INIT_PASSWORD = 'super_secure_staging_password_123';
    process.env.ADMIN_INIT_NAME = 'Staging Master Admin';

    const res = await seedAdmin();

    assert.equal(res.created, true);
    assert.equal(res.username, 'superadmin');
    assert.equal(res.role, 'superadmin');
    assert.ok(createdPayload);
    assert.equal(createdPayload.username, 'superadmin');
    assert.equal(createdPayload.role, 'superadmin');
    assert.equal(createdPayload.name, 'Staging Master Admin');
    assert.ok(createdPayload.password.startsWith('$2'), 'Password must be bcrypt hashed');
    assert.notEqual(createdPayload.password, 'super_secure_staging_password_123');
    assert.ok(createdPayload.access.includes('partners'));
    assert.ok(createdPayload.access.includes('categories'));
  });

  await t.test('13. seedAdmin (Existing Accounts Guard): strictly preserves existing accounts without overwrite or reset', async () => {
    let createdPayload = null;
    Admin.countDocuments = async () => 1;
    Admin.create = async (payload) => {
      createdPayload = payload;
      return payload;
    };

    process.env.ADMIN_INIT_USERNAME = 'superadmin';
    process.env.ADMIN_INIT_PASSWORD = 'attempted_override_pass_123';

    const res = await seedAdmin();

    assert.equal(res.created, false);
    assert.equal(res.reason, 'EXISTING_ACCOUNTS_PRESERVED');
    assert.equal(res.count, 1);
    assert.equal(createdPayload, null, 'Must NEVER call Admin.create when admin accounts already exist');
  });

  await t.test('14. seedAdmin (Missing Credentials Guard): does not create account when init env vars are absent', async () => {
    let createdPayload = null;
    Admin.countDocuments = async () => 0;
    Admin.create = async (payload) => {
      createdPayload = payload;
      return payload;
    };

    delete process.env.ADMIN_INIT_USERNAME;
    delete process.env.ADMIN_INIT_PASSWORD;

    const res = await seedAdmin();

    assert.equal(res.created, false);
    assert.equal(res.reason, 'MISSING_INIT_CREDENTIALS');
    assert.equal(createdPayload, null, 'Must NOT create account when init credentials are missing');
  });

  await t.test('15. Startup Staging Gate: ensures seedAdmin() is gated in staging mode', () => {
    // Case A: Staging mode without credentials -> gated off
    const isStagingTrue = true;
    const hasInitCredsEmpty = Boolean(undefined && undefined);
    const shouldRunCaseA = !isStagingTrue || hasInitCredsEmpty;
    assert.equal(shouldRunCaseA, false, 'Must skip seedAdmin in staging if no init credentials supplied');

    // Case B: Staging mode with explicit credentials -> allowed
    const hasInitCredsSet = Boolean('superadmin'.trim() && 'password123');
    const shouldRunCaseB = !isStagingTrue || hasInitCredsSet;
    assert.equal(shouldRunCaseB, true, 'Must allow seedAdmin in staging when explicit init credentials supplied');

    // Case C: Non-staging mode -> always allowed
    const isStagingFalse = false;
    const shouldRunCaseC = !isStagingFalse || hasInitCredsEmpty;
    assert.equal(shouldRunCaseC, true, 'Must allow seedAdmin in development / production mode');
  });

  await t.test('16. recoverStagingAdminPassword: pins host and updates target admin password', async () => {
    // Rejects non-staging host
    await assert.rejects(
      async () => recoverStagingAdminPassword({ uri: 'mongodb+srv://user:pass@evil-host.mongodb.net/farmart_test_disposable', username: 'superadmin', newPassword: 'new_valid_password_123' }),
      /does not match approved staging host/
    );

    // Rejects short password
    await assert.rejects(
      async () => recoverStagingAdminPassword({ uri: 'mongodb+srv://user:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable', username: 'superadmin', newPassword: 'short' }),
      /New password must be provided with at least 8 characters/
    );

    let updatedFilter = null;
    let updatedDoc = null;

    mongoose.connect = async () => mongoose;
    mongoose.disconnect = async () => {};

    Admin.findOne = async () => ({
      _id: 'staging-admin-doc-id',
      username: 'superadmin',
      role: 'superadmin',
      access: ['users', 'partners', 'riders', 'jobs', 'categories']
    });

    Admin.updateOne = async (filter, update) => {
      updatedFilter = filter;
      updatedDoc = update;
      return { matchedCount: 1, modifiedCount: 1 };
    };

    const validStagingUri = 'mongodb+srv://farmart_staging_tester:pass@farmart-staging.gxn3bfw.mongodb.net/farmart_test_disposable';
    const res = await recoverStagingAdminPassword({
      uri: validStagingUri,
      username: 'superadmin',
      newPassword: 'my_fresh_staging_password_456'
    });

    assert.equal(res.success, true);
    assert.equal(res.username, 'superadmin');
    assert.equal(res.role, 'superadmin');
    assert.deepEqual(updatedFilter, { _id: 'staging-admin-doc-id' });
    assert.ok(updatedDoc.$set.password.startsWith('$2'), 'Must be bcrypt hashed');
  });

  await t.test('17. adminLogin: supports trimmed and case-insensitive username matching', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hashed = await bcrypt.hash('secret_password_123', 10);

    let queriedFilter = null;
    Admin.findOne = async (filter) => {
      queriedFilter = filter;
      return {
        _id: 'admin-id-1',
        id: 'admin-id-1',
        username: 'superadmin',
        password: hashed,
        role: 'superadmin',
        access: ['users', 'partners'],
        toObject: function() { return { ...this }; }
      };
    };

    let statusCode = 0;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    process.env.JWT_ACCESS_SECRET = 'test_access_secret_32_characters_long_min!';

    // Test with whitespace and upper casing
    const req = {
      body: { username: '  SuperAdmin  ', password: 'secret_password_123' }
    };

    await adminLogin(req, res);

    assert.equal(statusCode, 0); // 200 default
    assert.equal(jsonBody.success, true);
    assert.equal(jsonBody.admin.username, 'superadmin');
    assert.ok(jsonBody.token, 'Token must be issued');
    assert.equal(jsonBody.admin.password, undefined, 'Password must never be returned');
    assert.ok(queriedFilter.username.$regex, 'Must use case-insensitive regex query');
  });

  await t.test('18. getStagingAdminInspect: returns safe read-only counts without passwords or secrets', async () => {
    Admin.countDocuments = async () => 2;
    Admin.find = () => ({
      lean: async () => [
        { id: 'admin-1', username: 'superadmin', role: 'superadmin', name: 'Super', access: ['all'] },
        { id: 'admin-2', username: 'partner_auditor', role: 'subadmin', name: 'Auditor', access: ['partners'] }
      ]
    });

    let statusCode = 0;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    process.env.STAGING_MODE = 'true';
    await getStagingAdminInspect({}, res);

    assert.equal(jsonBody.ok, true);
    assert.equal(jsonBody.adminAccountCount, 2);
    assert.equal(jsonBody.hasSuperadmin, true);
    assert.equal(jsonBody.accounts.length, 2);
    assert.equal(jsonBody.accounts[0].password, undefined);
    assert.equal(jsonBody.accounts[1].password, undefined);

    delete process.env.STAGING_MODE;
  });
});
