#[cfg(test)]
mod tests {
    use crate::{
        check_budget_not_exceeded, check_checked_add, check_checked_mul, check_checked_sub,
        check_counter_consistent, check_positive, simulate_sybil_attack, InvariantTestingError,
    };
    use soroban_sdk::Env;

    #[test]
    fn test_noise_invariant_positive() {
        let env = Env::default();
        let result = check_positive(&env, 100, "noise_must_be_positive");
        assert!(result.is_ok());
    }

    #[test]
    fn test_noise_invariant_zero() {
        let env = Env::default();
        let result = check_positive(&env, 0, "noise_must_be_positive");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_noise_invariant_negative() {
        let env = Env::default();
        let result = check_positive(&env, -100, "noise_must_be_positive");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_privacy_budget_invariant_valid() {
        let env = Env::default();
        let result = check_budget_not_exceeded(&env, 1000, 500, "budget_cannot_exceed_limit");
        assert!(result.is_ok());
    }

    #[test]
    fn test_privacy_budget_invariant_exceeded() {
        let env = Env::default();
        let result = check_budget_not_exceeded(&env, 500, 1000, "budget_cannot_exceed_limit");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_checked_add_no_overflow() {
        let env = Env::default();
        let result = check_checked_add(&env, 100, 1000, "no_integer_overflow");
        assert_eq!(result, Ok(1100));
    }

    #[test]
    fn test_checked_add_detects_overflow() {
        let env = Env::default();
        // The old toy check only compared `value > max_value` and could not
        // detect actual overflow; checked_add must fail closed instead.
        let result = check_checked_add(&env, i128::MAX, 1, "no_integer_overflow");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_checked_sub_detects_underflow() {
        let env = Env::default();
        // 0 - 1 = -1 is a valid i128; only below i128::MIN underflows.
        let result = check_checked_sub(&env, i128::MIN, 1, "no_integer_underflow");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_checked_mul_detects_overflow() {
        let env = Env::default();
        let result = check_checked_mul(&env, i128::MAX, 2, "no_integer_overflow");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_counter_consistent() {
        let env = Env::default();
        let result = check_counter_consistent(&env, 5, 5, "counter_consistency", "match");
        assert!(result.is_ok());
        let result = check_counter_consistent(&env, 5, 4, "counter_consistency", "mismatch");
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }

    #[test]
    fn test_sybil_attack_within_limit() {
        let env = Env::default();
        let result = simulate_sybil_attack(&env, 5, 1_000_000, 1_000_000_000_000_000_000i128);
        assert_eq!(result, Ok(false));
    }

    #[test]
    fn test_sybil_attack_exceeds_limit() {
        let env = Env::default();
        let result = simulate_sybil_attack(
            &env,
            100,
            100_000_000_000_000_000,
            1_000_000_000_000_000_000i128,
        );
        assert_eq!(result, Ok(true));
    }

    #[test]
    fn test_sybil_attack_overflow_fails_closed() {
        let env = Env::default();
        // Overflowing the product must fail closed, never wrap below the cap.
        let result = simulate_sybil_attack(&env, u32::MAX, i128::MAX, i128::MAX);
        assert_eq!(result, Err(InvariantTestingError::InvariantViolation));
    }
}
