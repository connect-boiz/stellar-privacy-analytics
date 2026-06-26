#[cfg(test)]
mod tests {
    use crate::onchain_aggregator::{
        AggregationOperation, AggregationRequest, AggregatorError, BatchProcessing,
        EncryptedDataPoint, OnChainAggregator,
    };
    use soroban_sdk::{
        testutils::Ledger,
        testutils::{Address as _, BytesN as _},
        Address, BytesN, Env, String, Vec,
    };

    /// Helper: register the contract and return the contract ID + an admin address.
    fn setup(env: &Env) -> (Address, Address) {
        let contract_id = env.register(OnChainAggregator, ());
        let admin = Address::generate(env);
        env.as_contract(&contract_id, || {
            OnChainAggregator::initialize(env.clone(), admin.clone());
        });
        (contract_id, admin)
    }

    /// Helper: store a minimal EncryptedDataPoint so that process_aggregation
    /// can find it.
    fn store_data_point(env: &Env, contract_id: &Address, data_id: &BytesN<32>) {
        env.as_contract(contract_id, || {
            let dp = EncryptedDataPoint {
                data_id: data_id.clone(),
                encrypted_value: soroban_sdk::Bytes::from_slice(env, &[1u8; 16]),
                provider_id: Address::generate(env),
                timestamp: 1000,
                data_hash: BytesN::<32>::random(env),
                epsilon_spent: 100,
            };
            env.storage().persistent().set(data_id, &dp);
        });
    }

    /// Helper: store an AggregationRequest in "pending" status with a single
    /// data-point reference.
    fn store_pending_request(
        env: &Env,
        contract_id: &Address,
        request_id: &BytesN<32>,
        data_id: &BytesN<32>,
    ) {
        env.as_contract(contract_id, || {
            let mut dps = Vec::new(env);
            dps.push_back(data_id.clone());
            let req = AggregationRequest {
                request_id: request_id.clone(),
                requester: Address::generate(env),
                operation: AggregationOperation::Sum,
                data_points: dps,
                privacy_budget: 1000,
                timestamp: env.ledger().timestamp(),
                status: String::from_str(env, "pending"),
                compute_credits_used: 1_000_000,
                batch_id: None,
            };
            env.storage().persistent().set(request_id, &req);
        });
    }

    /// Check if a Soroban `Vec<BytesN<32>>` contains a given id.
    fn vec_contains(vec: &Vec<BytesN<32>>, target: &BytesN<32>) -> bool {
        for item in vec.iter() {
            if item == *target {
                return true;
            }
        }
        false
    }

    // ── batch_process tests ───────────────────────────────────────────

    #[test]
    fn test_batch_process_all_succeed() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        // Create two valid requests
        let d1 = BytesN::<32>::random(&env);
        let d2 = BytesN::<32>::random(&env);
        store_data_point(&env, &contract_id, &d1);
        store_data_point(&env, &contract_id, &d2);

        let r1 = BytesN::<32>::random(&env);
        let r2 = BytesN::<32>::random(&env);
        store_pending_request(&env, &contract_id, &r1, &d1);
        store_pending_request(&env, &contract_id, &r2, &d2);

        let mut ids = Vec::new(&env);
        ids.push_back(r1.clone());
        ids.push_back(r2.clone());

        let batch_id = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin.clone())
                .expect("batch_process should succeed")
        });

        env.as_contract(&contract_id, || {
            let batch: BatchProcessing = env.storage().persistent().get(&batch_id).unwrap();
            assert_eq!(batch.status, String::from_str(&env, "completed"));
            assert_eq!(batch.succeeded_requests.len(), 2);
            assert_eq!(batch.failed_requests.len(), 0);
            assert!(batch.completed_at.is_some());
        });
    }

    #[test]
    fn test_batch_process_partial_fail() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        // Valid request
        let d1 = BytesN::<32>::random(&env);
        store_data_point(&env, &contract_id, &d1);
        let r_valid = BytesN::<32>::random(&env);
        store_pending_request(&env, &contract_id, &r_valid, &d1);

        // Non-existent request (will fail with RequestNotFound)
        let r_nonexistent = BytesN::<32>::random(&env);

        let mut ids = Vec::new(&env);
        ids.push_back(r_valid.clone());
        ids.push_back(r_nonexistent.clone());

        let batch_id = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin.clone())
                .expect("batch_process should still return Ok")
        });

        env.as_contract(&contract_id, || {
            let batch: BatchProcessing = env.storage().persistent().get(&batch_id).unwrap();
            assert_eq!(batch.status, String::from_str(&env, "partial"));
            assert_eq!(batch.succeeded_requests.len(), 1);
            assert_eq!(batch.failed_requests.len(), 1);
            // The valid request should now be "completed"
            let valid: AggregationRequest = env.storage().persistent().get(&r_valid).unwrap();
            assert_eq!(valid.status, String::from_str(&env, "completed"));
        });
    }

    #[test]
    fn test_batch_process_already_completed_request() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        // Pre-store an already-completed request
        let d1 = BytesN::<32>::random(&env);
        store_data_point(&env, &contract_id, &d1);

        let r_completed = BytesN::<32>::random(&env);
        env.as_contract(&contract_id, || {
            let mut dps = Vec::new(&env);
            dps.push_back(d1.clone());
            let completed_req = AggregationRequest {
                request_id: r_completed.clone(),
                requester: Address::generate(&env),
                operation: AggregationOperation::Sum,
                data_points: dps,
                privacy_budget: 1000,
                timestamp: env.ledger().timestamp(),
                status: String::from_str(&env, "completed"),
                compute_credits_used: 1_000_000,
                batch_id: None,
            };
            env.storage().persistent().set(&r_completed, &completed_req);
        });

        let mut ids = Vec::new(&env);
        ids.push_back(r_completed.clone());

        let batch_id = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin.clone())
                .expect("batch_process should still return Ok")
        });

        env.as_contract(&contract_id, || {
            let batch: BatchProcessing = env.storage().persistent().get(&batch_id).unwrap();
            assert_eq!(batch.status, String::from_str(&env, "partial"));
            assert_eq!(batch.succeeded_requests.len(), 0);
            assert_eq!(batch.failed_requests.len(), 1);
            // The request should have been updated to "failed"
            let updated: AggregationRequest = env.storage().persistent().get(&r_completed).unwrap();
            assert_eq!(updated.status, String::from_str(&env, "failed"));
        });
    }

    #[test]
    fn test_batch_process_reports_correct_ids() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        let d1 = BytesN::<32>::random(&env);
        store_data_point(&env, &contract_id, &d1);

        let r_ok = BytesN::<32>::random(&env);
        store_pending_request(&env, &contract_id, &r_ok, &d1);

        // Non-existent request
        let r_bad = BytesN::<32>::random(&env);

        let mut ids = Vec::new(&env);
        ids.push_back(r_ok.clone());
        ids.push_back(r_bad.clone());

        let batch_id = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin.clone())
                .expect("batch_process should still return Ok")
        });

        env.as_contract(&contract_id, || {
            let batch: BatchProcessing = env.storage().persistent().get(&batch_id).unwrap();

            // Verify the exact IDs appear in the correct lists
            let succeeded = batch.succeeded_requests;
            let failed = batch.failed_requests;
            assert!(vec_contains(&succeeded, &r_ok));
            assert!(vec_contains(&failed, &r_bad));
            assert!(!vec_contains(&succeeded, &r_bad));
            assert!(!vec_contains(&failed, &r_ok));
        });
    }

    #[test]
    fn test_batch_process_unauthorized() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let attacker = Address::generate(&env);

        let mut ids = Vec::new(&env);
        ids.push_back(BytesN::<32>::random(&env));

        let result = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, attacker)
        });
        assert!(matches!(result, Err(AggregatorError::NotAuthorized)));
    }

    #[test]
    fn test_batch_process_empty() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        let ids = Vec::new(&env);
        let batch_id = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin.clone())
                .expect("empty batch should succeed")
        });

        env.as_contract(&contract_id, || {
            let batch: BatchProcessing = env.storage().persistent().get(&batch_id).unwrap();
            assert_eq!(batch.status, String::from_str(&env, "completed"));
            assert_eq!(batch.succeeded_requests.len(), 0);
            assert_eq!(batch.failed_requests.len(), 0);
        });
    }

    #[test]
    fn test_batch_process_too_large() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);

        // Create more requests than MAX_BATCH_SIZE (100)
        let mut ids = Vec::new(&env);
        for _ in 0..101 {
            ids.push_back(BytesN::<32>::random(&env));
        }

        let result = env.as_contract(&contract_id, || {
            OnChainAggregator::batch_process(env.clone(), ids, admin)
        });
        assert!(matches!(result, Err(AggregatorError::BatchTooLarge)));
    }
}
