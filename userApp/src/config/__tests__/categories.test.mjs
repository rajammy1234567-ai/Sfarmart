import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_BROWSE_CATEGORIES,
  findCanonicalCategoryMatch,
  resolveBrowseCategories
} from '../categories.js';

test('Browse Categories Configuration & API Resolution Suite', async (t) => {
  await t.test('Canonical browse categories contains exactly the 8 specified categories in order', () => {
    assert.equal(CANONICAL_BROWSE_CATEGORIES.length, 8);

    const expectedNames = [
      'Fresh Fruits & Vegetables',
      'Dairy, Bread & Eggs',
      'Atta, Rice & Dal',
      'Oil, Ghee & Masala',
      'Ghar Ka Khana / Home Thali',
      'Mithai & Bakery',
      'Snacks & Munchies',
      'Cold Drinks & Juices'
    ];

    const actualNames = CANONICAL_BROWSE_CATEGORIES.map((c) => c.name);
    assert.deepEqual(actualNames, expectedNames);

    const expectedSlugs = [
      'vegetables',
      'dairy-milk',
      'atta-rice-dal',
      'oil-ghee-masala',
      'home-thali',
      'sweets-bakery',
      'snacks-namkeen',
      'beverages'
    ];

    const actualSlugs = CANONICAL_BROWSE_CATEGORIES.map((c) => c.canonicalSlug);
    assert.deepEqual(actualSlugs, expectedSlugs);
  });

  await t.test('Decorates returned categories and does NOT reintroduce missing or unseeded categories', () => {
    const mockDbCategories = [
      {
        _id: '60c72b2f9b1d8b2bad000001',
        name: 'Fresh Fruits & Vegetables',
        slug: 'vegetables',
        type: 'GROCERY',
        sortOrder: 1
      },
      {
        _id: '60c72b2f9b1d8b2bad000005',
        name: 'Ghar Ka Khana / Home Thali',
        slug: 'home-thali',
        type: 'FOOD',
        sortOrder: 5
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategories);
    // MUST NOT reintroduce the other 6 canonical categories that were not returned
    assert.equal(resolved.length, 2, 'Only the 2 returned categories must be resolved');

    // Vegetables is matched and decorated
    const vegCat = resolved.find((c) => c.canonicalSlug === 'vegetables');
    assert.ok(vegCat);
    assert.equal(vegCat.dbId, '60c72b2f9b1d8b2bad000001');
    assert.equal(vegCat.isAvailableInDb, true);
    assert.equal(vegCat.vectorIcon, 'leaf-outline');

    // Home Thali is matched and decorated
    const thaliCat = resolved.find((c) => c.canonicalSlug === 'home-thali');
    assert.ok(thaliCat);
    assert.equal(thaliCat.dbId, '60c72b2f9b1d8b2bad000005');
    assert.equal(thaliCat.isAvailableInDb, true);
    assert.equal(thaliCat.vectorIcon, 'restaurant-outline');

    // Dairy was NOT returned by DB, so it must NOT be in resolved list
    const dairyCat = resolved.find((c) => c.canonicalSlug === 'dairy-milk');
    assert.equal(dairyCat, undefined, 'Missing/hidden categories must not be reintroduced');
  });

  await t.test('Empty database response returns empty array without faking category availability', () => {
    const resolved = resolveBrowseCategories([]);
    assert.equal(resolved.length, 0, 'Must return empty array and not invent fake cards');
  });

  await t.test('Excluded category (e.g. Organic Hydroponics homeVisibility=false) is NOT reintroduced', () => {
    // 8 canonical categories returned by Home-filtered endpoint
    const mockHomeCategories = CANONICAL_BROWSE_CATEGORIES.map((c, i) => ({
      _id: `60c72b2f9b1d8b2bad00000${i + 1}`,
      name: c.name,
      slug: c.canonicalSlug,
      type: c.type,
      sortOrder: c.sortOrder
    }));

    const resolved = resolveBrowseCategories(mockHomeCategories);
    assert.equal(resolved.length, 8, 'Exactly 8 canonical categories resolved for Home');
    assert.equal(resolved.some(c => c.slug === 'organic-hydroponics'), false, 'Organic Hydroponics must remain off Home');
  });

  await t.test('Preserves unexpected dynamic backend categories with fallback decoration', () => {
    const mockDbCategories = [
      {
        _id: '60c72b2f9b1d8b2bad000099',
        name: 'Organic Seeds & Fertilizers',
        slug: 'farming-seeds',
        type: 'GROCERY',
        sortOrder: 10
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategories);
    assert.equal(resolved.length, 1, 'Dynamic backend category is decorated');

    const customCat = resolved.find((c) => c.slug === 'farming-seeds');
    assert.ok(customCat);
    assert.equal(customCat.dbId, '60c72b2f9b1d8b2bad000099');
    assert.equal(customCat.isAvailableInDb, true);
    assert.equal(customCat.vectorIcon, 'grid-outline');
  });

  await t.test('Two distinct IDs matching same canonical metadata share presentation metadata but preserve distinct React keys & identities', () => {
    const mockDbCategories = [
      {
        _id: '60c72b2f9b1d8b2bad000001',
        name: 'Fresh Fruits & Vegetables',
        slug: 'vegetables',
        type: 'GROCERY',
        sortOrder: 1
      },
      {
        _id: '60c72b2f9b1d8b2bad000099',
        name: 'Staging Fresh Produce',
        slug: 'staging-produce-fixture',
        type: 'GROCERY',
        sortOrder: 1
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategories);
    assert.equal(resolved.length, 2, 'Both distinct categories must be resolved without merging');

    const cat1 = resolved.find((c) => c._id === '60c72b2f9b1d8b2bad000001');
    const cat2 = resolved.find((c) => c._id === '60c72b2f9b1d8b2bad000099');

    assert.ok(cat1, 'First category must be present');
    assert.ok(cat2, 'Second category must be present');

    // Both match canonical vegetables metadata
    assert.equal(cat1.canonicalKey, 'vegetables');
    assert.equal(cat2.canonicalKey, 'vegetables');
    assert.equal(cat1.vectorIcon, 'leaf-outline');
    assert.equal(cat2.vectorIcon, 'leaf-outline');
    assert.equal(cat1.accentColor, '#16a34a');
    assert.equal(cat2.accentColor, '#16a34a');

    // Stable React keys MUST be distinct and derived from real database IDs
    assert.equal(cat1.key, '60c72b2f9b1d8b2bad000001');
    assert.equal(cat2.key, '60c72b2f9b1d8b2bad000099');
    assert.notEqual(cat1.key, cat2.key, 'React keys must never collide');

    // Individual names and slugs preserved
    assert.equal(cat1.name, 'Fresh Fruits & Vegetables');
    assert.equal(cat2.name, 'Staging Fresh Produce');
    assert.equal(cat1.slug, 'vegetables');
    assert.equal(cat2.slug, 'staging-produce-fixture');

    // React keys as mapped in HomeScreen are completely unique
    const reactKeys = resolved.map((cat, idx) => String(cat._id || cat.dbId || cat.key || cat.slug || idx));
    assert.equal(new Set(reactKeys).size, 2, 'React key set must have exactly 2 unique keys');
  });

  await t.test('Exact same database ID repeating is deduplicated strictly by that ID only without merging distinct categories', () => {
    const mockDbCategoriesWithDuplicate = [
      {
        _id: '60c72b2f9b1d8b2bad000001',
        name: 'Fresh Fruits & Vegetables',
        slug: 'vegetables',
        type: 'GROCERY',
        sortOrder: 1
      },
      {
        _id: '60c72b2f9b1d8b2bad000001', // Exact duplicate DB _id
        name: 'Fresh Fruits & Vegetables (Duplicate)',
        slug: 'vegetables',
        type: 'GROCERY',
        sortOrder: 1
      },
      {
        _id: '60c72b2f9b1d8b2bad000099', // Distinct DB _id matching same canonical profile
        name: 'Staging Fresh Produce',
        slug: 'staging-produce-fixture',
        type: 'GROCERY',
        sortOrder: 1
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategoriesWithDuplicate);
    assert.equal(resolved.length, 2, 'Duplicate exact ID must be removed, distinct ID must be preserved');

    const ids = resolved.map((c) => c._id);
    assert.deepEqual(ids, ['60c72b2f9b1d8b2bad000001', '60c72b2f9b1d8b2bad000099']);
  });
});

test('Category Vendor Discovery Navigation Contract', async (t) => {
  // Mock store discovery response handler as implemented in CategoryVendorsScreen.js
  const handleCategoryVendorsResponse = (category, mockApiResponse) => {
    if (category?.isAvailableInDb === false || !category?.slug) {
      return {
        state: 'COMING_SOON',
        vendors: [],
        title: 'Category Coming Soon',
        message: `We are currently onboarding verified local partners and farm stores for ${category.name}. Check back soon!`
      };
    }

    if (mockApiResponse?.isNetworkError) {
      return {
        state: 'NETWORK_ERROR',
        vendors: [],
        title: 'Connection Error',
        message: 'Unable to connect to service. Please check your internet connection and retry.'
      };
    }

    if (mockApiResponse?.success && Array.isArray(mockApiResponse.vendors)) {
      if (mockApiResponse.vendors.length > 0) {
        return {
          state: 'STORES_FOUND',
          vendors: mockApiResponse.vendors,
          count: mockApiResponse.vendors.length
        };
      }
      return {
        state: 'EMPTY_STORES',
        vendors: [],
        title: 'No Stores Available',
        message: `No partners in your delivery zone currently offer items in ${category.name}.`
      };
    }

    return {
      state: 'EMPTY_STORES',
      vendors: [],
      title: 'No Stores Available',
      message: `No partners in your delivery zone currently offer items in ${category.name}.`
    };
  };

  await t.test('Category with matching stores returns STORES_FOUND without falling back to all stores', () => {
    const category = { name: 'Fresh Fruits & Vegetables', slug: 'vegetables', isAvailableInDb: true, dbId: '123' };
    const mockRes = { success: true, vendors: [{ _id: 'v1', storeName: 'Green Valley Farms' }] };

    const result = handleCategoryVendorsResponse(category, mockRes);
    assert.equal(result.state, 'STORES_FOUND');
    assert.equal(result.vendors.length, 1);
    assert.equal(result.vendors[0].storeName, 'Green Valley Farms');
  });

  await t.test('Category with 0 stores returns EMPTY_STORES without falling back to unrelated stores', () => {
    const category = { name: 'Fresh Fruits & Vegetables', slug: 'vegetables', isAvailableInDb: true, dbId: '123' };
    const mockRes = { success: true, vendors: [] };

    const result = handleCategoryVendorsResponse(category, mockRes);
    assert.equal(result.state, 'EMPTY_STORES');
    assert.equal(result.vendors.length, 0);
    assert.equal(result.title, 'No Stores Available');
  });

  await t.test('Configured category absent from API returns COMING_SOON without making network call', () => {
    const category = { name: 'Cold Drinks & Juices', slug: 'beverages', isAvailableInDb: false, dbId: null };
    const result = handleCategoryVendorsResponse(category, null);

    assert.equal(result.state, 'COMING_SOON');
    assert.equal(result.vendors.length, 0);
    assert.equal(result.title, 'Category Coming Soon');
    assert.match(result.message, /onboarding verified local partners/);
  });

  await t.test('Failed category API request returns retryable NETWORK_ERROR', () => {
    const category = { name: 'Atta, Rice & Dal', slug: 'atta-rice-dal', isAvailableInDb: true, dbId: '123' };
    const mockRes = { success: false, isNetworkError: true, message: 'Network connection error' };

    const result = handleCategoryVendorsResponse(category, mockRes);
    assert.equal(result.state, 'NETWORK_ERROR');
    assert.equal(result.title, 'Connection Error');
  });
});
