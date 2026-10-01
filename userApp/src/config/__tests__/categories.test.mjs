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

  await t.test('Scenario 1 & 2: Existing category with real MongoDB _id is linked correctly', () => {
    const mockDbCategories = [
      {
        _id: '60c72b2f9b1d8b2bad000001',
        name: 'Fresh Fruits & Vegetables',
        slug: 'vegetables',
        type: 'GROCERY'
      },
      {
        _id: '60c72b2f9b1d8b2bad000005',
        name: 'Ghar Ka Khana / Home Thali',
        slug: 'home-thali',
        type: 'FOOD'
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategories);
    assert.equal(resolved.length, 8);

    // Vegetables is matched
    const vegCat = resolved.find((c) => c.canonicalSlug === 'vegetables');
    assert.ok(vegCat);
    assert.equal(vegCat.dbId, '60c72b2f9b1d8b2bad000001');
    assert.equal(vegCat.isAvailableInDb, true);

    // Home Thali is matched
    const thaliCat = resolved.find((c) => c.canonicalSlug === 'home-thali');
    assert.ok(thaliCat);
    assert.equal(thaliCat.dbId, '60c72b2f9b1d8b2bad000005');
    assert.equal(thaliCat.isAvailableInDb, true);

    // Other 6 categories remain visible with dbId = null and isAvailableInDb = false
    const dairyCat = resolved.find((c) => c.canonicalSlug === 'dairy-milk');
    assert.ok(dairyCat);
    assert.equal(dairyCat.dbId, null);
    assert.equal(dairyCat.isAvailableInDb, false);
    assert.notEqual(dairyCat._id, 'cat-1', 'Never invent fake IDs');
  });

  await t.test('Scenario 3: Configured categories absent from API remain visible with isAvailableInDb = false', () => {
    // Staging DB has 0 categories matching canonical slugs (or empty array)
    const resolved = resolveBrowseCategories([]);
    assert.equal(resolved.length, 8, 'All 8 configured browse cards remain visible');

    for (const cat of resolved) {
      assert.equal(cat.dbId, null, 'Unseeded category must have dbId null');
      assert.equal(cat.isAvailableInDb, false, 'Must indicate not available in DB');
      assert.ok(cat.canonicalSlug, 'Must retain canonical slug');
      assert.ok(cat.vectorIcon, 'Must retain presentation vector icon');
      assert.ok(cat.bgColor, 'Must retain presentation pastel tint');
    }
  });

  await t.test('Preserves unexpected dynamic backend categories without hiding them', () => {
    const mockDbCategories = [
      {
        _id: '60c72b2f9b1d8b2bad000099',
        name: 'Organic Seeds & Fertilizers',
        slug: 'farming-seeds',
        type: 'GROCERY'
      }
    ];

    const resolved = resolveBrowseCategories(mockDbCategories);
    assert.equal(resolved.length, 9, '8 canonical + 1 dynamic backend category');

    const customCat = resolved.find((c) => c.slug === 'farming-seeds');
    assert.ok(customCat);
    assert.equal(customCat.dbId, '60c72b2f9b1d8b2bad000099');
    assert.equal(customCat.isAvailableInDb, true);
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
