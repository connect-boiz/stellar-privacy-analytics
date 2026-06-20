use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Bytes, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DpError {
    /// The query exceeds the remaining privacy budget.
    BudgetExceeded = 10,
    /// Caller is not authorized.
    Unauthorized = 11,
    /// Contract not initialized.
    NotInitialized = 12,
    /// Contract has already been initialized.
    AlreadyInitialized = 13,
}

#[contracttype]
#[derive(Clone)]
pub enum DpDataKey {
    Admin,
    MaxEpsilon,
    UsedEpsilon,
    Initialized,
}

pub struct FixedPointMath;

impl FixedPointMath {
    pub const SCALE: i128 = 10_000;

    /// Approximates ln(1 - x) using Taylor series for x in [0, 1)
    /// x is expected to be scaled by SCALE.
    pub fn ln_1_minus_x(x: i128) -> i128 {
        let x2 = (x * x) / Self::SCALE;
        let x3 = (x2 * x) / Self::SCALE;
        // ln(1-x) ≈ -x - x^2/2 - x^3/3
        -x - (x2 / 2) - (x3 / 3)
    }

    /// Generates deterministic Laplace noise using a pseudo-random mechanism
    /// scaled by `sensitivity / epsilon`.
    pub fn laplace_noise(env: &Env, epsilon: i128, sensitivity: i128, seed: Bytes) -> i128 {
        // b = sensitivity / epsilon
        let b = (sensitivity * Self::SCALE) / epsilon;

        // Generate a uniform random value U in [-0.5, 0.5)
        // We use SHA256 of the seed to ensure determinism and resilience against reconstruction
        let hash = env.crypto().sha256(&seed);

        let b0 = hash.get(0).unwrap_or(0) as u32;
        let b1 = hash.get(1).unwrap_or(0) as u32;
        let b2 = hash.get(2).unwrap_or(0) as u32;
        let b3 = hash.get(3).unwrap_or(0) as u32;
        let raw_u = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;

        let u_scaled = (raw_u as i128 % Self::SCALE) - (Self::SCALE / 2);
        let sign = if u_scaled < 0 { -1 } else { 1 };
        let abs_u = if u_scaled < 0 { -u_scaled } else { u_scaled };

        let two_abs_u = 2 * abs_u;

        // ln(1 - 2|U|)
        let ln_val = Self::ln_1_minus_x(two_abs_u);

        // -b * sgn(U) * ln(...)
        (-b * sign * ln_val) / Self::SCALE
    }
}

#[contract]
pub struct DpAnalyticsContract;

#[contractimpl]
impl DpAnalyticsContract {
    /// Initializes the DP parameters with an admin and a max privacy budget (epsilon).
    /// The admin must authorize initialization, and initialization can only run once.
    pub fn init(env: Env, admin: Address, max_epsilon: i128) -> Result<(), DpError> {
        admin.require_auth();

        if env.storage().instance().has(&DpDataKey::Initialized)
            || env.storage().instance().has(&DpDataKey::Admin)
            || env.storage().instance().has(&DpDataKey::MaxEpsilon)
        {
            return Err(DpError::AlreadyInitialized);
        }

        env.storage().instance().set(&DpDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DpDataKey::MaxEpsilon, &max_epsilon);
        env.storage()
            .instance()
            .set(&DpDataKey::UsedEpsilon, &0i128);
        env.storage().instance().set(&DpDataKey::Initialized, &true);

        Ok(())
    }

    /// Returns the current privacy loss (used epsilon) for transparency.
    pub fn get_privacy_loss(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DpDataKey::UsedEpsilon)
            .unwrap_or(0)
    }

    /// Refreshes the privacy budget periodically. Only callable by the admin.
    pub fn refresh_budget(env: Env) -> Result<(), DpError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DpDataKey::Admin)
            .ok_or(DpError::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DpDataKey::UsedEpsilon, &0i128);
        Ok(())
    }

    /// Applies Laplace noise to an exact value based on the given privacy budget and sensitivity.
    pub fn apply_noise(
        env: Env,
        exact_value: i128,
        query_epsilon: i128,
        sensitivity: i128,
        query_seed: Bytes,
    ) -> Result<i128, DpError> {
        let max_eps: i128 = env
            .storage()
            .instance()
            .get(&DpDataKey::MaxEpsilon)
            .ok_or(DpError::NotInitialized)?;
        let mut used_eps: i128 = env
            .storage()
            .instance()
            .get(&DpDataKey::UsedEpsilon)
            .unwrap_or(0);

        if used_eps + query_epsilon > max_eps {
            return Err(DpError::BudgetExceeded);
        }

        // Update persistent storage with new budget usage
        used_eps += query_epsilon;
        env.storage()
            .instance()
            .set(&DpDataKey::UsedEpsilon, &used_eps);

        // Generate resilient noise
        let noise = FixedPointMath::laplace_noise(&env, query_epsilon, sensitivity, query_seed);

        Ok(exact_value + noise)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn assert_contract_error<T: core::fmt::Debug>(
        result: Result<T, Result<DpError, soroban_sdk::InvokeError>>,
        expected: DpError,
    ) {
        match result {
            Err(Ok(actual)) => assert_eq!(actual, expected),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    #[test]
    fn test_dp_noise_and_budget() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DpAnalyticsContract);
        let client = DpAnalyticsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.init(&admin, &10_000); // 1.0 epsilon

        assert_eq!(client.get_privacy_loss(), 0);

        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);
        // Apply noise with query epsilon of 0.1 (1000)
        let _noisy_val = client.apply_noise(&1_000_000, &1000, &10000, &seed);

        assert_eq!(client.get_privacy_loss(), 1000);

        // Try to exceed the budget of 1.0 (10000) with a 0.9001 (9001) epsilon request
        let res = client.try_apply_noise(&1_000_000, &9001, &10000, &seed);
        assert!(res.is_err());

        // Refresh budget as admin
        client.refresh_budget();

        // Privacy loss is reset
        assert_eq!(client.get_privacy_loss(), 0);
    }

    #[test]
    fn test_init_requires_admin_auth() {
        let env = Env::default();

        let contract_id = env.register_contract(None, DpAnalyticsContract);
        let client = DpAnalyticsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let result = client.try_init(&admin, &10_000);

        assert!(result.is_err());
        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);
        assert_contract_error(
            client.try_apply_noise(&1_000_000, &1000, &10000, &seed),
            DpError::NotInitialized,
        );
        assert_eq!(client.get_privacy_loss(), 0);
    }

    #[test]
    fn test_init_rejects_reinitialization() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DpAnalyticsContract);
        let client = DpAnalyticsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);

        client.init(&admin, &10_000);

        let result = client.try_init(&attacker, &1);
        assert_contract_error(result, DpError::AlreadyInitialized);

        let stored_admin: Address = env.storage().instance().get(&DpDataKey::Admin).unwrap();
        let stored_max_epsilon: i128 = env
            .storage()
            .instance()
            .get(&DpDataKey::MaxEpsilon)
            .unwrap();

        assert_eq!(stored_admin, admin);
        assert_eq!(stored_max_epsilon, 10_000);

        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);
        assert!(client
            .try_apply_noise(&1_000_000, &1000, &10000, &seed)
            .is_ok());
        assert_eq!(client.get_privacy_loss(), 1000);
    }

    #[test]
    fn test_init_rejects_legacy_initialized_storage_without_sentinel() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DpAnalyticsContract);
        let client = DpAnalyticsContractClient::new(&env, &contract_id);

        let legacy_admin = Address::generate(&env);
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DpDataKey::Admin, &legacy_admin);
            env.storage()
                .instance()
                .set(&DpDataKey::MaxEpsilon, &10_000i128);
            env.storage()
                .instance()
                .set(&DpDataKey::UsedEpsilon, &0i128);
        });

        let attacker = Address::generate(&env);
        assert_contract_error(client.try_init(&attacker, &1), DpError::AlreadyInitialized);

        let stored_admin: Address = env.as_contract(&contract_id, || {
            env.storage().instance().get(&DpDataKey::Admin).unwrap()
        });
        let stored_max_epsilon: i128 = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&DpDataKey::MaxEpsilon)
                .unwrap()
        });

        assert_eq!(stored_admin, legacy_admin);
        assert_eq!(stored_max_epsilon, 10_000);
    }
}
