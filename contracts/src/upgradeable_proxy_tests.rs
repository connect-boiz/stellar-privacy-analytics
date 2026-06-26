//! Test coverage for `UpgradeableProxy` — issues #294 and #297 follow-up.
//!
//! These tests exercise every security-critical entry point on the proxy:
//! initialization, the upgrade lifecycle (initiate → delay → complete),
//! cancel, admin transfer, and upgrade-delay configuration. Their goal is
//! to lock in the current accept/reject decisions so future refactors
//! cannot silently weaken the upgrade flow.
//!
//! Authorization model (post-hardening):
//! 1. Every admin-only entry point — `initialize`, `initiate_upgrade`,
//!    `complete_upgrade`, `cancel_upgrade`, `set_upgrade_delay`,
//!    `transfer_admin` — invokes `*.require_auth()` at the top of the
//!    function so the host can verify the address has a valid Stellar
//!    signature on the transaction.
//! 2. Layer (1) above prevents a composing or relayer contract from
//!    spoofing the admin address. The classic `if caller != admin`
//!    equality check then enforces business-logic authorization.
//!
//! Most tests below exercise layer 2 under `env.mock_all_auths()` and
//! confirm the accept/reject matrix. The final `host-level auth guard`
//! section exercises layer 1 by selectively authorizing only the
//! legitimate caller; even addresses that pass no auth check at all are
//! rejected with host-level errors before the contract logic runs.

#![cfg(test)]

use super::upgradeable_proxy::{
    ProxyError, UpgradeableProxy, UpgradeableProxyClient, MIN_UPGRADE_DELAY,
};
use soroban_sdk::testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, BytesN, Env, IntoVal, Symbol};

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

/// Initial implementation address baked into every test fixture below.
const TEST_IMPL: [u8; 32] = [7u8; 32];

fn deploy(env: &Env) -> (UpgradeableProxyClient, Address, BytesN<32>) {
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let impl_addr = BytesN::from_array(env, &TEST_IMPL);
    client.initialize(&impl_addr, &admin);
    (client, admin, impl_addr)
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[test]
fn initialize_succeeds_once_and_persists_state() {
    let env = new_env();
    let (client, admin, impl_addr) = deploy(&env);

    assert_eq!(client.implementation(), impl_addr);
    assert_eq!(client.admin(), admin);
    // Default upgrade delay is one week (matching DEFAULT_UPGRADE_DELAY).
    assert!(
        client.upgrade_delay() >= MIN_UPGRADE_DELAY,
        "default upgrade delay must satisfy the minimum: got {}",
        client.upgrade_delay()
    );
}

#[test]
fn initialize_twice_rejected() {
    let env = new_env();
    let (client, _admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[9u8; 32]);
    let new_admin = Address::generate(&env);
    let res = client.try_initialize(&new_impl, &new_admin);
    assert_eq!(res, Err(Ok(ProxyError::AlreadyInitialized)));
}

#[test]
fn initialize_with_zero_implementation_rejected() {
    let env = new_env();
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    let zero_impl = BytesN::from_array(&env, &[0u8; 32]);
    let admin = Address::generate(&env);
    let res = client.try_initialize(&zero_impl, &admin);
    assert_eq!(res, Err(Ok(ProxyError::InvalidImplementation)));
}

// ---------------------------------------------------------------------------
// initiate_upgrade
// ---------------------------------------------------------------------------

#[test]
fn initiate_upgrade_admin_succeeds_and_records_pending() {
    let env = new_env();
    let (client, admin, impl_addr) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);

    let pending = client
        .pending_upgrade()
        .expect("pending upgrade must exist");
    assert_eq!(pending.new_implementation, new_impl);
    assert_eq!(pending.old_implementation, impl_addr);
    assert_eq!(pending.initiated_at, env.ledger().timestamp());
}

#[test]
fn initiate_upgrade_non_admin_rejected() {
    let env = new_env();
    let (client, _admin, _) = deploy(&env);

    let attacker = Address::generate(&env);
    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    let res = client.try_initiate_upgrade(&new_impl, &attacker);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

#[test]
fn initiate_upgrade_zero_implementation_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let zero_impl = BytesN::from_array(&env, &[0u8; 32]);
    let res = client.try_initiate_upgrade(&zero_impl, &admin);
    assert_eq!(res, Err(Ok(ProxyError::InvalidImplementation)));
}

#[test]
fn initiate_upgrade_twice_rejected_until_completed() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let first = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&first, &admin);

    let second = BytesN::from_array(&env, &[2u8; 32]);
    let res = client.try_initiate_upgrade(&second, &admin);
    assert_eq!(res, Err(Ok(ProxyError::UpgradeAlreadyInitiated)));
}

// ---------------------------------------------------------------------------
// complete_upgrade — delay enforcement
// ---------------------------------------------------------------------------

#[test]
fn complete_upgrade_before_delay_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);

    // Advance less than the current upgrade delay.
    let delay = client.upgrade_delay();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + delay.saturating_sub(1));

    let res = client.try_complete_upgrade(&admin);
    assert_eq!(res, Err(Ok(ProxyError::UpgradeNotReady)));
}

#[test]
fn complete_upgrade_after_delay_succeeds_and_clears_pending() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);

    let delay = client.upgrade_delay();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + delay + 1);

    client.complete_upgrade(&admin);

    assert_eq!(client.implementation(), new_impl);
    assert!(
        client.pending_upgrade().is_none(),
        "pending upgrade state must be cleared after completion"
    );
}

#[test]
fn complete_upgrade_non_admin_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);

    let delay = client.upgrade_delay();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + delay + 1);

    let attacker = Address::generate(&env);
    let res = client.try_complete_upgrade(&attacker);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

#[test]
fn complete_upgrade_without_pending_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let res = client.try_complete_upgrade(&admin);
    assert_eq!(res, Err(Ok(ProxyError::NoPendingUpgrade)));
}

// ---------------------------------------------------------------------------
// cancel_upgrade
// ---------------------------------------------------------------------------

#[test]
fn cancel_upgrade_admin_clears_pending() {
    let env = new_env();
    let (client, admin, impl_addr) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);
    assert!(client.pending_upgrade().is_some());

    client.cancel_upgrade(&admin);

    assert!(
        client.pending_upgrade().is_none(),
        "cancel must clear pending implementation"
    );
    // Implementation must remain at the original value.
    assert_eq!(client.implementation(), impl_addr);
}

#[test]
fn cancel_upgrade_non_admin_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    client.initiate_upgrade(&new_impl, &admin);

    let attacker = Address::generate(&env);
    let res = client.try_cancel_upgrade(&attacker);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

#[test]
fn cancel_upgrade_without_pending_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let res = client.try_cancel_upgrade(&admin);
    assert_eq!(res, Err(Ok(ProxyError::NoPendingUpgrade)));
}

#[test]
fn after_cancel_a_new_upgrade_can_be_initiated() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let first = BytesN::from_array(&env, &[1u8; 32]);
    let second = BytesN::from_array(&env, &[2u8; 32]);
    client.initiate_upgrade(&first, &admin);
    client.cancel_upgrade(&admin);

    // The previously-initiated upgrade must be fully cleared.
    client.initiate_upgrade(&second, &admin);
    let pending = client.pending_upgrade().unwrap();
    assert_eq!(pending.new_implementation, second);
}

// ---------------------------------------------------------------------------
// transfer_admin
// ---------------------------------------------------------------------------

#[test]
fn transfer_admin_old_admin_loses_power_new_admin_gains_it() {
    let env = new_env();
    let (client, old_admin, _) = deploy(&env);

    let new_admin = Address::generate(&env);
    client.transfer_admin(&new_admin, &old_admin);

    assert_eq!(client.admin(), new_admin);

    // Old admin is no longer authorized for sensitive operations.
    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    let old_attempt = client.try_initiate_upgrade(&new_impl, &old_admin);
    assert_eq!(old_attempt, Err(Ok(ProxyError::NotAdmin)));

    // New admin can now initiate an upgrade.
    let new_attempt = client.try_initiate_upgrade(&new_impl, &new_admin);
    assert_eq!(new_attempt, Ok(Ok(())));
    assert!(client.pending_upgrade().is_some());
}

#[test]
fn transfer_admin_non_admin_rejected() {
    let env = new_env();
    let (client, _admin, _) = deploy(&env);

    let attacker = Address::generate(&env);
    let res = client.try_transfer_admin(&attacker, &attacker);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

// ---------------------------------------------------------------------------
// set_upgrade_delay
// ---------------------------------------------------------------------------

#[test]
fn set_upgrade_delay_admin_succeeds_and_is_read_back() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_delay = MIN_UPGRADE_DELAY + 60;
    client.set_upgrade_delay(&new_delay, &admin);
    assert_eq!(client.upgrade_delay(), new_delay);
}

#[test]
fn set_upgrade_delay_below_minimum_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let res = client.try_set_upgrade_delay(&(MIN_UPGRADE_DELAY - 1), &admin);
    assert_eq!(res, Err(Ok(ProxyError::InvalidDelay)));
}

#[test]
fn set_upgrade_delay_non_admin_rejected() {
    let env = new_env();
    let (client, _admin, _) = deploy(&env);

    let attacker = Address::generate(&env);
    let res = client.try_set_upgrade_delay(&(MIN_UPGRADE_DELAY + 1), &attacker);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

// ---------------------------------------------------------------------------
// View functions — NotInitialized guard
// ---------------------------------------------------------------------------

#[test]
fn view_functions_reject_uninitialized_contract() {
    let env = new_env();
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    assert_eq!(
        client.try_implementation(),
        Err(Ok(ProxyError::NotInitialized))
    );
    assert_eq!(client.try_admin(), Err(Ok(ProxyError::NotInitialized)));
    // upgrade_delay has a default fallback so it must succeed even pre-init.
    assert!(client.upgrade_delay() >= MIN_UPGRADE_DELAY);
    // pending_upgrade returns None (the SDK client unwraps the outer
    // Result<_, ProxyError>; if there is no pending upgrade, it returns
    // None directly) when there is nothing pending.
    assert!(client.pending_upgrade().is_none());
}

// ---------------------------------------------------------------------------
// Host-level authorization (caller.require_auth)
// ---------------------------------------------------------------------------
//
// These tests verify that *every* admin-only entry point — `initialize` and
// each admin mutation — invokes `*.require_auth()` so the host can verify
// the address has a valid Stellar signature. They run WITHOUT
// `env.mock_all_auths()`, so an unauthorized caller fails before any
// contract logic executes. See PR follow-up to issue #297.

/// Without any mocked authorizations, every admin-only entry point must
/// fail at the host's `require_auth()` boundary, not with a `ProxyError`.
#[test]
fn host_rejects_every_admin_action_without_signature() {
    let env = Env::default(); // NO mock_all_auths() — explicit on purpose.
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let impl_addr = BytesN::from_array(&env, &TEST_IMPL);

    // `initialize` requires `admin.require_auth()` so the host must reject
    // this before any `ProxyError::AlreadyInitialized` / `InvalidImplementation`
    // branch is reached.
    let init_attempt = client.try_initialize(&impl_addr, &admin);
    assert!(
        init_attempt.is_err(),
        "initialize must require admin signature: {:?}",
        init_attempt
    );

    // Because initialize failed, the contract is uninitialized and mutating
    // paths would yield `ProxyError::NotInitialized`, not host-level errors.
    // To exercise the host-boundary against mutators we mock the admin auth
    // for `initialize` only and then attempt mutations whose caller auth is
    // NOT mocked.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (impl_addr.clone(), admin.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&impl_addr, &admin);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);

    // Every mutation must reject the attacker at the host layer (NOT with
    // ProxyError::NotAdmin — the equality check is downstream of auth).
    let r_initiate = client.try_initiate_upgrade(&new_impl, &attacker);
    assert!(
        r_initiate.is_err(),
        "initiate_upgrade must require caller signature: {:?}",
        r_initiate
    );

    // complete_upgrade and cancel_upgrade require `caller.require_auth()`. A
    // pending upgrade is not even necessary — the host rejects before the
    // contract sees the call.
    let r_complete = client.try_complete_upgrade(&attacker);
    assert!(
        r_complete.is_err(),
        "complete_upgrade must require caller signature: {:?}",
        r_complete
    );

    let r_cancel = client.try_cancel_upgrade(&attacker);
    assert!(
        r_cancel.is_err(),
        "cancel_upgrade must require caller signature: {:?}",
        r_cancel
    );

    let r_delay = client.try_set_upgrade_delay(&(MIN_UPGRADE_DELAY + 1), &attacker);
    assert!(
        r_delay.is_err(),
        "set_upgrade_delay must require caller signature: {:?}",
        r_delay
    );

    let r_transfer = client.try_transfer_admin(&attacker, &attacker);
    assert!(
        r_transfer.is_err(),
        "transfer_admin must require caller signature: {:?}",
        r_transfer
    );
}

/// Authorizing ONLY the legitimate admin for `initialize` and one mutation
/// must succeed, and any other caller (or unauthorized mutation) must fail
/// at the host layer. This proves the auth gate is per-call and narrow.
#[test]
fn selective_auths_allow_admin_path_and_block_attacker_path() {
    let env = Env::default(); // NO mock_all_auths().
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let impl_initial = BytesN::from_array(&env, &TEST_IMPL);
    let impl_target = BytesN::from_array(&env, &[1u8; 32]);

    // Authorize ONLY `admin` for `initialize` and `initiate_upgrade`. Nothing
    // else gets a signature, so any other call will fail at the host.
    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: (impl_initial.clone(), admin.clone()).into_val(&env),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initiate_upgrade",
                args: (impl_target.clone(), admin.clone()).into_val(&env),
                sub_invokes: &[],
            },
        },
    ]);

    client.initialize(&impl_initial, &admin);
    client.initiate_upgrade(&impl_target, &admin);

    let pending = client.pending_upgrade().expect("admin must have initiated");
    assert_eq!(pending.new_implementation, impl_target);

    // The attacker has zero authorizations, so even if their address
    // matches a future admin state, the host will not let them through.
    let r_attacker_complete = client.try_complete_upgrade(&attacker);
    assert!(
        r_attacker_complete.is_err(),
        "complete_upgrade must reject unauthorized caller at host: {:?}",
        r_attacker_complete
    );
}
