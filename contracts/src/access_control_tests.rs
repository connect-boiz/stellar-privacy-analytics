#[cfg(test)]
mod tests {
    use crate::access_control::{
        DataSovereigntyAccessControl, DataSovereigntyAccessControlClient, PermissionType,
    };
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, BytesN as _, Ledger, MockAuth, MockAuthInvoke},
        Address, BytesN, Env, IntoVal, Symbol, Vec,
    };

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
        ///
        /// Visibility: `pub` so the generated `AccessVerifierClient`
        /// exposes it. (PR #320 originally wrote `fn check`, which the
        /// `#[contractimpl]` macro skipped when generating the client —
        /// the resulting `AccessVerifierClient` therefore had no public
        /// `check` method, breaking every cross-contract test.)
        pub fn check(
            env: Env,
            target: Address,
            user: Address,
            resource_id: BytesN<32>,
            required_permission: PermissionType,
        ) -> bool {
            let client =
                crate::access_control::DataSovereigntyAccessControlClient::new(&env, &target);
            // The generated client unwraps `Result<bool, AccessControlError>`
            // and returns `bool` directly. Comparing it to `Ok(true)` is a
            // type error (and the SDK panics on contract errors rather
            // than surfacing them as `Err`). Return the bool result as-is.
            client.check_access(&user, &resource_id, &required_permission)
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
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so is_authorized() returns true
        let owner = admin.clone();
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Verify resource was stored
        let has_resource: bool = env.as_contract(&contract_id, || {
            let resources: soroban_sdk::Map<BytesN<32>, crate::access_control::ResourceOwner> = env
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
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        let ttl: Option<u64> = Some(86400);
        client.grant_access(&resource_id, &user, &PermissionType::Read, &ttl);

        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        client.revoke_access(&resource_id, &user);

        let has_access_after = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access_after);
    }

    #[test]
    fn test_access_key_creation() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let holder = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let ttl: Option<u64> = Some(86400);
        let key_id = client.create_access_key(&resource_id, &holder, &permissions, &ttl);

        assert_ne!(key_id, BytesN::<32>::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Grant write permission
        let no_ttl: Option<u64> = None;
        client.grant_access(&resource_id, &user, &PermissionType::Write, &no_ttl);

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
    // Three complementary invariants are locked in below:
    //   (a) `check_access` itself completes successfully when caller-side
    //       auth is not mocked (proves the function does not call
    //       require_auth for the supplied user/account).
    //   (b) The owner short-circuit branch of `check_access` is reachable
    //       without caller-side auth.
    //   (c) A separate contract invoking `check_access` from contract
    //       code also completes successfully when caller-side auth is
    //       not mocked (proves the call is reachable cross-contract,
    //       not just directly).
    //
    // After `register_resource` / `grant_access` gained host-level
    // `require_auth()`, the setup phase for tests (a) and (b) authorizes
    // ONLY those mutating calls via `mock_auths`. The final `check_access`
    // call has NO matching entry, so if a future refactor reintroduced
    // `require_auth()` on `check_access`, the host boundary would reject
    // the call before contract logic runs — signaling the regression
    // immediately.

    #[test]
    fn test_check_access_succeeds_without_caller_signatures() {
        // Setup mutates state, so the on-chain owner authenticate each
        // step at the host boundary. We authorize ONLY the setup calls
        // via `mock_auths`; the final `check_access` invocation below
        // has NO matching entry. Its success proves check_access does
        // not impose require_auth() on the caller.
        let env = Env::default();

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        // Register the contract first so storage writes from setup
        // land on the registered instance (direct-method calls would
        // otherwise write to the env's placeholder contract-id
        // storage, which is not visible to subsequent client calls).
        let access_control_id = env.register(DataSovereigntyAccessControl, ());
        let access_control_client =
            DataSovereigntyAccessControlClient::new(&env, &access_control_id);

        // Authorize ONLY the data-setup calls. The `check_access`
        // invocation below intentionally has no matching MockAuth entry
        // — owner.require_auth() (in the mutators) is satisfied by
        // these entries; check_access has no require_auth and so needs
        // no entry.
        env.mock_auths(&[
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &access_control_id,
                    fn_name: "register_resource",
                    args: (
                        resource_id.clone(),
                        owner.clone(),
                        false,
                        1u32,
                        Vec::<Address>::new(&env),
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            },
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &access_control_id,
                    fn_name: "grant_access",
                    args: (
                        resource_id.clone(),
                        user.clone(),
                        PermissionType::Read,
                        None::<u64>,
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            },
        ]);

        access_control_client.initialize(&admin);
        access_control_client.register_resource(
            &resource_id,
            &owner,
            &false,
            &1u32,
            &Vec::new(&env),
        );
        access_control_client.grant_access(
            &resource_id,
            &user,
            &PermissionType::Read,
            &None::<u64>,
        );

        // No auth mocked for this call. If `require_auth()` were ever
        // reintroduced on the `check_access` path, the host
        // short-circuits this call before contract logic runs.
        let has_access =
            access_control_client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);
    }

    #[test]
    fn test_check_access_owner_path_succeeds_without_caller_signatures() {
        // Exercises the owner short-circuit branch of `check_access`:
        // when `user == resource_owner.owner` the function returns
        // `Ok(true)` before consulting permission storage. We
        // authorize only the `register_resource` setup call; the
        // `check_access` call below has no matching entry, which
        // proves `check_access` itself does not impose require_auth().
        let env = Env::default();

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        // Register and route setup via the client so storage writes
        // hit the registered instance.
        let access_control_id = env.register(DataSovereigntyAccessControl, ());
        let access_control_client =
            DataSovereigntyAccessControlClient::new(&env, &access_control_id);

        env.mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &access_control_id,
                fn_name: "register_resource",
                args: (
                    resource_id.clone(),
                    owner.clone(),
                    false,
                    1u32,
                    Vec::<Address>::new(&env),
                )
                    .into_val(&env),
                sub_invokes: &[],
            },
        }]);

        access_control_client.initialize(&admin);
        access_control_client.register_resource(
            &resource_id,
            &owner,
            &false,
            &1u32,
            &Vec::new(&env),
        );

        // No auth mocked for this call. The owner-short-circuit path
        // succeeds only if `check_access` is auth-free.
        let allowed =
            access_control_client.check_access(&owner, &resource_id, &PermissionType::Admin);
        assert!(allowed);
    }

    #[test]
    fn test_check_access_is_callable_from_a_different_contract() {
        // True cross-contract regression: define a tiny verifier
        // contract, register it, and have IT call `check_access` on
        // the access-control contract. The setup phase uses
        // selective `mock_auths()` entries to authorize only the
        // data-preparation calls; the verification call through
        // `verifier` has NO authorization entries, so it succeeds
        // solely because `check_access` does not invoke
        // `require_auth()` (issue #294). If `require_auth()` were
        // ever reintroduced on `check_access`, the host boundary
        // would reject the verifier's invocation before any contract
        // logic runs — signaling the regression immediately.
        //
        // Storage isolation: setup MUST target the registered
        // access-control contract's instance storage. Direct method
        // calls (`Type::method(env, ...)`) write to the env's
        // placeholder contract-id instance storage, which is NOT
        // shared with the registered contract's storage. Registering
        // contracts first and routing setup through the generated
        // client keeps all writes against the same instance.
        let env = Env::default();

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        // Register BOTH contracts so the cross-contract call below
        // targets a real instance, not the placeholder key used by
        // direct calls.
        let access_control_id = env.register(DataSovereigntyAccessControl, ());
        let verifier_id = env.register(AccessVerifier, ());

        let access_control_client =
            DataSovereigntyAccessControlClient::new(&env, &access_control_id);
        let verifier = AccessVerifierClient::new(&env, &verifier_id);

        // Authorize ONLY the data-setup calls. The verifier.check
        // call below is intentionally unauthorized so that it
        // succeeds only because `check_access` itself does not
        // enforce auth. The auth for register_resource and
        // grant_access is keyed on `owner` (which now requires
        // host-level signature per the contract's auth hardening);
        // initialize does not require auth.
        env.mock_auths(&[
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &access_control_id,
                    fn_name: "register_resource",
                    args: (
                        resource_id.clone(),
                        owner.clone(),
                        false,
                        1u32,
                        Vec::<Address>::new(&env),
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            },
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &access_control_id,
                    fn_name: "grant_access",
                    args: (
                        resource_id.clone(),
                        user.clone(),
                        PermissionType::Read,
                        None::<u64>,
                    )
                        .into_val(&env),
                    sub_invokes: &[],
                },
            },
        ]);

        access_control_client.initialize(&admin);
        access_control_client.register_resource(
            &resource_id,
            &owner,
            &false,
            &1u32,
            &Vec::new(&env),
        );
        access_control_client.grant_access(
            &resource_id,
            &user,
            &PermissionType::Read,
            &None::<u64>,
        );

        // The verifier has zero authorizations, so if `check_access`
        // ever required auth, this call would abort at the host
        // boundary before contract logic runs. Coming back `true`
        // from the verifier confirms the regression invariant holds.
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
        env.mock_all_auths();
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Grant access with 1 second TTL
        let ttl: Option<u64> = Some(1);
        client.grant_access(&resource_id, &user, &PermissionType::Read, &ttl);

        // Should have access immediately
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        // Jump forward in time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Should not have access after expiration
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access);
    }
}
