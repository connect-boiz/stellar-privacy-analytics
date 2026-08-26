# (Critical) On-Chain Access Control & Caller Identity: Every Soroban Contract Trusts Caller-Supplied Identity

**Epic · Smart Contracts · Contracts 1 of 5**

## Epic Summary

Five contracts derive identity from unchecked arguments or from `env.current_contract_address()`, and the multi-sig that is supposed to govern them never verifies a single signature. Net effect: an attacker can drain pooled oracle deposits, read any TTL-stored blob as if they were the owner, take over multi-sig governance, and seize differential-privacy budget control. These five workstreams are too interdependent to ship separately: the deposit/refund math in Workstream 1 is only meaningful once identity is real; the multi-sig in Workstream 2 is the admin of every other contract; Workstream 3's spoofable gaps are only closable after identity primitives exist (W1/W2); Workstream 4's permission semantics sit on top of the auth layer; and Workstream 5 is the shared release vehicle (admin rotation + freeze) that every contract must adopt at once, since shipping it per-contract leaves the rest exposed.

## Affected Components

`contracts/src/privacy_oracle.rs`, `contracts/src/admin.rs`, `contracts/src/access_control.rs`, `contracts/src/stellar_analytics.rs`, `contracts/src/ttl_storage.rs`, `contracts/src/onchain_aggregator.rs`, `src/laplace_noise.rs`, `src/data_sovereignty.rs`

---

## Workstream 1 — Repair caller identity in `PrivacyOracle` (fund-loss class)

**Objective:** Make every deposit/fee/refund operation authenticated to the actual caller so no address can spend or withdraw balances it does not own.

**Problem:** `privacy_oracle.rs` derives the user from the contract itself: `request_data` (`let requester = env.current_contract_address()`), and `add_deposit`, `withdraw`, and `cancel_request` do the same. Because every user's deposit lands in one pool keyed by the contract's own address, any caller can `withdraw(amount)` the pooled balance, and `cancel_request` refunds 50% of any request's fee into that same pool. `add_oracle_node`/`remove_oracle_node` compare the derived address against the stored `admin` (an external address) — the equality can never hold, so oracle onboarding is permanently broken and, worse, the admin check authenticates nothing.

**Scope:** All mutating entry points in `privacy_oracle.rs`: `request_data`, `fulfill_request`, `cancel_request`, `add_oracle_node`, `remove_oracle_node`, `add_deposit`, `withdraw`.

**Implementation:**
1. Add an explicit `caller: Address` argument to every mutating function and call `caller.require_auth()` (the pattern already adopted in `stellar_analytics.rs`).
2. Key deposits per-address; reject `withdraw`/`cancel_request` unless the caller owns the request/balance.
3. Require `amount > 0`, `fee` bounds checks, and reject negative `privacy_level`.
4. Admin-gated `add_oracle_node`/`remove_oracle_node` must authenticate the real admin and revoke nodes from the active list.

**Acceptance Criteria:**
1. A stranger calling `withdraw` on a deposit owned by another address is rejected.
2. Deposits are no longer pooled: `get_user_deposit(A)` is unaffected by `add_deposit(B)`.
3. `add_oracle_node`/`remove_oracle_node` succeed only with the admin's signature.
4. `cancel_request` refunds only the requester's own balance.
5. Negative or zero `amount`/`fee` inputs are rejected with `InvalidFee`.

**Testing:** Rust unit tests with `mock_auths` for happy paths; spoofing regression tests (stranger `withdraw`, stranger `cancel_request`, admin-op without admin auth) asserting host-level `Auth` panics or contract errors.

## Workstream 2 — MultiSigAdmin host-level authentication (governance takeover)

**Objective:** Make the multi-sig actually require signatures so no single caller can assume governance.

**Problem:** `contracts/src/admin.rs` contains zero `require_auth()` calls. `add_owner`, `remove_owner`, `change_threshold`, `submit_transaction`, `confirm_transaction`, and `execute_transaction` accept any `caller` argument and check only list membership via `is_owner`. Any caller passes an owner's address: add themselves as owner, drop the threshold to 1, and execute transactions. `initialize` also performs no auth, so the deployer's setup can be front-run and the contract initialized with attacker-chosen owners.

**Scope:** Entire `admin.rs`, including `initialize` and the confirmation/execution state machine.

**Implementation:**
1. Call `caller.require_auth()` in every mutating entry point before any ownership check.
2. Require each `owner` to authorize `initialize` (all owners, or at least threshold), and reject re-initialization.
3. Reject duplicate confirmations and executed transactions; bind the transaction hash to the nonce so replays fail.
4. `execute_transaction` must validate threshold against a deduplicated confirmation set.

**Acceptance Criteria:**
1. Impersonating an owner (passing their address as `caller` without their signature) fails with a host auth error.
2. `change_threshold` requires the caller's own signature.
3. Front-run `initialize` by an attacker is impossible (first initializer is authenticated).
4. A transaction cannot be executed twice; confirmations are unique per owner.
5. Threshold changes below the owner count are rejected.

**Testing:** Mock-auth negative tests (drop all auths, expect `Auth InvalidAction` panics); threshold-lifecycle tests; nonce/replay tests.

## Workstream 3 — Close spoofable authorization gaps across all contracts

**Objective:** No function may accept a victim's address as owner/admin/requester and act on it without that address's signature.

**Problem:**
- `stellar_analytics.rs` `register_dataset`/`create_dataset_version` accept an `uploader` argument with no `require_auth` — an attacker registers datasets attributed to victims, which breaks the consent flow (the "owner" can never sign) and pollutes the registry.
- `access_control.rs` `register_resource` authenticates nothing: `env.current_contract_address() != admin` is always true, so the check collapses to `is_authorized(owner)` (i.e., `owner == admin`), letting anyone register resources with the admin's address as owner.
- `ttl_storage.rs` `retrieve_data` and `bump_instance_ttl` compare the `requester` argument to the stored owner with **no** `require_auth` — anyone passes the owner's address to read stored blobs or to drain the owner's storage credits via TTL extension.
- `ttl_storage.rs` `cleanup_expired_data` trusts a spoofable `worker` argument; `onchain_aggregator.rs` `process_aggregation`/`batch_process` compare `processor != admin` with no auth; `src/laplace_noise.rs` `init` has no auth and no "already initialized" guard, so anyone can seize admin and set `MaxEpsilon`/reset `UsedEpsilon` at will.

**Scope:** The listed entry points across `stellar_analytics.rs`, `access_control.rs`, `ttl_storage.rs`, `onchain_aggregator.rs`, `laplace_noise.rs`.

**Implementation:** For each entry point, add the correct `require_auth` (uploader, owner, admin, or worker), fix the dead `current_contract_address` comparisons to authenticate a real caller, and add an init guard to `laplace_noise.rs` `init`.

**Acceptance Criteria:**
1. Registering a dataset with a victim's address as uploader fails without the victim's signature.
2. `register_resource` with spoofed `owner = admin` fails; only an authenticated admin can register resources for the admin.
3. `retrieve_data` as a stranger fails even when passing the owner's address.
4. `bump_instance_ttl` cannot deduct credits from a non-consenting account.
5. `cleanup_expired_data` runs only by the authenticated worker.
6. `process_aggregation`/`batch_process` reject a spoofed `processor = admin`.
7. `laplace_noise.rs` `init` cannot be called twice or by non-admin.

**Testing:** One parameterized spoofing suite: for each function, invoke with a victim's address and no auth, assert rejection; then invoke with correct auth, assert success.

## Workstream 4 — Enforce multi-sig & permission semantics and wire `MultiSigAdmin` as admin-of-record

**Objective:** Multi-sig and permission declarations must be enforced, and the admin of every contract must be the (now-secured) multi-sig.

**Problem:** `access_control.rs` records `requires_multi_sig`, `multi_sig_threshold`, and `authorized_signers`, but `grant_access`, `revoke_access`, and `create_access_key` never check them — a single signer can mutate a multi-sig-protected resource. `has_permission_level` lets `Admin` cover everything but nothing re-validates the grantee's permission at use time against current signer state. Every other contract stores a single `admin` address in instance storage with no relationship to the multi-sig.

**Scope:** `access_control.rs` enforcement paths plus admin wiring in `stellar_analytics.rs`, `privacy_oracle.rs`, `ttl_storage.rs`, `onchain_aggregator.rs`, `laplace_noise.rs`.

**Implementation:**
1. In `grant_access`/`revoke_access`/`create_access_key`, when `requires_multi_sig`, require `multi_sig_threshold` distinct authenticated signer signatures before mutating.
2. Re-check key/permission expiry inside `check_access` (not only on creation) so stale grants cannot be used after `cleanup_expired` gaps.
3. Replace each contract's standalone `admin` with the `MultiSigAdmin` contract address and route admin actions through it (or mirror its decision via a shared view).

**Acceptance Criteria:**
1. Granting access on a multi-sig resource with fewer than threshold signatures fails.
2. Threshold-sized signature sets from distinct authorized signers succeed.
3. Expired keys return `AccessExpired`/denied even if `cleanup_expired` has not run.
4. Each contract's admin action validates against the multi-sig.
5. No contract accepts a single compromised key as admin without the multi-sig path.

**Testing:** N-of-M signature tests; expired-grant tests with ledger time manipulation; cross-contract admin routing tests.

## Workstream 5 — Shared `AdminRights` module: rotation, transfer, emergency freeze

**Objective:** Give every contract a common, auditable admin layer with rotation, two-step transfer, and a global freeze so a compromised key is recoverable and incidents are containable.

**Problem:** Every contract stores `admin` in instance storage with no rotation, no transfer, and no emergency freeze; a compromised admin key is permanent and unrecoverable, and there is no way to halt mutating operations during an incident.

**Scope:** New shared module (e.g., `contracts/src/admin_rights.rs` or in the existing `admin.rs` family), adopted by all contracts.

**Implementation:**
1. Implement `AdminRights`: one-time `initialize`, `propose_admin` + `accept_admin` two-step transfer, `freeze`/`unfreeze`.
2. Add a shared `ensure_not_frozen` guard invoked at the top of every mutating entry point across contracts.
3. Emit canonical events (`admin_transferred`, `admin_proposed`, `freeze_activated`, `freeze_cleared`) with old/new addresses and timestamps.
4. Keep read-only view functions unfrozen so monitoring and audits continue during an incident.

**Acceptance Criteria:**
1. Admin transfer requires propose + accept from the new address; the old admin cannot transfer to themselves.
2. `freeze` blocks all mutating entry points in every contract; reads still work.
3. `unfreeze` restores operations and emits the event.
4. All admin actions appear in contract events for off-chain indexers.
5. No contract can bypass the freeze by calling another contract's entry point.

**Testing:** Lifecycle tests (init → propose → accept → transfer), freeze/unfreeze across all contracts, and event-emission assertions.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `cargo build --target wasm32-unknown-unknown --release` succeeds for `contracts/` and root `Cargo.toml`; wasm size deltas reported per contract.
2. `cargo fmt --check` and `cargo clippy --lib --bins -- -D warnings` are clean.
3. `cargo test` is green including the new spoofing, impersonation, and N-of-M suites; no `#[should_panic]` test relies on `mock_all_auths` to mask missing auth (each spoof test must use explicit `mock_auths` with dropped auths).
4. CI gates become real: remove `continue-on-error: true` from the `contracts-rust` Test and Build WASM steps in `.github/workflows/ci.yml`, and make `rust-extras` the same.
5. Cross-epic gate: all contracts built in this epic must compile under the overflow-checks release profile introduced in the arithmetic epic (Contracts Issue 2) — a contract that only passes because arithmetic silently wraps is not shippable.
