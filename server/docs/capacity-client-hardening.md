# Coordinated backend + app patch — 7 October 2026

Status: reviewable offline hardening patch; not a verified 5,000-user deployment. Based on uploaded server.zip and three src archives, not remote Git HEAD. No live DB/payment calls, hosting changes, credentials changes, commits or pushes were made.

## What changed in the apps

- Customer catalog/vendor/history reads follow bounded server pages instead of silently omitting everything after the first page. Sequential collection has a hard ceiling of 20 x 200 results; an invalid/repeated/clamped/oversized list fails explicitly. This is compatibility collection, not an infinitely scrollable catalog. Filtered cursor/load-more screens remain necessary for larger datasets and large order histories.
- Safe reads retry at most once with jitter and Retry-After handling. A delay over 30 seconds is surfaced instead of retrying early. Concurrent equivalent customer/rider reads share one in-flight promise. Sessions scope those promises; a session change stops another retry.
- POST/PATCH/DELETE operations are not given automatic network/busy retries. Existing one-time authentication refresh/replay is retained; this relies on the server's 401 occurring before route mutations.
- Customer/rider refresh timeout, network failure or 503 no longer clears stored credentials. An authoritative refresh 401/403 or missing refresh credential still requires sign-in. Rider refresh and socket creation check the session generation; pending socket creation is cancelled on logout.
- Checkout writes a customer-scoped pending attempt to persistent storage before dispatch and includes clientOrderId. Simultaneous identical submissions share one promise. A lost response retains the key for retry, including after an app restart. A changed payload is blocked until the previous attempt is checked; it is not silently given a second key. Known pre-write 400 validation failures release the claim so the cart/address can be corrected. Other ambiguous failures retain it. Persistent write failure blocks checkout rather than relying on a memory-only claim.
- The pending checkout record contains the request fingerprint/address inside the existing secure storage on native devices (localStorage on web). It is removed on confirmed completion. SecureStore deletion/read errors and device storage loss still require manual order reconciliation; this is not a substitute for a server recovery UI. An unresolved changed-payload attempt currently directs the user to My Orders; an explicit verified recovery/reset flow remains follow-up work.
- Partner initialization callbacks are stable; logging in no longer restarts the storage-restore effect via changing callback dependencies. Responses are checked against the active account/epoch. Store toggles use a synchronous lock and roll back optimistic state when the request fails.
- Partner polling now waits for each cycle: active queue every 20–25 seconds, inventory/stats approximately every 60–90 seconds, foreground only. Dashboard queues request status=active; completed history is not repeatedly downloaded. Existing order:new socket callbacks remain immediate. Stock socket events update the active partner's inventory; newer observed stock is retained when a slower inventory read finishes.
- Customer store-state fallback polling is 20–25 seconds, foreground/focused only. Tracking polls just the selected active order every 15–19 seconds instead of full order history every eight seconds. Terminal orders stop fallback polling. Rider fallback polling is sequential and foreground-only. GPS/background location functionality and existing map/icon/splash build configuration are preserved.
- Socket reconnects have capped manager attempts and jitter; customer/rider explicit server-kick refresh/reconnect paths are capped at three per connection instance. New rider connect calls share the pending token lookup. Async rider listeners are not installed after their effect has been cleaned up.
- Customer product response/body debug dumps removed. The working _diagnostic cache-busting parameter is preserved until actual Android/proxy validation proves it unnecessary. Failed store-product loads now show a retry message instead of falsely saying the catalog is empty.

## Scoped stock rollout

Backend joins public catalog:<vendorId> rooms only for valid IDs, within room/event budgets, without database queries. Customers subscribe while the store/cart screen is focused and rejoin after reconnect; reference counting avoids duplicate room churn. Updated partners receive own-vendor stock via their authenticated vendor room.

SCOPED_STOCK_EVENTS=true sends product:stock only to the catalog/vendor room union, not all 4,000 customer sockets. Default remains false so older installed clients continue receiving global updates. Enable only after deploying these coordinated source changes, building updated apps and checking store/cart/partner stock updates, room leaving and reconnect behavior in staging. Old installed releases may otherwise display stale stock even though checkout's server validation still protects inventory.

## Measured verification

- Selected backend offline suites: 191 passed, 0 failed, exit 0. Fifteen new backend hardening/lifecycle tests include real localhost HTTP/socket tests with mocked database operations.
- Selected app offline suites: 103 passed, 0 failed, exit 0. Nineteen new tests execute the real request policy, checkout recovery, stock bridge, customer/rider API refresh code and rider socket creation under controlled mocks.
- Backend/non-JSX JS modules checked: 117, zero syntax failures. Six modified React provider modules' non-JSX portions were additionally syntax-checked after omitting JSX returns; this is NOT a JSX/bundle check.
- Existing backend orderLifecycle.stagingGuard.offline.test.js and pushNotifications.offline.test.js fail on the original backend archive as well. They remain excluded from the verified selection. See backend-hardening.md for exact causes.
- HomeScreen.runtime.test.mjs could not run because @babel/parser/@babel/traverse are not available in the uploaded src-only workspace. This is an environment/dependency gap, not a passing test. The existing LiveOrderMap.test.js Jest suite was not run by the Node .mjs selection.
- No Expo export, Expo Doctor, AAB build, phone test, real MongoDB transaction soak or k6 load run was performed here. App package.json/lockfiles, App.js/config and assets were not supplied, so an installed native build cannot be reproduced from these archives.

## Apply on the laptop

1. Back up the current repository outside its directory. Extract the patch ZIP elsewhere and review coordinated-hardening.diff + manifest.json. It is a partial changed-file package: merge matching paths; do not replace/delete the whole server or app directories. Preserve other local edits.
2. From C:\viz\all app\farmart\farm-mart-new, inspect git diff. No .env, signing/Firebase files, dependencies, assets or build outputs are in this patch.
3. Run the backend selection described in backend-hardening.md and the new client suite:

```powershell
node --test .\userApp\src\services\__tests__\capacityPolicy.test.mjs
```

Then run the full existing app suites with their real dependencies, including HomeScreen.runtime.test.mjs and the project's configured Jest runner. Do not treat missing test dependencies as a pass.

4. In each app directory, with the staging API environment set, run Expo Doctor and Android export using the existing real package files. Verify checkout double-tap/lost-response recovery, same-stock competition, stock subscriptions, reconnect, account switch/logout, location updates and terminal-order tracking on actual phones before producing new AABs.
5. Review/provision the declared DB indexes using the pinned staging procedure, then measure query plans and build updated clients. Index declarations are not automatically applied because autoIndex/autoCreate are off.
6. Roll out first to staging. Enable scoped stock only after updated clients work. Do not add backend replicas yet: shared quotas, Socket.IO adapter and dispatch worker ownership are not implemented by this patch.

## Hosting and scale decisions still required

The supplied render.yaml has env: static, buildCommand: npm install && npm run build and staticPublishPath: dist. It hosts a frontend. Do not replace it with an invented backend configuration or assume it supplies backend compute. Supply actual backend start/build commands, Node runtime, instance CPU/RAM and MongoDB tier/replica-set topology (no connection URI/password) before choosing deployment sizing.

Target concurrency is 4,000 customers + 500 partners + 10–50 riders. Registered users are not throughput. A planning estimate for 4,000 customers on one focused polling screen is about 160–267 read requests/s before socket events, navigation bursts, retries and checkout. Five hundred partner queues at 20–25 seconds add about 20–25 reads/s, with catalog/stats pages adding more. Fifty riders at five-second GPS cadence add roughly ten writes/s plus foreground recovery reads. These are arithmetic estimates from polling intervals, NOT measurements or host capacity claims; multiple pages and simultaneous foreground/background GPS writers can increase work.

Next architecture gates:

- One measured backend instance first, with bounded pools/readiness and external restart supervision. Monitor request queueing, p95/p99 latency, 429/503, process RSS/event-loop delay, Mongo queue/connection usage and socket traffic. No instance/free-tier recommendation can be justified from source alone.
- Before multiple instances: shared atomic quota storage (for example Redis), coordinated Socket.IO adapter delivery, and durable dispatch jobs with explicit worker ownership/leases. Currently these controls/timers are process-local.
- Build indexes through a controlled migration; replace deep skip/list collection with filtered cursor queries and load-more UI. Review remaining admin/category/recovery scans and aggregation plans against actual data.
- Disposable staging load identities, realistic source-IP distribution, read/write/socket/GPS workload and restart/network-failure soak. The included k6 read harness is only a read workload and has NOT been executed. Do not jump from unit tests directly to target VUs on the current staging host.
- Perimeter abuse protection, monitoring, backups/restore tests and transaction/idempotency reconciliation remain operational work. Admission rejection is preferable to uncontrolled overload, but it is still an error that clients must handle; no system can honestly promise zero interruptions/errors under arbitrary abuse.
