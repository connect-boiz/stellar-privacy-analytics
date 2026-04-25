#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol};

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
        if env.storage().instance().has(&owner_key) {
            return Err(SovereigntyError::AlreadyRegistered);
        }
        
        // Store metadata in Instance storage for quick lookups
        env.storage().instance().set(&owner_key, &owner);
        
        env.events().publish(
            (Symbol::new(&env, "data"), Symbol::new(&env, "register")), 
            (cid, owner)
        );
        
        Ok(())
    }

    /// Grants time-bound access to a specific dataset. Requires owner signature.
    pub fn grant_access(
        env: Env, 
        owner: Address, 
        cid: String, 
        grantee: Address, 
        expiration_ts: u64
    ) -> Result<(), SovereigntyError> {
        owner.require_auth();
        
        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env.storage().instance().get(&owner_key).ok_or(SovereigntyError::DataNotFound)?;
        
        if actual_owner != owner {
            return Err(SovereigntyError::NotOwner);
        }
        
        let access_key = DataKey::Access(cid.clone(), grantee.clone());
        env.storage().instance().set(&access_key, &expiration_ts);
        
        // Emit event for access modification
        env.events().publish(
            (Symbol::new(&env, "access"), Symbol::new(&env, "granted")), 
            (cid, grantee, expiration_ts)
        );
        
        Ok(())
    }

    /// Revokes access from a grantee prematurely.
    pub fn revoke_access(env: Env, owner: Address, cid: String, grantee: Address) -> Result<(), SovereigntyError> {
        owner.require_auth();
        
        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env.storage().instance().get(&owner_key).ok_or(SovereigntyError::DataNotFound)?;
        
        if actual_owner != owner {
            return Err(SovereigntyError::NotOwner);
        }
        
        let access_key = DataKey::Access(cid.clone(), grantee.clone());
        env.storage().instance().remove(&access_key);
        
        env.events().publish(
            (Symbol::new(&env, "access"), Symbol::new(&env, "revoked")), 
            (cid, grantee)
        );
        
        Ok(())
    }

    /// Checks if a caller has valid, unexpired access to query the underlying data.
    pub fn check_access(env: Env, cid: String, caller: Address) -> Result<bool, SovereigntyError> {
        caller.require_auth();
        
        let owner_key = DataKey::Owner(cid.clone());
        let actual_owner: Address = env.storage().instance().get(&owner_key).ok_or(SovereigntyError::DataNotFound)?;
        
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
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_data_registration_and_access() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DataSovereigntyContract);
        let client = DataSovereigntyContractClient::new(&env, &contract_id);
        
        let owner = Address::generate(&env);
        let cid = String::from_str(&env, "QmHash123...");
        
        assert!(client.register_data(&owner, &cid).is_ok());
    }
}