# Farmart backend hardening — 7 October 2026

The coordinated package contains changed backend and three-app source files. This document describes its backend portion. It is based on the supplied server.zip, not the current remote GitHub HEAD. Existing .env files, dependencies, signing credentials and Firebase files are excluded. No commits, deployments, live payments or live database operations were performed.

## Verified outcome

- 191 tests passed, zero failures in the verified regression selection, exit code 0.
- 15 new hardening/lifecycle tests passed. Some use actual localhost HTTP and Socket.IO connections; model operations are mocked and do not demonstrate database throughput.
- All server JavaScript syntax checks passed on Node 24.19.0.
- The wider offline glob is NOT all green: orderLifecycle.stagingGuard.offline.test.js imports a missing createdFixtureIds export; pushNotifications.offline.test.js fails its receipt token cleanup assertion. These failures also occur on the original ZIP. Two failing child suites plus their failing subtest produce 3 reported failures. These two suites were excluded from the verified selection, not modified or silently counted as passing.
- The k6 capacity harness has NOT been executed. Native mobile behavior has NOT been tested here.

## Implemented changes

1. Authoritative vendor ACTIVE/approved and rider existence checks for authenticated HTTP and socket connections. JWT signature algorithm constrained to HS256, matching existing signing defaults. Authenticated account quotas are keyed only after verification. Legacy admin socket roles normalized after a DB record check.
2. Protected HTTP reads: 300/min/account; writes: 120/min/account. Delivery pickup/delivery verification: shared 10 attempts/10 min/rider. Existing login/payment limits preserved; refresh and legacy /api/login and /api/register routes added to the login limit. Duplicate rider authentication calls removed.
3. Coarse IP quota before JSON parsing; max 100 KB JSON retained. Query operator/array/duplicate-parameter shapes and dangerous nested body keys rejected. Object/array/string/depth bounds constrain parsing downstream. Account quotas are not a substitute for perimeter abuse protection.
4. Readiness gating and 200 in-flight HTTP response admissions by default, with 503 + Retry-After when busy/disconnected/draining. This bounds active HTTP responses, not the execution lifetime of every operation after a client disconnects. MongoDB pool and checkout wait bounds provide another layer; client-side cancellation does not undo a committed database write.
5. Customer/store order lists, product lists and the main vendor list now accept page/limit, default 100 and maximum 200. Offsets bounded to 10,000 and results ordered deterministically. Array response keys and page-count count semantics remain. These responses are partial pages. The accompanying client patch follows catalog/list pages sequentially with a finite ceiling; larger catalogs/history still require server-filtered, cursor-based UI pagination (see capacity-client-hardening.md). The returned page can be clamped at the deep-page bound; do not keep requesting beyond that bound. Cursor pagination remains a follow-up for deep history.
6. Atomic product stock pipeline updates replace stale document save. addStock increments current stock, validates integer bounds and includes vendor ownership in the write filter. An explicit stockQty set still intentionally replaces the quantity; the existing empty-stock re-enable behavior (25 units) is retained.
7. GPS writes compare observed rider assignment and previous location timestamp atomically. Order tracking writes also match rider, active delivery state and newer timestamp. Lost races return GPS_STATE_CONFLICT or skip stale tracking; no stale location broadcast occurs through the updated path.
8. Socket origin allowlist, 16 KB payload ceiling, 30 events/10 s/socket, account connection cap 4, total engine connection cap 6,000 and at most one concurrent order-room lookup/socket. Guest order joins do not query MongoDB. Callback types checked to avoid malformed acknowledgements crashing handlers.
9. Startup waits for DB connection. SIGTERM/SIGINT drains accepted HTTP work before DB disconnect; fatal process errors initiate shutdown instead of pretending normal execution is safe. A process manager must restart the process. A bounded shutdown can still interrupt exceptionally long work; existing idempotency/reconciliation mechanisms are required for retries.
10. MongoDB options: max pool 30 by default (bounded 5–100), min pool 0, max connecting 2, queue wait 5 s, server selection/connect 10 s, automatic index/collection creation and buffering disabled. Added declared query indexes and corresponding pinned staging provisioning entries. Indexes are NOT built by deploying schema files alone.
11. API Cache-Control private/no-store/no-transform added to reduce stale/transformed API responses. Verify behavior through the actual mobile/proxy stack before removing the temporary customer product cache-busting workaround.

## Deployment settings and compatibility

- MONGO_MAX_POOL_SIZE: optional, default 30. This is per-process/per-server pool capacity, not the number of app users.
- HTTP_MAX_IN_FLIGHT: optional, default 200. Tune from measured latency, memory and DB throughput, not registered-user count.
- API_IP_REQUESTS_PER_MINUTE: optional, default 3000, bounded 100–100000. One load generator IP will hit this guard at high VU counts. Prefer realistic source IP distribution. Any temporary increase must be confined to an isolated capacity environment and restored; do not infer capacity from 429 responses.
- TRUST_PROXY_HOPS: optional, default 1. Correct only when there is exactly one trusted proxy hop. Configure to the actual topology; a numeric hop count must not allow shorter paths accepting spoofed forwarding headers.
- SOCKET_MAX_CONNECTIONS: optional, default 6000. An admission ceiling is NOT a measured supported capacity.
- GET /healthz: process liveness. GET /api/health: database/draining readiness with 200/503.
- Node runtime/package manifest must be checked against the real repository. Root/app package.json and package-lock.json were not supplied. The pasted root render.yaml defines only a static frontend; it does not describe the existing backend service. Existing modules in the ZIP were used only to run tests, not redistributed.

## Apply locally first

1. Back up your existing server folder outside the repository.
2. Extract the provided changed-files ZIP to a separate folder, review backend-hardening.diff, then merge its server folder into the repository. Do not delete the original server directory; this is a partial patch package.
3. Review git diff. Preserve local .env and other changes.
4. Repeat tests using the real repository dependencies. To reproduce the verified selection in PowerShell from repository root:

```powershell
$tests = Get-ChildItem .\server\tests -Filter '*.offline.test.js' |
    Where-Object { $_.Name -notin @('orderLifecycle.stagingGuard.offline.test.js', 'pushNotifications.offline.test.js') } |
    ForEach-Object { $_.FullName }
node --test @tests .\server\tests\customerLoginDiagnosis.mock.test.js
```

5. Review and run the existing pinned staging provisioning procedure with the updated provisionStagingDb.js to add indexes. It refuses conflicts and does not remove indexes. Production index migration needs a separate reviewed procedure; do not point the staging script at production.
6. Only then run staging end-to-end tests, including COD/idempotent retries, refunds, two customers competing for stock, same/different rider acceptance, GPS conflicts, reconnect and restart recovery. No full-stack or live Mongo transaction tests were run in this review.

## Capacity testing and remaining work

Target mix: 4000 customers + 500 partners + 50 riders = 4550 active users. A registered-account total is not an active concurrency or requests/second measurement.

server/tests/load/readCapacity.k6.js is a read-only k6 harness with smoke/small/medium/target stages and unique staging tokens by group. It calls product browse, partner queues and rider active-order reads. Tokens must come from disposable staging identities and remain private; no fixture accounts or token files are included. It does NOT place orders, write GPS, use payment gateways or maintain live Socket.IO subscriptions. A separate full-stack write/socket/GPS soak and race workload is still needed after app bundle/device verification and disposable test fixture provisioning. Run smoke first, never jump straight to target on a free shared service.

Example token file structure (replace placeholders locally, do not commit):

```json
[{"group":"customers","token":"customer-access-token"},{"group":"partners","token":"partner-access-token"},{"group":"riders","token":"rider-access-token"}]
```

Supply at least each selected stage's count of distinct tokens per role. Tokens are short-lived: acquire fresh tokens just before this 4.5-minute run. Start with LOAD_STAGE=smoke. Harness environment: ALLOW_STAGING_LOAD=true, LOAD_BASE_URL=https://farmart-backend-staging.onrender.com/api, LOAD_IDENTITIES_FILE=<absolute private JSON path>. Run k6 run server/tests/load/readCapacity.k6.js with these environment variables. A 429/503, invalid JSON, latency threshold breach or token expiry is a failed result, not a pass to omit from capacity reports.

Remaining scale blockers:

- Rate-limit stores and connection/event budgets are process-local. Multiple instances require shared quota storage and coordinated socket adapters/room delivery.
- Rider dispatch/recovery timers and worker ownership have not been migrated to a distributed durable queue/lease design. Do not deploy multiple dispatch workers merely by adding replicas.
- Scoped public catalog rooms and customer store/cart subscriptions are implemented. SCOPED_STOCK_EVENTS defaults off for compatibility; set it true only after updated client rollout and staging verification. Leaving the flag off retains global fan-out and is not appropriate evidence of target-scale readiness.
- Three app src trees were reviewed and patched: bounded safe-read retries, partner deadlines/non-overlapping polls, customer checkout recovery, rider session/socket guards and bounded list collection. App manifests/dependencies/assets were not supplied, so native bundle/device validation remains required. Explicit cursor/load-more UI is still needed beyond the finite list ceiling.
- Protected admin aggregate lists, category endpoints and recovery scans still need a deeper query/pagination/cursor review with actual data and explain plans.
- Root dependencies, Render config, Atlas tier/connection limits, runtime memory and real request metrics are unknown. No infrastructure sizing or 5000-user support guarantee is made.
- Perimeter DDoS/bot controls, monitoring/alerts, backup/restore drills and staged availability testing remain deployment work. HTTP/socket middleware alone cannot prevent every abusive request or guarantee uninterrupted operations.

Official references consulted:
- MongoDB connection pools: https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/
- Socket.IO origin/CORS admission: https://socket.io/docs/v4/handling-cors/
- Node fatal-error behavior: https://nodejs.org/api/process.html#event-uncaughtexception
