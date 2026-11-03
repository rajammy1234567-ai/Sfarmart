import assert from 'node:assert/strict';
import test from 'node:test';
import { executeProductionProvisioningPlan } from '../scripts/provisionProductionDb.js';
import { REQUIRED_SCHEMA, isTextIndex, getExpectedNormalizedKey, getExpectedWeights } from '../scripts/provisionStagingDb.js';

test('Production Database Provisioning Suite (Offline)', async (t) => {
  await t.test('1. Dry-run mode identifies all missing collections and indexes without writes', async () => {
    const mockDb = {
      listCollections: () => ({
        toArray: async () => []
      })
    };

    const result = await executeProductionProvisioningPlan(mockDb, true);

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.missingCollectionsCount, Object.keys(REQUIRED_SCHEMA).length);
    assert.ok(result.missingIndexesCount > 0);
  });

  await t.test('2. Live execution creates collections and indexes idempotently', async () => {
    const createdCollections = [];
    const createdIndexes = [];

    const mockDb = {
      listCollections: () => ({
        toArray: async () => []
      }),
      createCollection: async (name) => {
        createdCollections.push(name);
        return {};
      },
      collection: (name) => ({
        createIndex: async (keys, options) => {
          createdIndexes.push({ name, keys, options });
          return options.name;
        },
        indexes: async () => {
          const required = REQUIRED_SCHEMA[name]?.indexes || [];
          return [
            { key: { _id: 1 }, name: '_id_' },
            ...required.map(r => {
              if (isTextIndex(r.keys)) {
                return {
                  key: getExpectedNormalizedKey(r.keys),
                  name: r.options.name,
                  weights: getExpectedWeights(r.keys),
                  default_language: 'english',
                  language_override: 'language',
                  ...r.options
                };
              }
              return {
                key: r.keys,
                name: r.options.name,
                ...r.options
              };
            })
          ];
        }
      })
    };

    const result = await executeProductionProvisioningPlan(mockDb, false);

    assert.equal(result.success, true);
    assert.equal(result.dryRun, false);
    assert.equal(createdCollections.length, Object.keys(REQUIRED_SCHEMA).length);
    assert.ok(createdIndexes.length > 0);
  });
});
