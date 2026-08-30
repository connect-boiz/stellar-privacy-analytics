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

    /// Sentinel value returned when x >= SCALE to prevent Taylor series
    /// divergence. This large negative value signals that the input is out
    /// of the valid convergence range for the ln(1-x) approximation.
    pub const LN_DIVERGENCE_SENTINEL: i128 = -1_000_000;

    /// Approximates ln(1 - x) using Taylor series for x in [0, 1)
    /// x is expected to be scaled by SCALE.
    ///
    /// # Input Validation
    /// The Taylor series approximation for ln(1-x) is only valid for x ∈ [0, 1).
    /// When x reaches or exceeds SCALE (x ≥ 1 in unscaled terms), the series
    /// diverges, producing inaccurate results. This function guards against
    /// divergence by returning a sentinel value for out-of-range inputs.
    pub fn ln_1_minus_x(x: i128) -> i128 {
        // Guard: ln(1 - 0) = 0
        if x <= 0 {
            return 0;
        }
        // Guard: x must be strictly less than SCALE for series convergence.
        // Values at or above SCALE would cause the Taylor series to diverge
        // and produce nonsensical (very large negative) outputs.
        if x >= Self::SCALE {
            // Return a large negative sentinel that saturates gracefully
            // rather than allowing the series to explode.
            return Self::LN_DIVERGENCE_SENTINEL;
        }
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

        // -b * sgn(U) * ln(...)
        // Use saturating multiplication chain to prevent integer overflow
        // from unchecked triple i128 multiplication
        let step1 = b.saturating_mul(sign);
        let step2 = step1.saturating_mul(ln_val);
        (-step2) / Self::SCALE
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
    fn test_ln_1_minus_x_edge_cases() {
        // x = 0 should return 0 (ln(1-0) = ln(1) = 0)
        assert_eq!(FixedPointMath::ln_1_minus_x(0), 0);

        // x < 0 should also return 0 (guard handles negative inputs)
        assert_eq!(FixedPointMath::ln_1_minus_x(-1), 0);

        // x = SCALE (1.0 unscaled) should return the divergence sentinel
        // to prevent Taylor series from diverging
        assert_eq!(
            FixedPointMath::ln_1_minus_x(FixedPointMath::SCALE),
            FixedPointMath::LN_DIVERGENCE_SENTINEL
        );

        // x > SCALE should also return the divergence sentinel
        assert_eq!(
            FixedPointMath::ln_1_minus_x(FixedPointMath::SCALE * 2),
            FixedPointMath::LN_DIVERGENCE_SENTINEL
        );

        // x = SCALE - 1 should produce a valid (negative) result,
        // distinct from the divergence sentinel
        let result_near_boundary = FixedPointMath::ln_1_minus_x(FixedPointMath::SCALE - 1);
        assert!(result_near_boundary < 0);
        assert_ne!(result_near_boundary, FixedPointMath::LN_DIVERGENCE_SENTINEL);
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
