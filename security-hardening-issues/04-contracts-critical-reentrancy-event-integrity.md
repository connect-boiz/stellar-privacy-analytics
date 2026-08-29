# (Critical) Re-entrancy, State Transitions & Event Integrity: Cross-Contract Call Safety

**Epic · Smart Contracts · Contracts 4 of 5**

## Epic Summary

The contracts mutate state with read-modify-write sequences, have no mutual exclusion between `complete`/`cancel`/`refund` paths, make cross-contract calls (consent auth, the data-sovereignty relay pattern, aggregator composition) without any reentrancy discipline, and emit events that cannot be used to reconstruct state — several emit empty `()` payloads or are spammable by an unauthenticated on-chain "test" contract. These workstreams are coupled: correct event integrity (W4) requires state transitions to be single-writer (W3); single-writer transitions require the accounting fixes from the arithmetic epic; loop/DoS bounds (W5) determine whether the single-writer state (requests, pending lists) can even be mutated under load; and the CEI discipline (W1/W2) is what keeps the whole thing safe as the protocol adds token flows.

## Affected Components

`contracts/src/stellar_analytics.rs`, `contracts/src/privacy_oracle.rs`, `contracts/src/onchain_aggregator.rs`, `contracts/src/access_control.rs`, `contracts/src/invariant_testing.rs`, `src/data_sovereignty.rs`

---

## Workstream 1 — Check-Effects-Interactions audit and state-machine discipline

**Objective:** Every mutating entry point must read all state it needs, validate, then write, then emit — with no external calls between validation and commit that could observe or influence intermediate state.

**Problem:** Several entry points interleave reads, writes, and (potential) cross-contract auth calls. In `stellar_analytics.rs` `request_analysis`, the consent check (`dataset.uploader.require_auth()`) runs after availability checks and before state writes — correct today, but undocumented; `complete_analysis` writes the result, then updates counters, then refunds — three separate storage writes with no failure atomicity. `privacy_oracle.rs` and `onchain_aggregator.rs` follow the same read-modify-write-without-ordering pattern. There is no CEI lint or review checklist anywhere in the repo.

**Scope:** All mutating entry points in the five affected contracts.

**Implementation:**
1. Produce a per-contract CEI table (read set → validation → effect set → event) in module docs and enforce it in review.
2. Reorder `complete_analysis`/`cancel_analysis`/`fulfill_request` so all validations complete before any storage write, and all writes complete before any refund/bookkeeping.
3. Add a CI lint (or clippy-driven checklist + review requirement) that flags interleaved reads/writes in changed code.

**Acceptance Criteria:**
1. Every mutating entry point has a documented CEI order; a script verifies no function writes storage between a `require_auth` and its owning validation set.
2. No entry point performs a cross-contract call after writing state (current code: none do — prove it with a test that instruments call order).
3. The CEI table is referenced from the module-level `//!` docs and reviewed in PRs.

**Testing:** Call-order instrumentation tests; a static analysis script (regex/`cargo-geiger`-style) run in CI; code-review checklist added to `CONTRIBUTING.md`.

## Workstream 2 — Reentrancy guards and safe cross-contract composition

**Objective:** Cross-contract calls (auth sub-invocations, relay composition, future token flows) must be safe against reentrant entry into the same contract.

**Problem:** `src/data_sovereignty.rs` `check_access` deliberately omits `require_auth` for composability (issue #294), meaning consumer contracts call it with opaque end-user identities; there is no reentrancy guard utility anywhere, so once token flows are added (aggregator fees, oracle deposits as native tokens), a reentrant call into the same contract could observe intermediate state (e.g., double-spend a deposit between `set_user_deposit` and the event). The protocol has no `nonReentrant` primitive at all.

**Scope:** A shared `non_reentrant` guard; audit of every cross-contract call site; `data_sovereignty.rs` relay pattern; `onchain_aggregator.rs` composition paths.

**Implementation:**
1. Add a `NonReentrant` storage flag utility (instance storage bool set at entry, cleared at exit, panics/rejects on reentry) in a shared module.
2. Apply it to every entry point that makes or can make a cross-contract call during its execution (document which are currently call-free).
3. Document Soroban auth re-check semantics (a reentrant call re-runs `require_auth`, so auth is not the defense — ordering is) in the module docs.

**Acceptance Criteria:**
1. A reentrant invocation into a guarded entry point is rejected.
2. All currently-cross-call entry points are guarded; a test simulates reentrancy via a malicious relay contract and asserts no state corruption.
3. Token-integration design note: any future entry point moving native assets must be CEI + guarded; the note is in the module docs.

**Testing:** Malicious-relay reentrancy tests against `data_sovereignty.rs` and `onchain_aggregator.rs`; guard-unit tests; cross-contract call-graph test.

## Workstream 3 — Single-writer request lifecycle (complete/cancel mutual exclusion)

**Objective:** Each `request_id` must have exactly one terminal transition, and no refund may be claimed twice.

**Problem:** `stellar_analytics.rs` `complete_analysis` and `cancel_analysis` each read `AnalysisRequest`, check `completed`/`cancelled`, then write. Two transactions in the same ledger can interleave: both read `completed=false`, both pass, one completes and one cancels, and the refund logic in both paths runs (this is also the source of the `active_analyses` underflow in the arithmetic epic). The status flags are checked but the transition is not atomic across the two functions.

**Scope:** `request_analysis` → `complete_analysis`/`cancel_analysis` lifecycle in `stellar_analytics.rs`; the same pattern in `privacy_oracle.rs` (`fulfill_request`/`cancel_request`).

**Implementation:**
1. Introduce a single `request_status` field (enum: `pending | completed | cancelled | refunded`) written through one helper that enforces valid transitions only.
2. Guard the terminal transition with the non-reentrancy flag from W2 and the checked arithmetic from the arithmetic epic.
3. In `privacy_oracle.rs`, apply the same single-writer transition to `fulfill_request`/`cancel_request`.

**Acceptance Criteria:**
1. A request can transition to exactly one terminal state; concurrent complete+cancel yields exactly one terminal state and one refund.
2. No path can refund the same `privacy_budget` twice.
3. `active_analyses` decrements exactly once per terminal transition (no underflow — ties to arithmetic epic acceptance).
4. State-machine transition table is documented and exhaustively tested.

**Testing:** Concurrent-transaction simulation tests (two invocations in one ledger on the same request); transition-table exhaustive tests; double-refund regression tests.

## Workstream 4 — Canonical event schema and exact state reconstruction

**Objective:** Off-chain indexers must be able to reconstruct contract state exactly from events, and the event stream must be free of spoofable/spam noise.

**Problem:** Most events publish empty `()` payloads (`analysis_requested`, `analysis_completed`, `analysis_cancelled`, `data_requested`, `data_fulfilled`) with only topic keys, so an indexer cannot reconstruct before/after values, budgets, or fees from the stream. `contracts/src/invariant_testing.rs` exposes unauthenticated `test_*`/`run_fuzz_test`/`simulate_sybil_attack` entry points that let anyone emit `invariant_violation` events with arbitrary descriptions — poisoning the event stream and any alerting built on it. There is no documented event schema or ABI-validated ingestion.

**Scope:** Event emission in all contracts; `invariant_testing.rs` removal/gating (see formal-verification epic); the backend `EventIndexer`.

**Implementation:**
1. Define a canonical event schema: topics = `(contract_id, event_name, entity_key)`; data = structured before/after deltas (`(before_budget, after_budget)`, `(request_id, status_from, status_to)`, fees, timestamps).
2. Replace empty `()` payloads with structured payloads; keep every mutation emitting exactly one event with its deltas.
3. Gate/remove the `InvariantTesting` contract's public entry points so it cannot be used to spam events (deploy-gate or delete).
4. Update `backend/src/services/EventIndexer.ts` to validate event topics against the schema and reject unknown/spoofed topics.

**Acceptance Criteria:**
1. Every state mutation emits an event containing enough data to reconstruct the change (before/after), verified by an indexer-replay test that rebuilds a ledger of budgets from events alone.
2. `invariant_violation` events can no longer be emitted by arbitrary callers.
3. The EventIndexer rejects events that do not match the schema and logs them as anomalies.
4. Event topics are stable across the upgrade workstream (versioned schema documented).

**Testing:** Indexer-replay property tests (mutate randomly, rebuild state from events, assert equality); event-schema conformance tests; spam-attempt tests against `InvariantTesting`.

## Workstream 5 — Bound unbounded loops and scans (gas DoS)

**Objective:** No entry point may have unbounded iteration that an attacker can drive to exhaust gas or brick the contract.

**Problem:** `access_control.rs` `check_access` iterates **all** access keys (`for (_, access_key) in access_keys.iter()`) on every check — O(n) per query, and the map grows without bound (grants are appended forever; `cleanup_expired` must be called by someone and iterates everything). `privacy_oracle.rs` `remove_from_pending`/`remove_from_active_nodes` rebuild a Vec linearly; `schema_enforcer.rs` `get_validation_log` scans the entire `validation_logs` index; `ttl_storage.rs` `cleanup_expired_data` walks the whole `data_entries` index. An attacker registering many keys/requests can make every subsequent check/cleanup exceed the ledger cost cap.

**Scope:** The listed iteration sites in `access_control.rs`, `privacy_oracle.rs`, `schema_enforcer.rs`, `ttl_storage.rs`.

**Implementation:**
1. Maintain per-user/per-resource indexes so `check_access` does constant (or bounded) work: `Map<Address, Vec<resource_id>>` plus a `Map<(resource_id, Address), AccessKey>` lookup instead of full scans.
2. Cap the number of grants/keys per user and per resource with typed errors (`MaxGrantsExceeded`).
3. Bound `remove_from_pending`/cleanup iterations to a per-call budget with continuation state (pagination), and make cleanup a resumable worker operation.

**Acceptance Criteria:**
1. `check_access` cost is independent of the total number of keys in the contract (benchmark test).
2. Grant/key creation past the cap fails with a typed error.
3. Cleanup of N entries can run in bounded chunks and resume without losing work.
4. `get_validation_log` lookup is O(1) via a payload→log index instead of a full scan.
5. No entry point's gas cost grows with total contract state.

**Testing:** Gas/cost benchmark tests (assert bounded cost as state grows); cap-limit tests; pagination/resume tests; adversarial state-growth tests (register 10k keys, assert check_access still cheap).

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `cargo build --target wasm32-unknown-unknown --release` succeeds; wasm size deltas reported.
2. `cargo fmt --check` and `cargo clippy --lib --bins -- -D warnings` are clean.
3. `cargo test` green, including reentrancy, state-machine, event-replay, and gas-benchmark suites.
4. CI gates real: `contracts-rust` Test/Build WASM blocking in `.github/workflows/ci.yml`; the storage/loop audit script runs and fails the build on unbounded-iteration regressions.
5. Cross-epic gates: state transitions consume the arithmetic epic's checked ops; freeze (upgrade epic) must halt mutations introduced here; the event schema is consumed by the backend's authz/data-integrity epics.
