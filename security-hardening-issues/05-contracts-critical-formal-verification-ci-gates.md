# (Critical) Formal Verification & Invariant Enforcement: Property Tests, Runtime Guards, and Real CI Gates

**Epic · Smart Contracts · Contracts 5 of 5**

## Epic Summary

The repo ships an on-chain contract named `InvariantTesting` that is not verification — it is an unauthenticated function anyone can call to emit `invariant_violation` events and return errors, giving false confidence while the real contracts have no embedded invariant checks, no property-based tests, and CI that ignores contract test/build failures (`continue-on-error: true` in `.github/workflows/ci.yml`). This epic replaces theater with a verification layer: runtime invariant guards embedded in the production contracts (W1), property-based test suites covering the ledger invariants defined by the arithmetic epic (W2), formal verification of the fixed-point math (W3), deployment-gating the test contract (W4), and real, blocking CI gates (W5). The workstreams are coupled: guards (W1) are only testable once the property suites (W2) exist; formal proofs (W3) target the same functions the property suites exercise; gating (W4) is meaningless without guards; and CI gates (W5) are the enforcement mechanism for all four.

## Affected Components

`contracts/src/invariant_testing.rs`, `contracts/src/stellar_analytics.rs`, `contracts/src/privacy_oracle.rs`, `contracts/src/onchain_aggregator.rs`, `contracts/src/access_control.rs`, `src/laplace_noise.rs`, `contracts/Cargo.toml`, `.github/workflows/ci.yml`, `test_snapshots/`

---

## Workstream 1 — Runtime invariant guards embedded in production contracts

**Objective:** The invariants the protocol depends on must be checked inside the shipping contracts, not in a sidecar test contract.

**Problem:** `invariant_testing.rs`'s `test_noise_invariant`, `test_privacy_budget_invariant`, `test_access_control_invariant`, and `test_integer_overflow_invariant` accept caller-supplied values, compare them, emit an event, and return an error — they verify nothing about the actual contract state and can be invoked by anyone to fabricate violations. Meanwhile the real invariants (per-user budgets sum to the global counter, `active_analyses` matches non-terminal requests, deposits never go negative, used epsilon ≤ max) are nowhere enforced in the production paths.

**Scope:** All production contracts; the `invariant_testing.rs` behavior is migrated into real guards.

**Implementation:**
1. Add internal `check_invariants(env)` calls (cheap subset in production, full set under `cfg(test)`) at the end of every mutating entry point; on violation, revert with a typed `InvariantViolation` error rather than emitting a decorative event.
2. Replace `invariant_testing.rs`'s caller-supplied-value API with internal guards; the module becomes a library of invariant definitions used by production code, not a callable contract.
3. Emit `invariant_violation` events only from production guards (impossible to spoof by construction).

**Acceptance Criteria:**
1. Every mutating entry point runs its invariant checks; a mutation that would break an invariant reverts.
2. No public function accepts arbitrary values and emits `invariant_violation`.
3. Invariant violations surface as typed errors with the violating value, usable by the backend indexer for alerting.

**Testing:** Invariant-violation fault-injection tests (force a bad state, assert revert); end-to-end tests proving the guard fires before any partial state is committed.

## Workstream 2 — Property-based test suites for ledger invariants

**Objective:** Randomized, reproducible property tests must prove the ledger invariants hold across all lifecycle sequences.

**Problem:** The current tests are hand-written happy-path/negative tests; nothing explores random interleavings of `request_analysis`/`complete_analysis`/`cancel_analysis`/`add_privacy_budget`, concurrent request lifecycles, or the deposit/fee ledgers. The invariants from the arithmetic epic (`total_privacy_budget_used == Σ per-user`, `active_analyses` exactness, deposits non-negative, epsilon budgets exact) are exactly the class of property that fuzzing catches.

**Scope:** `contracts/Cargo.toml` (add `proptest` dev-dependency); new `*_properties.rs` modules per contract.

**Implementation:**
1. Add `proptest` and write property tests: (a) budget-ledger: random sequences of request/complete/cancel/refund keep `total_privacy_budget_used` reconciled; (b) request lifecycle: any interleaving of complete/cancel yields exactly one terminal state (ties to the state-machine epic); (c) deposit/fee ledger: `total_fees_collected` reconciles after random request/cancel/fulfill; (d) DP budget: `used_eps` never exceeds `max_eps` and never goes negative.
2. Fix any invariant the properties expose (coordinate with the arithmetic epic — properties are the acceptance evidence).
3. Seed and regression-file failures so they are reproducible in CI.

**Acceptance Criteria:**
1. Each property suite runs ≥ 1,000 generated cases per CI run and is deterministic (seeded).
2. The four property groups above all pass.
3. No property test is `#[ignore]`d; each maps to a documented invariant in the module docs.
4. A failing property test blocks the build (wired in W5).

**Testing:** `cargo test --release` (overflow-checked profile) runs the property suites; regression snapshots in `test_snapshots/` are regenerated and diffed in CI.

## Workstream 3 — Formal verification of the fixed-point math and checked-arithmetic modules

**Objective:** The functions that can panic (division by zero) or silently misbehave (Taylor divergence, overflow) must be proven safe for all valid inputs.

**Problem:** `src/laplace_noise.rs` `ln_1_minus_x` uses a 3-term Taylor series with a sentinel for divergence, and `laplace_noise` computes `(sensitivity * SCALE) / epsilon` — division by zero when `epsilon == 0` and overflow when `sensitivity * SCALE` exceeds `i128::MAX`. `onchain_aggregator.rs` `calculate_noise` divides by `participants_count`. These are exactly the classes of bug that panic in WASM (`panic = "abort"`) and brick the contract. Formal methods (e.g., Kani) can prove no panic and no overflow across the valid input ranges.

**Scope:** `FixedPointMath` (`ln_1_minus_x`, `laplace_noise`), the checked-arithmetic helpers from the arithmetic epic, `calculate_noise`, `perform_sum`/`perform_average`.

**Implementation:**
1. Add Kani proof harnesses (or equivalent) for: `ln_1_minus_x` for all `0..=SCALE` inputs (no panic, no sentinel outside documented range), `laplace_noise` for all valid `(epsilon > 0, sensitivity > 0)` with bounds, and the checked-arithmetic helpers for all `i128` pairs (no panic, correct `Err` on overflow).
2. Preconditions encoded as contract input validation (reject `epsilon == 0`, `sensitivity <= 0`) so the proofs' assumptions hold in production.
3. Wire the proofs into CI as a blocking job.

**Acceptance Criteria:**
1. Kani proves `ln_1_minus_x` panics for no input in range and returns the sentinel only at/above `SCALE`.
2. Kani proves `laplace_noise` panics for no valid input (post-guard).
3. Kani proves checked-arithmetic helpers never panic and never wrap.
4. Every formal proof's preconditions are enforced by the contract's input validation.
5. Proofs run in CI and fail the build on regressions.

**Testing:** CI job running the proof harness; cross-check property tests (W2) against the same functions; a doc page listing proven properties and assumptions.

## Workstream 4 — Deploy-gate the `InvariantTesting` contract and event spam

**Objective:** The test contract must never ship on mainnet in its current form.

**Problem:** `soroban-project.yml` only lists `stellar_analytics` and `privacy_oracle` for deployment, but nothing prevents `InvariantTesting` from being deployed manually, and its public entry points are callable by anyone to spam `invariant_violation` events and burn caller funds. There is no deploy-time gating or contract registry.

**Scope:** `contracts/soroban-project.yml`, `contracts/scripts/deploy.ts`, CI build artifacts, and a deploy manifest.

**Implementation:**
1. Remove `InvariantTesting` from the buildable/deployable set (or `cfg(test)`-gate all its entry points so the shipped wasm has none).
2. Add a deploy manifest (`contracts/deploy-manifest.yml`) listing exactly which contracts may deploy to testnet/mainnet, enforced by the deploy script.
3. Add a post-deploy smoke check that verifies only allowlisted contracts are deployed at the recorded addresses.

**Acceptance Criteria:**
1. The release wasm for `invariant_testing` exposes zero public entry points (or the contract is excluded from release builds).
2. `deploy.ts` refuses to deploy any contract not in the manifest.
3. The CI artifact check asserts no `invariant_violation`-emitting public functions exist in the release wasm.
4. Existing `test_snapshots/` for `invariant_testing` are removed or converted to guard tests (W1).

**Testing:** Wasm entry-point enumeration in CI; deploy-script refusal tests; snapshot regeneration.

## Workstream 5 — Real, blocking CI gates (build, tests, lints, proof runs)

**Objective:** CI must fail when the contracts are broken — today it silently passes.

**Problem:** In `.github/workflows/ci.yml`, the `contracts-rust` job sets `continue-on-error: true` on `cargo test` and `cargo build --target wasm32-unknown-unknown --release`, and `rust-extras` does the same on tests; `backend/package.json` and `contracts/package.json` type-check scripts append "non-blocking in CI" fallbacks. Contract tests can fail, wasm builds can fail, and the pipeline still reports green. `test_snapshots/` exist but nothing verifies they match a deterministic test run.

**Scope:** `.github/workflows/ci.yml`, `contracts/package.json` (test/type-check/lint scripts), `backend/package.json` (same), CI conventions in `CONTRIBUTING.md`.

**Implementation:**
1. Remove `continue-on-error: true` from every job step in `ci.yml` (contracts-rust, rust-extras, backend-rust).
2. Add blocking jobs: `cargo fmt --check`, `cargo clippy --lib --bins -- -D warnings`, property tests, Kani proofs, wasm size budget check, and snapshot regeneration diff.
3. Replace "non-blocking" script fallbacks (`|| echo ...`) with genuinely blocking equivalents, or split "warnings allowed" and "must pass" scripts explicitly.
4. Add a storage-audit and event-schema lint (from the earlier epics) as blocking steps.

**Acceptance Criteria:**
1. Introducing a test failure, clippy warning, fmt violation, property-test failure, or wasm build failure turns the pipeline red.
2. `test_snapshots/` are regenerated deterministically and diffed; drift fails CI.
3. No `|| echo '...skipped'`-style fallbacks remain in CI-invoked scripts.
4. The full CI suite (shared → frontend → backend → contracts → extras → docs) runs in under the job timeouts and is green on `main`.

**Testing:** CI self-tests: a PR that breaks a contract test must fail the pipeline (verify once); a PR that only adds a snapshot drift must fail; documented in `CONTRIBUTING.md`.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. All contracts build with `cargo build --target wasm32-unknown-unknown --release` under the overflow-checked profile; wasm size deltas reported and budgeted.
2. `cargo fmt --check`, `cargo clippy --lib --bins -- -D warnings` are clean and blocking.
3. `cargo test --release` green, including property suites and fault-injection guard tests.
4. Kani (or equivalent) proofs pass and are blocking in CI.
5. All `continue-on-error: true` and non-blocking fallbacks removed from `.github/workflows/ci.yml` and package scripts; snapshot diff and storage/event lints are blocking.
6. Cross-epic gate: this epic's guards and properties encode the invariants from the arithmetic, state-machine, and access-control epics — a contract change that passes here but violates another epic's invariant fails the whole hardening program.
