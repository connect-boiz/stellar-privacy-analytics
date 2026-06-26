#[cfg(test)]
mod tests {
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, BytesN as _, Ledger},
        Address, BytesN, Env, Symbol, Vec,
    };
    use crate::access_control::{DataSovereigntyAccessControl, PermissionType};

    // --------------------------------------------------------------
    // Helper contract used by `test_check_access_is_callable_from_a_different_contract`
    // (issue #294). A tiny pass-through registered as a separate contract
    // that re-invokes `check_access` on the access-control contract via
    // its generated client.
    // --------------------------------------------------------------
    #[contract]
    struct AccessVerifier;

    #[contractimpl]
    impl AccessVerifier {
        /// Thin proxy used by the cross-contract composability test.
        /// This test fails if `check_access` ever acquires its own
        /// `require_auth()` requirement: `AccessVerifier::check` itself
        /// adds no auth, so the inner call would hit the host boundary
        /// and abort before any contract logic runs. Conversely, this
        /// test confirms current behavior: a contract is free to invoke
        /// `check_access` without having to satisfy the user signature.
        fn check(
            env: Env,
            target: Address,
            user: Address,
            resource_id: BytesN<32>,
            required_permission: PermissionType,
        ) -> bool {
            let client =
                crate::access_control::DataSovereigntyAccessControlClient::new(&env, &target);
            client.check_access(&user, &resource_id, &required_permission) == Ok(true)
        }
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let admin = Address::generate(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_register_resource() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());

        let result = DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_grant_and_revoke_access() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        let grant_result = DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            Some(86400),
        );

        assert!(grant_result.is_ok());

        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_access);

        let revoke_result =
            DataSovereigntyAccessControl::revoke_access(env.clone(), resource_id, user.clone());

        assert!(revoke_result.is_ok());
    }

    #[test]
    fn test_access_key_creation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let holder = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let key_id = DataSovereigntyAccessControl::create_access_key(
            env.clone(),
            resource_id,
            holder.clone(),
            permissions,
            Some(86400),
        )
        .unwrap();

        assert_ne!(key_id, BytesN::<32>::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        // Grant write permission
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Write,
            None,
        )
        .unwrap();

        // Should have read access (write includes read)
        let has_read = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_read);

        // Should have write access
        let has_write = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Write,
        )
        .unwrap();

        assert!(has_write);

        // Should not have admin access
        let has_admin = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id,
            PermissionType::Admin,
        )
        .unwrap();

        assert!(!has_admin);
    }

    // ---------------------------------------------------------------------
    // Issue #294 — `check_access` composability regression guard
    // ---------------------------------------------------------------------
    //
    // Other contracts (a faucet, a paying relayer, a privacy oracle, ...)
    // need to ask "does user X hold grant Y on resource Z?" on behalf of
    // their callers. `check_access` is the public surface they call into.
    // The function MUST NOT call `*.require_auth()` because a composing
    // contract cannot satisfy the user's Stellar signature context.
    //
    // Two complementary invariants are locked in below:
    //   (a) `check_access` itself completes successfully in an auth-free
    //       env (proves the function does not call require_auth).
    //   (b) A separate contract invoking `check_access` from contract code
    //       also completes successfully in an auth-free env (proves the
    //       call is reachable cross-contract, not just directly).
    //
    // If a future refactor reintroduces `require_auth()` on the
    // `check_access` path, both tests fail at the host boundary before the
    // contract logic runs, signaling the regression immediately.

    #[test]
    fn test_check_access_succeeds_without_caller_signatures() {
        // Deliberately NO `env.mock_all_auths()`.
        let env = Env::default();

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin);
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner,
            false,
            1,
            Vec::new(&env),
        )
        .unwrap();
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            None,
        )
        .unwrap();

        // No auth mocked. If require_auth() were ever reintroduced on the
        // check_access path, the host short-circuits this call.
        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user,
            resource_id,
            PermissionType::Read,
        )
        .unwrap();
        assert!(has_access);
    }

    #[test]
    fn test_check_access_owner_path_succeeds_without_caller_signatures() {
        // Exercises the owner short-circuit branch of `check_access`: when
        // `user == resource_owner.owner` the function returns `Ok(true)`
        // before consulting permission storage.
        let env = Env::default(); // NO mock_all_auths().

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin);
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        )
        .unwrap();

        let allowed = DataSovereigntyAccessControl::check_access(
            env.clone(),
            owner,
            resource_id,
            PermissionType::Admin,
        )
        .unwrap();
        assert!(allowed);
    }

    #[test]
    fn test_check_access_is_callable_from_a_different_contract() {
        // True cross-contract regression: define a tiny verifier contract,
        // register it, and have IT call `check_access` on the access
        // control contract. Runs without mock_all_auths() to prove
        // `check_access` remains reachable from contract code without
        // imposing any auth requirement on the caller (issue #294).
        let env = Env::default();

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin);
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner,
            false,
            1,
            Vec::new(&env),
        )
        .unwrap();
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            None,
        )
        .unwrap();

        let access_control_id = env.register(DataSovereigntyAccessControl, ());
        let verifier_id = env.register(AccessVerifier, ());
        let verifier = AccessVerifierClient::new(&env, &verifier_id);

        let allowed = verifier.check(
            &access_control_id,
            &user,
            &resource_id,
            &PermissionType::Read,
        );
        assert!(allowed);
    }

    #[test]
    fn test_ttl_expiration() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        // Grant access with 1 second TTL
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            Some(1),
        )
        .unwrap();

        // Should have access immediately
        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_access);

        // Jump forward in time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Should not have access after expiration
        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id,
            PermissionType::Read,
        )
        .unwrap();

        assert!(!has_access);
    }
}
