use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SovereigntyError {
    /// Caller is not the registered owner of the data.
    NotOwner = 1,
    /// The requested data CID was not found in the registry.
    DataNotFound = 2,
    /// Caller does not have access permissions.
    AccessDenied = 3,
    /// The granted access has expired.
    AccessExpired = 4,
    /// This CID has already been registered.
    AlreadyRegistered = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Maps a CID to its Owner's Address
    Owner(String),
    /// Maps a (CID, Grantee Address) to an Expiration Timestamp (u64)
    Access(String, Address),
}

#[contract]
pub struct DataSovereigntyContract;

#[contractimpl]
impl DataSovereigntyContract {
    /// Registers a new data CID and assigns the caller as the owner.
    pub fn register_data(env: Env, owner: Address, cid: String) -> Result<(), SovereigntyError> {
        // Integrates with Stellar's native multi-sig. If `owner` is a multi-sig account,
        // the network inherently requires the necessary threshold of signatures.
        owner.require_auth();

        let owner_key = DataKey::Owner(cid.clone());
        if env.storage().instance().get::<_, ()>(&owner_key).is_some() {
            return Err(SovereigntyError::AlreadyRegistered);
        }

        // Store metadata in Instance storage for quick lookups
        env.storage().instance().set(&owner_key, &owner);

        env.events().publish(
            (Symbol::new(&env, "data"), Symbol::new(&env, "register")),
            (cid, owner),
        );

        Ok(())
    }

    /// Grants time-bound access to a specific dataset. Requires owner signature.
    pub fn grant_access(
        env: Env,
        owner: Address,
        cid: String,
        grantee: Address,
        expiration_ts: u64,
    ) -> Result<(), SovereigntyError> {
        owner.require_auth();

        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env
            .storage()
            .instance()
            .get(&owner_key)
            .ok_or(SovereigntyError::DataNotFound)?;

        if actual_owner != owner {
            return Err(SovereigntyError::NotOwner);
        }

        let access_key = DataKey::Access(cid.clone(), grantee.clone());
        env.storage().instance().set(&access_key, &expiration_ts);

        // Emit event for access modification
        env.events().publish(
            (Symbol::new(&env, "access"), Symbol::new(&env, "granted")),
            (cid, grantee, expiration_ts),
        );

        Ok(())
    }

    /// Revokes access from a grantee prematurely.
    pub fn revoke_access(
        env: Env,
        owner: Address,
        cid: String,
        grantee: Address,
    ) -> Result<(), SovereigntyError> {
        owner.require_auth();

        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env
            .storage()
            .instance()
            .get(&owner_key)
            .ok_or(SovereigntyError::DataNotFound)?;

        if actual_owner != owner {
            return Err(SovereigntyError::NotOwner);
        }

        let access_key = DataKey::Access(cid.clone(), grantee.clone());
        env.storage().instance().remove(&access_key);

        env.events().publish(
            (Symbol::new(&env, "access"), Symbol::new(&env, "revoked")),
            (cid, grantee),
        );

        Ok(())
    }

    /// Checks if a caller has valid, unexpired access to query the underlying data.
    ///
    /// NOTE: This is a read-only view function. It deliberately does **not**
    /// invoke `caller.require_auth()` so that other contracts can compose on
    /// top of this access-control layer (e.g. an aggregator contract calling
    /// `check_access` on behalf of its end users). Authorization is enforced
    /// at the point of mutation (`register_data`, `grant_access`,
    /// `revoke_access`) and on the consuming contract, not here.
    /// See GitHub issue #294.
    pub fn check_access(env: Env, cid: String, caller: Address) -> Result<bool, SovereigntyError> {
        // No `caller.require_auth()` here — see issue #294 for rationale.
        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env
            .storage()
            .instance()
            .get(&owner_key)
            .ok_or(SovereigntyError::DataNotFound)?;

        // Owner always has access
        if caller == actual_owner {
            return Ok(true);
        }

        // Check grantee access
        let access_key = DataKey::Access(cid, caller);
        if let Some(expiration_ts) = env.storage().instance().get::<_, u64>(&access_key) {
            let current_ts = env.ledger().timestamp();

            if current_ts <= expiration_ts {
                return Ok(true);
            } else {
                return Err(SovereigntyError::AccessExpired);
            }
        }

        Err(SovereigntyError::AccessDenied)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke};
    use soroban_sdk::{contract, contractimpl, IntoVal, Val, Vec};

    /// A relay contract that calls `check_access` on behalf of an opaque
    /// end user. This is the contract-to-contract form that issue #294
    /// asks for: the relay itself cannot sign for the end user, so any
    /// `caller.require_auth()` inside `check_access` would cause the host
    /// to panic with an auth error.
    #[contract]
    pub struct RelayContract;

    #[contractimpl]
    impl RelayContract {
        /// Forwards a `check_access` query on behalf of an opaque end user.
        ///
        /// On soroban-sdk 22 the generated `try_check_access` returns
        /// `Result<Result<bool, ConversionError>, Result<SE, InvokeError>>`
        /// where:
        /// * `Ok(Ok(b))`           = success
        /// * `Err(Ok(contract_err))` = the contract returned our error enum
        /// * `Ok(Err(_)) | Err(Err(_))` = unexpected (arg conversion /
        ///   host invoke failure); not reachable in this test.
        ///
        /// We unwrap the outer layer and propagate the inner
        /// `SovereigntyError` so the test can `assert_eq!` against a
        /// flat `Result<bool, SovereigntyError>`.
        pub fn relay_check(
            env: Env,
            sovereignty_contract: Address,
            cid: String,
            end_user: Address,
        ) -> Result<bool, SovereigntyError> {
            let client = DataSovereigntyContractClient::new(&env, &sovereignty_contract);
            // Explicit type annotations on each constructor pin the result type to
            // `Result<bool, SovereigntyError>`, sidestepping the soroban-sdk
            // `try_check_access` double-Result shape (it returns
            // `Result<Result<bool, ConversionError>, Result<SE, InvokeError>>`).
            match client.try_check_access(&cid, &end_user) {
                Ok(Ok(b)) => Ok::<bool, SovereigntyError>(b),
                Err(Ok(e)) => Err::<bool, SovereigntyError>(e),
                _ => panic!("unexpected check_access error variant from relay"),
            }
        }
    }

    #[test]
    fn test_data_registration_and_access() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let cid = String::from_str(&env, "QmHash123...");

        client.register_data(&owner, &cid);
    }

    /// Verifies that `check_access` is composable: a relay contract
    /// (or any other contract) can call `check_access` on behalf of an
    /// arbitrary end user without that user having to provide a signature.
    ///
    /// Regression test for issue #294.
    ///
    /// The test uses MockAuth / MockAuthInvoke to authorize ONLY the two
    /// setup transactions (register_data, grant_access), then drops the
    /// auth state before making the cross-contract relay call. If
    /// `check_access` ever re-introduces `caller.require_auth()`, the
    /// relay call would panic with a host auth error because the relay
    /// cannot supply a signature for an arbitrary end user — and that
    /// panic would fail this test.
    #[test]
    fn test_check_access_is_composable_cross_contract() {
        let env = Env::default();

        let sovereignty_id = env.register(DataSovereigntyContract, ());
        let sovereignty_client = DataSovereigntyContractClient::new(&env, &sovereignty_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let stranger = Address::generate(&env);
        let cid = String::from_str(&env, "QmComposableHash");
        let expiration_ts = env.ledger().timestamp() + 10_000;

        // ---- authorize ONLY the two setup transactions ---------------
        let register_args: Vec<Val> = Vec::from_array(
            &env,
            [owner.clone().into_val(&env), cid.clone().into_val(&env)],
        );
        let grant_args: Vec<Val> = Vec::from_array(
            &env,
            [
                owner.clone().into_val(&env),
                cid.clone().into_val(&env),
                grantee.clone().into_val(&env),
                expiration_ts.into_val(&env),
            ],
        );
        env.mock_auths(&[
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &sovereignty_id,
                    fn_name: "register_data",
                    args: register_args,
                    sub_invokes: &[],
                },
            },
            MockAuth {
                address: &owner,
                invoke: &MockAuthInvoke {
                    contract: &sovereignty_id,
                    fn_name: "grant_access",
                    args: grant_args,
                    sub_invokes: &[],
                },
            },
        ]);
        sovereignty_client.register_data(&owner, &cid);
        sovereignty_client.grant_access(&owner, &cid, &grantee, &expiration_ts);

        // ---- drop ALL auths — cross-contract call must succeed without them
        env.mock_auths(&[]);

        // Deploy the relay and exercise every access-control arm.
        let relay_id = env.register(RelayContract, ());
        let relay_client = RelayContractClient::new(&env, &relay_id);

        // The relay lives in a separate contract, so we use the
        // `try_relay_check` helper which preserves the inner
        // `Result<bool, SovereigntyError>` envelope. (The plain
        // `relay_check` wrapper would unwrap it to `bool` and panic on
        // the contract-error path.)
        // Owner always has access: `Ok(Ok(true))`.
        let owner_outcome = relay_client.try_relay_check(&sovereignty_id, &cid, &owner);
        assert_eq!(owner_outcome, Ok(Ok(true)));

        // Granted grantee has access (composability).
        let grantee_outcome = relay_client.try_relay_check(&sovereignty_id, &cid, &grantee);
        assert_eq!(grantee_outcome, Ok(Ok(true)));

        // Stranger is denied — check_access returns Err(AccessDenied),
        // not Ok(false). The relay must forward this error verbatim.
        let stranger_outcome = relay_client.try_relay_check(&sovereignty_id, &cid, &stranger);
        assert_eq!(stranger_outcome, Err(Ok(SovereigntyError::AccessDenied)));
    }

    /// A non-existent CID must surface `DataNotFound`, not silently grant access.
    #[test]
    fn test_check_access_unknown_cid_returns_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let caller = Address::generate(&env);
        let cid = String::from_str(&env, "QmUnknown");

        let result = client.try_check_access(&cid, &caller);
        assert_eq!(result, Err(Ok(SovereigntyError::DataNotFound)));
    }

    /// `check_access` must surface `AccessExpired` (not silently `true`)
    /// once a grantee's window has elapsed.
    #[test]
    fn test_check_access_expired_grant_reports_access_expired() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let cid = String::from_str(&env, "QmExpired");

        let expiration_ts = env.ledger().timestamp() + 100;
        client.register_data(&owner, &cid);
        client.grant_access(&owner, &cid, &grantee, &expiration_ts);

        // Still valid.
        let before = client.try_check_access(&cid, &grantee);
        assert_eq!(before, Ok(Ok(true)));

        // Cross the expiration boundary.
        env.ledger().set_timestamp(expiration_ts + 1);
        let res = client.try_check_access(&cid, &grantee);
        assert_eq!(res, Err(Ok(SovereigntyError::AccessExpired)));
    }

    /// `revoke_access` must cause `check_access` to surface `AccessDenied`
    /// (the key is gone, so it's not "expired"; the grant was undone).
    #[test]
    fn test_revoked_grantee_is_denied() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let cid = String::from_str(&env, "QmRevoked");

        client.register_data(&owner, &cid);
        client.grant_access(&owner, &cid, &grantee, &1_000_000);
        client.revoke_access(&owner, &cid, &grantee);

        let res = client.try_check_access(&cid, &grantee);
        assert_eq!(res, Err(Ok(SovereigntyError::AccessDenied)));
    }

    /// A non-owner must not be able to grant/revoke access on a CID they do
    /// not own; the contract surfaces `NotOwner`.
    #[test]
    fn test_non_owner_cannot_grant_or_revoke_access() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let attacker = Address::generate(&env);
        let victim = Address::generate(&env);
        let cid = String::from_str(&env, "QmProtected");

        client.register_data(&owner, &cid);

        let grant = client.try_grant_access(&attacker, &cid, &victim, &1_000_000);
        assert_eq!(grant, Err(Ok(SovereigntyError::NotOwner)));

        // Owner grants legitimate access so we can verify revoke is also
        // gated.
        client.grant_access(&owner, &cid, &victim, &1_000_000);
        let revoke = client.try_revoke_access(&attacker, &cid, &victim);
        assert_eq!(revoke, Err(Ok(SovereigntyError::NotOwner)));
    }
}
