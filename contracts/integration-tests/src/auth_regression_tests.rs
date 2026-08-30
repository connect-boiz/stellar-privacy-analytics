//! Auth-regression coverage for issue #412 Workstream 1.
//!
//! Every mutating entry point now enforces host-level authentication
//! (`Address::require_auth`) on the actor argument instead of trusting
//! `env.current_contract_address()` or argument equality alone. These tests
//! prove that passing a victim/admin address as the caller WITHOUT their
//! signature is rejected by the host with `Error(Auth, InvalidAction)`.

#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::MockAuth;
use soroban_sdk::testutils::MockAuthInvoke;
use soroban_sdk::{Address, BytesN, Env, IntoVal, String, Val, Vec};

use access_control::{DataSovereigntyAccessControl, DataSovereigntyAccessControlClient};
use admin::{MultiSigAdmin, MultiSigAdminClient};
use onchain_aggregator::{
    AggregationOperation, AggregationRequest, DataPoint, OnChainAggregator, OnChainAggregatorClient,
};
use privacy_oracle::{PrivacyOracle, PrivacyOracleClient};
use stellar_analytics::{StellarAnalytics, StellarAnalyticsClient};
use ttl_storage::{TtlStorage, TtlStorageClient};

/// Authorize ONLY `initialize(admin)` and then call `client.initialize`.
fn init_only(env: &Env, contract_id: &Address, fn_name: &str, args: Vec<Val>, admin: &Address) {
    env.mock_auths(&[MockAuth {
        address: admin,
        invoke: &MockAuthInvoke {
            contract: contract_id,
            fn_name,
            args,
            sub_invokes: &[],
        },
    }]);
}

// ---------------------------------------------------------------------------
// privacy_oracle
// ---------------------------------------------------------------------------

/// WS1 acceptance: an attacker cannot call `add_oracle_node(admin, node)`
/// without the admin's signature — previously the caller was derived from
/// `current_contract_address()` so on-boarding was impossible AND spoofable.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_add_oracle_node_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(PrivacyOracle, ());
    let client = PrivacyOracleClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let node = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    // Drop all auths: the attacker passes `admin` as caller without a signature.
    env.mock_auths(&[]);
    client.add_oracle_node(&admin, &node, &String::from_str(&env, "http://evil.local"));
}

/// WS1: `request_data` requires the requester's signature (fees must be
/// debited from the real requester, not the contract).
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_request_data_requires_requester_signature() {
    let env = Env::default();
    let contract_id = env.register(PrivacyOracle, ());
    let client = PrivacyOracleClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    let data_source = String::from_str(&env, "market_data");
    let data_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.request_data(&admin, &data_source, &data_hash, &2u32);
}

/// WS1: `withdraw` requires the depositor's signature (previously the actor
/// was the contract itself, permanently locking user funds in).
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_withdraw_requires_depositor_signature() {
    let env = Env::default();
    let contract_id = env.register(PrivacyOracle, ());
    let client = PrivacyOracleClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    client.withdraw(&admin, &1i128);
}

// ---------------------------------------------------------------------------
// admin (MultiSigAdmin)
// ---------------------------------------------------------------------------

/// WS1: `initialize` requires every owner's signature, so a front-run
/// initialization cannot register victims as owners.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_initialize_requires_owner_signatures() {
    let env = Env::default();
    let contract_id = env.register(MultiSigAdmin, ());
    let client = MultiSigAdminClient::new(&env, &contract_id);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);

    let mut owners = Vec::new(&env);
    owners.push_back(owner1.clone());
    owners.push_back(owner2.clone());

    let init_args: Vec<Val> =
        Vec::from_array(&env, [owners.clone().into_val(&env), (1u32).into_val(&env)]);
    // Authorize ONLY owner1 — owner2's consent is missing, so the host must
    // reject the call.
    env.mock_auths(&[MockAuth {
        address: &owner1,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: init_args,
            sub_invokes: &[],
        },
    }]);
    client.initialize(&owners, &1u32);
}

/// WS1 acceptance: `initialize` cannot be front-run — the first legitimate
/// initialization wins; a second, attacker-supplied one is rejected.
#[test]
fn test_initialize_first_wins_second_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultiSigAdmin, ());
    let client = MultiSigAdminClient::new(&env, &contract_id);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);

    let mut owners = Vec::new(&env);
    owners.push_back(owner1.clone());
    owners.push_back(owner2.clone());
    client.initialize(&owners, &2u32);
    assert!(client.is_owner(&owner1));

    // Attacker's second init with a different owner set is rejected.
    let mut attacker_owners = Vec::new(&env);
    let attacker = Address::generate(&env);
    attacker_owners.push_back(attacker.clone());
    let res = client.try_initialize(&attacker_owners, &1u32);
    assert_eq!(res, Err(Ok(admin::MultiSigError::AlreadyInitialized)));
}

/// WS1 acceptance: a non-owner cannot execute `add_owner` by passing an
/// owner's address as `caller` — host auth rejects it without the owner's
/// signature.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_add_owner_rejects_spoofed_caller() {
    let env = Env::default();
    let contract_id = env.register(MultiSigAdmin, ());
    let client = MultiSigAdminClient::new(&env, &contract_id);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let mut owners = Vec::new(&env);
    owners.push_back(owner1.clone());
    owners.push_back(owner2.clone());

    let init_args: Vec<Val> =
        Vec::from_array(&env, [owners.clone().into_val(&env), (2u32).into_val(&env)]);
    env.mock_auths(&[
        MockAuth {
            address: &owner1,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args.clone(),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &owner2,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        },
    ]);
    client.initialize(&owners, &2u32);

    // Drop all auths: the attacker passes `owner1` as caller without owner1's
    // signature. The host must reject it even though `is_owner(owner1)` is true.
    env.mock_auths(&[]);
    client.add_owner(&new_owner, &owner1);
}

// ---------------------------------------------------------------------------
// access_control
// ---------------------------------------------------------------------------

/// WS1: `register_resource` requires the admin's signature.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_register_resource_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(DataSovereigntyAccessControl, ());
    let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let resource_id = BytesN::<32>::from_array(&env, &[1u8; 32]);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    let signers = Vec::new(&env);
    client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);
}

/// WS1: a non-admin caller is rejected by `register_resource` (in-contract
/// equality check).
#[test]
fn test_register_resource_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(DataSovereigntyAccessControl, ());
    let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let owner = Address::generate(&env);
    let resource_id = BytesN::<32>::from_array(&env, &[1u8; 32]);

    client.initialize(&admin);
    let signers = Vec::new(&env);
    let res =
        client.try_register_resource(&attacker, &resource_id, &owner, &false, &1u32, &signers);
    assert_eq!(
        res,
        Err(Ok(access_control::AccessControlError::Unauthorized))
    );
}

/// WS3/WS5: `cleanup_expired` requires the admin's signature (previously
/// unauthenticated — anyone could rewrite permission/key state).
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_cleanup_expired_requires_admin_signature() {
    let env = Env::default();
    let contract_id = env.register(DataSovereigntyAccessControl, ());
    let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    client.cleanup_expired(&admin);
}

// ---------------------------------------------------------------------------
// stellar_analytics
// ---------------------------------------------------------------------------

/// WS1 acceptance: `register_dataset` requires the uploader's signature so a
/// dataset cannot be registered under a victim's identity.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_register_dataset_requires_uploader_signature() {
    let env = Env::default();
    let contract_id = env.register(StellarAnalytics, ());
    let client = StellarAnalyticsClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let victim = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    let cid = String::from_str(&env, "QmTest12345678901234567");
    let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let no_key: Option<BytesN<32>> = None;
    client.register_dataset(
        &cid,
        &dataset_hash,
        &victim,
        &1024u64,
        &false,
        &1u32,
        &no_key,
    );
}

/// WS1: `create_dataset_version` requires the uploader's signature.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_create_dataset_version_requires_uploader_signature() {
    let env = Env::default();
    let contract_id = env.register(StellarAnalytics, ());
    let client = StellarAnalyticsClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let victim = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    // Register an existing dataset as the victim (auth mocked for setup).
    env.mock_all_auths();
    let old_cid = String::from_str(&env, "QmTest12345678901234567");
    let old_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let no_key: Option<BytesN<32>> = None;
    client.register_dataset(
        &old_cid, &old_hash, &victim, &1024u64, &false, &1u32, &no_key,
    );

    // Drop all auths: version creation under the victim's identity must fail.
    env.mock_auths(&[]);
    let new_cid = String::from_str(&env, "QmTest9999999999999999999");
    let new_hash = BytesN::<32>::from_array(&env, &[2u8; 32]);
    client.create_dataset_version(&old_cid, &new_cid, &new_hash, &victim, &2048u64, &no_key);
}

// ---------------------------------------------------------------------------
// onchain_aggregator
// ---------------------------------------------------------------------------

/// WS3: `process_aggregation` requires the processor's signature — a spoofed
/// `processor` argument can no longer be replayed to burn gas.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_process_aggregation_requires_processor_signature() {
    let env = Env::default();
    let contract_id = env.register(OnChainAggregator, ());
    let client = OnChainAggregatorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    // Seed a pending request + data point directly (no auth involved).
    let request_id = BytesN::<32>::from_array(&env, &[9u8; 32]);
    let data_id = BytesN::<32>::from_array(&env, &[8u8; 32]);
    let data_point = DataPoint {
        data_id: data_id.clone(),
        value: soroban_sdk::Bytes::from_slice(&env, &[1u8; 16]),
        provider_id: admin.clone(),
        timestamp: env.ledger().timestamp(),
        data_hash: BytesN::<32>::from_array(&env, &[7u8; 32]),
        epsilon_spent: 10i128,
    };
    let mut data_points = Vec::new(&env);
    data_points.push_back(data_id.clone());
    let request = AggregationRequest {
        request_id: request_id.clone(),
        requester: admin.clone(),
        operation: AggregationOperation::Count,
        data_points,
        privacy_budget: 1000i128,
        timestamp: env.ledger().timestamp(),
        status: String::from_str(&env, "pending"),
        compute_credits_used: 0i128,
        batch_id: None,
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&data_id, &data_point);
        env.storage().persistent().set(&request_id, &request);
    });

    // Drop all auths: passing `admin` as processor without a signature must fail.
    env.mock_auths(&[]);
    client.process_aggregation(&request_id, &admin);
}

// ---------------------------------------------------------------------------
// ttl_storage
// ---------------------------------------------------------------------------

/// WS1/WS4: `cleanup_expired_data` requires the cleanup worker's signature.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_cleanup_requires_worker_signature() {
    let env = Env::default();
    let contract_id = env.register(TtlStorage, ());
    let client = TtlStorageClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
    init_only(&env, &contract_id, "initialize", init_args, &admin);
    client.initialize(&admin);

    env.mock_auths(&[]);
    client.cleanup_expired_data(&admin);
}
