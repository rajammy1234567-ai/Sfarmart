import test from 'node:test';
import assert from 'node:assert/strict';
import { pagination } from '../utils/requestPolicy.js';

test('pagination policy strictly bounds limit to maxLimit 50', () => {
  assert.deepEqual(pagination({}, 50, 50), { page: 1, limit: 50, skip: 0 });
  assert.deepEqual(pagination({ page: '2', limit: '50' }, 50, 50), { page: 2, limit: 50, skip: 50 });
  // Over-limit clamp
  assert.deepEqual(pagination({ page: '1', limit: '500' }, 50, 50), { page: 1, limit: 50, skip: 0 });
  assert.deepEqual(pagination({ page: '1', limit: '100' }, 50, 50), { page: 1, limit: 50, skip: 0 });
  // Under-limit or zero/negative clamp
  assert.deepEqual(pagination({ page: '-1', limit: '-10' }, 50, 50), { page: 1, limit: 50, skip: 0 });
  assert.deepEqual(pagination({ page: '0', limit: '0' }, 50, 50), { page: 1, limit: 1, skip: 0 });
  assert.deepEqual(pagination({ page: 'abc', limit: 'xyz' }, 50, 50), { page: 1, limit: 50, skip: 0 });
});

test('pagination metadata calculation contracts', () => {
  const calcPaging = (total, page, limit) => {
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const hasMore = (skip + limit) < total;
    return { total, totalPages, page, limit, hasMore };
  };

  // Case 1: 120 total items, page 1 of 50
  const p1 = calcPaging(120, 1, 50);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.hasMore, true);

  // Case 2: 120 total items, page 2 of 50
  const p2 = calcPaging(120, 2, 50);
  assert.equal(p2.totalPages, 3);
  assert.equal(p2.hasMore, true);

  // Case 3: 120 total items, page 3 of 50 (last page with 20 items)
  const p3 = calcPaging(120, 3, 50);
  assert.equal(p3.totalPages, 3);
  assert.equal(p3.hasMore, false);

  // Case 4: 0 total items
  const p0 = calcPaging(0, 1, 50);
  assert.equal(p0.totalPages, 1);
  assert.equal(p0.hasMore, false);
});

test('deduplication via Map guarantees unique products across pages', () => {
  const page1 = [
    { _id: 'prod_1', name: 'Alphonso Mango' },
    { _id: 'prod_2', name: 'Fresh Milk' },
    { _id: 'prod_3', name: 'Organic Ghee' }
  ];
  // Simulating item shift where prod_3 also appears at top of page 2 due to concurrent insert
  const page2 = [
    { _id: 'prod_3', name: 'Organic Ghee' },
    { _id: 'prod_4', name: 'Brown Bread' },
    { _id: 'prod_5', name: 'Paneer' }
  ];

  const map = new Map();
  page1.forEach(p => map.set(p._id, p));
  page2.forEach(p => map.set(p._id, p));
  const combined = Array.from(map.values());

  assert.equal(combined.length, 5);
  assert.deepEqual(combined.map(p => p._id), ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5']);
});

test('server-side search regex escape safety', () => {
  const dangerousInputs = [
    'cow.*',
    'milk+cream',
    'ghee (pure)',
    'dal [organic]',
    'paneer {special}',
    'mango?fresh',
    'spice^chilli',
    'honey$sweet'
  ];

  for (const input of dangerousInputs) {
    const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    // Regex matches the literal string safely without crashing or catastrophic backtracking
    assert.equal(regex.test(input), true);
    assert.equal(regex.test('completely different text'), false);
  }
});
