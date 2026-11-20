import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CANONICAL_CATEGORIES_BOOTSTRAP } from '../services/categoryBootstrapService.js';
import { validateImageMagicBytes } from '../services/imageStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '../assets/categories');

test('Category Bootstrap Offline Suite', async (t) => {
  await t.test('1. Canonical categories list has 8 items with unique IDs and slugs', () => {
    assert.equal(CANONICAL_CATEGORIES_BOOTSTRAP.length, 8);
    const ids = new Set(CANONICAL_CATEGORIES_BOOTSTRAP.map(c => c.id));
    assert.equal(ids.size, 8);
    const slugs = new Set(CANONICAL_CATEGORIES_BOOTSTRAP.map(c => c.slug));
    assert.equal(slugs.size, 8);
  });

  await t.test('2. All 8 category illustration asset files exist on disk and have valid JPEG magic bytes', () => {
    for (const cat of CANONICAL_CATEGORIES_BOOTSTRAP) {
      const p = path.join(ASSETS_DIR, cat.file);
      assert.ok(fs.existsSync(p), `File must exist on disk: ${cat.file}`);
      const buf = fs.readFileSync(p);
      assert.ok(buf.length > 50000, `Image buffer must be substantial (>50KB): ${cat.file} is ${buf.length} bytes`);
      const check = validateImageMagicBytes(buf, 'image/jpeg');
      assert.equal(check.valid, true, `Magic bytes must be valid JPEG: ${cat.file}`);
      assert.equal(check.detectedMime, 'image/jpeg');
    }
  });
});
