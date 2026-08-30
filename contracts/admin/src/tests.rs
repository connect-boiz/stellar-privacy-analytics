//! WS1 (issue #412) acceptance tests for `MultiSigAdmin`.
//!
//! Every mutating entry point enforces host-level authentication on the
//! explicitly-passed caller — never argument equality alone. These tests prove
//! initialization cannot be front-run and an attacker cannot impersonate an
//! owner by passing their address as `caller`.

#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::MockAuth;
use soroban_sdk::testutils::MockAuthInvoke;
use soroban_sdk::{Address, Env, IntoVal, Val, Vec};

use crate::{MultiSigAdmin, MultiSigAdminClient, MultiSigError};

/// Authorize ONLY the given owner for `initialize(owners, threshold)`.
fn mock_init_auth(
    env: &Env,
    contract_id: &Address,
    owners: &Vec<Address>,
    threshold: u32,
    signing: &Address,
) {
    let args: Vec<Val> =
        Vec::from_array(env, [owners.clone().into_val(env), threshold.into_val(env)]);
    env.mock_auths(&[MockAuth {
        address: signing,
        invoke: &MockAuthInvoke {
            contract: contract_id,
            fn_name: "initialize",
            args,
            sub_invokes: &[],
        },
    }]);
}

/// WS1: `initialize` requires EVERY listed owner's signature. A front-run
/// initialization that lists victims as owners without their signatures is
/// rejected by the host.
#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_initialize_requires_each_owner_signature() {
    let env = Env::default();
    let contract_id = env.register(MultiSigAdmin, ());
    let client = MultiSigAdminClient::new(&env, &contract_id);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);

    let mut owners = Vec::new(&env);
    owners.push_back(owner1.clone());
    owners.push_back(owner2.clone());

    // Only owner1 authorizes — owner2's consent is missing.
    mock_init_auth(&env, &contract_id, &owners, 1, &owner1);
    client.initialize(&owners, &1u32);
}

/// WS1 acceptance: `initialize` cannot be front-run — the first legitimate
/// initialization wins and a second, attacker-supplied one is rejected.
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

    let mut attacker_owners = Vec::new(&env);
    attacker_owners.push_back(Address::generate(&env));
    let res = client.try_initialize(&attacker_owners, &1u32);
    assert_eq!(res, Err(Ok(MultiSigError::AlreadyInitialized)));
}

/// WS1 acceptance: a non-owner cannot execute `add_owner` by passing an
/// owner's address as `caller` — host auth rejects it without the owner's
/// signature, even though `is_owner(owner)` is true.
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

    // Authorize both owners for the legitimate initialization.
    let args: Vec<Val> =
        Vec::from_array(&env, [owners.clone().into_val(&env), (2u32).into_val(&env)]);
    env.mock_auths(&[
        MockAuth {
            address: &owner1,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: args.clone(),
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &owner2,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args,
                sub_invokes: &[],
            },
        },
    ]);
    client.initialize(&owners, &2u32);

    // Drop all auths: the attacker passes `owner1` as caller without owner1's
    // signature — the host must reject the call.
    env.mock_auths(&[]);
    client.add_owner(&new_owner, &owner1);
}
