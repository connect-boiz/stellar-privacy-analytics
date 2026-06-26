use soroban_sdk::contract;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::contracttype;
use soroban_sdk::Address;
use soroban_sdk::BytesN;
use soroban_sdk::Env;
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

        env.storage()
            .instance()
            .set(&String::from_str(&env, UPGRADE_DELAY_KEY), &new_delay);

        // Emit delay changed event
        env.events().publish(
            (String::from_str(&env, "upgrade_delay_changed"),),
            new_delay,
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

    /// Transfer admin rights (only callable by current admin)
    pub fn transfer_admin(env: Env, new_admin: Address, caller: Address) -> Result<(), ProxyError> {
        // Check if caller is admin
        let admin = Self::admin(env.clone())?;
        if caller != admin {
            return Err(ProxyError::NotAdmin);
        }

        // Set new admin
        env.storage()
            .instance()
            .set(&String::from_str(&env, ADMIN_KEY), &new_admin);

        // Emit admin transferred event
        env.events().publish(
            (String::from_str(&env, "admin_transferred"),),
            (admin, new_admin),
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};

    // ----- Test helpers -----------------------------------------------------

    /// A non-zero 32-byte hash that can act as a valid implementation
    /// identifier in proxy tests. The proxy rejects the all-zero address
    /// as invalid. The `env` is threaded through so the resulting `BytesN`
    /// is bound to the same env instance the contract is operating on,
    /// avoiding cross-env type mismatches.
    fn implementation_with_byte(env: &Env, seed: u8) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        bytes[0] = seed;
        BytesN::from_array(env, &bytes)
    }

    fn valid_implementation(env: &Env) -> BytesN<32> {
        implementation_with_byte(env, 1)
    }

    fn new_implementation(env: &Env) -> BytesN<32> {
        implementation_with_byte(env, 2)
    }

    fn third_implementation(env: &Env) -> BytesN<32> {
        implementation_with_byte(env, 3)
    }

    fn zero_implementation(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[0u8; 32])
    }

    // ----- initialize ------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        let impl_addr = valid_implementation(&env);

        let result = UpgradeableProxy::initialize(env.clone(), impl_addr.clone(), admin.clone());
        assert_eq!(result, Ok(()));

        assert_eq!(
            UpgradeableProxy::implementation(env.clone()),
            Ok(impl_addr)
        );
        assert_eq!(UpgradeableProxy::admin(env.clone()), Ok(admin));

        // Default upgrade delay is 7 days.
        assert_eq!(
            UpgradeableProxy::upgrade_delay(env.clone()),
            Ok(DEFAULT_UPGRADE_DELAY)
        );
    }

    #[test]
    fn test_initialize_fails_when_already_initialized() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        let impl_addr = valid_implementation(&env);

        UpgradeableProxy::initialize(env.clone(), impl_addr.clone(), admin.clone()).unwrap();

        let second = UpgradeableProxy::initialize(env.clone(), impl_addr, admin);
        assert_eq!(second, Err(ProxyError::AlreadyInitialized));
    }

    #[test]
    fn test_initialize_fails_with_invalid_implementation() {
        let (env, admin) = (Env::default(), Address::generate(&env));

        let result = UpgradeableProxy::initialize(env.clone(), zero_implementation(&env), admin);
        assert_eq!(result, Err(ProxyError::InvalidImplementation));
    }

    #[test]
    fn test_implementation_query_before_initialize_fails() {
        let env = Env::default();

        assert_eq!(
            UpgradeableProxy::implementation(env.clone()),
            Err(ProxyError::NotInitialized)
        );
        assert_eq!(
            UpgradeableProxy::admin(env.clone()),
            Err(ProxyError::NotInitialized)
        );
    }

    // ----- initiate_upgrade ------------------------------------------------

    #[test]
    fn test_initiate_upgrade_by_admin_succeeds() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let new_impl = new_implementation(&env);
        let result =
            UpgradeableProxy::initiate_upgrade(env.clone(), new_impl.clone(), admin.clone());
        assert_eq!(result, Ok(()));

        let pending = UpgradeableProxy::pending_upgrade(env.clone()).unwrap();
        let pending = pending.expect("pending upgrade info should exist");
        assert_eq!(pending.new_implementation, new_impl);
        assert_eq!(pending.initiated_at, env.ledger().timestamp());
    }

    #[test]
    fn test_initiate_upgrade_by_non_admin_fails() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin).unwrap();

        let result = UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), stranger);
        assert_eq!(result, Err(ProxyError::NotAdmin));
    }

    #[test]
    fn test_initiate_upgrade_with_invalid_implementation_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result = UpgradeableProxy::initiate_upgrade(env.clone(), zero_implementation(&env), admin);
        assert_eq!(result, Err(ProxyError::InvalidImplementation));
    }

    #[test]
    fn test_initiate_upgrade_twice_without_completion_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        UpgradeableProxy::initiate_upgrade(
            env.clone(),
            new_implementation(&env),
            admin.clone(),
        )
        .unwrap();

        let second = UpgradeableProxy::initiate_upgrade(
            env.clone(),
            new_implementation(&env),
            admin.clone(),
        );
        assert_eq!(second, Err(ProxyError::UpgradeAlreadyInitiated));

        // The pending upgrade from the first call is still tracked.
        let pending = UpgradeableProxy::pending_upgrade(env.clone()).unwrap();
        assert!(
            pending.is_some(),
            "first initiate must leave pending upgrade stored"
        );
    }

    // ----- complete_upgrade ------------------------------------------------

    #[test]
    fn test_complete_upgrade_before_delay_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let new_impl = new_implementation(&env);
        UpgradeableProxy::initiate_upgrade(env.clone(), new_impl, admin.clone()).unwrap();

        // We have NOT advanced the ledger, so the delay has not elapsed.
        let result = UpgradeableProxy::complete_upgrade(env.clone(), admin.clone());
        assert_eq!(result, Err(ProxyError::UpgradeNotReady));
    }

    #[test]
    fn test_complete_upgrade_after_delay_succeeds() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let new_impl = new_implementation(&env);
        UpgradeableProxy::initiate_upgrade(env.clone(), new_impl.clone(), admin.clone()).unwrap();

        // Advance the ledger past the minimum upgrade delay so the upgrade
        // can be completed.
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + DEFAULT_UPGRADE_DELAY + 1);

        let result = UpgradeableProxy::complete_upgrade(env.clone(), admin);
        assert_eq!(result, Ok(()));

        assert_eq!(
            UpgradeableProxy::implementation(env.clone()),
            Ok(new_impl)
        );
        assert_eq!(
            UpgradeableProxy::pending_upgrade(env.clone()),
            Ok(None),
            "pending upgrade should be cleared after a successful completion"
        );
    }

    #[test]
    fn test_complete_upgrade_by_non_admin_fails_even_after_delay() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), admin.clone())
            .unwrap();
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + DEFAULT_UPGRADE_DELAY + 1);

        let result = UpgradeableProxy::complete_upgrade(env.clone(), stranger);
        assert_eq!(result, Err(ProxyError::NotAdmin));
    }

    #[test]
    fn test_complete_upgrade_with_no_pending_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result = UpgradeableProxy::complete_upgrade(env.clone(), admin);
        assert_eq!(result, Err(ProxyError::NoPendingUpgrade));
    }

    // ----- cancel_upgrade --------------------------------------------------

    #[test]
    fn test_cancel_upgrade_clears_pending_upgrade() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), admin.clone())
            .unwrap();
        assert!(UpgradeableProxy::pending_upgrade(env.clone())
            .unwrap()
            .is_some());

        let result = UpgradeableProxy::cancel_upgrade(env.clone(), admin.clone());
        assert_eq!(result, Ok(()));

        assert_eq!(
            UpgradeableProxy::pending_upgrade(env.clone()),
            Ok(None),
            "pending upgrade information should be cleared after cancellation"
        );

        // Original implementation must remain in place.
        assert_eq!(
            UpgradeableProxy::implementation(env.clone()),
            Ok(valid_implementation(&env))
        );

        // After cancellation, a fresh upgrade can be initiated.
        assert_eq!(
            UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), admin),
            Ok(())
        );
    }

    #[test]
    fn test_cancel_upgrade_by_non_admin_fails() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), admin).unwrap();

        let result = UpgradeableProxy::cancel_upgrade(env.clone(), stranger);
        assert_eq!(result, Err(ProxyError::NotAdmin));
    }

    #[test]
    fn test_cancel_upgrade_with_no_pending_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result = UpgradeableProxy::cancel_upgrade(env.clone(), admin);
        assert_eq!(result, Err(ProxyError::NoPendingUpgrade));
    }

    // ----- transfer_admin --------------------------------------------------

    #[test]
    fn test_transfer_admin_enables_new_admin() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        let new_admin = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result = UpgradeableProxy::transfer_admin(
            env.clone(),
            new_admin.clone(),
            admin.clone(),
        );
        assert_eq!(result, Ok(()));

        // The new admin is now the admin of record.
        assert_eq!(UpgradeableProxy::admin(env.clone()), Ok(new_admin.clone()));

        // Privileged actions with the OLD admin are rejected.
        assert_eq!(
            UpgradeableProxy::initiate_upgrade(
                env.clone(),
                new_implementation(&env),
                admin.clone()
            ),
            Err(ProxyError::NotAdmin)
        );

        // Privileged actions with the NEW admin succeed.
        assert_eq!(
            UpgradeableProxy::initiate_upgrade(
                env.clone(),
                new_implementation(&env),
                new_admin.clone()
            ),
            Ok(())
        );
        // Cleanup so cancellation test below starts from a clean state.
        UpgradeableProxy::cancel_upgrade(env.clone(), new_admin.clone()).unwrap();
    }

    #[test]
    fn test_transfer_admin_by_non_admin_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        let stranger = Address::generate(&env);
        let new_admin = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin).unwrap();

        let result = UpgradeableProxy::transfer_admin(env.clone(), new_admin, stranger);
        assert_eq!(result, Err(ProxyError::NotAdmin));
    }

    // ----- set_upgrade_delay ----------------------------------------------

    #[test]
    fn test_set_upgrade_delay_at_minimum_succeeds() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result =
            UpgradeableProxy::set_upgrade_delay(env.clone(), MIN_UPGRADE_DELAY, admin.clone());
        assert_eq!(result, Ok(()));

        assert_eq!(
            UpgradeableProxy::upgrade_delay(env.clone()),
            Ok(MIN_UPGRADE_DELAY)
        );
    }

    #[test]
    fn test_set_upgrade_delay_above_minimum_succeeds() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let new_delay = MIN_UPGRADE_DELAY + 86_400; // 48h
        let result = UpgradeableProxy::set_upgrade_delay(env.clone(), new_delay, admin);
        assert_eq!(result, Ok(()));

        assert_eq!(UpgradeableProxy::upgrade_delay(env.clone()), Ok(new_delay));
    }

    #[test]
    fn test_set_upgrade_delay_below_minimum_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result =
            UpgradeableProxy::set_upgrade_delay(env.clone(), MIN_UPGRADE_DELAY - 1, admin);
        assert_eq!(result, Err(ProxyError::InvalidDelay));
    }

    #[test]
    fn test_set_upgrade_delay_zero_fails() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let result = UpgradeableProxy::set_upgrade_delay(env.clone(), 0u64, admin);
        assert_eq!(result, Err(ProxyError::InvalidDelay));
    }

    #[test]
    fn test_set_upgrade_delay_by_non_admin_fails() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin).unwrap();

        let result = UpgradeableProxy::set_upgrade_delay(env.clone(), MIN_UPGRADE_DELAY, stranger);
        assert_eq!(result, Err(ProxyError::NotAdmin));
    }

    // ----- integration / edge cases ---------------------------------------

    #[test]
    fn test_full_upgrade_lifecycle() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let v1 = new_implementation(&env);
        let v2 = third_implementation(&env);

        UpgradeableProxy::initiate_upgrade(env.clone(), v1.clone(), admin.clone()).unwrap();
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + DEFAULT_UPGRADE_DELAY + 1);
        UpgradeableProxy::complete_upgrade(env.clone(), admin.clone()).unwrap();
        assert_eq!(UpgradeableProxy::implementation(env.clone()), Ok(v1));

        UpgradeableProxy::initiate_upgrade(env.clone(), v2.clone(), admin.clone()).unwrap();
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + DEFAULT_UPGRADE_DELAY + 1);
        UpgradeableProxy::complete_upgrade(env.clone(), admin).unwrap();
        assert_eq!(UpgradeableProxy::implementation(env.clone()), Ok(v2));
    }

    #[test]
    fn test_custom_delay_affects_complete_upgrade_window() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let custom_delay = MIN_UPGRADE_DELAY + 86_400; // 48h
        UpgradeableProxy::set_upgrade_delay(env.clone(), custom_delay, admin.clone()).unwrap();

        UpgradeableProxy::initiate_upgrade(env.clone(), new_implementation(&env), admin.clone())
            .unwrap();

        // One second before the custom delay elapses, completion is still not ready.
        env.ledger().set_timestamp(custom_delay - 1);
        assert_eq!(
            UpgradeableProxy::complete_upgrade(env.clone(), admin.clone()),
            Err(ProxyError::UpgradeNotReady)
        );

        // At the exact delay boundary, completion succeeds (strict `<` comparison).
        env.ledger().set_timestamp(custom_delay);
        let result = UpgradeableProxy::complete_upgrade(env.clone(), admin);
        assert_eq!(result, Ok(()));

        assert_eq!(
            UpgradeableProxy::implementation(env.clone()),
            Ok(new_implementation(&env))
        );
    }

    #[test]
    fn test_upgrade_info_preserves_old_implementation_reference() {
        let (env, admin) = (Env::default(), Address::generate(&env));
        UpgradeableProxy::initialize(env.clone(), valid_implementation(&env), admin.clone()).unwrap();

        let v1 = new_implementation(&env);
        UpgradeableProxy::initiate_upgrade(env.clone(), v1, admin.clone()).unwrap();

        let pending = UpgradeableProxy::pending_upgrade(env.clone())
            .unwrap()
            .expect("pending upgrade info should exist after initiate");
        // Old implementation reference is captured at initiation time.
        assert_eq!(pending.old_implementation, valid_implementation(&env));
    }
}

