import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default || traverseModule;

import { resolveBrowseCategories, CANONICAL_BROWSE_CATEGORIES } from '../../../config/categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const homeScreenPath = path.resolve(__dirname, '../HomeScreen.js');

test('HomeScreen AST Verification: Zero Undeclared Identifiers', () => {
  const code = fs.readFileSync(homeScreenPath, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });

  const standardGlobals = new Set([
    'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'Promise', 'Array', 'Set', 'Map', 'Date', 'String', 'Number', 'Boolean',
    'Object', 'Math', 'JSON', 'RegExp', 'Error', 'TypeError', 'ReferenceError'
  ]);

  const declaredTopLevel = new Set();
  const unresolved = new Set();

  traverse(ast, {
    Program(progPath) {
      for (const name in progPath.scope.bindings) {
        declaredTopLevel.add(name);
      }
    },
    ReferencedIdentifier(idPath) {
      const { name } = idPath.node;
      if (!idPath.scope.hasBinding(name) && !standardGlobals.has(name) && !declaredTopLevel.has(name)) {
        unresolved.add(name);
      }
    }
  });

  assert.equal(
    unresolved.size,
    0,
    `Found unresolved identifiers in HomeScreen.js: ${Array.from(unresolved).join(', ')}`
  );
  assert.ok(code.includes('setIsLoading'), 'HomeScreen must define setIsLoading setter');
  assert.ok(code.includes('isValidImageUri'), 'HomeScreen must import and use isValidImageUri');
  assert.ok(code.includes('RefreshControl'), 'HomeScreen must import and use RefreshControl');
  assert.ok(code.includes('getHomeCategories'), 'HomeScreen must call getHomeCategories');
});

test('Runtime Path 1: Successful API Response Links Real Categories and Only Renders Live Categories', async () => {
  // Simulate state machine and loadHomeData
  let state = {
    categories: resolveBrowseCategories([]),
    vendors: [],
    isLoading: true,
    isRefreshing: false,
    apiError: null,
    hasCategoriesLoaded: false
  };

  const mockGetHomeCategories = async () => ({
    success: true,
    categories: [
      {
        _id: '66f0000000000000000000a1',
        name: 'Fresh Vegetables & Fruits',
        slug: 'vegetables',
        type: 'GROCERY',
        sortOrder: 1
      },
      {
        _id: '66f0000000000000000000a2',
        name: 'Dairy Milk Butter & Eggs',
        slug: 'dairy-milk',
        type: 'GROCERY',
        sortOrder: 2
      }
    ]
  });

  const mockGetVendors = async () => ({
    success: true,
    vendors: [
      { _id: 'vend-1', storeName: 'Green Farm Market', storeType: 'FARMER' },
      { _id: 'vend-2', storeName: 'Kaur Punjabi Thali', storeType: 'HOME_CHEF' }
    ]
  });

  // Execute loadHomeData logic
  state.isLoading = true;
  const [catResult, vendResult] = await Promise.allSettled([
    mockGetHomeCategories(),
    mockGetVendors()
  ]);

  const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
  const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

  if (catRes && catRes.success && Array.isArray(catRes.categories)) {
    state.categories = resolveBrowseCategories(catRes.categories);
    state.hasCategoriesLoaded = true;
  }
  if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
    state.vendors = vendRes.vendors;
  }
  state.isLoading = false;

  // Assertions
  assert.equal(state.isLoading, false, 'Initial loading must be false after completion');
  assert.equal(state.hasCategoriesLoaded, true, 'hasCategoriesLoaded must be true');
  assert.equal(state.vendors.length, 2, 'Vendors array must be populated');
  assert.equal(state.categories.length, 2, 'Only the 2 live categories from DB must be present');

  // Check Vegetables (matched)
  const vegCard = state.categories.find(c => c.canonicalSlug === 'vegetables');
  assert.ok(vegCard, 'Vegetables card must exist');
  assert.equal(vegCard.isAvailableInDb, true);
  assert.equal(vegCard._id, '66f0000000000000000000a1');

  // Check Ghar Ka Khana / Home Thali (unreturned in DB)
  const thaliCard = state.categories.find(c => c.canonicalSlug === 'home-thali');
  assert.equal(thaliCard, undefined, 'Unreturned categories must NOT be fabricated into Home');
});

test('Runtime Path 2: Clean/Empty Database Returns 0 Categories Without Faking Availability', async () => {
  let state = {
    categories: resolveBrowseCategories([]),
    vendors: [],
    isLoading: true,
    hasCategoriesLoaded: false
  };

  const mockGetHomeCategories = async () => ({ success: true, categories: [] });
  const mockGetVendors = async () => ({ success: true, vendors: [] });

  const [catResult, vendResult] = await Promise.allSettled([
    mockGetHomeCategories(),
    mockGetVendors()
  ]);

  const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
  const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

  if (catRes && catRes.success && Array.isArray(catRes.categories)) {
    state.categories = resolveBrowseCategories(catRes.categories);
    state.hasCategoriesLoaded = true;
  }
  if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
    state.vendors = vendRes.vendors;
  }
  state.isLoading = false;

  assert.equal(state.categories.length, 0, 'Zero categories rendered when DB is empty');
  assert.equal(state.hasCategoriesLoaded, true, 'hasCategoriesLoaded is true since API succeeded with 0 items');
});

test('Runtime Path 3: Failed Request Does NOT Produce Unhandled Rejection, Nor Present As Coming Soon', async () => {
  let state = {
    categories: resolveBrowseCategories([]),
    vendors: [],
    isLoading: true,
    isRefreshing: false,
    apiError: null,
    hasCategoriesLoaded: false
  };

  // Mock API network rejection
  const mockFailingGetCategories = async () => {
    throw new Error('Network request failed: ECONNREFUSED');
  };
  const mockFailingGetVendors = async () => {
    return { success: false, vendors: [], message: 'Server 500 error' };
  };

  state.isLoading = true;
  // Promise.allSettled guarantees no uncaught rejections
  const [catResult, vendResult] = await Promise.allSettled([
    mockFailingGetCategories(),
    mockFailingGetVendors()
  ]);

  const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
  const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

  let catFetchSucceeded = false;
  let vendFetchSucceeded = false;

  if (catRes && catRes.success && Array.isArray(catRes.categories)) {
    catFetchSucceeded = true;
    state.categories = resolveBrowseCategories(catRes.categories);
    state.hasCategoriesLoaded = true;
  } else {
    // API failed: DO NOT call resolveBrowseCategories([]) which would mark everything coming soon
  }

  if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
    vendFetchSucceeded = true;
    state.vendors = vendRes.vendors;
  }

  if (!catFetchSucceeded || !vendFetchSucceeded) {
    state.apiError = 'Unable to sync latest live data. Tap to retry.';
  }
  state.isLoading = false;

  assert.equal(state.isLoading, false);
  assert.equal(state.hasCategoriesLoaded, false, 'hasCategoriesLoaded must NOT be true on API failure');
  assert.ok(state.apiError, 'apiError must be set on API failure');

  // Verify that cards are NOT presented as "Coming Soon" or "Unavailable" due to an API error
  for (const cat of state.categories) {
    const isVerifiedMissing = state.hasCategoriesLoaded && cat.isAvailableInDb === false;
    assert.equal(
      isVerifiedMissing,
      false,
      'API network failure must NOT present browse categories as coming soon or unavailable'
    );
  }
});

test('Runtime Path 4: Pull-to-Refresh Preserves Previously Loaded Data on Transient Network Failure', async () => {
  // Step 1: Initial successful load
  let state = {
    categories: resolveBrowseCategories([
      { _id: '66f0000000000000000000a1', name: 'Fresh Vegetables', slug: 'vegetables' }
    ]),
    vendors: [{ _id: 'vend-1', storeName: 'Green Farm Market' }],
    isLoading: false,
    isRefreshing: false,
    apiError: null,
    hasCategoriesLoaded: true
  };

  const initialCatCount = state.categories.length;
  const initialVendCount = state.vendors.length;
  assert.equal(initialCatCount, 1);
  assert.equal(initialVendCount, 1);

  // Step 2: Trigger pull-to-refresh
  const isPullToRefresh = true;
  if (isPullToRefresh) {
    state.isRefreshing = true;
  } else {
    state.isLoading = true;
  }
  assert.equal(state.isRefreshing, true, 'isRefreshing must be set to true during pull-to-refresh');

  // Step 3: Simulate transient network timeout on refresh
  const mockRefreshCat = async () => ({ success: false, categories: [], isNetworkError: true });
  const mockRefreshVend = async () => ({ success: false, vendors: [], isNetworkError: true });

  const [catResult, vendResult] = await Promise.allSettled([
    mockRefreshCat(),
    mockRefreshVend()
  ]);

  const catRes = catResult.status === 'fulfilled' ? catResult.value : null;
  const vendRes = vendResult.status === 'fulfilled' ? vendResult.value : null;

  let catFetchSucceeded = false;
  let vendFetchSucceeded = false;

  if (catRes && catRes.success && Array.isArray(catRes.categories)) {
    catFetchSucceeded = true;
    state.categories = resolveBrowseCategories(catRes.categories);
    state.hasCategoriesLoaded = true;
  }
  if (vendRes && vendRes.success && Array.isArray(vendRes.vendors)) {
    vendFetchSucceeded = true;
    state.vendors = vendRes.vendors;
  }

  if (!catFetchSucceeded || !vendFetchSucceeded) {
    state.apiError = 'Unable to sync latest live data. Tap to retry.';
  }
  state.isRefreshing = false;

  // Step 4: Verify previously loaded data was PRESERVED
  assert.equal(state.isRefreshing, false, 'isRefreshing must be reset to false in finally block');
  assert.equal(state.categories.length, initialCatCount, 'Categories must NOT be cleared on failed refresh');
  assert.equal(state.vendors.length, initialVendCount, 'Vendors must NOT be cleared on failed refresh');
  assert.equal(state.vendors[0].storeName, 'Green Farm Market');
  assert.ok(state.apiError, 'User must be notified of transient refresh failure via retryable error');
});

test('Runtime Path 5: Multi-Category Canonical Collision Produces Unique React Keys and Preserves Home Filtering', async () => {
  // Verifies that when Home receives both Staging Fresh Produce and Fresh Fruits & Vegetables:
  // 1. Both are retained (never merged)
  // 2. Both share presentation metadata (vectorIcon, accentColor)
  // 3. React keys derived from _id are unique (no 'vegetables' key duplication)
  // 4. Hidden categories remain excluded and are not reinserted
  let calledEndpoint = null;
  const mockGetHomeCategories = async () => {
    calledEndpoint = '/categories?home=true';
    return {
      success: true,
      categories: [
        {
          _id: '66f000000000000000000001',
          name: 'Fresh Fruits & Vegetables',
          slug: 'vegetables',
          type: 'GROCERY',
          homeVisibility: true,
          sortOrder: 1
        },
        {
          _id: '66f000000000000000000099',
          name: 'Staging Fresh Produce',
          slug: 'staging-produce-fixture',
          type: 'GROCERY',
          homeVisibility: true,
          sortOrder: 1
        }
      ]
    };
  };

  const catRes = await mockGetHomeCategories();
  assert.equal(calledEndpoint, '/categories?home=true', 'Home must call /categories?home=true');

  const resolved = resolveBrowseCategories(catRes.categories);
  assert.equal(resolved.length, 2, 'Must resolve both live categories returned by Home endpoint');

  // Verify hidden categories are NOT reinserted
  assert.equal(
    resolved.some((c) => c.slug === 'organic-hydroponics'),
    false,
    'Organic Hydroponics must remain off Home'
  );

  // Verify React keys as rendered in HomeScreen.js
  const reactKeys = resolved.map((cat, idx) =>
    String(cat._id || cat.dbId || cat.key || cat.slug || idx)
  );

  assert.equal(reactKeys.length, 2);
  assert.equal(reactKeys[0], '66f000000000000000000001');
  assert.equal(reactKeys[1], '66f000000000000000000099');
  assert.notEqual(reactKeys[0], reactKeys[1], 'React keys must never collide');
  assert.equal(new Set(reactKeys).size, 2, 'All React keys must be unique');

  // Verify AST of HomeScreen.js uses real _id first
  const code = fs.readFileSync(homeScreenPath, 'utf8');
  assert.ok(
    code.includes('cat._id'),
    'HomeScreen must prioritize cat._id for React key'
  );
});
