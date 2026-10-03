import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import { REQUIRED_SCHEMA } from '../scripts/provisionStagingDb.js';
import { runAdminAccountCheck } from '../scripts/checkAdminAccounts.js';
import { runStagingAdminSetup, STAGING_ADMIN_ROLE_PERMISSIONS } from '../scripts/setupStagingAdmin.js';

test('Staging Admin Scripts Suite (Offline & Guard Verification)', async (t) => {
  const origConnect = mongoose.connect;
  const origDisconnect = mongoose.disconnect;
  const origAdminCount = Admin.countDocuments;
  const origAdminFind = Admin.find;
  const origAdminFindOne = Admin.findOne;

  t.afterEach(() => {
    mongoose.connect = origConnect;
    mongoose.disconnect = origDisconnect;
    Admin.countDocuments = origAdminCount;
    Admin.find = origAdminFind;
    Admin.findOne = origAdminFindOne;
    delete process.env.STAGING_ADMIN_USERNAME;
    delete process.env.STAGING_ADMIN_PASSWORD;
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
});
