#[cfg(test)]
mod tests {
    use crate::{
        AggregationOperation, AggregationRequest, AggregatorError, EncryptedDataPoint,
        OnChainAggregator, OnChainAggregatorClient,
    };
    use soroban_sdk::{
        testutils::BytesN as TestBytesN, Address, Bytes, BytesN, Env, String, Symbol, Vec,
    };

    fn generate_address(env: &Env) -> Address {
        <Address as soroban_sdk::testutils::Address>::generate(env)
    }

    fn random_bytesn32(env: &Env) -> BytesN<32> {
        <BytesN<32> as TestBytesN<32>>::random(env)
    }

    struct Harness<'a> {
        contract_id: Address,
        client: OnChainAggregatorClient<'a>,
        admin: Address,
    }

    fn setup(env: &Env) -> Harness<'_> {
        let contract_id = env.register(OnChainAggregator, ());
        let client = OnChainAggregatorClient::new(env, &contract_id);
        let admin = generate_address(env);
        client.initialize(&admin);
        Harness {
            contract_id,
            client,
            admin,
        }
    }

    fn create_data_point(env: &Env, contract_id: &Address, provider_id: Address) -> BytesN<32> {
        let data_id = random_bytesn32(env);
        let mut encrypted_value = Bytes::new(env);
        let value: i128 = 1000;
        encrypted_value.append(&Bytes::from_slice(env, &value.to_le_bytes()));

        let data_hash: BytesN<32> = env.crypto().sha256(&encrypted_value).into();

        let data_point = EncryptedDataPoint {
            data_id: data_id.clone(),
            encrypted_value,
            provider_id,
            timestamp: env.ledger().timestamp(),
            data_hash,
            epsilon_spent: 100i128,
        };

        env.as_contract(contract_id, || {
            env.storage().persistent().set(&data_id, &data_point);
        });
        data_id
    }

    fn create_aggregation_request(
        env: &Env,
        contract_id: &Address,
        requester: Address,
        data_point_ids: Vec<BytesN<32>>,
        privacy_budget: i128,
    ) -> BytesN<32> {
        let request_id = random_bytesn32(env);

        let request = AggregationRequest {
            request_id: request_id.clone(),
            requester,
            operation: AggregationOperation::Count,
            data_points: data_point_ids,
            privacy_budget,
            timestamp: env.ledger().timestamp(),
            status: String::from_str(env, "pending"),
            compute_credits_used: 500000i128,
            batch_id: None,
        };

        env.as_contract(contract_id, || {
            env.storage().persistent().set(&request_id, &request);
        });
        request_id
    }

    #[test]
    fn test_batch_process_all_succeed() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp2 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp3 = create_data_point(&env, &h.contract_id, provider.clone());

        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp1);
        data_point_ids.push_back(dp2);
        let rid1 = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            1000i128,
        );

        let mut data_point_ids2 = Vec::new(&env);
        data_point_ids2.push_back(dp3);
        let rid2 = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids2,
            1000i128,
        );

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(rid1.clone());
        request_ids.push_back(rid2.clone());

        let batch_id = h.client.batch_process(&request_ids, &h.admin);

        let batch = h.client.get_batch_status(&batch_id).expect("batch exists");
        assert_eq!(batch.status, String::from_str(&env, "completed"));
        assert_eq!(batch.completed_requests.len(), 2u32);
        assert_eq!(batch.failed_requests.len(), 0u32);
        assert!(batch.completed_at.is_some());

        let req1: AggregationRequest = env.as_contract(&h.contract_id, || {
            env.storage().persistent().get(&rid1).unwrap()
        });
        assert_eq!(req1.status, String::from_str(&env, "completed"));

        let req2: AggregationRequest = env.as_contract(&h.contract_id, || {
            env.storage().persistent().get(&rid2).unwrap()
        });
        assert_eq!(req2.status, String::from_str(&env, "completed"));
    }

    #[test]
    fn test_batch_process_mixed_results() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp = create_data_point(&env, &h.contract_id, provider.clone());
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp);
        let valid_rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            1000i128,
        );

        let invalid_rid = random_bytesn32(&env);

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(valid_rid.clone());
        request_ids.push_back(invalid_rid.clone());

        let batch_id = h.client.batch_process(&request_ids, &h.admin);

        let batch = h.client.get_batch_status(&batch_id).expect("batch exists");
        assert_eq!(batch.status, String::from_str(&env, "partial"));
        assert_eq!(batch.completed_requests.len(), 1u32);
        assert_eq!(batch.failed_requests.len(), 1u32);
        assert!(batch.completed_at.is_some());

        let valid_req: AggregationRequest = env.as_contract(&h.contract_id, || {
            env.storage().persistent().get(&valid_rid).unwrap()
        });
        assert_eq!(valid_req.status, String::from_str(&env, "completed"));

        // The nonexistent request is tracked in the batch's failed_requests;
        // no request entry is (or should be) created for an unknown ID.
        let mut failed_ids = Vec::new(&env);
        for id in batch.failed_requests.iter() {
            failed_ids.push_back(id);
        }
        assert!(failed_ids.contains(&invalid_rid));
    }

    #[test]
    fn test_batch_process_all_fail() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);

        let invalid_rid1 = random_bytesn32(&env);
        let invalid_rid2 = random_bytesn32(&env);

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(invalid_rid1.clone());
        request_ids.push_back(invalid_rid2.clone());

        let batch_id = h.client.batch_process(&request_ids, &h.admin);

        let batch = h.client.get_batch_status(&batch_id).expect("batch exists");
        assert_eq!(batch.status, String::from_str(&env, "failed"));
        assert_eq!(batch.completed_requests.len(), 0u32);
        assert_eq!(batch.failed_requests.len(), 2u32);
        assert!(batch.completed_at.is_some());
    }

    #[test]
    fn test_get_batch_status_returns_breakdown() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp2 = create_data_point(&env, &h.contract_id, provider.clone());

        let mut dp_ids1 = Vec::new(&env);
        dp_ids1.push_back(dp1);
        let rid1 =
            create_aggregation_request(&env, &h.contract_id, provider.clone(), dp_ids1, 1000i128);

        let mut dp_ids2 = Vec::new(&env);
        dp_ids2.push_back(dp2);
        let rid2 =
            create_aggregation_request(&env, &h.contract_id, provider.clone(), dp_ids2, 1000i128);

        let invalid_rid = random_bytesn32(&env);

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(rid1.clone());
        request_ids.push_back(invalid_rid.clone());
        request_ids.push_back(rid2.clone());

        let batch_id = h.client.batch_process(&request_ids, &h.admin);

        let batch = h.client.get_batch_status(&batch_id).expect("batch exists");
        assert_eq!(batch.batch_id, batch_id);
        assert_eq!(batch.status, String::from_str(&env, "partial"));
        assert_eq!(batch.completed_requests.len(), 2u32);
        assert_eq!(batch.failed_requests.len(), 1u32);

        let mut completed_ids = Vec::new(&env);
        for id in batch.completed_requests.iter() {
            completed_ids.push_back(id);
        }
        assert!(completed_ids.contains(&rid1));
        assert!(completed_ids.contains(&rid2));

        let mut failed_ids = Vec::new(&env);
        for id in batch.failed_requests.iter() {
            failed_ids.push_back(id);
        }
        assert!(failed_ids.contains(&invalid_rid));
    }

    #[test]
    fn test_batch_process_requires_admin_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let non_admin = generate_address(&env);

        let request_ids = Vec::new(&env);
        let result = h.client.try_batch_process(&request_ids, &non_admin);
        assert_eq!(result, Err(Ok(AggregatorError::NotAuthorized)));
    }

    #[test]
    fn test_batch_process_rejects_too_large() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);

        let mut request_ids = Vec::new(&env);
        for _ in 0..101 {
            request_ids.push_back(random_bytesn32(&env));
        }

        let result = h.client.try_batch_process(&request_ids, &h.admin);
        assert_eq!(result, Err(Ok(AggregatorError::BatchTooLarge)));
    }

    #[test]
    fn test_batch_process_empty_list() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);

        let request_ids = Vec::new(&env);
        let batch_id = h.client.batch_process(&request_ids, &h.admin);

        let batch = h.client.get_batch_status(&batch_id).expect("batch exists");
        assert_eq!(batch.status, String::from_str(&env, "completed"));
        assert_eq!(batch.completed_requests.len(), 0u32);
        assert_eq!(batch.failed_requests.len(), 0u32);
    }

    /// WS2 acceptance: a request whose data points sum to more epsilon than its
    /// privacy budget fails with InsufficientPrivacyBudget and stores no result.
    #[test]
    fn test_process_rejects_epsilon_over_budget() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        // Two data points each spending 100 epsilon, but the budget is 150.
        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp2 = create_data_point(&env, &h.contract_id, provider.clone());

        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp1);
        data_point_ids.push_back(dp2);
        let rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            150i128,
        );

        let res = h.client.try_process_aggregation(&rid, &h.admin);
        assert_eq!(res, Err(Ok(AggregatorError::InsufficientPrivacyBudget)));

        // No result may be stored.
        assert!(h.client.get_aggregation_result(&rid).is_none());

        // The request must remain pending (untouched) so it can be retried.
        let req: AggregationRequest = env.as_contract(&h.contract_id, || {
            env.storage().persistent().get(&rid).unwrap()
        });
        assert_eq!(req.status, String::from_str(&env, "pending"));
    }

    /// WS2 acceptance: exactly at the budget is allowed.
    #[test]
    fn test_process_accepts_epsilon_at_budget() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());

        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp1);
        let rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            100i128,
        );

        let cert = h.client.process_aggregation(&rid, &h.admin);
        assert!(h.client.get_privacy_certificate(&cert).is_some());
        let result = h.client.get_aggregation_result(&rid).unwrap();
        assert_eq!(result.total_epsilon_spent, 100);
    }

    /// WS3 acceptance: processing a request whose data points were all removed
    /// returns InvalidOperation instead of panicking (zero-participant guard).
    #[test]
    fn test_process_zero_participants_returns_error_not_panic() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        // Create a data point, then reference it in a request, then delete it.
        let dp = create_data_point(&env, &h.contract_id, provider.clone());

        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp.clone());
        let rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            1000i128,
        );

        env.as_contract(&h.contract_id, || {
            env.storage().persistent().remove(&dp);
        });

        // Must return an error, never panic (previously divided by zero).
        let res = h.client.try_process_aggregation(&rid, &h.admin);
        assert_eq!(res, Err(Ok(AggregatorError::InvalidOperation)));
    }

    /// WS3 acceptance: a request cannot be processed twice (no re-processing /
    /// concurrent double-processing by two callers in the same ledger).
    #[test]
    fn test_process_rejects_reprocessing() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp = create_data_point(&env, &h.contract_id, provider.clone());
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp);
        let rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            1000i128,
        );

        h.client.process_aggregation(&rid, &h.admin);

        let res = h.client.try_process_aggregation(&rid, &h.admin);
        assert_eq!(res, Err(Ok(AggregatorError::RequestAlreadyCompleted)));
    }

    /// WS3 acceptance: an issued privacy certificate carries a bound proof
    /// nonce and a non-empty signature; a certificate that lost them is
    /// rejected by get_privacy_certificate.
    #[test]
    fn test_certificate_has_binding_proof_nonce_and_signature() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp = create_data_point(&env, &h.contract_id, provider.clone());
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp);
        let rid = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            data_point_ids,
            1000i128,
        );

        let certificate_id = h.client.process_aggregation(&rid, &h.admin);
        let certificate = h
            .client
            .get_privacy_certificate(&certificate_id)
            .expect("certificate must be served");
        assert!(!certificate.signature.is_empty());
        assert_ne!(
            certificate.privacy_proofs_nonce,
            BytesN::from_array(&env, &[0u8; 32])
        );
        assert_eq!(certificate.epsilon_used, 100);

        // Corrupt the stored certificate (empty signature) — the consumer
        // must now treat it as absent.
        let mut corrupted = certificate.clone();
        corrupted.signature = Bytes::new(&env);
        env.as_contract(&h.contract_id, || {
            env.storage().persistent().set(&certificate_id, &corrupted);
        });
        assert!(h.client.get_privacy_certificate(&certificate_id).is_none());
    }

    /// WS5 acceptance: `verify_state` runs after every mutation and fails the
    /// transaction when the ledger is corrupted — a completed request that
    /// loses its stored result.
    #[test]
    fn test_verify_state_detects_corrupted_state() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        // Submit through the public path so the request is indexed.
        h.client.add_compute_credits(&provider, &1_000_000i128);
        let dp = create_data_point(&env, &h.contract_id, provider.clone());
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp);
        let rid = h.client.submit_aggregation_request(
            &provider,
            &AggregationOperation::Count,
            &data_point_ids,
            &1000i128,
        );
        h.client.process_aggregation(&rid, &h.admin);

        // Sanity: state is consistent right after a successful processing.
        let ok = env.as_contract(&h.contract_id, || OnChainAggregator::verify_state(&env));
        assert_eq!(ok, Ok(()));

        // Corrupt: drop the stored result of a completed request.
        env.as_contract(&h.contract_id, || {
            env.storage()
                .persistent()
                .remove(&(Symbol::new(&env, "result_"), rid.clone()));
        });

        let err = env.as_contract(&h.contract_id, || OnChainAggregator::verify_state(&env));
        assert_eq!(err, Err(AggregatorError::StateInconsistent));
    }

    // ── Differential-Privacy regression tests (issue #413) ──────────────────

    /// Helper: decode the little-endian i128 from the first 16 bytes of a
    /// `Bytes` result value (as produced by `perform_sum`/`perform_count`).
    fn decode_result_i128(bytes: &Bytes) -> i128 {
        let mut buf = [0u8; 16];
        for i in 0u32..16u32 {
            buf[i as usize] = bytes.get(i).unwrap_or(0);
        }
        i128::from_le_bytes(buf)
    }

    /// DP regression: the Laplace noise is actually applied to the aggregate.
    ///
    /// Two independent aggregation requests over the same data are processed
    /// and their results decoded.  Because the on-chain PRNG is seeded
    /// differently for each invocation, the two noisy outputs must differ from
    /// each other.  Additionally, at most one of them may equal the exact
    /// aggregate — if both equal the exact value, noise was computed but
    /// discarded (the original bug).
    #[test]
    fn test_aggregation_results_are_noisy_and_differ() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        // create_data_point encodes value=1000 and epsilon_spent=100.
        // For a Count operation the exact aggregate is 1 (one data point).
        let exact_count: i128 = 1;

        // First aggregation
        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());
        let mut ids1 = Vec::new(&env);
        ids1.push_back(dp1);
        let rid1 = create_aggregation_request(
            &env,
            &h.contract_id,
            provider.clone(),
            ids1,
            // Budget >= epsilon_spent (100) so the request is accepted.
            1000i128,
        );
        h.client.process_aggregation(&rid1, &h.admin);
        let result1 = h
            .client
            .get_aggregation_result(&rid1)
            .expect("result must exist after processing");

        // Second aggregation — independent PRNG state.
        let dp2 = create_data_point(&env, &h.contract_id, provider.clone());
        let mut ids2 = Vec::new(&env);
        ids2.push_back(dp2);
        let rid2 =
            create_aggregation_request(&env, &h.contract_id, provider.clone(), ids2, 1000i128);
        h.client.process_aggregation(&rid2, &h.admin);
        let result2 = h
            .client
            .get_aggregation_result(&rid2)
            .expect("result must exist after processing");

        let noisy1 = decode_result_i128(&result1.encrypted_result);
        let noisy2 = decode_result_i128(&result2.encrypted_result);

        // At least one result must differ from the exact aggregate (noise applied).
        assert!(
            noisy1 != exact_count || noisy2 != exact_count,
            "both aggregation results equal the exact aggregate {exact_count}; \
             noise is not being applied to the result (regression: issue #413)"
        );

        // The two independent noisy results must differ from each other.
        assert_ne!(
            noisy1, noisy2,
            "two independent aggregations returned identical noisy results; \
             PRNG is not generating distinct noise samples (regression: issue #413)"
        );
    }

    /// DP regression: budget over-run is rejected before any result is stored.
    ///
    /// Three data points each with epsilon_spent=100 give total_epsilon_spent=300.
    /// Setting privacy_budget=200 must cause `InsufficientPrivacyBudget` and
    /// leave the request in "pending" with no stored result.
    #[test]
    fn test_budget_overrun_is_rejected_and_leaves_request_pending() {
        let env = Env::default();
        env.mock_all_auths();
        let h = setup(&env);
        let provider = generate_address(&env);

        let dp1 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp2 = create_data_point(&env, &h.contract_id, provider.clone());
        let dp3 = create_data_point(&env, &h.contract_id, provider.clone());

        let mut ids = Vec::new(&env);
        ids.push_back(dp1);
        ids.push_back(dp2);
        ids.push_back(dp3);

        // total_epsilon_spent = 3 * 100 = 300 > privacy_budget = 200
        let rid = create_aggregation_request(&env, &h.contract_id, provider.clone(), ids, 200i128);

        let res = h.client.try_process_aggregation(&rid, &h.admin);
        assert_eq!(
            res,
            Err(Ok(AggregatorError::InsufficientPrivacyBudget)),
            "expected InsufficientPrivacyBudget when total epsilon exceeds the declared budget"
        );

        // No result must be stored.
        assert!(
            h.client.get_aggregation_result(&rid).is_none(),
            "no result may be stored when the privacy budget is exceeded"
        );

        // Request must remain in "pending" so it can be retried with a
        // higher budget or fewer data points.
        let req: AggregationRequest = env.as_contract(&h.contract_id, || {
            env.storage().persistent().get(&rid).unwrap()
        });
        assert_eq!(
            req.status,
            String::from_str(&env, "pending"),
            "request status must remain pending after a budget rejection"
        );
    }
}
