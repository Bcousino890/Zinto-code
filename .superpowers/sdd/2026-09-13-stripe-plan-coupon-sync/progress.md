# SDD ledger — plan: docs/superpowers/plans/2026-09-13-stripe-plan-coupon-sync.md

Workspace: /home/deploy/zinto/.worktrees/stripe-catalog-sync
Branch: feature/stripe-catalog-sync
Start commit: 800d3f9
Spec: docs/superpowers/specs/2026-09-13-stripe-plan-coupon-sync-design.md

## Preflight dependency and consistency scan

| Tasks | Producer / consumer or internal consistency | Finding |
|---|---|---|
| 1 | Domain functions and their stated tests | Consistent; tests cover money, intervals, discount choice, and fingerprint behavior. |
| 2 | Schema/storage interfaces and migration test | Consistent; migration number must be rechecked against repository numbering before creation. |
| 3 | Service interface and fake Stripe tests | Consistent; consumes Tasks 1–2. |
| 4 | Route endpoints, CRUD hooks, and authorization tests | Consistent; consumes Tasks 2–3. |
| 5 | Worker interface, feature flag, and concurrency tests | Consistent; consumes Tasks 2–3. |
| 6 | Checkout service, route integration, and integrity tests | Consistent; consumes Tasks 1–3. |
| 7 | Webhook verification and atomic storage tests | Consistent; consumes synchronized references from Tasks 2 and 6. |
| 8 | UI hook and admin pages | Consistent; consumes Task 4 endpoints. |
| 9 | Full verification, security review, and runbook | Consistent; consumes all prior tasks. |
| 1 → 3 | Domain mappings/fingerprints used by catalog service | Names and semantics agree. |
| 1 → 6 | Money and discount decisions used by checkout | Names and non-stacking rule agree. |
| 2 → 3 | Mapping columns and storage methods used by service | Interfaces agree. |
| 2 → 5 | Job table and claim/complete/fail methods used by worker | Interfaces agree. |
| 2 → 7 | Storage transaction and webhook event uniqueness | Existing event table can be reused; task must avoid a second idempotency mechanism. |
| 3 → 4 | Sync/archive methods used by CRUD/admin endpoints | Interfaces agree. |
| 3 → 5 | Sync methods invoked by worker | Interfaces agree. |
| 3 → 6 | Stored Stripe object IDs consumed by checkout | Interfaces agree. |
| 4 → 8 | Admin sync/status/retry API consumed by UI hook | Paths and operations agree. |
| 6 → 7 | Checkout metadata and expected values consumed by webhook verifier | Task 6 must persist expected discount and total in the payment transaction, not trust metadata alone. |
| 6 ↔ 7 | `server/storage.ts` shared write area | Sequential execution avoids conflicts; Task 7 builds on Task 2 storage additions. |
| 7 ↔ existing webhook routes | Two webhook implementations currently exist | Ruling: preserve one public endpoint and route all Stripe payment/subscription outcomes through one verifier; duplicate handlers would risk duplicate activation. Cost if wrong: existing event compatibility may need adapters. |
| 2 | Migration filename | Ruling: determine the next valid repository migration number at implementation time rather than blindly using 234. Cost if wrong: deployment ordering could conflict with concurrent migrations. |

Baseline: 8/8 selected existing tests passed. Full TypeScript check passed with `NODE_OPTIONS=--max-old-space-size=4096`.

Task 1: dispatched implementer Epicurus (`01a098cd-3612-78b3-8ee1-c27043c93a78`) from base `747e247`.
Task 1: fix round 1/5 (2 addressed, 1 open — sparse-array fingerprint collision; commits 06265f3..17846e0).
Task 1: fix round 2/5 (1 addressed, 0 open — commits 17846e0..56eb3e5).
Task 1: complete (commits 747e247..56eb3e5, review clean).
Task 2: dispatched implementer Wegener (`01a09a6b-8efa-7403-8f6a-a72559c6d461`) from base `56eb3e5`.
Task 2: implementation committed (`e7a0074`); focused migration test 1/1, domain tests 22/22, and TypeScript passed. PostgreSQL integration validation deferred because this environment has no database server.
Task 2: review round 1/5 requested changes (5 open: archive/upsert collision, raw SQL type mapping, per-claim fencing token, Drizzle CHECK parity, table-scoped constraint detection).
Task 2: fix round 1/5 implemented in `4e38577` (5 addressed; focused tests 9/9, domain tests 22/22, TypeScript passed; PostgreSQL integration remains deferred).
Task 2: complete (commits 56eb3e5..4e38577; re-review PASS). Residual deployment gate: run migration and concurrency integration tests against PostgreSQL before production rollout.
Task 3: dispatched implementer Planck (`01a09c49-7f7b-7be2-87b1-435ce6a97f19`) from base `4e38577`.
Task 3: implementation committed (`9ce6a7a`); focused tests 7/7, Tasks 1–3 suites 38/38, and TypeScript passed. Awaiting independent review.
Task 3: review round 1/5 requested changes (6 open: lifecycle of plan discount, deactivate plan price, coupon lifecycle/window, metadata reconciliation, configured currency, isolated dry-run).
Task 3: fix round 1/5 implemented in `c55fc91` (6 addressed; focused tests 13/13, Tasks 1–3 suites 44/44, TypeScript passed). Awaiting re-review.
Task 3: re-review of fix round 1 requested changes (3 open: reactivate archived price, time-window reconciliation, pass discount duration to Stripe).
Task 3: fix round 2/5 implemented in `e0c13ce` (3 addressed; focused tests 17/17 and TypeScript passed). Awaiting final re-review.
Task 3: complete (commits 4e38577..e0c13ce; final re-review PASS). No external Stripe calls were made; availability reconciliation is ready for the future worker.
Task 4: implementation committed (`16f1b16`); plan/coupon create-update-delete routes enqueue outbox jobs from the persisted record's fingerprint only, reject client-supplied Stripe fields/state, and archive-before-delete (502 on archive failure blocks the local delete). New superadmin-only routes: `POST /api/admin/stripe-catalog/sync`, `GET /api/admin/stripe-catalog/status`, `POST /api/admin/stripe-catalog/retry/:entityType/:entityId`.
Task 4: review (range `e0c13ce..16f1b16`) found P2 — the retry route had no CSRF/Origin-Referer check, so a cross-site request could force a real (non-dry-run) Stripe catalog mutation via a superadmin's `SameSite=None` session cookie.
Task 4: fix implemented in `5750498` (`requireSessionCsrf` applied to sync + retry routes; status route issues/reuses the session token). Focused tests 6/6, declared catalog suites 53/53, `npm run check` exit 0.
Task 4: complete (commits e0c13ce..5750498; rereview PASS — no bypass found via missing/invalid Origin-Referer, cross-site header, missing/wrong token, or a token supplied only in the body). *(Retroactively logged; this entry was missing from the ledger even though task-4-report.md/task-4-review.md/task-4-rereview.md already existed — see those files for full detail.)*
Task 5: implementation committed (`b59ad0e`); worker consumes only the existing claim/complete/fail storage methods (no raw SQL, no new storage methods), dispatches each claimed job by operation×entityType (upsert/archive × plan/coupon) to the matching `StripeCatalogSyncService` method, processes a claimed batch strictly sequentially so two jobs for the same entity are never in flight together even if the outbox returned two rows for it, and treats a fenced-out `undefined` complete/fail result (lease expired or stolen) as a safe no-op — never retried, never thrown. Storage's `failStripeCatalogSyncJob` only persists a caller-supplied `nextAttemptAt` (confirmed by reading it first), so the worker owns capped exponential backoff (30s→240s, 1h cap) terminating at the terminal `failed` dead-letter state after 5 attempts; a `failed` job is never reclaimed again. Errors are sanitized via the existing `sanitizeStripeCatalogError` before logging or persisting. `STRIPE_CATALOG_AUTO_SYNC`-gated startup wired into `server/index.ts` (no-op unless the flag is exactly `'true'`; stopped on SIGTERM/SIGINT alongside the existing durable-webhook-worker lifecycle). Focused tests 8/8, Tasks 1-5 catalog suites 56/56, module-mocked admin-routes+csrf 6/6, `NODE_OPTIONS=--max-old-space-size=4096 npm run check` exit 0. No real Stripe or PostgreSQL calls were made; this environment has no PostgreSQL server.
Task 5: awaiting independent review (diff range `5750498..b59ad0e`; see task-5-report.md for full TDD RED/GREEN evidence, retry/backoff design rationale, and noted deviations).
