use soroban_sdk::contracttype;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::Address;
use soroban_sdk::Env;
use soroban_sdk::BytesN;
use soroban_sdk::String;

// Contract state storage keys
const IMPLEMENTATION_KEY: &str = "IMPLEMENTATION";
const ADMIN_KEY: &str = "ADMIN";
const PENDING_IMPLEMENTATION_KEY: &str = "PENDING_IMPLEMENTATION";
const UPGRADE_DELAY_KEY: &str = "UPGRADE_DELAY";
const UPGRADE_INITIATED_KEY: &str = "UPGRADE_INITIATED";

// Constants
const MIN_UPGRADE_DELAY: u64 = 86400; // 24 hours in seconds
const DEFAULT_UPGRADE_DELAY: u64 = 604800; // 7 days in seconds

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
}

pub struct UpgradeableProxy;

#[contractimpl]
impl UpgradeableProxy {
    /// Initialize the proxy with an implementation contract and admin
    pub fn initialize(env: Env, implementation: BytesN<32>, admin: Address) -> Result<(), ProxyError> {
        // Check if already initialized
        if env.storage().instance().has(&String::from_str(&env, IMPLEMENTATION_KEY)) {
            return Err(ProxyError::AlreadyInitialized);
        }

        // Validate implementation address (basic check)
        if implementation == BytesN::from_array(&env, &[0; 32]) {
            return Err(ProxyError::InvalidImplementation);
        }

        // Set implementation
        env.storage().instance().set(
            &String::from_str(&env, IMPLEMENTATION_KEY),
            &implementation,
        );

        // Set admin
        env.storage().instance().set(
            &String::from_str(&env, ADMIN_KEY),
            &admin,
        );

        // Set default upgrade delay
        env.storage().instance().set(
            &String::from_str(&env, UPGRADE_DELAY_KEY),
            &DEFAULT_UPGRADE_DELAY,
        );

        Ok(())
    }

    /// Get the current implementation address
    pub fn implementation(env: Env) -> Result<BytesN<32>, ProxyError> {
        if !env.storage().instance().has(&String::from_str(&env, IMPLEMENTATION_KEY)) {
            return Err(ProxyError::NotInitialized);
        }

        Ok(env.storage()
            .instance()
            .get(&String::from_str(&env, IMPLEMENTATION_KEY))
            .unwrap())
    }

    /// Get the admin address
    pub fn admin(env: Env) -> Result<Address, ProxyError> {
        if !env.storage().instance().has(&String::from_str(&env, ADMIN_KEY)) {
            return Err(ProxyError::NotInitialized);
        }

        Ok(env.storage()
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
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Validate new implementation
        if new_implementation == BytesN::from_array(&env, &[0; 32]) {
            return Err(ProxyError::InvalidImplementation);
        }

        // Check if upgrade already initiated
        if env.storage().instance().has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY)) {
            return Err(ProxyError::UpgradeAlreadyInitiated);
        }

        let current_implementation = Self::implementation(env.clone())?;
        let upgrade_delay = env.storage()
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
        env.events().publish(
            (String::from_str(&env, "upgrade_initiated"),),
            UpgradeInfo {
                old_implementation: current_implementation,
                new_implementation,
                initiated_at: env.ledger().timestamp(),
                upgrade_delay,
            },
        );

        Ok(())
    }

    /// Complete the upgrade after delay period
    pub fn complete_upgrade(env: Env, caller: Address) -> Result<(), ProxyError> {
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Check if there's a pending upgrade
        if !env.storage().instance().has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY)) {
            return Err(ProxyError::NoPendingUpgrade);
        }

        let pending_implementation = env.storage()
            .instance()
            .get::<_, BytesN<32>>(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
            .unwrap();

        let upgrade_initiated = env.storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_INITIATED_KEY))
            .unwrap();

        let upgrade_delay = env.storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap_or(DEFAULT_UPGRADE_DELAY);

        // Check if enough time has passed
        let current_time = env.ledger().timestamp();
        if current_time < upgrade_initiated + upgrade_delay {
            return Err(ProxyError::UpgradeNotReady);
        }

        let old_implementation = Self::implementation(env.clone())?;

        // Perform the upgrade
        env.storage().instance().set(
            &String::from_str(&env, IMPLEMENTATION_KEY),
            &pending_implementation,
        );

        // Clear pending upgrade data
        env.storage().instance().remove(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY));
        env.storage().instance().remove(&String::from_str(&env, UPGRADE_INITIATED_KEY));

        // Emit upgrade completed event
        env.events().publish(
            (String::from_str(&env, "upgrade_completed"),),
            UpgradeInfo {
                old_implementation,
                new_implementation: pending_implementation,
                initiated_at: upgrade_initiated,
                upgrade_delay,
            },
        );

        Ok(())
    }

    /// Cancel pending upgrade
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), ProxyError> {
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Check if there's a pending upgrade
        if !env.storage().instance().has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY)) {
            return Err(ProxyError::NoPendingUpgrade);
        }

        // Clear pending upgrade data
        env.storage().instance().remove(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY));
        env.storage().instance().remove(&String::from_str(&env, UPGRADE_INITIATED_KEY));

        // Emit upgrade cancelled event
        env.events().publish(
            (String::from_str(&env, "upgrade_cancelled"),),
            env.ledger().timestamp(),
        );

        Ok(())
    }

    /// Set upgrade delay (only callable by admin)
    pub fn set_upgrade_delay(env: Env, new_delay: u64, caller: Address) -> Result<(), ProxyError> {
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Validate delay
        if new_delay < MIN_UPGRADE_DELAY {
            return Err(ProxyError::InvalidDelay);
        }

        env.storage().instance().set(
            &String::from_str(&env, UPGRADE_DELAY_KEY),
            &new_delay,
        );

        // Emit delay changed event
        env.events().publish(
            (String::from_str(&env, "upgrade_delay_changed"),),
            new_delay,
        );

        Ok(())
    }

    /// Get current upgrade delay
    pub fn upgrade_delay(env: Env) -> Result<u64, ProxyError> {
        if !env.storage().instance().has(&String::from_str(&env, UPGRADE_DELAY_KEY)) {
            return Ok(DEFAULT_UPGRADE_DELAY);
        }

        Ok(env.storage()
            .instance()
            .get(&String::from_str(&env, UPGRADE_DELAY_KEY))
            .unwrap())
    }

    /// Get pending upgrade info
    pub fn pending_upgrade(env: Env) -> Result<Option<UpgradeInfo>, ProxyError> {
        if !env.storage().instance().has(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY)) {
            return Ok(None);
        }

        let pending_implementation = env.storage()
            .instance()
            .get::<_, BytesN<32>>(&String::from_str(&env, PENDING_IMPLEMENTATION_KEY))
            .unwrap();

        let upgrade_initiated = env.storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, UPGRADE_INITIATED_KEY))
            .unwrap();

        let upgrade_delay = env.storage()
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

    /// Transfer admin rights (only callable by current admin)
    pub fn transfer_admin(env: Env, new_admin: Address, caller: Address) -> Result<(), ProxyError> {
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Set new admin
        env.storage().instance().set(
            &String::from_str(&env, ADMIN_KEY),
            &new_admin,
        );

        // Emit admin transferred event
        env.events().publish(
            (String::from_str(&env, "admin_transferred"),),
            (admin, new_admin),
        );

        Ok(())
    }
}
