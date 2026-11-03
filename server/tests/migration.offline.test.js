import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_PRODUCTION_SCHEMA,
  GRIDFS_SCHEMA,
  ADMIN_CONTENT_SCHEMA,
  provisionProductionDatabase,
  migrateBusinessRecords,
  verifyTargetIntegrity
} from '../scripts/migrateProductionData.js';
import mongoose from 'mongoose';

test('Production Migration Schema & Integrity Suite', async (t) => {
  await t.test('1. FULL_PRODUCTION_SCHEMA includes 10 core application collections + GridFS + Admin Content', () => {
    const keys = Object.keys(FULL_PRODUCTION_SCHEMA);
    const expected = [
      'orders', 'riders', 'users', 'vendors', 'products',
      'refreshtokens', 'categories', 'categoryrequests', 'admins', 'pushreceipts',
      'product_images.files', 'product_images.chunks', 'shop_images.files', 'shop_images.chunks',
      'applications', 'jobapplications', 'contactinquiries'
    ];
    for (const col of expected) {
      assert.ok(keys.includes(col), `Must include collection ${col}`);
    }

    const emailIdx = FULL_PRODUCTION_SCHEMA.users.indexes.find(i => i.options.name === 'email_1');
    assert.ok(emailIdx, 'email_1 index must exist in users schema');
    assert.deepEqual(emailIdx.options.partialFilterExpression, { email: { $type: 'string', $gt: '' } }, 'email_1 must use partialFilterExpression');
  });

  await t.test('2. migrateBusinessRecords treats blank emails as absent, checks duplicate non-empty emails, and migrates safely', async () => {
    const krishnaId = new mongoose.Types.ObjectId('6ae461e7b53a14b178ef76c4');
    const bannerFileId = new mongoose.Types.ObjectId('6ae85203c2ee0531cbabb99b');
    const prodFileId = new mongoose.Types.ObjectId('6ae47c211e70d85570212591');
    const cat1Id = new mongoose.Types.ObjectId('6aaa44d4bba7479a91ad1756');
    const prod1Id = new mongoose.Types.ObjectId('6ae4770a7c20b61861f9d239');
    const appId = new mongoose.Types.ObjectId();
    const jobId = new mongoose.Types.ObjectId();
    const inqId = new mongoose.Types.ObjectId();
    const user1Id = new mongoose.Types.ObjectId();
    const user2Id = new mongoose.Types.ObjectId();
    const user3Id = new mongoose.Types.ObjectId();

    const mockSourceDb = {
      collection: (name) => {
        if (name === 'categories') {
          return {
            find: () => ({
              toArray: async () => [
                { _id: cat1Id, name: 'Dairy, Bread & Eggs' }
              ]
            })
          };
        }
        if (name === 'vendors') {
          return {
            findOne: async (q) => {
              if (q._id.equals(krishnaId)) {
                return {
                  _id: krishnaId,
                  storeName: "Krishna's shop",
                  banner: `/api/uploads/shop-photos/${bannerFileId}`
                };
              }
              return null;
            }
          };
        }
        if (name === 'products') {
          return {
            find: () => ({
              toArray: async () => [
                {
                  _id: prod1Id,
                  name: 'Water',
                  vendor: krishnaId,
                  category: cat1Id.toString(),
                  image: `http://localhost:5000/api/uploads/product-images/${prodFileId}`
                }
              ]
            })
          };
        }
        if (name === 'users') {
          return {
            find: () => ({
              toArray: async () => [
                { _id: user1Id, phone: '7009264006', email: '' }, // blank email
                { _id: user2Id, phone: '7973442177', email: '   ' }, // whitespace email
                { _id: user3Id, phone: '9876543210', email: 'rajesh.kumar@example.com' } // valid email
              ]
            })
          };
        }
        if (name === 'applications') {
          return { find: () => ({ toArray: async () => [{ _id: appId, fullName: 'Sukhjinder singh' }] }) };
        }
        if (name === 'jobapplications') {
          return { find: () => ({ toArray: async () => [{ _id: jobId, fullName: 'Randeep Singh' }] }) };
        }
        if (name === 'contactinquiries') {
          return { find: () => ({ toArray: async () => [{ _id: inqId, name: 'VIZ DIGITAL' }] }) };
        }
        if (name === 'shop_images.files') {
          return { findOne: async (q) => ({ _id: q._id, filename: 'shop.jpg', length: 1234 }) };
        }
        if (name === 'shop_images.chunks') {
          return { find: () => ({ toArray: async () => [{ files_id: bannerFileId, n: 0, data: Buffer.from('abc') }] }) };
        }
        if (name === 'product_images.files') {
          return { findOne: async (q) => ({ _id: q._id, filename: 'prod.jpg', length: 5678 }) };
        }
        if (name === 'product_images.chunks') {
          return { find: () => ({ toArray: async () => [{ files_id: prodFileId, n: 0, data: Buffer.from('xyz') }] }) };
        }
        return {
          find: () => ({ toArray: async () => [] }),
          findOne: async () => null
        };
      }
    };

    const targetStore = {
      categories: new Map(),
      vendors: new Map(),
      products: new Map(),
      users: new Map(),
      applications: new Map(),
      jobapplications: new Map(),
      contactinquiries: new Map(),
      'shop_images.files': new Map(),
      'shop_images.chunks': new Map(),
      'product_images.files': new Map(),
      'product_images.chunks': new Map()
    };

    const mockTargetDb = {
      collection: (name) => ({
        findOne: async (q) => targetStore[name]?.get(q._id?.toString()) || null,
        insertOne: async (doc) => {
          targetStore[name]?.set(doc._id.toString(), doc);
          return { insertedId: doc._id };
        },
        updateOne: async (q, update) => {
          const doc = targetStore[name]?.get(q._id.toString());
          if (doc && update.$unset && update.$unset.email !== undefined) {
            delete doc.email;
          }
          return { acknowledged: true };
        },
        replaceOne: async (filter, doc) => {
          targetStore[name]?.set(`${filter.files_id}_${filter.n}`, doc);
          return { acknowledged: true };
        }
      })
    };

    // Run 1: initial migration
    const res = await migrateBusinessRecords(mockSourceDb, mockTargetDb);
    assert.equal(res.categories.copied, 1);
    assert.equal(res.vendors.copied, 1);
    assert.equal(res.products.copied, 1);
    assert.equal(res.users.copied, 3);
    assert.equal(res.applications.copied, 1);
    assert.equal(res.jobapplications.copied, 1);
    assert.equal(res.contactinquiries.copied, 1);
    assert.equal(res.gridfsFiles.copied, 2);
    assert.equal(res.gridfsChunks.copied, 2);

    // Verify blank emails were stripped/omitted in target
    const targetUser1 = targetStore.users.get(user1Id.toString());
    const targetUser2 = targetStore.users.get(user2Id.toString());
    const targetUser3 = targetStore.users.get(user3Id.toString());
    assert.equal(targetUser1.email, undefined, 'Blank email must be omitted');
    assert.equal(targetUser2.email, undefined, 'Whitespace email must be omitted');
    assert.equal(targetUser3.email, 'rajesh.kumar@example.com', 'Valid email must be preserved');

    // Run 2: safe resumption, zero duplicate writes
    const res2 = await migrateBusinessRecords(mockSourceDb, mockTargetDb);
    assert.equal(res2.categories.skipped, 1);
    assert.equal(res2.vendors.skipped, 1);
    assert.equal(res2.products.skipped, 1);
    assert.equal(res2.users.skipped, 3);
    assert.equal(res2.applications.skipped, 1);
    assert.equal(res2.jobapplications.skipped, 1);
    assert.equal(res2.contactinquiries.skipped, 1);
    assert.equal(res2.gridfsFiles.skipped, 2);
  });

  await t.test('3. migrateBusinessRecords rejects duplicate non-empty emails fail-closed', async () => {
    const mockSourceDb = {
      collection: (name) => {
        if (name === 'users') {
          return {
            find: () => ({
              toArray: async () => [
                { _id: new mongoose.Types.ObjectId(), phone: '1111111111', email: 'duplicate@example.com' },
                { _id: new mongoose.Types.ObjectId(), phone: '2222222222', email: 'DUPLICATE@example.com' }
              ]
            })
          };
        }
        return { find: () => ({ toArray: async () => [] }), findOne: async () => null };
      }
    };
    const mockTargetDb = { collection: () => ({ findOne: async () => null }) };

    await assert.rejects(
      async () => migrateBusinessRecords(mockSourceDb, mockTargetDb),
      /FAIL-CLOSED: Conflicting duplicate non-empty email/
    );
  });

  await t.test('4. provisionProductionDatabase repairs obsolete sparse email_1 index on users', async () => {
    let droppedIndex = null;
    let unsetStrings = false;
    let createdIndex = null;

    const mockDb = {
      listCollections: () => ({
        toArray: async () => Object.keys(FULL_PRODUCTION_SCHEMA).map(name => ({ name }))
      }),
      collection: (name) => {
        if (name === 'users') {
          let userIndexes = [
            { name: '_id_', key: { _id: 1 } },
            { name: 'phone_1', key: { phone: 1 }, unique: true },
            // Obsolete sparse index without partialFilterExpression
            { name: 'email_1', key: { email: 1 }, unique: true, sparse: true },
            { name: 'role_1', key: { role: 1 } },
            { name: 'status_1', key: { status: 1 } }
          ];
          return {
            indexes: async () => userIndexes,
            updateMany: async (filter, update) => {
              if (update.$unset && update.$unset.email !== undefined) {
                unsetStrings = true;
              }
              return { acknowledged: true };
            },
            dropIndex: async (idxName) => {
              droppedIndex = idxName;
              userIndexes = userIndexes.filter(i => i.name !== idxName);
            },
            createIndex: async (keys, options) => {
              createdIndex = { keys, options };
              userIndexes.push({ name: options.name, key: keys, ...options });
            }
          };
        }
        return {
          indexes: async () => {
            const req = FULL_PRODUCTION_SCHEMA[name]?.indexes || [];
            return req.map(r => {
              if (r.keys.name === 'text') {
                return {
                  name: r.options.name,
                  key: { _fts: 'text', _ftsx: 1 },
                  weights: { name: 1, tags: 1 },
                  default_language: 'english',
                  language_override: 'language'
                };
              }
              return { name: r.options.name, key: r.keys, ...r.options };
            });
          },
          createIndex: async () => {}
        };
      }
    };

    const res = await provisionProductionDatabase(mockDb);
    assert.equal(droppedIndex, 'email_1', 'Must drop obsolete email_1 index');
    assert.equal(unsetStrings, true, 'Must unset empty string emails');
    assert.ok(createdIndex, 'Must create repaired email_1 index');
    assert.deepEqual(createdIndex.options.partialFilterExpression, { email: { $type: 'string', $gt: '' } });
    assert.ok(res.repairedIndexes.includes('users.email_1'));
  });

  await t.test('5. verifyTargetIntegrity asserts vendor, products, relational keys, image chunks, and partial index', async () => {
    const krishnaId = new mongoose.Types.ObjectId('6ae461e7b53a14b178ef76c4');
    const catId = new mongoose.Types.ObjectId('6aaa44d4bba7479a91ad1756');
    const bannerFileId = new mongoose.Types.ObjectId('6ae85203c2ee0531cbabb99b');

    const mockDb = {
      listCollections: () => ({
        toArray: async () => Object.keys(FULL_PRODUCTION_SCHEMA).map(name => ({ name }))
      }),
      collection: (name) => {
        if (name === 'vendors') {
          return {
            findOne: async () => ({ _id: krishnaId, storeName: "Krishna's shop" }),
            countDocuments: async () => 1
          };
        }
        if (name === 'categories') {
          return {
            countDocuments: async () => 8,
            findOne: async (q) => ({ _id: catId, name: 'Dairy' })
          };
        }
        if (name === 'products') {
          return {
            findOne: async () => ({ _id: new mongoose.Types.ObjectId(), vendor: krishnaId, category: catId.toString() }),
            countDocuments: async () => 1
          };
        }
        if (name === 'orders' || name === 'riders') {
          return { countDocuments: async () => 0 };
        }
        if (name === 'applications') {
          return { countDocuments: async () => 47 };
        }
        if (name === 'jobapplications') {
          return {
            countDocuments: async () => 48,
            findOne: async () => ({ resumeName: 'randeep .pdf' })
          };
        }
        if (name === 'contactinquiries') {
          return { countDocuments: async () => 14 };
        }
        if (name === 'users') {
          return {
            countDocuments: async (filter) => {
              if (filter && filter.email === '') return 0;
              return 21;
            },
            findOne: async (q) => {
              if (q && q.email === 'rajesh.kumar@example.com') return { email: 'rajesh.kumar@example.com' };
              return null;
            },
            indexes: async () => [
              { name: 'email_1', key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }
            ]
          };
        }
        if (name === 'shop_images.files') {
          return { find: () => ({ toArray: async () => [{ _id: bannerFileId, length: 3 }] }) };
        }
        if (name === 'shop_images.chunks') {
          return { find: () => ({ sort: () => ({ toArray: async () => [{ files_id: bannerFileId, n: 0, data: Buffer.from('abc') }] }) }) };
        }
        if (name === 'product_images.files') {
          return { find: () => ({ toArray: async () => [] }) };
        }
        return {
          countDocuments: async () => 0,
          find: () => ({ toArray: async () => [] })
        };
      }
    };

    const integrity = await verifyTargetIntegrity(null, mockDb);
    assert.equal(integrity.collectionsChecked, Object.keys(FULL_PRODUCTION_SCHEMA).length);
    assert.equal(integrity.relationalChecks.length, 2);
    assert.equal(integrity.imageIntegrity.length, 1);
    assert.ok(integrity.imageIntegrity[0].valid);
    assert.equal(integrity.recordsVerified.users.blankEmails, 0);
    assert.equal(integrity.recordsVerified.users.partialIndexVerified, true);
  });
});
