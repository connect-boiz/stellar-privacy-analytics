# (Critical) Upgrade, Storage Layout & TTL Durability: Inert Proxy and Silent State Eviction

**Epic · Smart Contracts · Contracts 3 of 5**

## Epic Summary

Two failure modes will destroy this protocol in production: (1) the `UpgradeableProxy` never actually delegates or upgrades anything — it stores an implementation hash it never applies, so "upgrades" are inert and the code can never be repaired on-chain; and (2) nearly all contract state lives in instance/persistent storage whose entries expire on a default TTL (~7 days of inactivity on Stellar/Soroban) and is never extended, so budgets, datasets, requests, and grants can be silently evicted. The workstreams are coupled: a working upgrade path (W1) is required before any storage-layout migration (W4) is safe; TTL extension (W2) is what keeps state alive across the upgrade window; the chunk-leak and index bugs (W3) corrupt the storage that W2 keeps alive; and emergency controls (W5) must ride the same admin layer the access-control epic builds.

## Affected Components

`contracts/src/upgradeable_proxy.rs`, `contracts/src/ttl_storage.rs`, `contracts/src/stellar_analytics.rs`, `contracts/src/privacy_oracle.rs`, `contracts/src/access_control.rs`, `contracts/src/onchain_aggregator.rs`, `contracts/src/schema_enforcer.rs`, `src/data_sovereignty.rs`, `src/laplace_noise.rs`

---

## Workstream 1 — Make `UpgradeableProxy` a real proxy with safe upgrade execution

**Objective:** Upgrades must actually change behavior, and must never point the contract at a hash that cannot execute.

**Problem:** `upgradeable_proxy.rs` stores `IMPLEMENTATION` and `PENDING_IMPLEMENTATION` but contains no fallback/`__call`-style forwarding and never calls `env.deployer().update_current_contract_wasm(...)` — the proxy is inert, and `complete_upgrade` merely rewrites a storage key. There is no check that the pending hash corresponds to a deployed WASM (any 32 bytes are accepted in `initiate_upgrade`), so the proxy can be pointed at a garbage hash that would brick execution if it were ever applied.

**Scope:** `upgradeable_proxy.rs` `initialize`, `initiate_upgrade`, `complete_upgrade`, plus the deployment scripts (`contracts/scripts/deploy.ts`) and `soroban-project.yml`.

**Implementation:**
1. Implement Soroban upgrade semantics: `complete_upgrade` must call `env.deployer().update_current_contract_wasm(&pending_implementation)` (the WASM-hash upgrade primitive) so the change is real.
2. Validate in `initiate_upgrade` that the pending hash is not zero and, where host APIs allow, that a contract/WASM for the hash exists on-ledger (verify at execute time with a safe failure path, not a silent no-op).
3. Add a `fallback`/`__call`-style forwarding entry point if the proxy is meant to delegate calls to the implementation address; otherwise document that this is a code-upgrade proxy and remove the misleading `IMPLEMENTATION` storage key.
4. Keep the time-delay flow (`MIN_UPGRADE_DELAY`/`DEFAULT_UPGRADE_DELAY`) and ensure `complete_upgrade` clears pending state only after a successful host call (no state mutation before the host call succeeds).

**Acceptance Criteria:**
1. After `complete_upgrade`, the contract's WASM is actually replaced (verified via the upgraded contract's behavior in a test, not just storage keys).
2. `initiate_upgrade` with a zero or non-deployable hash fails.
3. An interrupted/failed upgrade leaves the previous implementation fully functional.
4. The delay window cannot be bypassed by re-initiating or by calling `complete_upgrade` early.
5. `pending_upgrade`/`upgrade_delay` views stay accurate after every transition.

**Testing:** Upgrade lifecycle tests in the Soroban test env (deploy → initiate → early-complete rejected → complete → behavior changed); failure-injection tests for the host upgrade call; delay-boundary tests.

## Workstream 2 — TTL extension for all long-lived instance/persistent state

**Objective:** No contract state may expire while the protocol intends it to persist.

**Problem:** `stellar_analytics.rs`, `privacy_oracle.rs`, `access_control.rs`, `onchain_aggregator.rs`, `schema_enforcer.rs`, `data_sovereignty.rs`, and `laplace_noise.rs` write budgets, datasets, requests, results, permissions, grants, and schemas into instance/persistent storage without ever calling `extend_ttl` on those keys (only `ttl_storage.rs` extends chunk TTLs). On Soroban, instance-storage entries carry a TTL and are evicted when not touched; a dormant dataset or a rarely-accessed budget is silently deleted.

**Scope:** Every `env.storage().instance().set/get` and `env.storage().persistent().set/get` in the listed contracts.

**Implementation:**
1. Add a shared TTL policy module (e.g., `contracts/src/storage_policy.rs`) with per-key-class TTL targets and an `extend(key)` helper using `env.storage().instance().extend_ttl(...)`/`persistent().extend_ttl(...)`.
2. Touch/extend on every read and write of long-lived keys (budgets, datasets, requests, results, permissions, keys, schemas, grants).
3. Cap the extension to `env.storage().max_ttl()` and log/report keys that approach eviction.

**Acceptance Criteria:**
1. After simulated idle periods exceeding the default TTL, budgets, datasets, requests, results, permissions, and grants still resolve.
2. Every storage write in the audited contracts is paired with an extension; a code-level audit finds zero bare writes.
3. `ttl_storage.rs` entry TTLs, chunk TTLs, and the entry `expires_at` remain consistent after extension.
4. Extension costs are bounded per call (no unbounded fee growth in tests).

**Testing:** Ledger-advance tests (jump sequence/time past the default TTL) proving state survives; a storage audit script (grep for `storage().instance().set`/`persistent().set`) wired into CI.

## Workstream 3 — Fix `ttl_storage.rs` chunk leak, index pruning, and reconstruction integrity

**Objective:** Cleanup must actually free storage, and reconstruction must fail loudly on corruption.

**Problem:** In `ttl_storage.rs`, `remove_entry` deletes the persistent entry first and then reads it back to find its chunks — `get_data_entry` returns `None` after deletion, so chunk data leaks in temporary storage forever (storage bloat, unbounded ledger costs). `bump_instance_ttl` mutates `entry.expires_at` and re-extends chunk TTLs, but the `data_entries` index Vec is never pruned for entries removed outside `cleanup_expired_data`, so the index grows unboundedly and cleanup cost grows linearly. `reconstruct_data` returns `EntryNotFound` on any missing chunk, which is indistinguishable from a corrupted blob.

**Scope:** `remove_entry`, `cleanup_expired_data`, `bump_instance_ttl`, `reconstruct_data`, and the `data_entries` index.

**Implementation:**
1. Read the entry into a local variable **before** deleting it, then iterate chunks from the local copy (fixes the use-after-free class of bug).
2. Add a `DataCorrupted` error variant for partial/checksum-mismatched reconstructions instead of `EntryNotFound`.
3. Prune the `data_entries` index when entries are removed via any path, and cap index growth.
4. Ensure `bump_instance_ttl` keeps chunk TTLs in lockstep with the extended `expires_at` (existing intent, make it provable).

**Acceptance Criteria:**
1. After `cleanup_expired_data` removes an entry, no chunks remain for that entry id (storage freed).
2. A corrupted chunk (bad checksum) yields a distinct, typed error.
3. The `data_entries` index size does not grow with deleted entries.
4. `bump_instance_ttl` extended entries remain fully retrievable past the original TTL (existing acceptance #285) and past the extension.
5. Cleanup of a live entry leaves everything intact.

**Testing:** Multi-chunk cleanup tests asserting chunk removal; checksum-corruption tests; index-growth property tests; ledger-time tests for TTL interplay.

## Workstream 4 — Storage layout versioning & migration for upgradeable contracts

**Objective:** Upgrades must not corrupt or orphan existing state.

**Problem:** All contracts read state via bare `Symbol`/string keys with no namespacing or versioning. When code changes the shape of a struct or the meaning of a key, old entries are read as new types (deserialization errors or silently wrong values), and there is no migration hook. Combined with W1 (a proxy that can now actually swap code), this makes every future upgrade a data-corruption risk.

**Scope:** All storage keys across the audited contracts; `schema_enforcer.rs` schemas and validation logs; `soroban-project.yml` upgrade flow.

**Implementation:**
1. Introduce storage key versioning (e.g., `Symbol` namespacing like `v1::budgets`) with a documented layout table per contract.
2. Add a `migrate_storage` entry point (admin-gated via the access-control epic's `AdminRights`) that upgrades known keys atomically and is idempotent (safe to re-run).
3. For `schema_enforcer.rs`/`onchain_aggregator.rs` persistent data, keep backward-compatible reads or fail closed with a typed `StorageVersionMismatch` error rather than deserializing garbage.
4. Migration must run within the upgrade flow in W1 before or atomically with the WASM swap.

**Acceptance Criteria:**
1. A simulated upgrade from layout v1 to v2 migrates all existing entries without loss and without deserialization errors.
2. `migrate_storage` is idempotent and admin-gated.
3. Reading v1 data on v2 code without migration fails closed (typed error), never silently wrong values.
4. Every contract documents its storage layout in a table in the module docs.

**Testing:** Migration tests (v1 → v2 with live data); idempotency tests; fail-closed read tests; storage-layout documentation review checklist in CI docs lint.

## Workstream 5 — Emergency freeze, pause, and recovery paths across contracts

**Objective:** When a vulnerability is found, operators must be able to halt mutating operations without bricking the contract or losing data.

**Problem:** There is no pause/freeze mechanism in any contract (the only "kill" concept lives in backend HSM tooling, not on-chain). During an incident the only options are a full (currently inert) upgrade or doing nothing. Freeze must interoperate with the TTL workstream: a frozen contract must still extend TTLs for held state, or the freeze itself causes eviction.

**Scope:** All contracts; coordination with the access-control epic's `AdminRights`.

**Implementation:**
1. Add `freeze`/`unfreeze` to the shared `AdminRights` module (access-control epic, Workstream 5) and gate every mutating entry point with it.
2. While frozen, read views and TTL extension (W2) must continue to run so state survives the incident.
3. Add a documented recovery runbook: freeze → assess → migrate (W4) → upgrade (W1) → unfreeze, each step verifiable via events.
4. Emit `contract_paused`/`contract_resumed` events with the caller and reason.

**Acceptance Criteria:**
1. Freezing halts all mutations in all contracts; reads and TTL extensions continue.
2. State survives a freeze of any realistic duration (TTL workstream test with frozen contract).
3. Unfreeze restores operation with an auditable event.
4. The recovery runbook is documented in `docs/deployment.md` and every step is scripted in `contracts/scripts/`.

**Testing:** Freeze-during-lifecycle tests (freeze between request and complete); long-freeze TTL tests; runbook dry-run in CI via scripts.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `cargo build --target wasm32-unknown-unknown --release` succeeds for `contracts/` and root; wasm size deltas reported.
2. `cargo fmt --check` and `cargo clippy --lib --bins -- -D warnings` are clean.
3. `cargo test` green including TTL-survival, chunk-leak, migration, and freeze lifecycle suites.
4. CI gates real: remove `continue-on-error: true` from `contracts-rust` Test/Build WASM and `rust-extras` jobs in `.github/workflows/ci.yml`.
5. A storage-audit lint (no bare storage writes without TTL extension or versioned key) runs in CI and fails the build on violations.
6. Cross-epic gates: upgrade admin paths use the access-control epic's authenticated `AdminRights`; freeze does not break the arithmetic epic's ledger invariants.
