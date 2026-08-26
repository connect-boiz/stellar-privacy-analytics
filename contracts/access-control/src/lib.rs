#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::contract;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::contracttype;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::Address;
use soroban_sdk::Bytes;
use soroban_sdk::BytesN;
use soroban_sdk::Env;
use soroban_sdk::Map;
use soroban_sdk::String;
use soroban_sdk::Symbol;
use soroban_sdk::Vec;

const RESOURCE_OWNERS_KEY: &str = "RESOURCE_OWNERS";
const ACCESS_LOG_KEY: &str = "ACCESS_LOG";

const MAX_TTL: u64 = 2592000;
const MIN_MULTI_SIG: u32 = 2;
const MAX_MULTI_SIG: u32 = 10;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AccessPermission {
    pub user: Address,
    pub resource_id: BytesN<32>,
    pub permission_type: PermissionType,
    pub granted_by: Address,
    pub granted_at: u64,
    pub expires_at: Option<u64>,
    pub active: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum PermissionType {
    Read = 0,
    Write = 1,
    Admin = 2,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct ResourceOwner {
    pub resource_id: BytesN<32>,
    pub owner: Address,
    pub created_at: u64,
    pub requires_multi_sig: bool,
    pub multi_sig_threshold: u32,
    pub authorized_signers: Vec<Address>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AccessKey {
    pub key_id: BytesN<32>,
    pub resource_id: BytesN<32>,
    pub holder: Address,
    pub created_at: u64,
    pub expires_at: Option<u64>,
    pub permissions: Vec<PermissionType>,
    pub active: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AccessLogEntry {
    pub timestamp: u64,
    pub user: Address,
    pub resource_id: BytesN<32>,
    pub action: String,
    pub success: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum AccessControlError {
    Unauthorized = 0,
    ResourceNotFound = 1,
    PermissionDenied = 2,
    InvalidTTL = 3,
    InvalidPermissionType = 4,
    InvalidMultiSigThreshold = 5,
    AccessExpired = 6,
    AlreadyExists = 7,
    NotActive = 8,
    InsufficientSignatures = 9,
    InvalidSigner = 10,
    Overflow = 11,
    StateInconsistent = 12,
}

#[contract]
pub struct DataSovereigntyAccessControl;

#[contractimpl]
impl DataSovereigntyAccessControl {
    pub fn initialize(env: Env, admin: Address) {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, "initialized"))
        {
            return; // Already initialized
        }

        // Require the admin to authorize initialization. Without this an
        // attacker could front-run the deployer's setup transaction and
        // claim admin by passing their own address.
        admin.require_auth();

        // Set admin
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Register a new resource. Only the stored admin may do so, and the admin
    /// must authorize the call (previously the caller was derived from
    /// `current_contract_address()` and fell back to that address as the admin,
    /// so anyone could register resources attributed to the contract).
    pub fn register_resource(
        env: Env,
        caller: Address,
        resource_id: BytesN<32>,
        owner: Address,
        requires_multi_sig: bool,
        multi_sig_threshold: u32,
        authorized_signers: Vec<Address>,
    ) -> Result<(), AccessControlError> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        if requires_multi_sig {
            if !(MIN_MULTI_SIG..=MAX_MULTI_SIG).contains(&multi_sig_threshold) {
                return Err(AccessControlError::InvalidMultiSigThreshold);
            }
            if authorized_signers.len() < multi_sig_threshold {
                return Err(AccessControlError::InsufficientSignatures);
            }
        }

        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        if resources.contains_key(resource_id.clone()) {
            return Err(AccessControlError::AlreadyExists);
        }

        let resource_owner = ResourceOwner {
            resource_id: resource_id.clone(),
            owner: owner.clone(),
            created_at: env.ledger().timestamp(),
            requires_multi_sig,
            multi_sig_threshold,
            authorized_signers,
        };

        let mut updated_resources = resources;
        updated_resources.set(resource_owner.resource_id.clone(), resource_owner);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, RESOURCE_OWNERS_KEY), &updated_resources);

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "resource_registered"), resource_id),
            (
                event_nonce,
                owner,
                requires_multi_sig,
                multi_sig_threshold,
                env.ledger().timestamp(),
            ),
        );

        // Fail-closed invariant check over the ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(())
    }

    pub fn grant_access(
        env: Env,
        caller: Address,
        resource_id: BytesN<32>,
        user: Address,
        permission_type: PermissionType,
        ttl_seconds: Option<u64>,
    ) -> Result<(), AccessControlError> {
        caller.require_auth();

        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id.clone())
            .ok_or(AccessControlError::ResourceNotFound)?;

        if caller != resource_owner.owner && !Self::is_authorized(&env, &caller) {
            return Err(AccessControlError::Unauthorized);
        }

        let expires_at = if let Some(ttl) = ttl_seconds {
            if ttl > MAX_TTL {
                return Err(AccessControlError::InvalidTTL);
            }
            Some(
                env.ledger()
                    .timestamp()
                    .checked_add(ttl)
                    .ok_or(AccessControlError::Overflow)?,
            )
        } else {
            None
        };

        let permission = AccessPermission {
            user: user.clone(),
            resource_id: resource_id.clone(),
            permission_type: permission_type.clone(),
            granted_by: resource_owner.owner,
            granted_at: env.ledger().timestamp(),
            expires_at,
            active: true,
        };

        // Per-user permission list under `(Symbol("perm_"), user)` — no more
        // rewriting a global `Map<Address, ...>` on every grant.
        let perm_key = (Symbol::new(&env, "perm_"), user.clone());
        let mut user_permissions: Vec<AccessPermission> = env
            .storage()
            .persistent()
            .get(&perm_key)
            .unwrap_or_else(|| Vec::new(&env));

        // Track the user in the enumeration index on first grant so the
        // admin-only cleanup job can find per-user keys.
        if user_permissions.is_empty() {
            let mut perm_users: Vec<Address> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "perm_users"))
                .unwrap_or_else(|| Vec::new(&env));
            perm_users.push_back(user.clone());
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "perm_users"), &perm_users);
        }

        user_permissions.push_back(permission);
        env.storage().persistent().set(&perm_key, &user_permissions);

        Self::log_access(
            &env,
            user.clone(),
            resource_id.clone(),
            String::from_str(&env, "access_granted"),
            true,
            None,
        );

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "access_granted"), resource_id.clone()),
            (
                event_nonce,
                user,
                permission_type,
                expires_at,
                env.ledger().timestamp(),
            ),
        );

        // Fail-closed invariant check over the ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(())
    }

    pub fn revoke_access(
        env: Env,
        caller: Address,
        resource_id: BytesN<32>,
        user: Address,
    ) -> Result<(), AccessControlError> {
        caller.require_auth();

        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id.clone())
            .ok_or(AccessControlError::ResourceNotFound)?;

        if caller != resource_owner.owner && !Self::is_authorized(&env, &caller) {
            return Err(AccessControlError::Unauthorized);
        }

        let perm_key = (Symbol::new(&env, "perm_"), user.clone());
        let user_permissions: Vec<AccessPermission> = env
            .storage()
            .persistent()
            .get(&perm_key)
            .ok_or(AccessControlError::PermissionDenied)?;

        let mut updated_permissions = Vec::new(&env);
        let mut found = false;

        for permission in user_permissions.iter() {
            if permission.resource_id == resource_id {
                found = true;
            } else {
                updated_permissions.push_back(permission);
            }
        }

        if !found {
            return Err(AccessControlError::PermissionDenied);
        }

        if updated_permissions.is_empty() {
            env.storage().persistent().remove(&perm_key);
            // Keep the enumeration index consistent: drop the user from
            // `perm_users` when their last permission is revoked (the
            // verify_state hook treats an indexed user without a permission
            // list as a corrupted ledger).
            let perm_users: Vec<Address> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "perm_users"))
                .unwrap_or_else(|| Vec::new(&env));
            let mut remaining_perm_users = Vec::new(&env);
            for existing in perm_users.iter() {
                if existing != user {
                    remaining_perm_users.push_back(existing);
                }
            }
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "perm_users"), &remaining_perm_users);
        } else {
            env.storage()
                .persistent()
                .set(&perm_key, &updated_permissions);
        }

        Self::log_access(
            &env,
            user.clone(),
            resource_id.clone(),
            String::from_str(&env, "access_revoked"),
            true,
            None,
        );

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "access_revoked"), resource_id),
            (event_nonce, user, env.ledger().timestamp()),
        );

        // Fail-closed invariant check over the ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(())
    }

    pub fn create_access_key(
        env: Env,
        caller: Address,
        resource_id: BytesN<32>,
        holder: Address,
        permissions: Vec<PermissionType>,
        ttl_seconds: Option<u64>,
    ) -> Result<BytesN<32>, AccessControlError> {
        caller.require_auth();

        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id.clone())
            .ok_or(AccessControlError::ResourceNotFound)?;

        if caller != resource_owner.owner && !Self::is_authorized(&env, &caller) {
            return Err(AccessControlError::Unauthorized);
        }

        let expires_at = if let Some(ttl) = ttl_seconds {
            if ttl > MAX_TTL {
                return Err(AccessControlError::InvalidTTL);
            }
            Some(
                env.ledger()
                    .timestamp()
                    .checked_add(ttl)
                    .ok_or(AccessControlError::Overflow)?,
            )
        } else {
            None
        };

        // Generate unique key ID
        let mut key_data = soroban_sdk::Bytes::new(&env);
        key_data.append(&resource_id.clone().to_xdr(&env));
        key_data.append(&holder.clone().to_xdr(&env));
        key_data.append(&Bytes::from_slice(
            &env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        key_data.append(&Bytes::from_slice(&env, &permissions.len().to_be_bytes()));
        let key_id: BytesN<32> = env.crypto().sha256(&key_data).into();

        let access_key = AccessKey {
            key_id: key_id.clone(),
            resource_id: resource_id.clone(),
            holder: holder.clone(),
            created_at: env.ledger().timestamp(),
            expires_at,
            permissions,
            active: true,
        };

        // Store by key id (direct lookup) and index by holder (so check_access
        // only scans this holder's keys, never every key ever issued).
        env.storage()
            .persistent()
            .set(&(Symbol::new(&env, "akey_"), key_id.clone()), &access_key);

        let holder_key = (Symbol::new(&env, "hkey_"), holder.clone());
        let mut holder_keys: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&holder_key)
            .unwrap_or_else(|| Vec::new(&env));

        if holder_keys.is_empty() {
            let mut hkey_users: Vec<Address> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "hkey_users"))
                .unwrap_or_else(|| Vec::new(&env));
            hkey_users.push_back(holder.clone());
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "hkey_users"), &hkey_users);
        }

        holder_keys.push_back(key_id.clone());
        env.storage().persistent().set(&holder_key, &holder_keys);

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "access_key_created"), resource_id.clone()),
            (
                event_nonce,
                key_id.clone(),
                holder.clone(),
                expires_at,
                env.ledger().timestamp(),
            ),
        );

        // Fail-closed invariant check over the ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(key_id)
    }

    /// Constant-cost access check: only the requesting user's own permission
    /// list and the holder's own access keys are scanned (never the global set
    /// of every key ever issued). Access-log writes are off the check path —
    /// checks emit events only, so a third party calling `check_access` cannot
    /// amplify this contract's storage writes (issue #412 WS3).
    pub fn check_access(
        env: Env,
        user: Address,
        resource_id: BytesN<32>,
        required_permission: PermissionType,
    ) -> Result<bool, AccessControlError> {
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id.clone())
            .ok_or(AccessControlError::ResourceNotFound)?;

        if user == resource_owner.owner {
            return Ok(true);
        }

        let current_time = env.ledger().timestamp();

        // 1) Direct permission grants held by this user.
        let perm_key = (Symbol::new(&env, "perm_"), user.clone());
        if let Some(user_permissions) = env
            .storage()
            .persistent()
            .get::<_, Vec<AccessPermission>>(&perm_key)
        {
            for permission in user_permissions.iter() {
                if permission.resource_id == resource_id
                    && permission.active
                    && Self::has_permission_level(&permission.permission_type, &required_permission)
                {
                    if let Some(expires_at) = permission.expires_at {
                        if current_time >= expires_at {
                            continue;
                        }
                    }
                    Self::emit_access_check(&env, &user, &resource_id, true, "permission");
                    return Ok(true);
                }
            }
        }

        // 2) Access keys held by this user (only this holder's keys).
        let holder_key = (Symbol::new(&env, "hkey_"), user.clone());
        if let Some(holder_keys) = env
            .storage()
            .persistent()
            .get::<_, Vec<BytesN<32>>>(&holder_key)
        {
            for key_id in holder_keys.iter() {
                let akey_key = (Symbol::new(&env, "akey_"), key_id.clone());
                if let Some(access_key) = env.storage().persistent().get::<_, AccessKey>(&akey_key)
                {
                    if access_key.resource_id == resource_id
                        && access_key.holder == user
                        && access_key.active
                    {
                        if let Some(expires_at) = access_key.expires_at {
                            if current_time >= expires_at {
                                continue;
                            }
                        }
                        for permission in access_key.permissions.iter() {
                            if Self::has_permission_level(&permission, &required_permission) {
                                Self::emit_access_check(&env, &user, &resource_id, true, "key");
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }

        Self::emit_access_check(&env, &user, &resource_id, false, "no_valid_permission");
        Ok(false)
    }

    fn emit_access_check(
        env: &Env,
        user: &Address,
        resource_id: &BytesN<32>,
        granted: bool,
        via: &str,
    ) {
        let event_nonce = Self::next_event_nonce(env);
        env.events().publish(
            (Symbol::new(env, "access_checked"), resource_id.clone()),
            (
                event_nonce,
                user.clone(),
                granted,
                String::from_str(env, via),
                env.ledger().timestamp(),
            ),
        );
    }

    /// Monotonically increasing event nonce for indexer replay detection
    /// (issue #412 WS5).
    fn next_event_nonce(env: &Env) -> u64 {
        let nonce: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "event_nonce"))
            .unwrap_or(0);
        let next = nonce + 1;
        env.storage()
            .instance()
            .set(&Symbol::new(env, "event_nonce"), &next);
        next
    }

    /// WS5: fail-closed state-consistency hook run after every mutation. Every
    /// user in the permission enumeration index must still have their per-user
    /// permission list, and every holder in the key enumeration index must
    /// still have their holder key list — a corrupted ledger fails the
    /// transaction (issue #412 WS5).
    fn verify_state(env: &Env) -> Result<(), AccessControlError> {
        let perm_users: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "perm_users"))
            .unwrap_or_else(|| Vec::new(env));
        for user in perm_users.iter() {
            let perm_key = (Symbol::new(env, "perm_"), user.clone());
            if !env.storage().persistent().has(&perm_key) {
                return Err(AccessControlError::StateInconsistent);
            }
        }

        let hkey_users: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "hkey_users"))
            .unwrap_or_else(|| Vec::new(env));
        for user in hkey_users.iter() {
            let holder_key = (Symbol::new(env, "hkey_"), user.clone());
            if !env.storage().persistent().has(&holder_key) {
                return Err(AccessControlError::StateInconsistent);
            }
        }

        Ok(())
    }

    fn has_permission_level(current: &PermissionType, required: &PermissionType) -> bool {
        matches!(
            (current, required),
            (PermissionType::Admin, _)
                | (PermissionType::Write, PermissionType::Read)
                | (PermissionType::Write, PermissionType::Write)
                | (PermissionType::Read, PermissionType::Read)
        )
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), AccessControlError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "admin"))
            .ok_or(AccessControlError::Unauthorized)?;
        if caller != &admin {
            return Err(AccessControlError::Unauthorized);
        }
        Ok(())
    }

    fn is_authorized(env: &Env, address: &Address) -> bool {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "admin"))
            .unwrap_or_else(|| panic!("admin not initialized"));
        address == &admin
    }

    fn log_access(
        env: &Env,
        user: Address,
        resource_id: BytesN<32>,
        action: String,
        success: bool,
        reason: Option<String>,
    ) {
        let log_entry = AccessLogEntry {
            timestamp: env.ledger().timestamp(),
            user: user.clone(),
            resource_id,
            action,
            success,
            reason,
        };

        let mut access_log: Vec<AccessLogEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(env, ACCESS_LOG_KEY))
            .unwrap_or_else(|| Vec::new(env));

        access_log.push_back(log_entry);

        // Keep only last 1000 log entries to prevent storage bloat
        if access_log.len() > 1000 {
            let start = access_log.len() - 1000;
            let mut trimmed = Vec::new(env);
            for i in start..access_log.len() {
                if let Some(entry) = access_log.get(i) {
                    trimmed.push_back(entry);
                }
            }
            access_log = trimmed;
        }

        env.storage()
            .instance()
            .set(&Symbol::new(env, ACCESS_LOG_KEY), &access_log);
    }

    pub fn get_access_log(env: Env) -> Vec<AccessLogEntry> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, ACCESS_LOG_KEY))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Admin-only cleanup of expired permissions and access keys. Now
    /// authenticated (previously any caller could rewrite the permission and
    /// key maps and erase active grants).
    pub fn cleanup_expired(env: Env, caller: Address) -> Result<u32, AccessControlError> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        let mut cleaned_count = 0u32;
        let current_time = env.ledger().timestamp();

        // Clean per-user permission lists via the enumeration index.
        let perm_users: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "perm_users"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut remaining_perm_users = Vec::new(&env);
        for user in perm_users.iter() {
            let perm_key = (Symbol::new(&env, "perm_"), user.clone());
            let mut active_permissions = Vec::new(&env);
            let mut found_active = false;

            if let Some(user_permissions) = env
                .storage()
                .persistent()
                .get::<_, Vec<AccessPermission>>(&perm_key)
            {
                for permission in user_permissions.iter() {
                    let is_expired = if let Some(expires_at) = permission.expires_at {
                        current_time >= expires_at
                    } else {
                        false
                    };
                    if !is_expired && permission.active {
                        active_permissions.push_back(permission);
                        found_active = true;
                    } else if is_expired {
                        cleaned_count += 1;
                    }
                }
            }

            if found_active {
                env.storage()
                    .persistent()
                    .set(&perm_key, &active_permissions);
                remaining_perm_users.push_back(user.clone());
            } else {
                env.storage().persistent().remove(&perm_key);
            }
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "perm_users"), &remaining_perm_users);

        // Clean per-holder access keys via the holder index.
        let hkey_users: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "hkey_users"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut remaining_hkey_users = Vec::new(&env);
        for holder in hkey_users.iter() {
            let holder_key = (Symbol::new(&env, "hkey_"), holder.clone());
            let mut live_key_ids = Vec::new(&env);

            if let Some(holder_keys) = env
                .storage()
                .persistent()
                .get::<_, Vec<BytesN<32>>>(&holder_key)
            {
                for key_id in holder_keys.iter() {
                    let akey_key = (Symbol::new(&env, "akey_"), key_id.clone());
                    let expired = match env.storage().persistent().get::<_, AccessKey>(&akey_key) {
                        Some(key) => {
                            if let Some(expires_at) = key.expires_at {
                                current_time >= expires_at
                            } else {
                                !key.active
                            }
                        }
                        None => true,
                    };

                    if expired {
                        env.storage().persistent().remove(&akey_key);
                        cleaned_count += 1;
                    } else {
                        live_key_ids.push_back(key_id.clone());
                    }
                }
            }

            if live_key_ids.is_empty() {
                env.storage().persistent().remove(&holder_key);
            } else {
                env.storage().persistent().set(&holder_key, &live_key_ids);
                remaining_hkey_users.push_back(holder.clone());
            }
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "hkey_users"), &remaining_hkey_users);

        // Fail-closed invariant check over the ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(cleaned_count)
    }
}

#[cfg(test)]
mod tests;
