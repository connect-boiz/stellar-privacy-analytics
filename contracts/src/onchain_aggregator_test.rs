#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::*;
    use soroban_sdk::Env;

    fn create_id(n: u32) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        bytes[0..4].copy_from_slice(&n.to_le_bytes());
        BytesN::from_array(&bytes)
    }

    fn vec_from_slice(env: &Env, slice: &[u8]) -> Vec<u8> {
        let mut v = Vec::new(env);
        for &byte in slice {
            v.push_back(byte);
        }
        v
    }

    #[test]
    fn test_toctou_deleted_data_points() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let requester = Address::generate(&env);
        
        // Initialize contract
        OnChainAggregator::initialize(env.clone(), admin.clone());
        
        // Add credits to requester
        OnChainAggregator::add_compute_credits(
            env.clone(),
            requester.clone(),
            100000000,
        ).unwrap();
        
        // Create 10 data points
        let mut data_ids = Vec::new(&env);
        for i in 0..10 {
            let data_point = EncryptedDataPoint {
                data_id: create_id(i),
                encrypted_value: vec_from_slice(&env, &[i as u8; 16]),
                provider_id: Address::generate(&env),
                timestamp: env.ledger().timestamp(),
                data_hash: create_id(i + 100),
                epsilon_spent: 1000,
            };
            env.storage().persistent().set(&create_id(i), &data_point);
            data_ids.push_back(create_id(i));
        }
        
        // Submit aggregation request with requester auth
        let request_id = env.as_contract(&requester, || {
            OnChainAggregator::submit_aggregation_request(
                env.clone(),
                requester.clone(),
                AggregationOperation::Sum,
                data_ids,
                1000,
            ).unwrap()
        });
        
        // Delete 5 data points
        for i in 0..5 {
            env.storage().persistent().remove(&create_id(i));
        }
        
        // Try to process - should fail
        let result = OnChainAggregator::process_aggregation(
            env.clone(),
            request_id,
            admin,
        );
        
        assert!(result.is_err());
    }
}