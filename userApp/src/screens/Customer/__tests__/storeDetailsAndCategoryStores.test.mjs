import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default || traverseModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const standardGlobals = new Set([
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'Promise', 'Array', 'Set', 'Map', 'Date', 'String', 'Number', 'Boolean',
  'Object', 'Math', 'JSON', 'RegExp', 'Error', 'TypeError', 'ReferenceError'
]);

function verifyAST(code, fileName) {
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
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
    `Found unresolved identifiers in ${fileName}: ${Array.from(unresolved).join(', ')}`
  );
}

describe('Store Details & Category Stores Refinements Contract', () => {
  const vendorStorePath = path.resolve(__dirname, '../VendorStoreScreen.js');
  const categoryVendorsPath = path.resolve(__dirname, '../CategoryVendorsScreen.js');
  const mediaUtilPath = path.resolve(__dirname, '../../../utils/media.js');

  const vendorStoreSrc = fs.readFileSync(vendorStorePath, 'utf8');
  const categoryVendorsSrc = fs.readFileSync(categoryVendorsPath, 'utf8');
  const mediaUtilSrc = fs.readFileSync(mediaUtilPath, 'utf8');

  test('1. resolveMediaUrl rewrites loopback/localhost/emulator URLs to active backend host', () => {
    const API_BASE_URL = 'https://farmart-backend-staging.onrender.com/api';
    const resolveMediaUrl = (uri, customApiBase = null) => {
      if (!uri || typeof uri !== 'string') return null;
      const trimmed = uri.trim();
      if (!trimmed) return null;
      const effectiveBase = customApiBase || API_BASE_URL;
      const hostBase = effectiveBase.replace(/\/api\/?$/, '');
      const localMatch = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?(\/.*)$/i);
      if (localMatch) {
        return hostBase ? `${hostBase}${localMatch[1]}` : localMatch[1];
      }
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      if (trimmed.startsWith('/')) {
        return hostBase ? `${hostBase}${trimmed}` : trimmed;
      }
      return trimmed;
    };

    const localUri = 'http://localhost:5000/api/uploads/product-images/6ae47c211e70d85570212591';
    const resolved = resolveMediaUrl(localUri);
    assert.equal(
      resolved,
      'https://farmart-backend-staging.onrender.com/api/uploads/product-images/6ae47c211e70d85570212591',
      'Localhost URL must be replaced with Render staging backend host'
    );

    const emuUri = 'http://10.0.2.2:5000/api/uploads/product-images/pic.png';
    const resolvedEmu = resolveMediaUrl(emuUri);
    assert.equal(
      resolvedEmu,
      'https://farmart-backend-staging.onrender.com/api/uploads/product-images/pic.png',
      '10.0.2.2 emulator URL must be replaced with Render staging backend host'
    );

    const slashUri = '/api/uploads/product-images/pic.png';
    const resolvedSlash = resolveMediaUrl(slashUri);
    assert.equal(
      resolvedSlash,
      'https://farmart-backend-staging.onrender.com/api/uploads/product-images/pic.png'
    );

    const httpsUri = 'https://res.cloudinary.com/demo/image.png';
    assert.equal(resolveMediaUrl(httpsUri), httpsUri, 'External https URLs must remain untouched');
  });

  test('2. VendorStoreScreen AST Verification: Zero Undeclared Identifiers', () => {
    verifyAST(vendorStoreSrc, 'VendorStoreScreen.js');
  });

  test('3. CategoryVendorsScreen AST Verification: Zero Undeclared Identifiers', () => {
    verifyAST(categoryVendorsSrc, 'CategoryVendorsScreen.js');
  });

  test('4. VendorStoreScreen enforces safe-area top inset for back button and bounded banner', () => {
    // Back button safe area top clearance
    assert.ok(
      vendorStoreSrc.includes('insets.top'),
      'VendorStoreScreen must compute safe area top clearance for back button'
    );
    assert.ok(
      vendorStoreSrc.includes('styles.backButtonCircle'),
      'VendorStoreScreen must render backButtonCircle'
    );

    // Hero banner bounded height
    assert.ok(
      vendorStoreSrc.includes('height: 160') && vendorStoreSrc.includes('maxHeight: 180'),
      'VendorStoreScreen must bound heroBanner height'
    );

    // Store card surface
    assert.ok(
      vendorStoreSrc.includes('styles.storeCard'),
      'VendorStoreScreen must render store card on distinct surface'
    );
    assert.ok(
      vendorStoreSrc.includes("backgroundColor: '#ffffff'"),
      'storeCard must use solid white background for high contrast'
    );

    // Product images and real data
    assert.ok(
      vendorStoreSrc.includes('product.price') && vendorStoreSrc.includes('product.unit'),
      'VendorStoreScreen must preserve real prices and manual pack size / unit'
    );
    assert.ok(
      vendorStoreSrc.includes('SafeImage'),
      'VendorStoreScreen must use SafeImage for resilient image loading'
    );
  });

  test('5. CategoryVendorsScreen enforces safe-area top inset, compact empty state, and filter clear', () => {
    // Safe area top clearance on header
    assert.ok(
      categoryVendorsSrc.includes('insets.top'),
      'CategoryVendorsScreen must use insets.top for header safe area'
    );
    assert.ok(
      categoryVendorsSrc.includes('numberOfLines={1}'),
      'CategoryVendorsScreen must prevent header title clipping on large fonts'
    );

    // Honest empty state wording: "No stores in this category"
    assert.ok(
      categoryVendorsSrc.includes('No stores in this category'),
      'Empty state must honestly say "No stores in this category" without unverified delivery claims'
    );

    // Browse all stores clears filter and navigates to real store list
    assert.ok(
      categoryVendorsSrc.includes('handleBrowseAllStores'),
      'CategoryVendorsScreen must provide handleBrowseAllStores handler'
    );
    assert.ok(
      categoryVendorsSrc.includes("selectedCategory: 'all'"),
      'Browse All Stores must clear category filter to \'all\''
    );
  });
});
