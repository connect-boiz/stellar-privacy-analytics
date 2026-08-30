# (Critical) Arithmetic Invariants & Balance Accounting: Silent Overflow/Underflow in Release WASM

**Epic · Smart Contracts · Contracts 2 of 5**

## Epic Summary

The release WASM profile has no overflow checks (`contracts/Cargo.toml` defines `[profile.release]` with `panic = "abort"` and no `overflow-checks`, and the shipped builds use `--release`), so every `i128`/`u64` balance, counter, and refund in the protocol silently wraps in production. Balance accounting is also internally inconsistent: counters and per-user balances are updated independently, so drift is guaranteed. These workstreams are coupled: the checked-math foundation (W1) is what makes every later fix expressible; the budget/deposit/credit ledgers (W2–W4) share the same read-modify-write pattern and the same "global counter must equal the sum of per-user balances" invariant; and the DP math (W5) cannot be validated until the ledger math (W2/W3) is fixed, because budget exhaustion is what bounds noise queries.

## Affected Components

`contracts/Cargo.toml`, `contracts/src/stellar_analytics.rs`, `contracts/src/privacy_oracle.rs`, `contracts/src/onchain_aggregator.rs`, `src/laplace_noise.rs`

---

## Workstream 1 — Overflow-checked release build + checked arithmetic discipline

**Objective:** Make every integer operation fail loudly instead of silently wrapping in the shipped artifact.

**Problem:** `contracts/Cargo.toml` `[profile.release]` has no `overflow-checks` (a `release-with-overflow` profile exists but nothing uses it), so release builds wrap: `total_analyses + 1`, `active_analyses - 1`, `total_budget_used - refund`, `used_eps + query_epsilon`, `sensitivity * SCALE`, and `fee_per_hour * ttl_hours` can all overflow/underflow silently. Debug builds pass tests while production WASM wraps.

**Scope:** `contracts/Cargo.toml` and root `Cargo.toml`; every arithmetic site in the affected contracts.

**Implementation:**
1. Enable `overflow-checks = true` on the release profile used for the shipped wasm (or make `release-with-overflow` the release artifact in `soroban-project.yml` and CI).
2. Introduce a `checked` helper module (`checked_add`, `checked_sub`, `checked_mul`, `saturating_*` for noise) and replace all balance/counter arithmetic.
3. Convert bare `-`/`+` on stored balances to checked ops that return typed errors (`BudgetExceeded`, `OverflowError`) instead of panicking or wrapping.

**Acceptance Criteria:**
1. Building with the release profile used in CI (`cargo build --target wasm32-unknown-unknown --release`) enables overflow checks (verify via a test that overflows in debug and would wrap without checks).
2. No `+`, `-`, `*` on `i128`/`u64` storage values remain in the four contracts except through the checked helpers.
3. Fuzzing every arithmetic site with boundary inputs (MAX, MIN, negative) never produces a wrapped value.

**Testing:** Unit tests asserting `Err` on overflow for each helper; a build-level test that compiles with `overflow-checks` and asserts panics/errors on overflow; add this to CI so the gate is enforced.

## Workstream 2 — Repair `StellarAnalytics` budget bookkeeping

**Objective:** Per-user budgets, the global counter, and `active_analyses` must never disagree or underflow.

**Problem:** In `stellar_analytics.rs`: `complete_analysis` and `cancel_analysis` both execute `active_analyses - 1` (wrapping to `u64::MAX` if ever zero); the refund path does `total_budget_used - refund`, which can underflow when refunds exceed the counter; `add_privacy_budget` checks `current_budget + amount > MAX_PRIVACY_BUDGET` — the addition wraps first in release, so the cap is bypassable; and a request can be cancelled after completion is attempted (see the event/state-transition epic) so refunds can be claimed on both paths.

**Scope:** `request_analysis`, `complete_analysis`, `cancel_analysis`, `add_privacy_budget`, `get_user_privacy_budget`/`set_user_privacy_budget`, `get_stats`.

**Implementation:**
1. Use checked subtraction for `active_analyses` and `total_privacy_budget_used`, returning a typed error on underflow rather than wrapping.
2. Compute `add_privacy_budget` cap as `amount > MAX_PRIVACY_BUDGET - current_budget` (or checked add) so the cap cannot be wrapped around.
3. Make complete/cancel mutually exclusive per `request_id` (single state-transition writer; see the re-entrancy epic) so refunds cannot double-apply.
4. Add an invariant: `total_privacy_budget_used == sum(per-user used)` after every mutating call.

**Acceptance Criteria:**
1. Calling `complete_analysis` and `cancel_analysis` on the same request cannot double-refund or underflow `active_analyses`.
2. `add_privacy_budget` rejects any amount that would push the budget past `MAX_PRIVACY_BUDGET`, including near-`i128::MAX` inputs.
3. `get_stats` counters never wrap; a test drives the counter to zero and asserts a clean error, not `u64::MAX`.
4. The global counter equals the sum of per-user budgets after random request/complete/cancel sequences.

**Testing:** Property test over request lifecycle fuzzing (request → complete/cancel → double-op) asserting counters remain consistent; targeted overflow tests.

## Workstream 3 — Repair `PrivacyOracle` deposit and fee accounting

**Objective:** Deposits, fees, and the `total_fees_collected` counter must reconcile exactly.

**Problem:** In `privacy_oracle.rs`: `request_data` deducts the fee from the (currently pooled, see access-control epic) deposit; `cancel_request` refunds `cancel_fee / 2`; `total_fees_collected` is incremented at request time and decremented by refunds at cancel time — but with no negative validation on `fee`, no bound on `total_fees_collected - refund`, and `add_deposit`/`withdraw` accepting unchecked `amount`, the ledger drifts and can underflow. `update_oracle_stats` increments counters with bare `+= 1`.

**Scope:** `request_data`, `cancel_request`, `add_deposit`, `withdraw`, `update_oracle_stats`, `get_stats`.

**Implementation:**
1. Validate `fee` within `MIN_FEE..=MAX_FEE` (already present) and reject negative deposits/withdrawals; make `withdraw` checked.
2. Use checked arithmetic for `total_fees_collected` increments/decrements and per-user deposit updates.
3. Add an invariant reconciling `total_fees_collected` against per-request fees minus refunds.

**Acceptance Criteria:**
1. Repeated cancel/refund cycles never drive `total_fees_collected` negative or wrap.
2. `withdraw` over the deposit balance fails cleanly (already does) and no concurrent path can double-spend a deposit.
3. `total_requests` and per-node stats use checked increments.
4. Ledger reconciliation test passes after randomized request/cancel/fulfill sequences.

**Testing:** Randomized lifecycle property tests; overflow boundary tests for fee arithmetic.

## Workstream 4 — Repair `OnChainAggregator` credits, epsilon, and noise math

**Objective:** Compute-credit accounting must be exact, and the aggregation math must never panic or wrap.

**Problem:** In `onchain_aggregator.rs`: `calculate_noise` computes `1000i128 / (participants_count as i128)` — division by zero when `participants_count == 0` (reachable if referenced data points are absent) panics in WASM; `submit_aggregation_request` accepts an unchecked `privacy_budget` (negative allowed) and `data_point_ids` referencing points whose `epsilon_spent` is summed without bound; `update_user_credits` uses unchecked addition; `perform_sum` relies on `checked_add` (good) but `perform_average` divides `sum / count` without a zero guard; `total_epsilon_spent` can exceed the request's declared `privacy_budget`.

**Scope:** `submit_aggregation_request`, `process_aggregation`, `batch_process`, `update_user_credits`, `perform_sum`/`perform_average`/`perform_count`, `calculate_noise`, `create_dp_params`.

**Implementation:**
1. Guard `participants_count == 0` and `count == 0` in `calculate_noise` and `perform_average` with a typed error.
2. Validate `privacy_budget > 0` at submission and cap `total_epsilon_spent` at the request's budget in `process_aggregation`.
3. Use checked/saturating arithmetic for credit updates and epsilon sums; bound `data_point_ids` length (already `MAX_BATCH_SIZE`, but also validate each referenced point exists and is owned by the requester where applicable).

**Acceptance Criteria:**
1. Aggregating a request whose data points are missing returns `DataPointNotFound`, never a panic.
2. `epsilon_spent` sums exceeding the request budget are rejected.
3. Negative `privacy_budget` is rejected at submission.
4. Credit balances never go negative and never wrap.

**Testing:** Division-by-zero regression tests; epsilon-overrun tests; credit arithmetic property tests.

## Workstream 5 — Fix `DpAnalyticsContract` / `laplace_noise` DP math and budget accounting

**Objective:** Noise generation must never panic, budget accounting must be exact, and noise must not be attacker-cancellable.

**Problem:** In `src/laplace_noise.rs`: `apply_noise` checks `used_eps + query_epsilon > max_eps` — the addition can overflow in release and pass, and `query_epsilon`/`sensitivity` are unvalidated (negative `query_epsilon` shrinks the budget; `epsilon == 0` divides by zero in `laplace_noise`'s `(sensitivity * SCALE) / epsilon`); `used_eps += query_epsilon` is unchecked; `laplace_noise` derives only 32 bits of entropy from the seed hash (2^32 noise values — brute-forceable), and the seed is attacker-chosen, so an adversary can pick seeds that cancel the noise. `init` is also unauthenticated (see access-control epic).

**Scope:** `FixedPointMath` (`ln_1_minus_x`, `laplace_noise`), `apply_noise`, `refresh_budget`, `init`.

**Implementation:**
1. Validate `epsilon > 0`, `sensitivity > 0`, reject negative epsilon; guard `epsilon == 0` with a typed error.
2. Use checked/saturating arithmetic for `used_eps` and the noise computation; enforce `query_epsilon <= max_eps - used_eps` via checked subtraction.
3. Expand entropy to at least 128 bits from the hash and expand the `ln(1-x)` Taylor series (≥10 terms) with a documented error bound.
4. Derive noise from a contract-side secret/salt (not a caller-chosen seed) so noise cannot be cancelled by seed selection; document the determinism/entropy tradeoff.
5. Make budget accounting per-user (partition `UsedEpsilon` per caller) so one caller cannot drain the shared budget.

**Acceptance Criteria:**
1. `apply_noise` never panics for any `(epsilon, sensitivity)` input in valid ranges; invalid inputs return `DpError`.
2. Negative `query_epsilon` cannot decrease `UsedEpsilon`.
3. Noise distribution passes a statistical test (Kolmogorov-Smirnov, p > 0.01 over 10k samples) against the Laplace distribution for the target scale.
4. Replaying the same query with an attacker-chosen seed no longer cancels noise.
5. One caller exhausting their partition does not exhaust other callers' budgets.

**Testing:** Fuzz tests over all valid input ranges (never panics); statistical distribution tests; budget-accounting tests with multiple callers; overflow boundary tests.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. Contracts build under the overflow-checked release profile used by CI (`cargo build --target wasm32-unknown-unknown --release`); `soroban-project.yml`/CI reference the checked profile.
2. `cargo fmt --check` and `cargo clippy --lib --bins -- -D warnings` are clean.
3. `cargo test` green, including the new property/fuzz suites; property tests run in CI (see the formal-verification epic) and are not `#[ignore]`d.
4. No new bare arithmetic on stored balances/counters without a review note referencing this epic.
5. CI gates become real: `contracts-rust` Test and Build WASM steps in `.github/workflows/ci.yml` must be blocking (remove `continue-on-error: true`).
6. Cross-epic gate: every contract from the access-control epic must pass this epic's overflow-checked build and ledger-reconciliation tests.
