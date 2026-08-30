# (Critical) Idempotency, Race Conditions & Data Consistency: Budget Races, Mock Pipelines, and Lost State

**Epic · Backend · Backend 2 of 5**

## Epic Summary

The system has two parallel realities: real services (DB-backed `PrivacyBudgetService`, `StorageService`) and mock routes that bypass them (`privacy-budget.ts` in-memory budgets with an unauthenticated reset, `encrypted-upload.ts` returning fabricated IPFS CIDs and "confirmed" Stellar transactions, `uploadManager` that discards every chunk). Privacy-budget enforcement is a check-then-act race in the service and a non-atomic read-modify-write in the in-memory DP service, so epsilon budgets can be overspent under concurrency — breaking the differential-privacy guarantee. These workstreams are coupled: atomic budget consumption (W1) requires a shared, durable store (W4); idempotency keys (W2) only work against that store; the mock-pipeline removal (W3) must land before W1's numbers can be trusted; and the chain watcher/indexer (W5) must be idempotent or it will double-apply the very events the contracts emit.

## Affected Components

`backend/src/services/differentialPrivacy.ts`, `backend/src/services/privacyBudgetService.ts`, `backend/src/repositories/privacyBudgetRepository.ts`, `backend/src/routes/privacy-budget.ts`, `backend/src/routes/encrypted-upload.ts`, `backend/src/services/uploadManager.ts`, `backend/src/services/zkpService.ts`, `backend/src/workers/StellarTransactionWatcher.ts`, `backend/src/services/EventIndexer.ts`, `backend/src/services/masterKeyManager.ts`

---

## Workstream 1 — Atomic privacy-budget consumption end-to-end

**Objective:** Epsilon consumption must be atomic and enforced at the point of mutation, in every code path.

**Problem:** `differentialPrivacy.ts` `updatePrivacyBudget` does a non-atomic read-modify-write on an in-memory Map (`budget.used += epsilonUsed; budget.remaining = ...`), so two concurrent queries can both pass the `budget.remaining < query.epsilon` check and overspend. `privacyBudgetService.ts` `enforceBudget` is a check-then-act (`getBudgetByDatasetId` → check → allow) that runs separately from `consumeBudget`, leaving a TOCTOU window between enforcement and consumption. The route layer (`routes/privacy-budget.ts`) mutates a module-level mock Map with `budget.currentEpsilon += amount` — no atomicity, no auth, and it does not touch the repository at all.

**Scope:** `differentialPrivacy.ts`, `privacyBudgetService.ts`, `privacyBudgetRepository.ts`, `routes/privacy-budget.ts`, and every consumer of `enforceBudget`.

**Implementation:**
1. Make the DB-backed `consumeBudget` the single enforcement point using an atomic conditional update (`UPDATE privacy_budgets SET current_epsilon = current_epsilon + $1 WHERE id = $2 AND current_epsilon + $1 <= max_epsilon`), returning the affected row — no separate check-then-act.
2. Replace the in-memory `differentialPrivacy.ts` budget map with the Redis-backed atomic pattern (Lua script or `INCRBY` with caps) and a per-user partition; remove the per-instance state (see W4).
3. Replace the mock `routes/privacy-budget.ts` with the real service/repository behind auth (auth from the authn epic); remove the unauthenticated `reset` endpoint or gate it admin-only.
4. Wire the budget enforcement into the analytics/query execution path so no query runs without consuming its epsilon atomically.

**Acceptance Criteria:**
1. 50 concurrent consumers of the same budget never exceed `maxEpsilon` (stress test).
2. `enforceBudget` + `consumeBudget` collapse into one atomic operation; no TOCTOU window remains.
3. `routes/privacy-budget.ts` reads/writes the same state as the service — no second ledger.
4. The `reset` endpoint is admin-gated and logged.
5. Per-user epsilon partitions cannot be drained by other users.

**Testing:** Concurrency stress tests (50 parallel consumes); route/service consistency tests; reset-authorization tests; a test proving the DP guarantee holds (total epsilon consumed ≤ budget) under load.

## Workstream 2 — Idempotency keys for all mutating endpoints

**Objective:** Retries, double-submits, and replays must not double-apply mutations.

**Problem:** Mutating endpoints (`/privacy/budget/:id/consume`, `/upload/*`, `/zkp/*`, gateway policy CRUD, analytics create) have no idempotency: a client retry (network timeout, user double-click, BullMQ redelivery) consumes epsilon twice, creates duplicate datasets, double-charges fees, and re-applies policy changes. The contracts upstream emit one event per mutation, so a double-applied request desynchronizes the backend ledger from on-chain state.

**Scope:** All mutating routes; a shared idempotency middleware; the request `X-Request-Id` already present in CORS headers.

**Implementation:**
1. Add an `Idempotency-Key` middleware backed by Redis: first request executes and stores the response keyed by (user, key) with a TTL; replays return the stored response without re-executing.
2. Accept the existing `X-Request-Id` header as a fallback key; generate one if absent.
3. Use idempotency keys on budget consumption, uploads, ZKP submissions, policy CRUD, and analytics creation; key uniqueness scoped per user.
4. Ensure unique constraints in the DB back the idempotency (e.g., unique `(user_id, idempotency_key)` on consumption history) so races at the DB level cannot double-insert.

**Acceptance Criteria:**
1. Replaying the same idempotent request (same key) returns the original response and does not consume epsilon twice.
2. Two different keys from the same user execute independently.
3. The consumption history has no duplicate rows for the same (user, key).
4. The middleware degrades closed (rejects ambiguous replays) rather than re-executing when Redis is down.

**Testing:** Replay tests per endpoint; concurrent-same-key tests; Redis-down behavior tests; uniqueness-constraint tests.

## Workstream 3 — Remove mock pipelines and fabricated confirmations

**Objective:** Every endpoint must perform the operation it claims to perform, or fail loudly.

**Problem:** `routes/encrypted-upload.ts` `/ipfs` returns a fabricated CID (`Qm${fileId}_${...}`) after a `setTimeout`, and `/stellar-transaction` returns `{ network: "testnet", status: "confirmed" }` without creating or verifying any transaction — downstream consumers are being told on-chain verification happened. `/encrypt` returns the plaintext encryption key to the caller and stores nothing verifiable. `uploadManager.processChunk` calls `simulateChunkProcessing` (a sleep) and never persists chunk data, so "completed" uploads contain no data. `zkpService.generateProof` returns `zk_proof_<random>` (see the ZK workstream) and `verifyProof` always returns `true` after 200ms.

**Scope:** `routes/encrypted-upload.ts`, `services/uploadManager.ts`, `services/zkpService.ts`, and the routes that consume them.

**Implementation:**
1. Wire `/ipfs` to the real `ipfsService.uploadAndPinFile` and `/stellar-transaction` to the real transaction builder/watcher; remove `simulate*` paths.
2. Make `uploadManager` persist chunks (to `StorageService`/IPFS) and reassemble with integrity verification; chunk index/size validation on every `processChunk` call.
3. Replace `zkpService.verifyProof`'s unconditional `true` with real verification or a `501 Not Implemented`; replace fake proof generation with a real prover or an explicit error.
4. Add a repo-wide lint banning `Simulate`/`simulate`/`mock` identifiers in non-test services.

**Acceptance Criteria:**
1. `/ipfs` returns a real, retrievable CID; `/stellar-transaction` returns a real transaction id or an error — never a fabricated `confirmed`.
2. A "completed" upload is fully retrievable byte-for-byte from storage.
3. `verifyProof` never returns `true` for an invalid/malformed proof; it either verifies or returns 501.
4. No mock/simulate code paths exist outside `src/__tests__` and `src/testing`.
5. The plaintext encryption key is no longer returned to callers (see secrets epic for the envelope-encryption replacement).

**Testing:** End-to-end upload→retrieve tests; fabricated-transaction regression tests (expect failure, not fake success); ZK verify tests (valid → true, invalid → false, malformed → error); lint enforcement in CI.

## Workstream 4 — Shared, durable, concurrency-safe state (no per-instance truth)

**Objective:** Budgets, uploads, rate-limit state, and caches must be shared across instances and survive restarts.

**Problem:** `differentialPrivacy.ts` budgets, `uploadManager` uploads, `zkpService` `proofCache` (unbounded), `rateLimiter.ts`/`enhancedRateLimiter.ts` collision/burst/adaptive maps, and `privacy-budget.ts` mocks are all in-memory per-process state: with the Docker Compose/`docker-compose.optimized.yml` multi-instance setup, budgets reset per instance (N× epsilon available), rate limits multiply by N, and uploads vanish on any restart. Nothing is durable.

**Scope:** The listed services; Redis configuration (`backend/src/config/redis.ts`); deployment docs.

**Implementation:**
1. Move authoritative budget state to Postgres (repository) with Redis as a read/counter layer, never as the only source of truth.
2. Add a bounded, evicting cache (LRU with max size) to `zkpService.proofCache` and Redis-share the rate-limiter collision/burst maps.
3. Persist upload sessions to Redis with TTL so chunk reassembly survives instance failover.
4. Add startup/health checks that fail when Redis or DB is unreachable in production (no silent "continue with limited services").

**Acceptance Criteria:**
1. Two instances sharing Redis/Postgres enforce a single epsilon budget and a single rate limit.
2. Restarting an instance does not reset budgets or lose in-flight uploads.
3. `proofCache` size is bounded (gauge metric) and evicts under load.
4. Production startup fails fast without Redis/DB rather than degrading silently.

**Testing:** Two-instance integration tests (boot two app instances against shared Redis/DB, verify shared counters); restart-persistence tests; cache-bounds load tests.

## Workstream 5 — Idempotent chain watcher and event indexer

**Objective:** On-chain events must be processed exactly once, in order, with replay safety.

**Problem:** `StellarTransactionWatcher` consumes ledger events and delivers webhooks; `EventIndexer` ingests contract events (budget, request, grant). Neither has a documented deduplication mechanism (no `(contract_id, ledger_seq, event_index)` primary key), so a redelivered or re-fetched event — common with RPC cursor resets and BullMQ retries — double-counts epsilon, double-delivers webhooks, and double-applies access grants. Combined with the contract event schema workstream (contracts epic 4), the indexer must reconstruct state exactly.

**Scope:** `workers/StellarTransactionWatcher.ts`, `services/EventIndexer.ts`, webhook delivery, and the DB tables they write.

**Implementation:**
1. Add a unique `(contract_id, ledger_sequence, event_index)` key on every indexed event; insert with `ON CONFLICT DO NOTHING` and skip already-processed events.
2. Make webhook delivery at-least-once with an idempotency key per event and a delivery state machine (pending → delivered → acked; retry with backoff, dead-letter after N).
3. Cursor/resume logic: persist the last processed ledger sequence per contract so restarts resume without re-scanning processed ranges.
4. Correlate indexed events with the backend ledger (budget consumption, request status) so a replayed event cannot desynchronize the DB.

**Acceptance Criteria:**
1. Replaying the same ledger range processes each event exactly once (DB row count and epsilon deltas unchanged on replay).
2. Webhooks are delivered at-least-once with dedupe; a crashed delivery retries without double-sending to subscribers.
3. Restarting the watcher resumes from the last processed sequence, not the chain head.
4. Indexed event state matches on-chain contract state after a full re-sync (reconciliation test).

**Testing:** Replay/dedupe tests; crash-resume tests; webhook retry/dedup tests; reconciliation tests against contract test fixtures (`test_snapshots/`).

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `npm run build`, `npm run type-check`, `npm run lint` pass and are blocking (no `|| echo` fallbacks).
2. `npm test` green, including concurrency, replay, and reconciliation suites.
3. CI's `backend` job runs the load suite (`npm run test:load:moderate`) as a smoke gate.
4. A lint bans mock/simulate code paths outside test directories.
5. Cross-epic gates: budget consumption is atomic only with the authn epic's per-user identity; audit records of consumption feed the audit-logging epic; the indexer consumes the contract event schema from contracts epic 4.
