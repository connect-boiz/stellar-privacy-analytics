//! Initialization-auth coverage for issue #282.
//!
//! Every contract's `initialize(admin)` now calls `admin.require_auth()` so an
//! attacker cannot front-run the deployer's setup transaction and seize admin
//! by passing their own address. These tests assert, for all 7 contracts:
//!
//! * an **unsigned** `initialize` call panics with a host auth error
//!   (`Error(Auth, InvalidAction)`), and
//! * a **signed** `initialize` call succeeds and records the signer as admin.
//!
//! The unsigned/signed pair demonstrates that initialization succeeds only when
//! the supplied admin authorizes the call.

#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env, Symbol};

use crate::access_control::{DataSovereigntyAccessControl, DataSovereigntyAccessControlClient};
use crate::onchain_aggregator::{OnChainAggregator, OnChainAggregatorClient};
use crate::privacy_oracle::{PrivacyOracle, PrivacyOracleClient};
use crate::schema_enforcer::{SchemaEnforcer, SchemaEnforcerClient};
use crate::stellar_analytics::{StellarAnalytics, StellarAnalyticsClient};
use crate::ttl_storage::{TtlStorage, TtlStorageClient};
use crate::upgradeable_proxy::{UpgradeableProxy, UpgradeableProxyClient};

/// Read the admin recorded under the conventional instance-storage `admin`
/// symbol used by the six analytics/data contracts.
fn stored_admin(env: &Env, contract_id: &Address) -> Address {
    env.as_contract(contract_id, || {
        env.storage()
            .instance()
            .get(&Symbol::new(env, "admin"))
            .expect("admin must be recorded after initialize")
    })
}

// ---------------------------------------------------------------------------
// stellar_analytics
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn stellar_analytics_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(StellarAnalytics, ());
    let client = StellarAnalyticsClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    // No auth mocked: the host must reject the unsigned call.
    client.initialize(&admin);
}

#[test]
fn stellar_analytics_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StellarAnalytics, ());
    let client = StellarAnalyticsClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// privacy_oracle
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn privacy_oracle_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(PrivacyOracle, ());
    let client = PrivacyOracleClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn privacy_oracle_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(PrivacyOracle, ());
    let client = PrivacyOracleClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// access_control
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn access_control_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(DataSovereigntyAccessControl, ());
    let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn access_control_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(DataSovereigntyAccessControl, ());
    let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// ttl_storage
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn ttl_storage_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(TtlStorage, ());
    let client = TtlStorageClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn ttl_storage_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TtlStorage, ());
    let client = TtlStorageClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// onchain_aggregator
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn onchain_aggregator_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(OnChainAggregator, ());
    let client = OnChainAggregatorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn onchain_aggregator_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(OnChainAggregator, ());
    let client = OnChainAggregatorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// schema_enforcer
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn schema_enforcer_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(SchemaEnforcer, ());
    let client = SchemaEnforcerClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
fn schema_enforcer_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(SchemaEnforcer, ());
    let client = SchemaEnforcerClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(stored_admin(&env, &contract_id), admin);
}

// ---------------------------------------------------------------------------
// upgradeable_proxy (initialize takes an implementation + admin and returns a
// Result; admin is read back via the public getter)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn upgradeable_proxy_initialize_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let implementation = BytesN::from_array(&env, &[7u8; 32]);
    client.initialize(&implementation, &admin);
}

#[test]
fn upgradeable_proxy_initialize_succeeds_when_admin_signs() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(UpgradeableProxy, ());
    let client = UpgradeableProxyClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let implementation = BytesN::from_array(&env, &[7u8; 32]);
    client.initialize(&implementation, &admin);
    assert_eq!(client.admin(), admin);
}
