use soroban_sdk::contracttype;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::Address;
use soroban_sdk::Env;
use soroban_sdk::Vec;
use soroban_sdk::String;
use soroban_sdk::symbol_short;
use soroban_sdk::symbol;
use soroban_sdk::Map;
use soroban_sdk::BytesN;
use soroban_sdk::crypto::sha256;
use soroban_sdk::xdr::ScVal;

// Contract state storage keys
const USER_PERMISSIONS_KEY: &str = "USER_PERMISSIONS";
const RESOURCE_OWNERS_KEY: &str = "RESOURCE_OWNERS";
const ACCESS_KEYS_KEY: &str = "ACCESS_KEYS";
const TTL_ACCESS_KEY: &str = "TTL_ACCESS";
const MULTI_SIG_REQUIREMENTS_KEY: &str = "MULTI_SIG_REQUIREMENTS";
const ACCESS_LOG_KEY: &str = "ACCESS_LOG";

// Constants
const DEFAULT_TTL: u64 = 86400; // 24 hours in seconds
const MAX_TTL: u64 = 2592000; // 30 days in seconds
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
}

pub struct DataSovereigntyAccessControl;

#[contractimpl]
impl DataSovereigntyAccessControl {
    /// Initialize the contract with an admin
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol!("initialized")) {
            return; // Already initialized
        }

        // Set admin
        env.storage().instance().set(&symbol!("admin"), &admin);
        env.storage().instance().set(&symbol!("initialized"), &true);
    }

    /// Register a new resource with an owner
    pub fn register_resource(
        env: Env,
        resource_id: BytesN<32>,
        owner: Address,
        requires_multi_sig: bool,
        multi_sig_threshold: u32,
        authorized_signers: Vec<Address>,
    ) -> Result<(), AccessControlError> {
        // Check if caller is admin or resource owner
        let caller = env.current_contract_address();
        let admin: Address = env.storage().instance().get(&symbol!("admin")).unwrap_or_else(|| caller);
        
        if env.current_contract_address() != admin && !Self::is_authorized(&env, &owner) {
            return Err(AccessControlError::Unauthorized);
        }

        // Validate multi-sig requirements
        if requires_multi_sig {
            if multi_sig_threshold < MIN_MULTI_SIG || multi_sig_threshold > MAX_MULTI_SIG {
                return Err(AccessControlError::InvalidMultiSigThreshold);
            }
            if authorized_signers.len() < multi_sig_threshold as usize {
                return Err(AccessControlError::InsufficientSignatures);
            }
        }

        // Check if resource already exists
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&symbol!(RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        if resources.contains_key(resource_id) {
            return Err(AccessControlError::AlreadyExists);
        }

        // Create resource owner record
        let resource_owner = ResourceOwner {
            resource_id,
            owner,
            created_at: env.ledger().timestamp(),
            requires_multi_sig,
            multi_sig_threshold,
            authorized_signers,
        };

        // Store resource owner
        let mut updated_resources = resources;
        updated_resources.set(resource_id, &resource_owner);
        env.storage()
            .instance()
            .set(&symbol!(RESOURCE_OWNERS_KEY), &updated_resources);

        // Emit event for resource registration
        env.events().publish(
            (symbol!("resource_registered"), resource_id),
            (owner, requires_multi_sig, multi_sig_threshold),
        );

        Ok(())
    }

    /// Grant access to a resource for a user
    pub fn grant_access(
        env: Env,
        resource_id: BytesN<32>,
        user: Address,
        permission_type: PermissionType,
        ttl_seconds: Option<u64>,
    ) -> Result<(), AccessControlError> {
        // Get resource owner
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&symbol!(RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id)
            .ok_or(AccessControlError::ResourceNotFound)?;

        // Check if caller is the resource owner
        let caller = env.current_contract_address();
        if caller != resource_owner.owner && !Self::is_authorized(&env, &resource_owner.owner) {
            return Err(AccessControlError::Unauthorized);
        }

        // Validate TTL
        let expires_at = if let Some(ttl) = ttl_seconds {
            if ttl > MAX_TTL {
                return Err(AccessControlError::InvalidTTL);
            }
            Some(env.ledger().timestamp() + ttl)
        } else {
            None
        };

        // Create access permission
        let permission = AccessPermission {
            user: user.clone(),
            resource_id,
            permission_type: permission_type.clone(),
            granted_by: resource_owner.owner,
            granted_at: env.ledger().timestamp(),
            expires_at,
            active: true,
        };

        // Store permission
        let mut permissions: Map<Address, Vec<AccessPermission>> = env
            .storage()
            .instance()
            .get(&symbol!(USER_PERMISSIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let user_permissions = permissions.get(user.clone()).unwrap_or_else(|| Vec::new(&env));
        let mut updated_permissions = user_permissions;
        updated_permissions.push_back(permission);

        permissions.set(user, &updated_permissions);
        env.storage()
            .instance()
            .set(&symbol!(USER_PERMISSIONS_KEY), &permissions);

        // Emit event for access grant
        env.events().publish(
            (symbol!("access_granted"), resource_id),
            (user, permission_type, expires_at),
        );

        Ok(())
    }

    /// Revoke access to a resource for a user
    pub fn revoke_access(
        env: Env,
        resource_id: BytesN<32>,
        user: Address,
    ) -> Result<(), AccessControlError> {
        // Get resource owner
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&symbol!(RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id)
            .ok_or(AccessControlError::ResourceNotFound)?;

        // Check if caller is the resource owner
        let caller = env.current_contract_address();
        if caller != resource_owner.owner && !Self::is_authorized(&env, &resource_owner.owner) {
            return Err(AccessControlError::Unauthorized);
        }

        // Get user permissions
        let mut permissions: Map<Address, Vec<AccessPermission>> = env
            .storage()
            .instance()
            .get(&symbol!(USER_PERMISSIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let user_permissions = permissions
            .get(user.clone())
            .ok_or(AccessControlError::PermissionDenied)?;

        // Find and deactivate permission for the specific resource
        let mut updated_permissions = Vec::new(&env);
        let mut found = false;

        for permission in user_permissions.iter() {
            if permission.resource_id == resource_id {
                found = true;
                // Skip this permission (effectively revoking it)
            } else {
                updated_permissions.push_back(permission);
            }
        }

        if !found {
            return Err(AccessControlError::PermissionDenied);
        }

        permissions.set(user, &updated_permissions);
        env.storage()
            .instance()
            .set(&symbol!(USER_PERMISSIONS_KEY), &permissions);

        // Log the revocation
        Self::log_access(
            &env,
            user,
            resource_id,
            String::from_str(&env, "access_revoked"),
            true,
            None,
        );

        // Emit event for access revocation
        env.events().publish(
            (symbol!("access_revoked"), resource_id),
            (user, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Create an access key with TTL
    pub fn create_access_key(
        env: Env,
        resource_id: BytesN<32>,
        holder: Address,
        permissions: Vec<PermissionType>,
        ttl_seconds: Option<u64>,
    ) -> Result<BytesN<32>, AccessControlError> {
        // Get resource owner
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&symbol!(RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id)
            .ok_or(AccessControlError::ResourceNotFound)?;

        // Check if caller is the resource owner
        let caller = env.current_contract_address();
        if caller != resource_owner.owner && !Self::is_authorized(&env, &resource_owner.owner) {
            return Err(AccessControlError::Unauthorized);
        }

        // Validate TTL
        let expires_at = if let Some(ttl) = ttl_seconds {
            if ttl > MAX_TTL {
                return Err(AccessControlError::InvalidTTL);
            }
            Some(env.ledger().timestamp() + ttl)
        } else {
            None
        };

        // Generate unique key ID
        let key_data = format!("{}{}{}{}", resource_id, holder, env.ledger().timestamp(), permissions.len());
        let key_id = BytesN::from_array(&env, &sha256(key_data.as_bytes()).to_array());

        // Create access key
        let access_key = AccessKey {
            key_id,
            resource_id,
            holder,
            created_at: env.ledger().timestamp(),
            expires_at,
            permissions,
            active: true,
        };

        // Store access key
        let mut access_keys: Map<BytesN<32>, AccessKey> = env
            .storage()
            .instance()
            .get(&symbol!(ACCESS_KEYS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        access_keys.set(key_id, &access_key);
        env.storage()
            .instance()
            .set(&symbol!(ACCESS_KEYS_KEY), &access_keys);

        // Emit event for key creation
        env.events().publish(
            (symbol!("access_key_created"), resource_id),
            (key_id, holder, expires_at),
        );

        Ok(key_id)
    }

    /// Check if a user has access to a resource
    pub fn check_access(
        env: Env,
        user: Address,
        resource_id: BytesN<32>,
        required_permission: PermissionType,
    ) -> Result<bool, AccessControlError> {
        // Get resource owner
        let resources: Map<BytesN<32>, ResourceOwner> = env
            .storage()
            .instance()
            .get(&symbol!(RESOURCE_OWNERS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let resource_owner = resources
            .get(resource_id)
            .ok_or(AccessControlError::ResourceNotFound)?;

        // Resource owner always has access
        if user == resource_owner.owner {
            return Ok(true);
        }

        // Check user permissions
        let permissions: Map<Address, Vec<AccessPermission>> = env
            .storage()
            .instance()
            .get(&symbol!(USER_PERMISSIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        if let Some(user_permissions) = permissions.get(user.clone()) {
            let current_time = env.ledger().timestamp();
            
            for permission in user_permissions.iter() {
                if permission.resource_id == resource_id 
                    && permission.active 
                    && Self::has_permission_level(&permission.permission_type, &required_permission) {
                    
                    // Check if permission has expired
                    if let Some(expires_at) = permission.expires_at {
                        if current_time >= expires_at {
                            continue; // Skip expired permission
                        }
                    }
                    
                    // Log successful access check
                    Self::log_access(
                        &env,
                        user,
                        resource_id,
                        String::from_str(&env, "access_check_success"),
                        true,
                        None,
                    );
                    
                    return Ok(true);
                }
            }
        }

        // Check access keys
        let access_keys: Map<BytesN<32>, AccessKey> = env
            .storage()
            .instance()
            .get(&symbol!(ACCESS_KEYS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let current_time = env.ledger().timestamp();
        for (_, access_key) in access_keys.iter() {
            if access_key.resource_id == resource_id 
                && access_key.holder == user 
                && access_key.active {
                
                // Check if key has expired
                if let Some(expires_at) = access_key.expires_at {
                    if current_time >= expires_at {
                        continue; // Skip expired key
                    }
                }
                
                // Check if key has required permission
                for permission in access_key.permissions.iter() {
                    if Self::has_permission_level(permission, &required_permission) {
                        // Log successful access check
                        Self::log_access(
                            &env,
                            user,
                            resource_id,
                            String::from_str(&env, "access_check_success_key"),
                            true,
                            None,
                        );
                        
                        return Ok(true);
                    }
                }
            }
        }

        // Log failed access check
        Self::log_access(
            &env,
            user,
            resource_id,
            String::from_str(&env, "access_check_failed"),
            false,
            Some(String::from_str(&env, "No valid permission found")),
        );

        Ok(false)
    }

    /// Helper function to check permission hierarchy
    fn has_permission_level(current: &PermissionType, required: &PermissionType) -> bool {
        match (current, required) {
            (PermissionType::Admin, _) => true, // Admin has all permissions
            (PermissionType::Write, PermissionType::Read) => true, // Write includes read
            (PermissionType::Write, PermissionType::Write) => true,
            (PermissionType::Read, PermissionType::Read) => true,
            _ => false,
        }
    }

    /// Helper function to check if address is authorized
    fn is_authorized(env: &Env, address: &Address) -> bool {
        let admin: Address = env.storage().instance().get(&symbol!("admin")).unwrap_or_else(|| env.current_contract_address());
        address == &admin
    }

    /// Helper function to log access attempts
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
            user,
            resource_id,
            action,
            success,
            reason,
        };

        let mut access_log: Vec<AccessLogEntry> = env
            .storage()
            .instance()
            .get(&symbol!(ACCESS_LOG_KEY))
            .unwrap_or_else(|| Vec::new(env));

        access_log.push_back(log_entry);
        
        // Keep only last 1000 log entries to prevent storage bloat
        if access_log.len() > 1000 {
            access_log = access_log.slice(access_log.len() - 1000..access_log.len());
        }

        env.storage()
            .instance()
            .set(&symbol!(ACCESS_LOG_KEY), &access_log);
    }

    /// Get access log for debugging/auditing
    pub fn get_access_log(env: Env) -> Vec<AccessLogEntry> {
        env.storage()
            .instance()
            .get(&symbol!(ACCESS_LOG_KEY))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Clean up expired permissions and keys
    pub fn cleanup_expired(env: Env) -> Result<u32, AccessControlError> {
        let mut cleaned_count = 0;
        let current_time = env.ledger().timestamp();

        // Clean up expired permissions
        let mut permissions: Map<Address, Vec<AccessPermission>> = env
            .storage()
            .instance()
            .get(&symbol!(USER_PERMISSIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let mut updated_permissions = Map::new(&env);
        
        for (user, user_permissions) in permissions.iter() {
            let mut active_permissions = Vec::new(&env);
            
            for permission in user_permissions.iter() {
                let is_expired = if let Some(expires_at) = permission.expires_at {
                    current_time >= expires_at
                } else {
                    false
                };

                if !is_expired && permission.active {
                    active_permissions.push_back(permission);
                } else if is_expired {
                    cleaned_count += 1;
                }
            }
            
            if !active_permissions.is_empty() {
                updated_permissions.set(user, &active_permissions);
            }
        }

        env.storage()
            .instance()
            .set(&symbol!(USER_PERMISSIONS_KEY), &updated_permissions);

        // Clean up expired access keys
        let mut access_keys: Map<BytesN<32>, AccessKey> = env
            .storage()
            .instance()
            .get(&symbol!(ACCESS_KEYS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let mut updated_keys = Map::new(&env);
        
        for (key_id, access_key) in access_keys.iter() {
            let is_expired = if let Some(expires_at) = access_key.expires_at {
                current_time >= expires_at
            } else {
                false
            };

            if !is_expired && access_key.active {
                updated_keys.set(key_id, &access_key);
            } else if is_expired {
                cleaned_count += 1;
            }
        }

        env.storage()
            .instance()
            .set(&symbol!(ACCESS_KEYS_KEY), &updated_keys);

        Ok(cleaned_count)
    }
}
