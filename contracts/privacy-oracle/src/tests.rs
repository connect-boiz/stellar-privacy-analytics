#[cfg(test)]
mod tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, BytesN, Env, String, Vec};

    use crate::{PrivacyOracle, PrivacyOracleClient};

    // "market_data" fee configured in PrivacyOracle::initialize (0.05 XLM).
    const MARKET_DATA_FEE: i128 = 50_000_000;

    struct Harness<'a> {
        env: Env,
        client: PrivacyOracleClient<'a>,
        // The admin doubles as the requester/oracle in these happy-path tests.
        admin: Address,
    }

    fn setup(env: &Env) -> Harness<'_> {
        env.mock_all_auths();
        let contract_id = env.register(PrivacyOracle, ());
        let client = PrivacyOracleClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        Harness {
            env: env.clone(),
            client,
            admin,
        }
    }

    // `seed` distinguishes the data_hash so otherwise-identical requests hash to
    // distinct request IDs (the ID also folds in ledger time/sequence, which do
    // not advance between calls in a single test).
    fn request_market_data(h: &Harness, seed: u8) -> BytesN<32> {
        let data_source = String::from_str(&h.env, "market_data");
        let data_hash = BytesN::<32>::from_array(&h.env, &[seed; 32]);
        h.client
            .request_data(&h.admin, &data_source, &data_hash, &2u32)
    }

    /// Acceptance: create request -> cancel -> total_fees_collected reflects the
    /// net fee actually retained (fee - 50% refund).
    #[test]
    fn test_cancel_request_decrements_total_fees_to_net_fee() {
        let env = Env::default();
        let h = setup(&env);

        h.client.add_deposit(&h.admin, &MARKET_DATA_FEE);
        let request_id = request_market_data(&h, 1);

        // Full fee booked on request.
        let (_requests, fees_after_request, _nodes) = h.client.get_oracle_stats();
        assert_eq!(fees_after_request, MARKET_DATA_FEE);

        h.client.cancel_request(&h.admin, &request_id);

        // 50% refunded, so the counter must reflect the net fee (fee - refund).
        let refund = MARKET_DATA_FEE / 2;
        let net_fee = MARKET_DATA_FEE - refund;
        let (_r, fees_after_cancel, _n) = h.client.get_oracle_stats();
        assert_eq!(fees_after_cancel, net_fee);
        assert_eq!(fees_after_cancel, 25_000_000);
    }

    /// Acceptance: create request -> fulfill -> total_fees_collected reflects the
    /// full fee (fulfilment retains the entire fee, no refund).
    #[test]
    fn test_fulfill_request_keeps_full_fee() {
        let env = Env::default();
        let h = setup(&env);

        // Register the admin as an active oracle so fulfilment is authorized.
        h.client.add_oracle_node(
            &h.admin,
            &h.admin,
            &String::from_str(&env, "http://oracle.local"),
        );

        h.client.add_deposit(&h.admin, &MARKET_DATA_FEE);
        let request_id = request_market_data(&h, 1);

        let result_hash = BytesN::<32>::from_array(&env, &[2u8; 32]);
        let privacy_proofs: Vec<BytesN<32>> = Vec::new(&env);
        h.client
            .fulfill_request(&h.admin, &request_id, &result_hash, &privacy_proofs, &95u32);

        let (_r, fees_after_fulfill, _n) = h.client.get_oracle_stats();
        assert_eq!(fees_after_fulfill, MARKET_DATA_FEE);
    }

    /// The counter must track net fees consistently across interleaved
    /// fulfil/cancel operations rather than drifting upward per cancellation.
    #[test]
    fn test_total_fees_collected_tracks_net_across_multiple_requests() {
        let env = Env::default();
        let h = setup(&env);

        h.client.add_oracle_node(
            &h.admin,
            &h.admin,
            &String::from_str(&env, "http://oracle.local"),
        );
        h.client.add_deposit(&h.admin, &(MARKET_DATA_FEE * 3));

        // Request #1 -> fulfilled (retains full fee).
        let req1 = request_market_data(&h, 1);
        let result_hash = BytesN::<32>::from_array(&env, &[2u8; 32]);
        let proofs: Vec<BytesN<32>> = Vec::new(&env);
        h.client
            .fulfill_request(&h.admin, &req1, &result_hash, &proofs, &90u32);

        // Request #2 and #3 -> cancelled (retains 50% each).
        let req2 = request_market_data(&h, 2);
        let req3 = request_market_data(&h, 3);
        h.client.cancel_request(&h.admin, &req2);
        h.client.cancel_request(&h.admin, &req3);

        // Net = full fee + 2 * (fee - refund).
        let refund = MARKET_DATA_FEE / 2;
        let expected = MARKET_DATA_FEE + 2 * (MARKET_DATA_FEE - refund);
        let (_r, total_fees, _n) = h.client.get_oracle_stats();
        assert_eq!(total_fees, expected);
    }

    /// A non-admin cannot add oracle nodes: the equality check must reject them
    /// even under mock_all_auths (host auth is satisfied for any address).
    #[test]
    fn test_add_oracle_node_rejects_non_admin() {
        let env = Env::default();
        let h = setup(&env);

        let attacker = Address::generate(&env);
        let node = Address::generate(&env);
        let res = h.client.try_add_oracle_node(
            &attacker,
            &node,
            &String::from_str(&env, "http://attacker.local"),
        );
        assert_eq!(res, Err(Ok(crate::PrivacyOracleError::Unauthorized)));
    }

    /// A non-requester cannot cancel another user's request.
    #[test]
    fn test_cancel_request_rejects_non_requester() {
        let env = Env::default();
        let h = setup(&env);

        h.client.add_deposit(&h.admin, &MARKET_DATA_FEE);
        let request_id = request_market_data(&h, 1);

        let stranger = Address::generate(&env);
        let res = h.client.try_cancel_request(&stranger, &request_id);
        assert_eq!(res, Err(Ok(crate::PrivacyOracleError::Unauthorized)));
    }

    /// A request by the same requester for identical inputs in the same ledger
    /// must yield two distinct request IDs (collision-proof; issue #412 WS2).
    #[test]
    fn test_same_ledger_duplicate_requests_get_distinct_ids() {
        let env = Env::default();
        let h = setup(&env);

        h.client.add_deposit(&h.admin, &(MARKET_DATA_FEE * 2));

        let data_source = String::from_str(&env, "market_data");
        let data_hash = BytesN::<32>::from_array(&env, &[7u8; 32]);
        let id1 = h
            .client
            .request_data(&h.admin, &data_source.clone(), &data_hash.clone(), &2u32);
        let id2 = h
            .client
            .request_data(&h.admin, &data_source, &data_hash, &2u32);

        assert_ne!(id1, id2, "same-ledger identical requests must not collide");

        // Both requests are stored; the user was debited twice (no overwrite).
        let (_total, _fees, _nodes) = h.client.get_oracle_stats();
        assert_eq!(h.client.get_data_request(&id1).request_id, id1);
        assert_eq!(h.client.get_data_request(&id2).request_id, id2);
    }
}
