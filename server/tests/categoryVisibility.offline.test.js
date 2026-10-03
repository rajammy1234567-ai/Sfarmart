import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import { getAllCategories, updateCategoryAdmin } from '../controllers/categoryController.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

test('Category Visibility & Partner Selection Isolation Suite (Offline)', async (t) => {
  const originalFind = Category.find;
  const originalFindById = Category.findById;

  t.afterEach(() => {
    Category.find = originalFind;
    Category.findById = originalFindById;
  });

  const canonicalSlugs = [
    'fruits-vegetables',
    'dairy-milk',
    'atta-rice-dal',
    'oil-ghee-masala',
    'home-thali',
    'sweets-bakery',
    'snacks-namkeen',
    'beverages'
  ];

  const dbDataset = [
    // 8 canonical categories with homeVisibility: true
    ...canonicalSlugs.map((slug, idx) => ({
      _id: new mongoose.Types.ObjectId(),
      name: slug.replace(/-/g, ' ').toUpperCase(),
      slug,
      isActive: true,
      homeVisibility: true,
      sortOrder: idx + 1,
      createdAt: new Date(Date.now() - 10000 + idx)
    })),
    // Organic Hydroponics: active, but homeVisibility: false
    {
      _id: new mongoose.Types.ObjectId(),
      name: 'Organic Hydroponics',
      slug: 'organic-hydroponics',
      isActive: true,
      homeVisibility: false,
      sortOrder: 9,
      createdAt: new Date()
    },
    // Exact fixture category: active, but homeVisibility: false
    {
      _id: new mongoose.Types.ObjectId(),
      name: 'Staging Produce Fixture',
      slug: 'staging-produce-sfix_1790844015081_zwtr8',
      isActive: true,
      homeVisibility: false,
      sortOrder: 10,
      createdAt: new Date()
    },
    // Inactive category (should never appear anywhere)
    {
      _id: new mongoose.Types.ObjectId(),
      name: 'Archived Seasonal',
      slug: 'archived-seasonal',
      isActive: false,
      homeVisibility: true,
      sortOrder: 11,
      createdAt: new Date()
    }
  ];

  await t.test('1. Home request (?home=true): Excludes Organic Hydroponics and staging fixture, returning exactly 8 canonical categories', async () => {
    let capturedFilter = null;

    Category.find = (filter) => {
      capturedFilter = filter;
      const matched = dbDataset.filter(doc => {
        for (const key of Object.keys(filter)) {
          if (doc[key] !== filter[key]) return false;
        }
        return true;
      });
      return {
        sort: () => matched
      };
    };

    const req = { query: { home: 'true' } };
    const res = createMockRes();
    await getAllCategories(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedFilter, { isActive: true, homeVisibility: true });
    assert.equal(res.body.count, 8);
    assert.equal(res.body.categories.length, 8);

    const slugs = res.body.categories.map(c => c.slug);
    assert.equal(slugs.includes('organic-hydroponics'), false, 'Organic Hydroponics must NOT appear on Home');
    assert.equal(slugs.includes('staging-produce-sfix_1790844015081_zwtr8'), false, 'Staging fixture must NOT appear on Home');
    assert.equal(slugs.includes('archived-seasonal'), false, 'Inactive category must NOT appear');
    for (const slug of canonicalSlugs) {
      assert.equal(slugs.includes(slug), true, `Canonical slug ${slug} must be present`);
    }
  });

  await t.test('2. Default public request without params: Also enforces { isActive: true, homeVisibility: true }', async () => {
    let capturedFilter = null;

    Category.find = (filter) => {
      capturedFilter = filter;
      const matched = dbDataset.filter(doc => {
        for (const key of Object.keys(filter)) {
          if (doc[key] !== filter[key]) return false;
        }
        return true;
      });
      return {
        sort: () => matched
      };
    };

    const req = { query: {} };
    const res = createMockRes();
    await getAllCategories(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedFilter.isActive, true);
    assert.equal(capturedFilter.homeVisibility, true);
    assert.equal(res.body.count, 8);
    assert.equal(res.body.categories.some(c => c.slug === 'organic-hydroponics'), false);
  });

  await t.test('3. Partner request (?partner=true): Retrieves all active categories, so Organic Hydroponics remains selectable', async () => {
    let capturedFilter = null;

    Category.find = (filter) => {
      capturedFilter = filter;
      const matched = dbDataset.filter(doc => {
        for (const key of Object.keys(filter)) {
          if (doc[key] !== filter[key]) return false;
        }
        return true;
      });
      return {
        sort: () => matched
      };
    };

    const req = { query: { partner: 'true' } };
    const res = createMockRes();
    await getAllCategories(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedFilter, { isActive: true }, 'Partner selector must query only isActive: true');
    // 8 canonical + 1 organic-hydroponics + 1 staging-produce = 10 active categories
    assert.equal(res.body.count, 10);
    const slugs = res.body.categories.map(c => c.slug);
    assert.equal(slugs.includes('organic-hydroponics'), true, 'Organic Hydroponics must remain selectable in partnerApp');
    assert.equal(slugs.includes('archived-seasonal'), false, 'Inactive category must never appear in partner selector');
  });

  await t.test('4. Admin-curated visibility controls Home appearance dynamically', async () => {
    // Simulate admin toggling homeVisibility on snacks-namkeen
    const snacksDoc = dbDataset.find(c => c.slug === 'snacks-namkeen');
    assert.ok(snacksDoc);

    // Set homeVisibility to false
    snacksDoc.homeVisibility = false;

    Category.find = (filter) => {
      const matched = dbDataset.filter(doc => {
        for (const key of Object.keys(filter)) {
          if (doc[key] !== filter[key]) return false;
        }
        return true;
      });
      return {
        sort: () => matched
      };
    };

    // Home request
    const homeReq = { query: { home: 'true' } };
    const homeRes = createMockRes();
    await getAllCategories(homeReq, homeRes);

    assert.equal(homeRes.body.count, 7, 'Now only 7 categories on Home');
    assert.equal(homeRes.body.categories.some(c => c.slug === 'snacks-namkeen'), false, 'snacks-namkeen removed from Home');

    // Partner request still sees it
    const partnerReq = { query: { partner: 'true' } };
    const partnerRes = createMockRes();
    await getAllCategories(partnerReq, partnerRes);
    assert.equal(partnerRes.body.count, 10, 'Partner selector still has all 10 active categories');
    assert.equal(partnerRes.body.categories.some(c => c.slug === 'snacks-namkeen'), true);

    // Restore
    snacksDoc.homeVisibility = true;
  });
});
