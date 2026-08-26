#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::contract;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::contracttype;
use soroban_sdk::Address;
use soroban_sdk::BytesN;
use soroban_sdk::Env;
use soroban_sdk::String;
use soroban_sdk::Symbol;

// Contract state storage keys
const IMPLEMENTATION_KEY: &str = "IMPLEMENTATION";
const ADMIN_KEY: &str = "ADMIN";
const PENDING_IMPLEMENTATION_KEY: &str = "PENDING_IMPLEMENTATION";
const UPGRADE_DELAY_KEY: &str = "UPGRADE_DELAY";
const UPGRADE_INITIATED_KEY: &str = "UPGRADE_INITIATED";
const IMPLEMENTATIONS_KEY: &str = "IMPLEMENTATIONS";
const STORAGE_VERSION_KEY: &str = "STORAGE_VERSION";
const PENDING_ADMIN_KEY: &str = "PENDING_ADMIN";
const ADMIN_TRANSFER_INITIATED_KEY: &str = "ADMIN_TRANSFER_INITIATED";

/// Current storage layout version. `complete_upgrade` refuses to switch to an
/// implementation that requires a different version, making incompatible
/// upgrades tamper-evident (issue #412 WS4).
pub const STORAGE_VERSION: u32 = 1;

// Constants
pub const MIN_UPGRADE_DELAY: u64 = 86400; // 24 hours in seconds
pub const DEFAULT_UPGRADE_DELAY: u64 = 604800; // 7 days in seconds

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct UpgradeInfo {
    pub old_implementation: BytesN<32>,
    pub new_implementation: BytesN<32>,
    pub initiated_at: u64,
    pub upgrade_delay: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ProxyError {
    NotAdmin = 1,
    InvalidImplementation = 2,
    UpgradeNotReady = 3,
    UpgradeAlreadyInitiated = 4,
    NoPendingUpgrade = 5,
    InvalidDelay = 6,
    AlreadyInitialized = 7,
    NotInitialized = 8,
    StorageVersionMismatch = 9,
    UnregisteredImplementation = 10,
    PendingAdminAlreadySet = 11,
    NoPendingAdminTransfer = 12,
}

#[contract]
pub struct UpgradeableProxy;

#[contractimpl]
impl UpgradeableProxy {
    /// Initialize the proxy with an implementation contract and admin
    pub fn initialize(
        env: Env,
        implementation: BytesN<32>,
        admin: Address,
    ) -> Result<(), ProxyError> {
        // Check if already initialized
        if env
            .storage()
            .instance()
            .has(&String::from_str(&env, IMPLEMENTATION_KEY))
        {
            return Err(ProxyError::AlreadyInitialized);
        }

        // Require admin authorization to prevent front-running
        // initialize() between deployment and the legitimate
        // admin's setup transaction.
        admin.require_auth();

        // Validate implementation address (basic check)
        if implementation == BytesN::from_array(&env, &[0; 32]) {
            return Err(ProxyError::InvalidImplementation);
        }

        // Set implementation
        env.storage()
            .instance()
            .set(&String::from_str(&env, IMPLEMENTATION_KEY), &implementation);

        // Set admin
        env.storage()
            .instance()
            .set(&String::from_str(&env, ADMIN_KEY), &admin);

        // Set default upgrade delay
        env.storage().instance().set(
            &String::from_str(&env, UPGRADE_DELAY_KEY),
            &DEFAULT_UPGRADE_DELAY,
        );

        // Record the storage layout version so upgrade-compatibility checks
        // can be enforced (issue #412 WS4).
        env.storage().instance().set(
            &String::from_str(&env, STORAGE_VERSION_KEY),
            &STORAGE_VERSION,
        );

        Ok(())
    }

    /// Get the current storage layout version.
    pub fn storage_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&String::from_str(&env, STORAGE_VERSION_KEY))
            .unwrap_or(STORAGE_VERSION)
    }

    /// Register an implementation hash as verified and record the storage
    /// layout version it requires (admin only). `initiate_upgrade` refuses any
    /// hash that was not registered here, so an arbitrary `BytesN<32>` can
    /// never be pointed to as an implementation (issue #412 WS4).
    pub fn register_implementation(
        env: Env,
        caller: Address,
        implementation: BytesN<32>,
        required_storage_version: u32,
    ) -> Result<(), ProxyError> {
        Self::verify_admin(&env, &caller)?;

        if implementation == BytesN::from_array(&env, &[0; 32]) {
            return Err(ProxyError::InvalidImplementation);
        }
        if required_storage_version == 0 {
            return Err(ProxyError::InvalidImplementation);
        }

        let mut implementations: soroban_sdk::Map<BytesN<32>, u32> = env
            .storage()
            .instance()
            .get(&String::from_str(&env, IMPLEMENTATIONS_KEY))
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        implementations.set(implementation.clone(), required_storage_version);
        env.storage().instance().set(
            &String::from_str(&env, IMPLEMENTATIONS_KEY),
            &implementations,
        );

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "implementation_registered"),),
            (event_nonce, implementation, required_storage_version),
        );

        Ok(())
    }

    /// Get the current implementation address
    pub fn implementation(env: Env) -> Result<BytesN<32>, ProxyError> {
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, IMPLEMENTATION_KEY))
        {
            return Err(ProxyError::NotInitialized);
        }

        Ok(env
            .storage()
            .instance()
            .get(&String::from_str(&env, IMPLEMENTATION_KEY))
            .unwrap())
    }

    /// Get the admin address
    pub fn admin(env: Env) -> Result<Address, ProxyError> {
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, ADMIN_KEY))
        {
            return Err(ProxyError::NotInitialized);
        }

        Ok(env
            .storage()
            .instance()
            .get(&String::from_str(&env, ADMIN_KEY))
            .unwrap())
    }

    /// Begin upgrade process with time delay
    pub fn initiate_upgrade(
        env: Env,
        new_implementation: BytesN<32>,
        caller: Address,
    ) -> Result<(), ProxyError> {
        // Delegate auth + admin-equality to the shared helper. See issue #297.
        Self::verify_admin(&env, &caller)?;

        // Validate new implementation: it must be zero-free AND have been
        // registered/verified by the admin (issue #412 WS4).
        if new_implementation == BytesN::from_array(&env, &[0; 32]) {
            return Err(ProxyError::InvalidImplementation);
        }

        let implementations: soroban_sdk::Map<BytesN<32>, u32> = env
            .storage()
            .instance()
            .get(&String::from_str(&env, IMPLEMENTATIONS_KEY))
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));
        if !implementations.contains_key(new_implementation.clone()) {
            return Err(ProxyError::UnregisteredImplementation);
        }

        // Check if upgrade already initiated
        if env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
        {
            return Err(ProxyError::UpgradeAlreadyInitiated);
        }

        let current_implementation = Self::implementation(env.clone())?;
        let upgrade_delay = env
            .storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap_or(DEFAULT_UPGRADE_DELAY);

        // Set pending implementation
        env.storage().instance().set(
            &String::from_str(&env, PENDING_IMPLEMENTATION_KEY),
            &new_implementation,
        );

        // Set upgrade initiation time
        env.storage().instance().set(
            &String::from_str(&env, UPGRADE_INITIATED_KEY),
            &env.ledger().timestamp(),
        );

        // Emit upgrade initiated event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "upgrade_initiated"),),
            (
                event_nonce,
                UpgradeInfo {
                    old_implementation: current_implementation,
                    new_implementation,
                    initiated_at: env.ledger().timestamp(),
                    upgrade_delay,
                },
            ),
        );

        Ok(())
    }

    /// Complete the upgrade after delay period
    pub fn complete_upgrade(env: Env, caller: Address) -> Result<(), ProxyError> {
        // Delegate auth + admin-equality to the shared helper. See issue #297.
        Self::verify_admin(&env, &caller)?;

        // Check if there's a pending upgrade
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
        {
            return Err(ProxyError::NoPendingUpgrade);
        }

        let pending_implementation = env
            .storage()
            .instance()
            .get::<_, BytesN<32>>(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
            .unwrap();

        let upgrade_initiated = env
            .storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_INITIATED_KEY))
            .unwrap();

        let upgrade_delay = env
            .storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap_or(DEFAULT_UPGRADE_DELAY);

        // Check if enough time has passed
        let current_time = env.ledger().timestamp();
        if current_time < upgrade_initiated + upgrade_delay {
            return Err(ProxyError::UpgradeNotReady);
        }

        // Storage-layout compatibility: the pending implementation must have
        // been registered with a storage version equal to the current layout,
        // otherwise the upgrade is refused (issue #412 WS4).
        let implementations: soroban_sdk::Map<BytesN<32>, u32> = env
            .storage()
            .instance()
            .get(&String::from_str(&env, IMPLEMENTATIONS_KEY))
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));
        let required_version = implementations
            .get(pending_implementation.clone())
            .ok_or(ProxyError::UnregisteredImplementation)?;
        let current_version = Self::storage_version(env.clone());
        if required_version != current_version {
            return Err(ProxyError::StorageVersionMismatch);
        }

        let old_implementation = Self::implementation(env.clone())?;

        // Perform the upgrade
        env.storage().instance().set(
            &String::from_str(&env, IMPLEMENTATION_KEY),
            &pending_implementation,
        );

        // Clear pending upgrade data
        env.storage()
            .instance()
            .remove(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY));
        env.storage()
            .instance()
            .remove(&String::from_str(&env, UPGRADE_INITIATED_KEY));

        // Emit upgrade completed event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "upgrade_completed"),),
            (
                event_nonce,
                UpgradeInfo {
                    old_implementation,
                    new_implementation: pending_implementation,
                    initiated_at: upgrade_initiated,
                    upgrade_delay,
                },
            ),
        );

        Ok(())
    }

    /// Cancel pending upgrade
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), ProxyError> {
        // Delegate auth + admin-equality to the shared helper. See issue #297.
        Self::verify_admin(&env, &caller)?;

        // Check if there's a pending upgrade
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
        {
            return Err(ProxyError::NoPendingUpgrade);
        }

        // Clear pending upgrade data
        env.storage()
            .instance()
            .remove(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY));
        env.storage()
            .instance()
            .remove(&String::from_str(&env, UPGRADE_INITIATED_KEY));

        // Emit upgrade cancelled event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "upgrade_cancelled"),),
            (event_nonce, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Set upgrade delay (only callable by admin)
    pub fn set_upgrade_delay(env: Env, new_delay: u64, caller: Address) -> Result<(), ProxyError> {
        // Delegate auth + admin-equality to the shared helper. See issue #297.
        Self::verify_admin(&env, &caller)?;

        // Validate delay
        if new_delay < MIN_UPGRADE_DELAY {
            return Err(ProxyError::InvalidDelay);
        }

        env.storage()
            .instance()
            .set(&String::from_str(&env, UPGRADE_DELAY_KEY), &new_delay);

        // Emit delay changed event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "upgrade_delay_changed"),),
            (event_nonce, new_delay),
        );

        Ok(())
    }

    /// Get current upgrade delay
    pub fn upgrade_delay(env: Env) -> Result<u64, ProxyError> {
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, UPGRADE_DELAY_KEY))
        {
            return Ok(DEFAULT_UPGRADE_DELAY);
        }

        Ok(env
            .storage()
            .instance()
            .get(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap())
    }

    /// Get pending upgrade info
    pub fn pending_upgrade(env: Env) -> Result<Option<UpgradeInfo>, ProxyError> {
        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
        {
            return Ok(None);
        }

        let pending_implementation = env
            .storage()
            .instance()
            .get::<_, BytesN<32>>(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
            .unwrap();

        let upgrade_initiated = env
            .storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_INITIATED_KEY))
            .unwrap();

        let upgrade_delay = env
            .storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap_or(DEFAULT_UPGRADE_DELAY);

        let current_implementation = Self::implementation(env.clone())?;

        Ok(Some(UpgradeInfo {
            old_implementation: current_implementation,
            new_implementation: pending_implementation,
            initiated_at: upgrade_initiated,
            upgrade_delay,
        }))
    }

    /// Get the address that has been proposed as the next admin, if any.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get(&String::from_str(&env, PENDING_ADMIN_KEY))
    }

    /// Propose a new admin (only callable by current admin). The transfer is
    /// NOT effective until the proposed admin calls `accept_admin_transfer` —
    /// a two-step handoff so a mistyped address can never permanently lock out
    /// admin (issue #412 WS4).
    pub fn transfer_admin(env: Env, new_admin: Address, caller: Address) -> Result<(), ProxyError> {
        // Capture the current admin BEFORE the helper consumes the env.
        let old_admin = Self::admin(env.clone())?;

        // Delegate auth + admin-equality to the shared helper. See issue #297.
        Self::verify_admin(&env, &caller)?;

        // One pending proposal at a time.
        if env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_ADMIN_KEY))
        {
            return Err(ProxyError::PendingAdminAlreadySet);
        }

        // Record the proposal; admin does not change yet.
        env.storage()
            .instance()
            .set(&String::from_str(&env, PENDING_ADMIN_KEY), &new_admin);
        env.storage().instance().set(
            &String::from_str(&env, ADMIN_TRANSFER_INITIATED_KEY),
            &env.ledger().timestamp(),
        );

        // Emit admin transfer proposed event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "admin_transfer_proposed"),),
            (event_nonce, old_admin, new_admin, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Accept a pending admin transfer. Only the proposed admin may call this;
    /// on success the proposed admin becomes the stored admin and any pending
    /// proposal is cleared.
    pub fn accept_admin_transfer(env: Env, caller: Address) -> Result<(), ProxyError> {
        // The proposer's signature alone is not enough — the proposed admin
        // must authorize the acceptance, so a mistyped or compromised proposal
        // cannot silently hand over the contract.
        caller.require_auth();

        let pending_admin: Address = env
            .storage()
            .instance()
            .get(&String::from_str(&env, PENDING_ADMIN_KEY))
            .ok_or(ProxyError::NoPendingAdminTransfer)?;

        if caller != pending_admin {
            return Err(ProxyError::NotAdmin);
        }

        let old_admin = Self::admin(env.clone())?;

        env.storage()
            .instance()
            .set(&String::from_str(&env, ADMIN_KEY), &pending_admin);
        env.storage()
            .instance()
            .remove(&String::from_str(&env, PENDING_ADMIN_KEY));
        env.storage()
            .instance()
            .remove(&String::from_str(&env, ADMIN_TRANSFER_INITIATED_KEY));

        // Emit admin transferred event
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "admin_transferred"),),
            (
                event_nonce,
                old_admin,
                pending_admin,
                env.ledger().timestamp(),
            ),
        );

        Ok(())
    }

    /// Cancel a pending admin transfer (only callable by the current admin).
    pub fn cancel_admin_transfer(env: Env, caller: Address) -> Result<(), ProxyError> {
        Self::verify_admin(&env, &caller)?;

        if !env
            .storage()
            .instance()
            .has(&String::from_str(&env, PENDING_ADMIN_KEY))
        {
            return Err(ProxyError::NoPendingAdminTransfer);
        }

        env.storage()
            .instance()
            .remove(&String::from_str(&env, PENDING_ADMIN_KEY));
        env.storage()
            .instance()
            .remove(&String::from_str(&env, ADMIN_TRANSFER_INITIATED_KEY));

        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (String::from_str(&env, "admin_transfer_cancelled"),),
            (event_nonce, env.ledger().timestamp()),
        );

        Ok(())
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

    /// Centralized admin guard for all mutating entry points.
    ///
    /// Performs two checks:
    /// 1. **Host-level auth** (`caller.require_auth()`) — the Soroban
    ///    auth context must approve the call. This is the only check
    ///    that protects against caller-spoofing, because the subsequent
    ///    equality check trusts whatever `caller` argument is passed.
    /// 2. **Stored-admin equality** — the supplied caller must match
    ///    the admin previously recorded by `initialize`.
    ///
    /// Centralizing these checks here prevents future mutating methods
    /// from accidentally omitting host-level auth. Every public entry
    /// point that affects proxy state MUST start with
    /// `Self::verify_admin(&env, &caller)?;`. See GitHub issue #297.
    fn verify_admin(env: &Env, caller: &Address) -> Result<(), ProxyError> {
        caller.require_auth();
        let admin = Self::admin(env.clone())?;
        if caller != &admin {
            return Err(ProxyError::NotAdmin);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
