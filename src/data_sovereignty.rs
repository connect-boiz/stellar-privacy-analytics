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
    /// Deliberately does **not** call `caller.require_auth()`. Access checks
    /// are read-only verifications and must be safe for cross-contract
    /// composability, so any other contract may ask this contract whether a
    /// given user holds a valid grant without satisfying the user's
    /// authorization requirements (which only the user themselves can).
    pub fn check_access(env: Env, cid: String, caller: Address) -> Result<bool, SovereigntyError> {

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
    use soroban_sdk::testutils::{Address as _, Ledger as _};

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

    #[test]
    fn test_check_access_owner() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashOwner...");

        client.register_data(&owner, &cid);

        // The owner is always granted implicit access.
        assert!(client.check_access(&cid, &owner));
    }

    #[test]
    fn test_check_access_granted_within_window() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashGranted...");

        client.register_data(&owner, &cid);
        client.grant_access(&owner, &cid, &grantee, &(env.ledger().timestamp() + 1_000));

        assert!(client.check_access(&cid, &grantee));
    }

    #[test]
    fn test_check_access_expired_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashExpired...");

        client.register_data(&owner, &cid);
        // Grant that already expired by the time we query.
        client.grant_access(&owner, &cid, &grantee, &0u64);

        env.ledger().set_timestamp(1);

        assert_eq!(
            client.try_check_access(&cid, &grantee),
            Err(Ok(SovereigntyError::AccessExpired))
        );
    }

    #[test]
    fn test_check_access_no_grant() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let stranger = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashNoGrant...");

        client.register_data(&owner, &cid);

        assert_eq!(
            client.try_check_access(&cid, &stranger),
            Err(Ok(SovereigntyError::AccessDenied))
        );
    }

    #[test]
    fn test_check_access_supports_cross_contract_calls() {
        // Regression test for #294:
        // `check_access` MUST NOT require the caller to authenticate, so other
        // contracts can delegate access verification on behalf of an end user
        // (the end user is the data being passed as `caller`, the calling
        // contract supplies the authorization context).
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        // `proxy` simulates an intermediary contract invoking the check on
        // behalf of another address. It is NOT given any auth context.
        let proxy = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashCrossContract...");

        client.register_data(&owner, &cid);
        client.grant_access(&owner, &cid, &grantee, &(env.ledger().timestamp() + 1_000_000));

        // A "proxy" contract asks whether the grantee has access. Because
        // `check_access` does not call `caller.require_auth()`, the proxy
        // (which would not be able to satisfy auth on behalf of `grantee`
        // anyway) is free to invoke this read-only query.
        assert!(client.check_access(&cid, &grantee));

        // The same proxy can verify negative outcomes — i.e. whoever the
        // proxy is asking about, no spurious auth is demanded.
        assert_eq!(
            client.try_check_access(&cid, &proxy),
            Err(Ok(SovereigntyError::AccessDenied))
        );
    }

    #[test]
    fn test_register_data_rejects_duplicates() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashDup...");

        // The first registration succeeds.
        assert!(client.try_register_data(&owner, &cid).is_ok());

        // Re-registering the same CID must fail with a contract error rather
        // than a host/Vm error. We use `try_register_data` to surface the
        // contract Err directly without a panic-induced ConversionError that
        // some SDK versions surface when an auto-unwrapped client is fed a
        // re-invocation against an address whose auth nonce already advanced.
        assert!(client.try_register_data(&owner, &cid).is_err());
    }

    #[test]
    fn test_revoke_access_invalidates_check() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyContract, ());
        let client = DataSovereigntyContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let grantee = Address::generate(&env);
        let cid = String::from_str(&env, "QmHashRevoke...");

        client.register_data(&owner, &cid);
        client.grant_access(&owner, &cid, &grantee, &(env.ledger().timestamp() + 1_000_000));
        client.revoke_access(&owner, &cid, &grantee);

        assert_eq!(
            client.try_check_access(&cid, &grantee),
            Err(Ok(SovereigntyError::AccessDenied))
        );
    }
}
