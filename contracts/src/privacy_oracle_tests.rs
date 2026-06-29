#[cfg(test)]
mod tests {
    use soroban_sdk::{Address, BytesN, Env, String, Vec};

    use crate::privacy_oracle::{PrivacyOracle, PrivacyOracleClient};

    // "market_data" fee configured in PrivacyOracle::initialize (0.05 XLM).
    const MARKET_DATA_FEE: i128 = 50_000_000;

    struct Harness<'a> {
        env: Env,
        client: PrivacyOracleClient<'a>,
        // The contract's own address doubles as admin/requester/oracle because
        // every entrypoint derives the caller from env.current_contract_address().
        actor: Address,
    }

    fn setup(env: &Env) -> Harness<'_> {
        env.mock_all_auths();
        let contract_id = env.register(PrivacyOracle, ());
        let client = PrivacyOracleClient::new(env, &contract_id);
        let actor: Address = env.as_contract(&contract_id, || env.current_contract_address());
        client.initialize(&actor);
        Harness {
            env: env.clone(),
            client,
            actor,
        }
    }

    // `seed` distinguishes the data_hash so otherwise-identical requests hash to
    // distinct request IDs (the ID also folds in ledger time/sequence, which do
    // not advance between calls in a single test).
    fn request_market_data(h: &Harness, seed: u8) -> BytesN<32> {
        let data_source = String::from_str(&h.env, "market_data");
        let data_hash = BytesN::<32>::from_array(&h.env, &[seed; 32]);
        h.client.request_data(&data_source, &data_hash, &2u32)
    }

    /// Acceptance: create request -> cancel -> total_fees_collected reflects the
    /// net fee actually retained (fee - 50% refund).
    #[test]
    fn test_cancel_request_decrements_total_fees_to_net_fee() {
        let env = Env::default();
        let h = setup(&env);

        h.client.add_deposit(&MARKET_DATA_FEE);
        let request_id = request_market_data(&h, 1);

        // Full fee booked on request.
        let (_requests, fees_after_request, _nodes) = h.client.get_stats();
        assert_eq!(fees_after_request, MARKET_DATA_FEE);

        h.client.cancel_request(&request_id);

        // 50% refunded, so the counter must reflect the net fee (fee - refund).
        let refund = MARKET_DATA_FEE / 2;
        let net_fee = MARKET_DATA_FEE - refund;
        let (_r, fees_after_cancel, _n) = h.client.get_stats();
        assert_eq!(fees_after_cancel, net_fee);
        assert_eq!(fees_after_cancel, 25_000_000);
    }

    /// Acceptance: create request -> fulfill -> total_fees_collected reflects the
    /// full fee (fulfilment retains the entire fee, no refund).
    #[test]
    fn test_fulfill_request_keeps_full_fee() {
        let env = Env::default();
        let h = setup(&env);

        // Register the actor as an active oracle so fulfilment is authorized.
        h.client
            .add_oracle_node(&h.actor, &String::from_str(&env, "http://oracle.local"));

        h.client.add_deposit(&MARKET_DATA_FEE);
        let request_id = request_market_data(&h, 1);

        let result_hash = BytesN::<32>::from_array(&env, &[2u8; 32]);
        let privacy_proofs: Vec<BytesN<32>> = Vec::new(&env);
        h.client
            .fulfill_request(&request_id, &result_hash, &privacy_proofs, &95u32);

        let (_r, fees_after_fulfill, _n) = h.client.get_stats();
        assert_eq!(fees_after_fulfill, MARKET_DATA_FEE);
    }

    /// The counter must track net fees consistently across interleaved
    /// fulfil/cancel operations rather than drifting upward per cancellation.
    #[test]
    fn test_total_fees_collected_tracks_net_across_multiple_requests() {
        let env = Env::default();
        let h = setup(&env);

        h.client
            .add_oracle_node(&h.actor, &String::from_str(&env, "http://oracle.local"));
        h.client.add_deposit(&(MARKET_DATA_FEE * 3));

        // Request #1 -> fulfilled (retains full fee).
        let req1 = request_market_data(&h, 1);
        let result_hash = BytesN::<32>::from_array(&env, &[2u8; 32]);
        let proofs: Vec<BytesN<32>> = Vec::new(&env);
        h.client
            .fulfill_request(&req1, &result_hash, &proofs, &90u32);

        // Request #2 and #3 -> cancelled (retains 50% each).
        let req2 = request_market_data(&h, 2);
        let req3 = request_market_data(&h, 3);
        h.client.cancel_request(&req2);
        h.client.cancel_request(&req3);

        // Net = full fee + 2 * (fee - refund).
        let refund = MARKET_DATA_FEE / 2;
        let expected = MARKET_DATA_FEE + 2 * (MARKET_DATA_FEE - refund);
        let (_r, total_fees, _n) = h.client.get_stats();
        assert_eq!(total_fees, expected);
    }
}
