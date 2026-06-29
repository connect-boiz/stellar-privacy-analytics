#[cfg(test)]
mod tests {
    use super::*;
    use crate::onchain_aggregator::{
        AggregationOperation, AggregationRequest, BatchProcessing, EncryptedDataPoint,
        OnChainAggregator,
    };
    use soroban_sdk::{
        testutils::{Address as TestAddress, BytesN as TestBytesN},
        Address, Bytes, BytesN, Env, Vec,
    };

    fn setup_contract(env: &Env) -> Address {
        let admin = TestAddress::generate(env);
        OnChainAggregator::initialize(env.clone(), admin.clone());
        admin
    }

    fn create_data_point(env: &Env, provider_id: Address) -> BytesN<32> {
        let data_id = TestBytesN::random(env);
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

        env.storage().persistent().set(&data_id, &data_point);
        data_id
    }

    fn create_aggregation_request(
        env: &Env,
        requester: Address,
        data_point_ids: Vec<BytesN<32>>,
    ) -> BytesN<32> {
        let request_id = TestBytesN::random(env);

        let request = AggregationRequest {
            request_id: request_id.clone(),
            requester,
            operation: AggregationOperation::Count,
            data_points: data_point_ids,
            privacy_budget: 1000i128,
            timestamp: env.ledger().timestamp(),
            status: soroban_sdk::String::from_str(env, "pending"),
            compute_credits_used: 500000i128,
            batch_id: None,
        };

        env.storage().persistent().set(&request_id, &request);
        request_id
    }

    #[test]
    fn test_batch_process_all_succeed() {
        let env = Env::default();
        let admin = setup_contract(&env);
        let provider = TestAddress::generate(&env);

        // Create data points
        let dp1 = create_data_point(&env, provider.clone());
        let dp2 = create_data_point(&env, provider.clone());
        let dp3 = create_data_point(&env, provider.clone());

        // Create aggregation requests with data points
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp1);
        data_point_ids.push_back(dp2);
        let rid1 = create_aggregation_request(&env, provider.clone(), data_point_ids);

        let mut data_point_ids2 = Vec::new(&env);
        data_point_ids2.push_back(dp3);
        let rid2 = create_aggregation_request(&env, provider.clone(), data_point_ids2);

        // Build request_ids vec
        let mut request_ids = Vec::new(&env);
        request_ids.push_back(rid1.clone());
        request_ids.push_back(rid2.clone());

        // Process batch
        let _batch_id = OnChainAggregator::batch_process(
            env.clone(),
            request_ids.clone(),
            admin.clone(),
        )
        .unwrap();

        // Verify batch status using get_batch_status query
        let batch = OnChainAggregator::get_batch_status(env.clone(), _batch_id)
            .expect("get_batch_status should return the batch");

        assert_eq!(
            batch.status,
            soroban_sdk::String::from_str(&env, "completed"),
            "All requests succeeded, batch should be 'completed'"
        );
        assert_eq!(batch.completed_requests.len(), 2u32);
        assert_eq!(batch.failed_requests.len(), 0u32);
        assert!(batch.completed_at.is_some());

        // Verify individual requests are "completed"
        let req1: AggregationRequest = env.storage().persistent().get(&rid1).unwrap();
        assert_eq!(req1.status, soroban_sdk::String::from_str(&env, "completed"));

        let req2: AggregationRequest = env.storage().persistent().get(&rid2).unwrap();
        assert_eq!(req2.status, soroban_sdk::String::from_str(&env, "completed"));
    }

    #[test]
    fn test_batch_process_mixed_results() {
        let env = Env::default();
        let admin = setup_contract(&env);
        let provider = TestAddress::generate(&env);

        // Create a valid data point and request
        let dp = create_data_point(&env, provider.clone());
        let mut data_point_ids = Vec::new(&env);
        data_point_ids.push_back(dp);
        let valid_rid = create_aggregation_request(&env, provider.clone(), data_point_ids);

        // Create an invalid (nonexistent) request ID
        let invalid_rid = TestBytesN::random(&env);

        // Build request_ids with one valid and one invalid
        let mut request_ids = Vec::new(&env);
        request_ids.push_back(valid_rid.clone());
        request_ids.push_back(invalid_rid.clone());

        // Process batch
        let _batch_id = OnChainAggregator::batch_process(
            env.clone(),
            request_ids.clone(),
            admin.clone(),
        )
        .unwrap();

        // Verify batch status using get_batch_status query
        let batch = OnChainAggregator::get_batch_status(env.clone(), _batch_id)
            .expect("get_batch_status should return the batch");

        assert_eq!(
            batch.status,
            soroban_sdk::String::from_str(&env, "partial"),
            "Mixed results, batch should be 'partial'"
        );
        assert_eq!(batch.completed_requests.len(), 1u32);
        assert_eq!(batch.failed_requests.len(), 1u32);
        assert!(batch.completed_at.is_some());

        // Verify valid request is "completed"
        let valid_req: AggregationRequest = env.storage().persistent().get(&valid_rid).unwrap();
        assert_eq!(valid_req.status, soroban_sdk::String::from_str(&env, "completed"));

        // Verify invalid request is "failed" (NOT "processing")
        let invalid_req: AggregationRequest =
            env.storage().persistent().get(&invalid_rid).unwrap();
        assert_eq!(
            invalid_req.status,
            soroban_sdk::String::from_str(&env, "failed"),
            "Failed request should be marked 'failed', not left in 'processing'"
        );
    }

    #[test]
    fn test_batch_process_all_fail() {
        let env = Env::default();
        let admin = setup_contract(&env);

        // Create nonexistent request IDs (all will fail with RequestNotFound)
        let invalid_rid1 = TestBytesN::random(&env);
        let invalid_rid2 = TestBytesN::random(&env);

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(invalid_rid1.clone());
        request_ids.push_back(invalid_rid2.clone());

        // Process batch
        let _batch_id = OnChainAggregator::batch_process(
            env.clone(),
            request_ids.clone(),
            admin.clone(),
        )
        .unwrap();

        // Verify batch status using get_batch_status query
        let batch = OnChainAggregator::get_batch_status(env.clone(), _batch_id)
            .expect("get_batch_status should return the batch");

        assert_eq!(
            batch.status,
            soroban_sdk::String::from_str(&env, "failed"),
            "All requests failed, batch should be 'failed'"
        );
        assert_eq!(batch.completed_requests.len(), 0u32);
        assert_eq!(batch.failed_requests.len(), 2u32);
        assert!(batch.completed_at.is_some());
    }

    #[test]
    fn test_get_batch_status_returns_breakdown() {
        let env = Env::default();
        let admin = setup_contract(&env);
        let provider = TestAddress::generate(&env);

        // Create 2 valid and 1 invalid requests
        let dp1 = create_data_point(&env, provider.clone());
        let dp2 = create_data_point(&env, provider.clone());

        let mut dp_ids1 = Vec::new(&env);
        dp_ids1.push_back(dp1);
        let rid1 = create_aggregation_request(&env, provider.clone(), dp_ids1);

        let mut dp_ids2 = Vec::new(&env);
        dp_ids2.push_back(dp2);
        let rid2 = create_aggregation_request(&env, provider.clone(), dp_ids2);

        let invalid_rid = TestBytesN::random(&env);

        let mut request_ids = Vec::new(&env);
        request_ids.push_back(rid1.clone());
        request_ids.push_back(invalid_rid.clone());
        request_ids.push_back(rid2.clone());

        let batch_id = OnChainAggregator::batch_process(
            env.clone(),
            request_ids.clone(),
            admin.clone(),
        )
        .unwrap();

        // Use get_batch_status to retrieve the breakdown
        let batch = OnChainAggregator::get_batch_status(env.clone(), batch_id.clone())
            .expect("get_batch_status should return the batch");

        assert_eq!(batch.batch_id, batch_id);
        assert_eq!(batch.status, soroban_sdk::String::from_str(&env, "partial"));
        assert_eq!(batch.completed_requests.len(), 2u32);
        assert_eq!(batch.failed_requests.len(), 1u32);

        // Verify completed requests contain the valid request IDs
        let completed_ids: Vec<BytesN<32>> = batch.completed_requests.iter().collect();
        assert!(completed_ids.contains(&rid1));
        assert!(completed_ids.contains(&rid2));

        // Verify failed requests contain the invalid request ID
        let failed_ids: Vec<BytesN<32>> = batch.failed_requests.iter().collect();
        assert!(failed_ids.contains(&invalid_rid));
    }

    #[test]
    fn test_batch_process_requires_admin_auth() {
        let env = Env::default();
        let admin = setup_contract(&env);
        let non_admin = TestAddress::generate(&env);

        let request_ids = Vec::new(&env);

        // Non-admin shouldn't be able to batch process
        let result =
            OnChainAggregator::batch_process(env.clone(), request_ids, non_admin);
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_process_rejects_too_large() {
        let env = Env::default();
        let admin = setup_contract(&env);

        // Create more than MAX_BATCH_SIZE (100) requests
        let mut request_ids = Vec::new(&env);
        for _ in 0..101 {
            request_ids.push_back(TestBytesN::random(&env));
        }

        let result =
            OnChainAggregator::batch_process(env.clone(), request_ids, admin);
        assert!(result.is_err());
    }

    #[test]
    fn test_batch_process_empty_list() {
        let env = Env::default();
        let admin = setup_contract(&env);

        let request_ids = Vec::new(&env);

        let _batch_id =
            OnChainAggregator::batch_process(env.clone(), request_ids, admin.clone()).unwrap();

        let batch = OnChainAggregator::get_batch_status(env.clone(), _batch_id)
            .expect("get_batch_status should return the batch");

        assert_eq!(
            batch.status,
            soroban_sdk::String::from_str(&env, "completed"),
            "Empty batch should be 'completed'"
        );
        assert_eq!(batch.completed_requests.len(), 0u32);
        assert_eq!(batch.failed_requests.len(), 0u32);
    }
}
