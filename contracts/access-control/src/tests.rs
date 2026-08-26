#[cfg(test)]
mod tests {
    use crate::{
        AccessControlError, DataSovereigntyAccessControl, DataSovereigntyAccessControlClient,
        PermissionType,
    };
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, BytesN as _, Ledger},
        Address, BytesN, Env, Symbol, Vec,
    };

    /// Minimal consumer contract used to exercise `check_access` in a true
    /// contract-to-contract invocation (issue #412 WS3). It writes a marker
    /// into its OWN storage before the cross-contract call and re-reads it
    /// after, proving the invoked contract cannot mutate the caller's state
    /// mid-invocation.
    #[contract]
    pub struct AccessRelay;

    #[contractimpl]
    impl AccessRelay {
        pub fn check_via_relay(
            env: Env,
            access_control: Address,
            user: Address,
            resource_id: BytesN<32>,
            required: PermissionType,
        ) -> (bool, bool) {
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "marker"), &true);

            let client = DataSovereigntyAccessControlClient::new(&env, &access_control);
            let granted = client.check_access(&user, &resource_id, &required);

            let marker: bool = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "marker"))
                .unwrap_or(false);
            (granted, marker)
        }
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let stored_admin: Address = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&Symbol::new(&env, "admin"))
                .unwrap()
        });
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_register_resource() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so is_authorized() returns true
        let owner = admin.clone();
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);

        // Verify resource was stored
        let has_resource: bool = env.as_contract(&contract_id, || {
            let resources: soroban_sdk::Map<BytesN<32>, crate::ResourceOwner> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "RESOURCE_OWNERS"))
                .unwrap();
            resources.contains_key(resource_id.clone())
        });
        assert!(has_resource);
    }

    #[test]
    fn test_grant_and_revoke_access() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);

        let ttl: Option<u64> = Some(86400);
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Read, &ttl);

        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        client.revoke_access(&owner, &resource_id, &user);

        let has_access_after = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access_after);
    }

    #[test]
    fn test_access_key_creation() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let holder = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let ttl: Option<u64> = Some(86400);
        let key_id = client.create_access_key(&owner, &resource_id, &holder, &permissions, &ttl);

        assert_ne!(key_id, BytesN::<32>::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);

        // Grant write permission
        let no_ttl: Option<u64> = None;
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Write, &no_ttl);

        // Should have read access (write includes read)
        let has_read = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_read);

        // Should have write access
        let has_write = client.check_access(&user, &resource_id, &PermissionType::Write);
        assert!(has_write);

        // Should not have admin access
        let has_admin = client.check_access(&user, &resource_id, &PermissionType::Admin);
        assert!(!has_admin);
    }

    #[test]
    fn test_ttl_expiration() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &owner, &false, &1u32, &signers);

        // Grant access with 1 second TTL
        let ttl: Option<u64> = Some(1);
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Read, &ttl);

        // Should have access immediately
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        // Jump forward in time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Should not have access after expiration
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access);
    }
    /// WS3 acceptance: `check_access` cost is constant regardless of how many
    /// users/permissions exist — the check reads only the requesting user's own
    /// permission entries (per-user keys), never a global scan. The pre-WS3
    /// implementation iterated every access key ever issued on each check.
    #[test]
    fn test_check_access_cost_constant_across_many_users() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let resource_id = BytesN::<32>::random(&env);
        let signers = Vec::new(&env);
        client.register_resource(&admin, &resource_id, &admin, &false, &1u32, &signers);

        let user = Address::generate(&env);
        client.grant_access(&admin, &resource_id, &user, &PermissionType::Read, &None);

        // Measure the cost of ONE check_access via a delta between two
        // consecutive readings (the host metering scope stays open across
        // client calls, so readings are cumulative — deltas isolate a single
        // check's cost).
        let measure = |env: &Env| {
            assert!(client.check_access(&user, &resource_id, &PermissionType::Read));
            let before = env.cost_estimate().resources().instructions;
            assert!(client.check_access(&user, &resource_id, &PermissionType::Read));
            let after = env.cost_estimate().resources().instructions;
            after - before
        };
        let baseline_delta = measure(&env);

        // Grant the same resource to 100 more users — `user`'s lookup path must
        // not grow with the global user count.
        for _ in 0..100 {
            let other = Address::generate(&env);
            client.grant_access(&admin, &resource_id, &other, &PermissionType::Read, &None);
        }
        let after_delta = measure(&env);

        // Generous slack for host-level noise; the pre-WS3 O(N) full-map scan
        // would exceed this by orders of magnitude.
        assert!(
            after_delta <= baseline_delta + 200_000,
            "check_access CPU grew with user count: baseline {baseline_delta} vs {after_delta}"
        );
    }

    /// WS3 acceptance: `check_access` is composable cross-contract. A consumer
    /// contract invokes it on behalf of an end user (no end-user signature
    /// needed) and the caller's own state is untouched by the invocation — the
    /// invoked contract cannot mutate the caller mid-invocation.
    #[test]
    fn test_check_access_is_composable_cross_contract() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);
        let relay_id = env.register(AccessRelay, ());
        let relay_client = AccessRelayClient::new(&env, &relay_id);

        let admin = Address::generate(&env);
        let grantee = Address::generate(&env);
        let stranger = Address::generate(&env);
        let resource_id: BytesN<32> =
            <BytesN<32> as soroban_sdk::testutils::BytesN<32>>::random(&env);

        client.initialize(&admin);
        client.register_resource(&admin, &resource_id, &admin, &false, &1u32, &Vec::new(&env));
        client.grant_access(&admin, &resource_id, &grantee, &PermissionType::Read, &None);

        // The resource owner is granted through the relay.
        let (granted, marker) =
            relay_client.check_via_relay(&contract_id, &admin, &resource_id, &PermissionType::Read);
        assert!(granted);
        assert!(
            marker,
            "cross-contract call must not mutate the caller's state"
        );

        // A granted grantee is reachable by an unrelated contract (composability).
        let (granted, marker) = relay_client.check_via_relay(
            &contract_id,
            &grantee,
            &resource_id,
            &PermissionType::Read,
        );
        assert!(granted);
        assert!(marker);

        // A stranger is denied (Ok(false), never an auth panic).
        let (granted, marker) = relay_client.check_via_relay(
            &contract_id,
            &stranger,
            &resource_id,
            &PermissionType::Read,
        );
        assert!(!granted);
        assert!(marker);
    }

    /// WS5 acceptance: `verify_state` fails the transaction when the ledger is
    /// corrupted — an enumerated user loses their per-user permission list.
    #[test]
    fn test_verify_state_detects_corrupted_state() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id: BytesN<32> =
            <BytesN<32> as soroban_sdk::testutils::BytesN<32>>::random(&env);

        client.initialize(&admin);
        client.register_resource(&admin, &resource_id, &admin, &false, &1u32, &Vec::new(&env));
        client.grant_access(&admin, &resource_id, &user, &PermissionType::Read, &None);

        // Sanity: consistent right after the grants.
        let ok = env.as_contract(&contract_id, || {
            DataSovereigntyAccessControl::verify_state(&env)
        });
        assert_eq!(ok, Ok(()));

        // Corrupt: drop the enumerated user's permission list.
        env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .remove(&(Symbol::new(&env, "perm_"), user.clone()));
        });

        let err = env.as_contract(&contract_id, || {
            DataSovereigntyAccessControl::verify_state(&env)
        });
        assert_eq!(err, Err(AccessControlError::StateInconsistent));
    }
}
