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
}

#[contracttype]
#[derive(Clone)]
pub enum DpDataKey {
    Admin,
    MaxEpsilon,
    UsedEpsilon,
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
        // Use checked multiplication to prevent i128 overflow in computation
        let b = sensitivity
            .checked_mul(Self::SCALE)
            .map(|v| v / epsilon)
            .unwrap_or(i128::MAX);

        // Generate a uniform random value U in [-0.5, 0.5)
        // We use SHA256 of the seed to ensure determinism and resilience against reconstruction
        let hash = env.crypto().sha256(&seed);
        let hash_array = hash.to_array();

        let b0 = hash_array[0] as u32;
        let b1 = hash_array[1] as u32;
        let b2 = hash_array[2] as u32;
        let b3 = hash_array[3] as u32;
        let raw_u = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;

        let u_scaled = (raw_u as i128 % Self::SCALE) - (Self::SCALE / 2);
        let sign = if u_scaled < 0 { -1 } else { 1 };
        let abs_u = if u_scaled < 0 { -u_scaled } else { u_scaled };

        let two_abs_u = 2 * abs_u;

        // ln(1 - 2|U|)
        let ln_val = Self::ln_1_minus_x(two_abs_u);

        // Compute absolute magnitude of ln_val for checked multiplication
        let abs_ln_val = if ln_val < 0 { -ln_val } else { ln_val };

        // Use checked multiplication to prevent i128 overflow
        // -b * sgn(U) * ln(...) / SCALE
        match b.checked_mul(abs_ln_val) {
            Some(prod) => sign * (prod / Self::SCALE),
            None => {
                // Overflow: clamp to maximum reasonable value based on sign
                if sign > 0 {
                    i128::MAX
                } else {
                    i128::MIN
                }
            }
        }
    }
}

#[contract]
pub struct DpAnalyticsContract;

#[contractimpl]
impl DpAnalyticsContract {
    /// Initializes the DP parameters with an admin and a max privacy budget (epsilon).
    pub fn init(env: Env, admin: Address, max_epsilon: i128) {
        env.storage().instance().set(&DpDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DpDataKey::MaxEpsilon, &max_epsilon);
        env.storage()
            .instance()
            .set(&DpDataKey::UsedEpsilon, &0i128);
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

    #[test]
    fn test_laplace_noise_overflow_protection() {
        let env = Env::default();
        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);

        // Use max safe sensitivity (avoids overflow in b = sensitivity * SCALE / epsilon)
        // but large enough that b * abs_ln_val overflows for typical U values
        // sensitivity * SCALE = i128::MAX, so b = i128::MAX (with epsilon=1)
        // b * abs_ln_val overflows for any abs_ln_val > 1 (guaranteed for non-zero U)
        let sensitivity = i128::MAX / FixedPointMath::SCALE;
        let epsilon = 1;

        // This should not panic — overflow in b * abs_ln_val should be safely clamped
        let noise = FixedPointMath::laplace_noise(&env, epsilon, sensitivity, seed);

        // Verify the noise is clamped to extreme bounds (overflow occurred)
        // If U happens to be 0 (abs_ln_val = 0), noise would be 0 which is also valid
        assert!(
            noise == i128::MAX || noise == i128::MIN || noise == 0,
            "Overflow should clamp to i128::MAX or i128::MIN, or be 0 for edge case. Got: {}",
            noise
        );
    }

    #[test]
    fn test_laplace_noise_normal_case() {
        let env = Env::default();
        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);

        // Normal case: reasonable sensitivity and epsilon
        let noise = FixedPointMath::laplace_noise(&env, 1000, 10000, seed);

        // Noise should be within i128 bounds (not saturated)
        assert!(noise > i128::MIN && noise < i128::MAX);
    }

    #[test]
    fn test_laplace_noise_zero_sensitivity() {
        let env = Env::default();
        let seed = Bytes::from_slice(&env, &[1, 2, 3, 4]);

        // Zero sensitivity means zero noise
        let noise = FixedPointMath::laplace_noise(&env, 1000, 0, seed);
        assert_eq!(noise, 0);
    }

    #[test]
    fn test_dp_noise_and_budget() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DpAnalyticsContract, ());
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
}
