#[cfg(test)]
mod tests {
    use crate::onchain_aggregator::OnChainAggregatorClient;
    use crate::*;
    use soroban_sdk::testutils::{Address as _, BytesN as _, Ledger as _};
    use soroban_sdk::{Address, Bytes, BytesN, Env, Symbol, Vec};

    const CREDITS: i128 = 10_000_000;

    struct Ctx {
        env: Env,
        admin: Address,
        contract: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, OnChainAggregator);
        let client = OnChainAggregatorClient::new(&env, &contract).mock_all_auths();
        client.initialize_aggregator(&admin);
        Ctx {
            env,
            admin,
            contract,
        }
    }

    fn seed_data_point(
        env: &Env,
        contract: &Address,
        data_id: &BytesN<32>,
        provider: &Address,
        value: i128,
    ) {
        env.as_contract(contract, || {
            let mut value_bytes = Bytes::new(env);
            value_bytes.extend_from_array(&value.to_le_bytes());

            let data_point = DataPoint {
                data_id: data_id.clone(),
                value: value_bytes,
                provider_id: provider.clone(),
                timestamp: env.ledger().timestamp(),
                data_hash: BytesN::random(env),
                epsilon_spent: 1000,
            };

            env.storage().persistent().set(data_id, &data_point);
        });
    }

    fn decode_i128(value: &Bytes) -> i128 {
        let mut bytes = [0u8; 16];
        for i in 0..16u32 {
            bytes[i as usize] = value.get(i).unwrap_or(0);
        }
        i128::from_le_bytes(bytes)
    }

    #[test]
    fn test_initialize_sets_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, OnChainAggregator);
        let client = OnChainAggregatorClient::new(&env, &contract).mock_all_auths();
        client.initialize_aggregator(&admin);

        let stored_admin: Address = env.as_contract(&contract, || {
            env.storage()
                .instance()
                .get(&Symbol::new(&env, "admin"))
                .unwrap()
        });
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_owner_can_aggregate_own_data() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 42);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&owner, &CREDITS);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());

        let request_id =
            client.submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000);

        let certificate_id = client.process_aggregation(&request_id, &ctx.admin);

        let result = client.get_aggregation_result(&request_id, &owner);

        assert_eq!(decode_i128(&result.result_value), 42);
        assert_eq!(result.participants_count, 1);
        assert_ne!(certificate_id, BytesN::from_array(&ctx.env, &[0u8; 32]));
    }

    #[test]
    fn test_cross_user_aggregation_is_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let attacker = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        // Attacker has no relationship to the data point.
        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 100);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&attacker, &CREDITS);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());

        let err = client
            .try_submit_aggregation_request(&attacker, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("attacker must not aggregate another user's data point")
            .expect("contract error expected");

        assert_eq!(err, AggregatorError::NotDataPointOwner);
    }

    #[test]
    fn test_missing_data_point_returns_not_found() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let missing_id = BytesN::random(&ctx.env);

        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&owner, &CREDITS);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(missing_id.clone());

        let err = client
            .try_submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("missing data point should be rejected")
            .expect("contract error expected");

        assert_eq!(err, AggregatorError::DataPointNotFound);
    }

    #[test]
    fn test_grant_access_allows_delegated_aggregation() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let analyst = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 7);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&analyst, &CREDITS);

        // Without a grant the analyst is rejected.
        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());
        let err = client
            .try_submit_aggregation_request(&analyst, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("analyst without grant must be rejected")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::NotDataPointOwner);

        // Owner grants access; analyst can now aggregate.
        client.grant_data_access(&owner, &data_id, &analyst);

        let request_id = client.submit_aggregation_request(
            &analyst,
            &AggregationOperation::Count,
            &ids,
            &1_000_000,
        );

        client.process_aggregation(&request_id, &ctx.admin);

        let result = client.get_aggregation_result(&request_id, &analyst);
        assert_eq!(decode_i128(&result.result_value), 1);
    }

    #[test]
    fn test_revoked_access_is_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let analyst = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 7);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&analyst, &CREDITS);

        client.grant_data_access(&owner, &data_id, &analyst);
        client.revoke_data_access(&owner, &data_id, &analyst);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());

        let err = client
            .try_submit_aggregation_request(&analyst, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("revoked analyst must be rejected")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::NotDataPointOwner);
    }

    #[test]
    fn test_only_owner_can_grant_or_revoke_access() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let stranger = Address::generate(&ctx.env);
        let analyst = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 7);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();

        let err = client
            .try_grant_data_access(&stranger, &data_id, &analyst)
            .expect_err("non-owner must not grant access")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::NotAuthorized);

        let err = client
            .try_revoke_data_access(&stranger, &data_id, &analyst)
            .expect_err("non-owner must not revoke access")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::NotAuthorized);
    }

    #[test]
    fn test_sum_average_count_compute_correct_values() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let id1 = BytesN::random(&ctx.env);
        let id2 = BytesN::random(&ctx.env);
        let id3 = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &id1, &owner, 10);
        seed_data_point(&ctx.env, &ctx.contract, &id2, &owner, 20);
        seed_data_point(&ctx.env, &ctx.contract, &id3, &owner, 30);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&owner, &CREDITS);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(id1.clone());
        ids.push_back(id2.clone());
        ids.push_back(id3.clone());

        // Sum
        let new_ts = ctx.env.ledger().timestamp() + 1;
        ctx.env.ledger().with_mut(|l| l.timestamp = new_ts);
        let sum_req =
            client.submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000);
        client.process_aggregation(&sum_req, &ctx.admin);
        let sum_result = client.get_aggregation_result(&sum_req, &owner);
        assert_eq!(decode_i128(&sum_result.result_value), 60);
        assert_eq!(sum_result.participants_count, 3);

        // Average
        let new_ts = ctx.env.ledger().timestamp() + 1;
        ctx.env.ledger().with_mut(|l| l.timestamp = new_ts);
        let avg_req = client.submit_aggregation_request(
            &owner,
            &AggregationOperation::Average,
            &ids,
            &1_000_000,
        );
        client.process_aggregation(&avg_req, &ctx.admin);
        let avg_result = client.get_aggregation_result(&avg_req, &owner);
        assert_eq!(decode_i128(&avg_result.result_value), 20);

        // Count
        let new_ts = ctx.env.ledger().timestamp() + 1;
        ctx.env.ledger().with_mut(|l| l.timestamp = new_ts);
        let count_req = client.submit_aggregation_request(
            &owner,
            &AggregationOperation::Count,
            &ids,
            &1_000_000,
        );
        client.process_aggregation(&count_req, &ctx.admin);
        let count_result = client.get_aggregation_result(&count_req, &owner);
        assert_eq!(decode_i128(&count_result.result_value), 3);
    }

    #[test]
    fn test_aggregation_result_is_gated_behind_authorization() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let participant = Address::generate(&ctx.env);
        let stranger = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 55);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&owner, &CREDITS);

        // The participant is granted access to the data point but is not the requester.
        client.grant_data_access(&owner, &data_id, &participant);

        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());

        let request_id =
            client.submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000);
        client.process_aggregation(&request_id, &ctx.admin);

        // Unauthorized stranger cannot read the result.
        let err = client
            .try_get_aggregation_result(&request_id, &stranger)
            .expect_err("stranger must not read the result")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::NotAuthorized);

        // The requester can read the result.
        let owner_result = client.get_aggregation_result(&request_id, &owner);
        assert_eq!(decode_i128(&owner_result.result_value), 55);

        // A granted participant of the request's data points can read it.
        let participant_result = client.get_aggregation_result(&request_id, &participant);
        assert_eq!(decode_i128(&participant_result.result_value), 55);

        // The admin can read any result.
        let admin_result = client.get_aggregation_result(&request_id, &ctx.admin);
        assert_eq!(decode_i128(&admin_result.result_value), 55);
    }

    #[test]
    fn test_insufficient_credits_is_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let data_id = BytesN::random(&ctx.env);

        seed_data_point(&ctx.env, &ctx.contract, &data_id, &owner, 5);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();

        // No credits funded.
        let mut ids = Vec::new(&ctx.env);
        ids.push_back(data_id.clone());

        let err = client
            .try_submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("missing credits must be rejected")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::InsufficientCredits);
    }

    #[test]
    fn test_batch_too_large_is_rejected() {
        let ctx = setup();
        let owner = Address::generate(&ctx.env);
        let client = OnChainAggregatorClient::new(&ctx.env, &ctx.contract).mock_all_auths();
        client.add_compute_credits(&owner, &CREDITS);

        let mut ids = Vec::new(&ctx.env);
        for _ in 0..101 {
            ids.push_back(BytesN::random(&ctx.env));
        }

        let err = client
            .try_submit_aggregation_request(&owner, &AggregationOperation::Sum, &ids, &1_000_000)
            .expect_err("oversized batch must be rejected")
            .expect("contract error expected");
        assert_eq!(err, AggregatorError::BatchTooLarge);
    }
}
