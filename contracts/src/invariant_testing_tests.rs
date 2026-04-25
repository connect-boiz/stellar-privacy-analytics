#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as TestAddress, BytesN as TestBytesN}, Env};

    #[test]
    fn test_noise_invariant_positive() {
        let env = Env::default();
        let result = InvariantTesting::test_noise_invariant(env.clone(), 100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_noise_invariant_zero() {
        let env = Env::default();
        let result = InvariantTesting::test_noise_invariant(env.clone(), 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_noise_invariant_negative() {
        let env = Env::default();
        let result = InvariantTesting::test_noise_invariant(env.clone(), -100);
        assert!(result.is_err());
    }

    #[test]
    fn test_privacy_budget_invariant_valid() {
        let env = Env::default();
        let result = InvariantTesting::test_privacy_budget_invariant(env.clone(), 1000, 500);
        assert!(result.is_ok());
    }

    #[test]
    fn test_privacy_budget_invariant_exceeded() {
        let env = Env::default();
        let result = InvariantTesting::test_privacy_budget_invariant(env.clone(), 500, 1000);
        assert!(result.is_err());
    }

    #[test]
    fn test_integer_overflow_invariant_valid() {
        let env = Env::default();
        let result = InvariantTesting::test_integer_overflow_invariant(env.clone(), 100, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_integer_overflow_invariant_exceeded() {
        let env = Env::default();
        let result = InvariantTesting::test_integer_overflow_invariant(env.clone(), 1000, 500);
        assert!(result.is_err());
    }

    #[test]
    fn test_fuzz_test_no_violations() {
        let env = Env::default();
        let mut test_data = Vec::new(&env);
        test_data.push_back(100);
        test_data.push_back(200);
        test_data.push_back(300);
        
        let violations = InvariantTesting::run_fuzz_test(env.clone(), test_data).unwrap();
        assert_eq!(violations, 0);
    }

    #[test]
    fn test_fuzz_test_with_violations() {
        let env = Env::default();
        let mut test_data = Vec::new(&env);
        test_data.push_back(100);
        test_data.push_back(0);
        test_data.push_back(-100);
        
        let violations = InvariantTesting::run_fuzz_test(env.clone(), test_data).unwrap();
        assert_eq!(violations, 2);
    }

    #[test]
    fn test_sybil_attack_within_limit() {
        let env = Env::default();
        let mut attackers = Vec::new(&env);
        for _ in 0..5 {
            attackers.push_back(TestAddress::generate(&env));
        }
        
        let result = InvariantTesting::simulate_sybil_attack(env.clone(), attackers, 1000000);
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn test_sybil_attack_exceeds_limit() {
        let env = Env::default();
        let mut attackers = Vec::new(&env);
        for _ in 0..100 {
            attackers.push_back(TestAddress::generate(&env));
        }
        
        let result = InvariantTesting::simulate_sybil_attack(env.clone(), attackers, 1000000000000000000);
        assert!(result.is_err());
    }
}
