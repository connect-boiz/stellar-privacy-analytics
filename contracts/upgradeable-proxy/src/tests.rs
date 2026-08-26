//! Test coverage for `UpgradeableProxy` — issues #297 and #412 (WS4).
//!
//! The proxy calls `caller.require_auth()` on every mutating function before
//! the equality check against the stored admin (issue #297). Issue #412 adds:
//! a verified-implementation registry (`register_implementation` + upgrade
//! gating), storage-layout version compatibility checks on `complete_upgrade`,
//! and a two-step admin transfer (propose via `transfer_admin`, then
//! `accept_admin_transfer` by the proposed admin).

#![cfg(test)]

use super::{
    ProxyError, UpgradeableProxy, UpgradeableProxyClient, MIN_UPGRADE_DELAY, STORAGE_VERSION,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::testutils::MockAuth;
use soroban_sdk::testutils::MockAuthInvoke;
use soroban_sdk::{Address, BytesN, Env, IntoVal, Val, Vec};

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

/// An uninitialized env without mock_all_auths for host-auth tests.
fn raw_env() -> Env {
    Env::default()
}

/// Initial implementation address baked into every test fixture below.
const TEST_IMPL: [u8; 32] = [7u8; 32];

fn deploy(env: &Env) -> (UpgradeableProxyClient<'_>, Address, BytesN<32>) {
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let impl_addr = BytesN::from_array(env, &TEST_IMPL);
    client.initialize(&impl_addr, &admin);
    (client, admin, impl_addr)
}

/// Register `hash` as a verified implementation requiring `version`.
fn register_impl(
    client: &UpgradeableProxyClient<'_>,
    admin: &Address,
    hash: &BytesN<32>,
    version: u32,
) {
    client.register_implementation(admin, hash, &version);
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
    assert_eq!(client.storage_version(), STORAGE_VERSION);
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
// register_implementation
// ---------------------------------------------------------------------------

#[test]
fn register_implementation_admin_succeeds() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    register_impl(&client, &admin, &hash, 1);
}

#[test]
fn register_implementation_non_admin_rejected() {
    let env = new_env();
    let (client, _admin, _) = deploy(&env);

    let attacker = Address::generate(&env);
    let hash = BytesN::from_array(&env, &[1u8; 32]);
    let res = client.try_register_implementation(&attacker, &hash, &1u32);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));
}

#[test]
fn register_implementation_zero_hash_or_version_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
    assert_eq!(
        client.try_register_implementation(&admin, &zero_hash, &1u32),
        Err(Ok(ProxyError::InvalidImplementation))
    );

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    assert_eq!(
        client.try_register_implementation(&admin, &hash, &0u32),
        Err(Ok(ProxyError::InvalidImplementation))
    );
}

// ---------------------------------------------------------------------------
// initiate_upgrade
// ---------------------------------------------------------------------------

#[test]
fn initiate_upgrade_admin_succeeds_and_records_pending() {
    let env = new_env();
    let (client, admin, impl_addr) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    register_impl(&client, &admin, &new_impl, 1);
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

/// WS4 acceptance: an implementation hash that was never registered/verified
/// cannot be pointed to as an upgrade target.
#[test]
fn initiate_upgrade_unregistered_implementation_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let unregistered = BytesN::from_array(&env, &[1u8; 32]);
    let res = client.try_initiate_upgrade(&unregistered, &admin);
    assert_eq!(res, Err(Ok(ProxyError::UnregisteredImplementation)));
}

#[test]
fn initiate_upgrade_twice_rejected_until_completed() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let first = BytesN::from_array(&env, &[1u8; 32]);
    register_impl(&client, &admin, &first, 1);
    client.initiate_upgrade(&first, &admin);

    let second = BytesN::from_array(&env, &[2u8; 32]);
    register_impl(&client, &admin, &second, 1);
    let res = client.try_initiate_upgrade(&second, &admin);
    assert_eq!(res, Err(Ok(ProxyError::UpgradeAlreadyInitiated)));
}

// ---------------------------------------------------------------------------
// complete_upgrade — delay + storage-version enforcement
// ---------------------------------------------------------------------------

#[test]
fn complete_upgrade_before_delay_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    register_impl(&client, &admin, &new_impl, 1);
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
    register_impl(&client, &admin, &new_impl, 1);
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

/// WS4 acceptance: `complete_upgrade` is rejected when the pending
/// implementation's required storage version differs from the current layout.
#[test]
fn complete_upgrade_rejects_storage_version_mismatch() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    // Registered as requiring a FUTURE storage version — incompatible.
    register_impl(&client, &admin, &new_impl, STORAGE_VERSION + 1);
    client.initiate_upgrade(&new_impl, &admin);

    let delay = client.upgrade_delay();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + delay + 1);

    let res = client.try_complete_upgrade(&admin);
    assert_eq!(res, Err(Ok(ProxyError::StorageVersionMismatch)));

    // Implementation must remain unchanged.
    assert_eq!(
        client.implementation(),
        BytesN::from_array(&env, &TEST_IMPL)
    );
}

#[test]
fn complete_upgrade_non_admin_rejected() {
    let env = new_env();
    let (client, admin, _) = deploy(&env);

    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    register_impl(&client, &admin, &new_impl, 1);
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
    register_impl(&client, &admin, &new_impl, 1);
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
    register_impl(&client, &admin, &new_impl, 1);
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
    register_impl(&client, &admin, &first, 1);
    register_impl(&client, &admin, &second, 1);
    client.initiate_upgrade(&first, &admin);
    client.cancel_upgrade(&admin);

    // The previously-initiated upgrade must be fully cleared.
    client.initiate_upgrade(&second, &admin);
    let pending = client.pending_upgrade().unwrap();
    assert_eq!(pending.new_implementation, second);
}

// ---------------------------------------------------------------------------
// transfer_admin — two-step (propose + accept)
// ---------------------------------------------------------------------------

/// WS4 acceptance: `transfer_admin` is only a proposal — the new admin gains
/// power only after `accept_admin_transfer`.
#[test]
fn transfer_admin_requires_acceptance_before_new_admin_acts() {
    let env = new_env();
    let (client, old_admin, _) = deploy(&env);

    let new_admin = Address::generate(&env);
    client.transfer_admin(&new_admin, &old_admin);

    // Admin has NOT changed yet.
    assert_eq!(client.admin(), old_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    // The proposed admin accepts.
    client.accept_admin_transfer(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);

    // Old admin is no longer authorized for sensitive operations.
    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    let old_attempt = client.try_initiate_upgrade(&new_impl, &old_admin);
    assert_eq!(old_attempt, Err(Ok(ProxyError::NotAdmin)));

    // New admin can now initiate an upgrade.
    let new_attempt = client.try_initiate_upgrade(&new_impl, &new_admin);
    assert_eq!(new_attempt, Err(Ok(ProxyError::UnregisteredImplementation)));
}

#[test]
fn accept_admin_transfer_rejected_for_non_proposed() {
    let env = new_env();
    let (client, old_admin, _) = deploy(&env);

    let new_admin = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.transfer_admin(&new_admin, &old_admin);

    let res = client.try_accept_admin_transfer(&stranger);
    assert_eq!(res, Err(Ok(ProxyError::NotAdmin)));

    // Admin unchanged.
    assert_eq!(client.admin(), old_admin);
}

#[test]
fn accept_admin_transfer_without_proposal_rejected() {
    let env = new_env();
    let (client, _old_admin, _) = deploy(&env);

    let stranger = Address::generate(&env);
    let res = client.try_accept_admin_transfer(&stranger);
    assert_eq!(res, Err(Ok(ProxyError::NoPendingAdminTransfer)));
}

#[test]
fn transfer_admin_twice_rejected_until_accepted() {
    let env = new_env();
    let (client, old_admin, _) = deploy(&env);

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    client.transfer_admin(&first, &old_admin);

    let res = client.try_transfer_admin(&second, &old_admin);
    assert_eq!(res, Err(Ok(ProxyError::PendingAdminAlreadySet)));
}

#[test]
fn cancel_admin_transfer_clears_proposal() {
    let env = new_env();
    let (client, old_admin, _) = deploy(&env);

    let new_admin = Address::generate(&env);
    client.transfer_admin(&new_admin, &old_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    client.cancel_admin_transfer(&old_admin);
    assert_eq!(client.pending_admin(), None);
    assert_eq!(client.admin(), old_admin);
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
    // pending_upgrade returns None when there is nothing pending.
    assert_eq!(client.pending_upgrade(), None);
    // storage_version falls back to the current layout version.
    assert_eq!(client.storage_version(), STORAGE_VERSION);
}

// ---------------------------------------------------------------------------
// Host-level auth rejection — #[should_panic] tests for issues #297/#412
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn initiate_upgrade_panics_when_admin_provides_no_signature() {
    let env = raw_env();
    let admin = Address::generate(&env);
    let impl_addr = BytesN::from_array(&env, &TEST_IMPL);
    let new_impl = BytesN::from_array(&env, &[1u8; 32]);

    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    // Authorize initialize + register_implementation only.
    let init_args: Vec<Val> = Vec::from_array(
        &env,
        [
            impl_addr.clone().into_val(&env),
            admin.clone().into_val(&env),
        ],
    );
    let reg_args: Vec<Val> = Vec::from_array(
        &env,
        [
            admin.clone().into_val(&env),
            new_impl.clone().into_val(&env),
            (1u32).into_val(&env),
        ],
    );
    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_implementation",
                args: reg_args,
                sub_invokes: &[],
            },
        },
    ]);
    client.initialize(&impl_addr, &admin);
    client.register_implementation(&admin, &new_impl, &1u32);

    // Drop all auths — the next call has zero authorization.
    env.mock_auths(&[]);

    // This MUST panic with a host auth error.
    client.initiate_upgrade(&new_impl, &admin);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn complete_upgrade_panics_when_admin_provides_no_signature() {
    let env = raw_env();
    let admin = Address::generate(&env);
    let impl_addr = BytesN::from_array(&env, &TEST_IMPL);

    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    // Authorize initialize + register_implementation + initiate_upgrade.
    let init_args: Vec<Val> = Vec::from_array(
        &env,
        [
            impl_addr.clone().into_val(&env),
            admin.clone().into_val(&env),
        ],
    );
    let new_impl = BytesN::from_array(&env, &[1u8; 32]);
    let reg_args: Vec<Val> = Vec::from_array(
        &env,
        [
            admin.clone().into_val(&env),
            new_impl.clone().into_val(&env),
            (1u32).into_val(&env),
        ],
    );
    let init_upg_args: Vec<Val> = Vec::from_array(
        &env,
        [
            new_impl.clone().into_val(&env),
            admin.clone().into_val(&env),
        ],
    );
    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_implementation",
                args: reg_args,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initiate_upgrade",
                args: init_upg_args,
                sub_invokes: &[],
            },
        },
    ]);
    client.initialize(&impl_addr, &admin);
    client.register_implementation(&admin, &new_impl, &1u32);
    client.initiate_upgrade(&new_impl, &admin);

    // Advance past the upgrade delay.
    let delay = client.upgrade_delay();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + delay + 1);

    // Drop all auths.
    env.mock_auths(&[]);

    // This MUST panic with a host auth error.
    client.complete_upgrade(&admin);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn transfer_admin_panics_when_admin_provides_no_signature() {
    let env = raw_env();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let impl_addr = BytesN::from_array(&env, &TEST_IMPL);

    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);

    // Authorize ONLY the initialize call.
    let init_args: Vec<Val> = Vec::from_array(
        &env,
        [
            impl_addr.clone().into_val(&env),
            admin.clone().into_val(&env),
        ],
    );
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: init_args,
            sub_invokes: &[],
        },
    }]);
    client.initialize(&impl_addr, &admin);

    // Drop all auths.
    env.mock_auths(&[]);

    // This MUST panic with a host auth error.
    client.transfer_admin(&new_admin, &admin);
}
