// Read-only capacity harness. No orders, payments, GPS writes or production traffic.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

const base = __ENV.LOAD_BASE_URL || '';
if (__ENV.ALLOW_STAGING_LOAD !== 'true' || base !== 'https://farmart-backend-staging.onrender.com/api') {
  throw new Error('Explicit ALLOW_STAGING_LOAD=true and pinned staging URL required');
}
const identities = new SharedArray('staging test identities', () => JSON.parse(open(__ENV.LOAD_IDENTITIES_FILE)));
const stages = {
  smoke: { customers: 10, partners: 2, riders: 1 },
  small: { customers: 100, partners: 20, riders: 5 },
  medium: { customers: 1000, partners: 100, riders: 20 },
  target: { customers: 4000, partners: 500, riders: 50 }
};
const selected = stages[__ENV.LOAD_STAGE || 'smoke'];
if (!selected) throw new Error('Unknown LOAD_STAGE');
for (const [group, count] of Object.entries(selected)) {
  const members = identities.filter(item => item.group === group);
  if (members.length < count || members.some(item => typeof item.token !== 'string' || !item.token)) throw new Error(`Insufficient unique ${group} staging identities`);
  if (new Set(members.map(item => item.token)).size !== members.length) throw new Error(`Duplicate ${group} tokens distort quotas`);
}
const total = selected.customers + selected.partners + selected.riders;
export const options = {
  scenarios: { traffic: { executor: 'ramping-vus', exec: 'traffic', startVUs: 0,
    stages: [{ duration: '1m', target: total }, { duration: '3m', target: total }, { duration: '30s', target: 0 }],
    gracefulRampDown: '30s' } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1500', 'p(99)<3000'], checks: ['rate>0.99'] }
};
function read(group, path) {
  const members = identities.filter(item => item.group === group);
  // One scenario gives a contiguous VU range; each active VU uses a distinct role identity.
  const offset = group === 'customers' ? 0 : group === 'partners' ? selected.customers : selected.customers + selected.partners;
  const identity = members[(exec.vu.idInTest - 1 - offset + members.length) % members.length];
  const response = http.get(`${base}${path}`, {
    headers: { Authorization: `Bearer ${identity.token}`, 'Accept-Encoding': 'identity' },
    timeout: '15s', tags: { group, name: path.split('?')[0] }
  });
  check(response, { 'HTTP 200 (429/503 count as failures)': r => r.status === 200,
    'valid JSON success': r => { try { return r.json('success') === true; } catch { return false; } } });
  sleep(group === 'customers' ? 8 : 6);
}
export function traffic() {
  const id = exec.vu.idInTest;
  if (id <= selected.customers) read('customers', '/products?limit=20&page=1');
  else if (id <= selected.customers + selected.partners) read('partners', '/vendors/me/orders?status=active&limit=50');
  else read('riders', '/rider/active-order');
}
