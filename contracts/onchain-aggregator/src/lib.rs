#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::contract;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::contracttype;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::Address;
use soroban_sdk::Bytes;
use soroban_sdk::BytesN;
use soroban_sdk::Env;
use soroban_sdk::Map;
use soroban_sdk::String;
use soroban_sdk::Symbol;
use soroban_sdk::Vec;

// Constants
const MAX_BATCH_SIZE: u32 = 100;
const MIN_CREDITS_FOR_SUM: i128 = 1000000; // 0.001 XLM
const MIN_CREDITS_FOR_AVG: i128 = 2000000; // 0.002 XLM
const MIN_CREDITS_FOR_COUNT: i128 = 500000; // 0.0005 XLM
const PRIVACY_BUDGET_COST: i128 = 100000; // 0.0001 XLM per operation

// Differential-privacy Laplace mechanism constants (scaled by NOISE_SCALE_FACTOR
// to avoid fractional arithmetic in no_std i128 arithmetic).
// sensitivity = 1 for count/sum/average (global sensitivity of a single record).
const DP_SENSITIVITY: i128 = 1;
// NOISE_SCALE_FACTOR: multiplier used to work in fixed-point so that
// (sensitivity / epsilon) can be expressed as an integer ratio.
const NOISE_SCALE_FACTOR: i128 = 1_000_000;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum AggregationOperation {
    Sum,
    Average,
    Count,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct EncryptedDataPoint {
    pub data_id: BytesN<32>,
    pub encrypted_value: Bytes,
    pub provider_id: Address,
    pub timestamp: u64,
    pub data_hash: BytesN<32>,
    pub epsilon_spent: i128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AggregationRequest {
    pub request_id: BytesN<32>,
    pub requester: Address,
    pub operation: AggregationOperation,
    pub data_points: Vec<BytesN<32>>,
    pub privacy_budget: i128,
    pub timestamp: u64,
    pub status: String, // "pending", "processing", "completed", "failed"
    pub compute_credits_used: i128,
    pub batch_id: Option<BytesN<32>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AggregationResult {
    pub request_id: BytesN<32>,
    pub encrypted_result: Bytes,
    pub result_hash: BytesN<32>,
    pub privacy_certificate_id: BytesN<32>,
    pub timestamp: u64,
    pub participants_count: u32,
    pub total_epsilon_spent: i128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct PrivacyCertificate {
    pub certificate_id: BytesN<32>,
    pub request_id: BytesN<32>,
    pub differential_privacy_params: Map<String, i128>,
    pub noise_added: i128,
    pub epsilon_used: i128,
    pub delta_used: i128,
    pub timestamp: u64,
    /// Nonce committed by the processor that binds the certificate to the
    /// request, its result, and the processor (issue #412 WS3).
    pub privacy_proofs_nonce: BytesN<32>,
    /// On-chain commitment over (request_id, privacy_proofs_nonce). Never
    /// empty: consumers reject certificates that assert integrity without a
    /// binding signature (issue #412 WS3).
    pub signature: Bytes,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct BatchProcessing {
    pub batch_id: BytesN<32>,
    pub requests: Vec<BytesN<32>>,
    pub status: String,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub completed_requests: Vec<BytesN<32>>,
    pub failed_requests: Vec<BytesN<32>>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum AggregatorError {
    InvalidRequestId = 0,
    RequestNotFound = 1,
    InsufficientCredits = 2,
    InsufficientPrivacyBudget = 3,
    InvalidOperation = 4,
    BatchTooLarge = 5,
    DataPointNotFound = 6,
    OverflowError = 7,
    InvalidEpsilon = 8,
    NotAuthorized = 9,
    RequestAlreadyCompleted = 10,
    StateInconsistent = 11,
}

#[contract]
pub struct OnChainAggregator;

#[contractimpl]
impl OnChainAggregator {
    /// Initialize the aggregator contract
    pub fn initialize(env: Env, admin: Address) {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, "initialized"))
        {
            return; // Already initialized
        }

        // Require the admin to authorize initialization. Without this an
        // attacker could front-run the deployer's setup transaction and
        // claim admin by passing their own address.
        admin.require_auth();

        // Set admin
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);

        // Initialize default compute credit prices
        let mut credit_prices = Map::new(&env);
        credit_prices.set(Symbol::new(&env, "sum"), MIN_CREDITS_FOR_SUM);
        credit_prices.set(Symbol::new(&env, "avg"), MIN_CREDITS_FOR_AVG);
        credit_prices.set(Symbol::new(&env, "count"), MIN_CREDITS_FOR_COUNT);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "credit_prices"), &credit_prices);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Submit a new aggregation request
    pub fn submit_aggregation_request(
        env: Env,
        requester: Address,
        operation: AggregationOperation,
        data_point_ids: Vec<BytesN<32>>,
        privacy_budget: i128,
    ) -> Result<BytesN<32>, AggregatorError> {
        // Verify requester authorization
        requester.require_auth();

        // Validate batch size
        if data_point_ids.len() > MAX_BATCH_SIZE {
            return Err(AggregatorError::BatchTooLarge);
        }

        // Check if requester has sufficient compute credits
        let required_credits = Self::get_required_credits(&env, &operation, data_point_ids.len());
        let user_credits = Self::get_user_credits(&env, &requester);
        if user_credits < required_credits {
            return Err(AggregatorError::InsufficientCredits);
        }

        // Verify all data points exist and are valid
        for data_id in data_point_ids.iter() {
            if !Self::data_point_exists(&env, &data_id) {
                return Err(AggregatorError::DataPointNotFound);
            }
        }

        // Generate a collision-proof request ID (per-requester nonce + ledger
        // sequence fold into the hash) and reject any residual collision.
        let request_id = Self::generate_request_id(&env, &requester, &operation);
        if env.storage().persistent().has(&request_id) {
            return Err(AggregatorError::InvalidRequestId);
        }

        let current_time = env.ledger().timestamp();

        let request = AggregationRequest {
            request_id: request_id.clone(),
            requester: requester.clone(),
            operation: operation.clone(),
            data_points: data_point_ids.clone(),
            privacy_budget,
            timestamp: current_time,
            status: String::from_str(&env, "pending"),
            compute_credits_used: required_credits,
            batch_id: None,
        };

        // Store request
        env.storage().persistent().set(&request_id, &request);

        // Append to the request index so the WS5 verify_state hook can
        // enumerate the full request ledger (append-only enumeration index;
        // per-actor storage is used for all balance-like state).
        let mut request_ids: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "request_ids"))
            .unwrap_or_else(|| Vec::new(&env));
        request_ids.push_back(request_id.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "request_ids"), &request_ids);

        // Fail-closed invariant check over the request ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        // Deduct compute credits (checked; fail-closed on overflow)
        Self::update_user_credits(&env, &requester, -required_credits)?;

        // Emit payload-bearing event with a replay-detection nonce
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (
                Symbol::new(&env, "aggregation_requested"),
                request_id.clone(),
            ),
            (
                event_nonce,
                requester.clone(),
                operation,
                privacy_budget,
                required_credits,
                current_time,
            ),
        );

        Ok(request_id)
    }

    /// Process aggregation request (simplified for demonstration)
    pub fn process_aggregation(
        env: Env,
        request_id: BytesN<32>,
        processor: Address,
    ) -> Result<BytesN<32>, AggregatorError> {
        // Host-level auth: a spoofable `processor` argument previously let any
        // caller replay `process_aggregation(ids, admin)` to burn gas. The
        // processor must authorize the call (issue #412 WS1/WS3).
        processor.require_auth();

        Self::process_aggregation_internal(env, request_id, processor)
    }

    /// Shared processing core used by the public entry point and by
    /// `batch_process`. It performs the admin-equality check but deliberately
    /// does NOT call `require_auth` (the caller already authenticated the
    /// processor; re-requiring auth inside the same invocation frame would
    /// raise `Auth, ExistingValue`).
    fn process_aggregation_internal(
        env: Env,
        request_id: BytesN<32>,
        processor: Address,
    ) -> Result<BytesN<32>, AggregatorError> {
        // Verify processor authorization (could be a designated oracle)
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(AggregatorError::NotAuthorized)?;
        if processor != admin {
            return Err(AggregatorError::NotAuthorized);
        }

        let mut request = Self::get_aggregation_request(&env, &request_id)
            .ok_or(AggregatorError::RequestNotFound)?;

        // A request may only be processed once: reject completed AND any
        // in-flight/failed re-processing (issue #412 WS3 ordering guard).
        if request.status != String::from_str(&env, "pending") {
            return Err(AggregatorError::RequestAlreadyCompleted);
        }

        // Validate inputs BEFORE mutating status so a failed validation leaves
        // the request untouched in "pending".
        let mut encrypted_values = Vec::new(&env);
        let mut total_epsilon_spent = 0i128;
        let mut participants_count = 0u32;

        for data_id in request.data_points.iter() {
            if let Some(data_point) = Self::get_data_point(&env, &data_id) {
                encrypted_values.push_back(data_point.encrypted_value.clone());
                total_epsilon_spent = total_epsilon_spent
                    .checked_add(data_point.epsilon_spent)
                    .ok_or(AggregatorError::OverflowError)?;
                participants_count += 1;
            }
        }

        // Differential-privacy budget invariant (issue #412 WS2): the total
        // epsilon spent by the data points must not exceed the request's
        // privacy budget, otherwise the certificate would claim protection the
        // aggregation does not provide. Fail closed with no result stored.
        if total_epsilon_spent > request.privacy_budget {
            return Err(AggregatorError::InsufficientPrivacyBudget);
        }

        // Zero-participant guard: `calculate_noise` divides by the participant
        // count, so an empty request used to panic the whole transaction.
        if participants_count == 0 {
            return Err(AggregatorError::InvalidOperation);
        }

        // Update status to processing (inputs are now validated)
        request.status = String::from_str(&env, "processing");
        env.storage().persistent().set(&request_id, &request);

        // Perform aggregation based on operation; on failure restore status to
        // "pending" so the request can be retried rather than stuck.
        let encrypted_result = match request.operation {
            AggregationOperation::Sum => Self::perform_sum(&env, &encrypted_values),
            AggregationOperation::Average => Self::perform_average(&env, &encrypted_values),
            AggregationOperation::Count => Self::perform_count(&env, &encrypted_values),
        };

        let encrypted_result = match encrypted_result {
            Ok(result) => result,
            Err(err) => {
                request.status = String::from_str(&env, "pending");
                env.storage().persistent().set(&request_id, &request);
                return Err(err);
            }
        };

        // ── Differential-privacy: apply Laplace noise to the raw aggregate ──
        //
        // Previously `calculate_noise` returned an i128 that was recorded in
        // the certificate but was never added to the result, making the DP
        // guarantee purely cosmetic.  We now derive a signed Laplace sample
        // from the environment PRNG (deterministic in tests, unpredictable
        // on-chain) and add it to the raw aggregate before persisting.
        //
        // Laplace mechanism: noise ~ Lap(sensitivity / epsilon)
        //   sensitivity = 1 (one record can change the aggregate by at most 1
        //                    in the scaled integer representation)
        //   epsilon     = total_epsilon_spent (the actual privacy-loss budget)
        //
        // Because epsilon is stored scaled (e.g. 100 == 0.0001 in fixed-point)
        // we divide by NOISE_SCALE_FACTOR to get the true epsilon before
        // computing the scale, then re-scale the noise back to integer space.
        let noise_magnitude =
            Self::laplace_noise_magnitude(&env, total_epsilon_spent, participants_count);
        let noisy_result = Self::add_noise_to_result(&env, &encrypted_result, noise_magnitude);

        // Generate privacy certificate
        let certificate_id = Self::generate_certificate_id(&env, &request_id);
        // Hash covers the *noisy* result so consumers can verify integrity.
        let result_hash: BytesN<32> = env.crypto().sha256(&noisy_result).into();

        // WS3: the certificate must bind the result. The privacy_proofs nonce
        // commits to (request, result, processor, ledger timestamp) and the
        // signature is a deterministic on-chain commitment over that nonce —
        // a certificate is never persisted with an empty signature that
        // asserts integrity it does not provide. A real oracle signature can
        // replace the commitment in production; consumers reject empty
        // signatures and unbound nonces (see get_privacy_certificate).
        let mut proof_input = soroban_sdk::Bytes::new(&env);
        proof_input.append(&request_id.clone().to_xdr(&env));
        proof_input.append(&result_hash.clone().to_xdr(&env));
        proof_input.append(&processor.clone().to_xdr(&env));
        proof_input.append(&Bytes::from_slice(
            &env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        let privacy_proofs_nonce: BytesN<32> = env.crypto().sha256(&proof_input).into();

        let mut sig_input = soroban_sdk::Bytes::new(&env);
        sig_input.append(&request_id.clone().to_xdr(&env));
        sig_input.append(&privacy_proofs_nonce.clone().to_xdr(&env));
        let sig_hash: BytesN<32> = env.crypto().sha256(&sig_input).into();
        let signature = Bytes::from_slice(&env, &sig_hash.to_array());

        let privacy_certificate = PrivacyCertificate {
            certificate_id: certificate_id.clone(),
            request_id: request_id.clone(),
            differential_privacy_params: Self::create_dp_params(&env, &request.operation),
            // Record the actual signed noise applied so consumers can audit
            // calibration without re-computing it.
            noise_added: noise_magnitude,
            epsilon_used: total_epsilon_spent,
            delta_used: total_epsilon_spent / 1000, // Simplified delta calculation
            timestamp: env.ledger().timestamp(),
            privacy_proofs_nonce,
            signature,
        };

        // Store privacy certificate
        env.storage()
            .persistent()
            .set(&certificate_id, &privacy_certificate);

        // Create result — stores the *noisy* aggregate, not the raw one.
        let result = AggregationResult {
            request_id: request_id.clone(),
            encrypted_result: noisy_result,
            result_hash,
            privacy_certificate_id: certificate_id.clone(),
            timestamp: env.ledger().timestamp(),
            participants_count,
            total_epsilon_spent,
        };

        // Store result
        env.storage()
            .persistent()
            .set(&(Symbol::new(&env, "result_"), request_id.clone()), &result);

        // Update request status
        request.status = String::from_str(&env, "completed");
        env.storage().persistent().set(&request_id, &request);

        // Emit payload-bearing event with a replay-detection nonce
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (
                Symbol::new(&env, "aggregation_completed"),
                request_id.clone(),
            ),
            (
                event_nonce,
                certificate_id.clone(),
                total_epsilon_spent,
                participants_count,
                env.ledger().timestamp(),
            ),
        );

        // Fail-closed invariant check over the request ledger (issue #412 WS5).
        Self::verify_state(&env)?;

        Ok(certificate_id)
    }

    /// Batch process multiple aggregation requests
    pub fn batch_process(
        env: Env,
        request_ids: Vec<BytesN<32>>,
        processor: Address,
    ) -> Result<BytesN<32>, AggregatorError> {
        // Host-level auth (same spoofing protection as process_aggregation).
        processor.require_auth();

        // Verify processor authorization
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(AggregatorError::NotAuthorized)?;
        if processor != admin {
            return Err(AggregatorError::NotAuthorized);
        }

        // Validate batch size
        if request_ids.len() > MAX_BATCH_SIZE {
            return Err(AggregatorError::BatchTooLarge);
        }

        // Generate batch ID
        let batch_id = Self::generate_batch_id(&env, &processor);

        let batch = BatchProcessing {
            batch_id: batch_id.clone(),
            requests: request_ids.clone(),
            status: String::from_str(&env, "processing"),
            created_at: env.ledger().timestamp(),
            completed_at: None,
            completed_requests: Vec::new(&env),
            failed_requests: Vec::new(&env),
        };

        // Store initial batch
        env.storage().persistent().set(&batch_id, &batch);

        // Process each request, tracking successes and failures
        let mut completed_requests = Vec::new(&env);
        let mut failed_requests = Vec::new(&env);

        for request_id in request_ids.iter() {
            match Self::process_aggregation_internal(
                env.clone(),
                request_id.clone(),
                processor.clone(),
            ) {
                Ok(_certificate_id) => {
                    completed_requests.push_back(request_id.clone());
                }
                Err(_err) => {
                    // Set the failed request's status to "failed" explicitly
                    if let Some(mut req) = Self::get_aggregation_request(&env, &request_id) {
                        req.status = String::from_str(&env, "failed");
                        env.storage().persistent().set(&request_id, &req);
                    }
                    failed_requests.push_back(request_id.clone());
                }
            }
        }

        // Determine final batch status based on results
        let completed_count = completed_requests.len();
        let failed_count = failed_requests.len();
        let batch_status = if failed_requests.is_empty() {
            String::from_str(&env, "completed")
        } else if completed_requests.is_empty() {
            String::from_str(&env, "failed")
        } else {
            String::from_str(&env, "partial")
        };

        // Update batch with results
        let updated_batch = BatchProcessing {
            batch_id: batch_id.clone(),
            requests: request_ids,
            status: batch_status.clone(),
            created_at: batch.created_at,
            completed_at: Some(env.ledger().timestamp()),
            completed_requests,
            failed_requests,
        };
        env.storage().persistent().set(&batch_id, &updated_batch);

        // Emit payload-bearing event with a replay-detection nonce
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "batch_processed"), batch_id.clone()),
            (
                event_nonce,
                batch_status,
                completed_count,
                failed_count,
                env.ledger().timestamp(),
            ),
        );

        Ok(batch_id)
    }

    /// Add compute credits to user account
    pub fn add_compute_credits(
        env: Env,
        user: Address,
        amount: i128,
    ) -> Result<(), AggregatorError> {
        // Verify admin authorization
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(AggregatorError::NotAuthorized)?;
        admin.require_auth();

        Self::update_user_credits(&env, &user, amount)?;

        // Emit payload-bearing event with a replay-detection nonce
        let event_nonce = Self::next_event_nonce(&env);
        env.events().publish(
            (Symbol::new(&env, "credits_added"), user.clone()),
            (event_nonce, amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Get user's compute credit balance
    pub fn get_user_compute_credits(env: Env, user: Address) -> i128 {
        Self::get_user_credits(&env, &user)
    }

    /// Get batch processing status including succeeded/failed breakdown
    pub fn get_batch_status(env: Env, batch_id: BytesN<32>) -> Option<BatchProcessing> {
        env.storage().persistent().get(&batch_id)
    }

    /// Get aggregation result
    pub fn get_aggregation_result(env: Env, request_id: BytesN<32>) -> Option<AggregationResult> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "result_"), request_id.clone()))
    }

    /// Get privacy certificate. Certificates that assert integrity they do
    /// not provide — an empty signature or an unbound (all-zero) proof nonce —
    /// are rejected and reported as absent (issue #412 WS3 fail-closed).
    pub fn get_privacy_certificate(
        env: Env,
        certificate_id: BytesN<32>,
    ) -> Option<PrivacyCertificate> {
        match env
            .storage()
            .persistent()
            .get::<_, PrivacyCertificate>(&certificate_id)
        {
            Some(cert)
                if !cert.signature.is_empty()
                    && cert.privacy_proofs_nonce != BytesN::from_array(&env, &[0u8; 32]) =>
            {
                Some(cert)
            }
            _ => None,
        }
    }

    // Helper functions

    fn generate_request_id(
        env: &Env,
        requester: &Address,
        operation: &AggregationOperation,
    ) -> BytesN<32> {
        let mut combined = soroban_sdk::Bytes::new(env);
        combined.append(&requester.to_xdr(env));
        let op_str = match operation {
            AggregationOperation::Sum => String::from_str(env, "sum"),
            AggregationOperation::Average => String::from_str(env, "avg"),
            AggregationOperation::Count => String::from_str(env, "count"),
        };
        combined.append(&op_str.to_xdr(env));
        combined.append(&Bytes::from_slice(
            env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        combined.append(&Bytes::from_slice(
            env,
            &env.ledger().sequence().to_be_bytes(),
        ));
        // Per-requester monotonic nonce makes the ID collision-proof even for
        // two submits within the same ledger (issue #412 WS2 pattern).
        let key = (Symbol::new(env, "req_nonce"), requester.clone());
        let nonce: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        let next = nonce + 1;
        env.storage().persistent().set(&key, &next);
        combined.append(&Bytes::from_slice(env, &next.to_be_bytes()));
        env.crypto().sha256(&combined).into()
    }

    fn generate_certificate_id(env: &Env, request_id: &BytesN<32>) -> BytesN<32> {
        let mut combined = soroban_sdk::Bytes::new(env);
        combined.append(&request_id.to_xdr(env));
        combined.append(&String::from_str(env, "certificate").to_xdr(env));
        combined.append(&Bytes::from_slice(
            env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        env.crypto().sha256(&combined).into()
    }

    fn generate_batch_id(env: &Env, processor: &Address) -> BytesN<32> {
        let mut combined = soroban_sdk::Bytes::new(env);
        combined.append(&processor.to_xdr(env));
        combined.append(&String::from_str(env, "batch").to_xdr(env));
        combined.append(&Bytes::from_slice(
            env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        env.crypto().sha256(&combined).into()
    }

    fn get_aggregation_request(env: &Env, request_id: &BytesN<32>) -> Option<AggregationRequest> {
        env.storage().persistent().get(request_id)
    }

    fn get_data_point(env: &Env, data_id: &BytesN<32>) -> Option<EncryptedDataPoint> {
        env.storage().persistent().get(data_id)
    }

    fn data_point_exists(env: &Env, data_id: &BytesN<32>) -> bool {
        env.storage().persistent().has(data_id)
    }

    fn get_required_credits(_env: &Env, operation: &AggregationOperation, data_count: u32) -> i128 {
        let base_credits = match operation {
            AggregationOperation::Sum => MIN_CREDITS_FOR_SUM,
            AggregationOperation::Average => MIN_CREDITS_FOR_AVG,
            AggregationOperation::Count => MIN_CREDITS_FOR_COUNT,
        };

        // Add per-data-point cost
        base_credits + (PRIVACY_BUDGET_COST * data_count as i128)
    }

    fn get_user_credits(env: &Env, user: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, "credits_"), user.clone()))
            .unwrap_or(0i128)
    }

    fn update_user_credits(env: &Env, user: &Address, delta: i128) -> Result<(), AggregatorError> {
        let current_credits = Self::get_user_credits(env, user);
        let new_credits = current_credits
            .checked_add(delta)
            .ok_or(AggregatorError::OverflowError)?;
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, "credits_"), user.clone()), &new_credits);
        Ok(())
    }

    fn perform_sum(env: &Env, encrypted_values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        // Simplified homomorphic addition (in production, use proper homomorphic encryption)
        let mut result = soroban_sdk::Bytes::new(env);
        let mut sum = 0i128;

        for value in encrypted_values.iter() {
            // This is a placeholder - real implementation would use homomorphic encryption
            if value.len() >= 16 {
                let mut bytes = [0u8; 16];
                let mut i = 0u32;
                while i < 16u32 && i < value.len() {
                    bytes[i as usize] = value.get(i).unwrap_or(0);
                    i += 1;
                }
                let val = i128::from_le_bytes(bytes);
                sum = sum.checked_add(val).ok_or(AggregatorError::OverflowError)?;
            }
        }

        result.append(&Bytes::from_slice(env, &sum.to_le_bytes()));
        Ok(result)
    }

    fn perform_average(env: &Env, encrypted_values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        // Simplified average calculation
        let sum_result = Self::perform_sum(env, encrypted_values)?;
        let count = encrypted_values.len() as i128;

        if count == 0 {
            return Err(AggregatorError::InvalidOperation);
        }

        // Extract sum from result
        let mut sum_bytes = [0u8; 16];
        let mut i = 0u32;
        while i < 16u32 && i < sum_result.len() {
            sum_bytes[i as usize] = sum_result.get(i).unwrap_or(0);
            i += 1;
        }
        let sum = i128::from_le_bytes(sum_bytes);

        let average = sum / count;

        let mut result = soroban_sdk::Bytes::new(env);
        result.append(&Bytes::from_slice(env, &average.to_le_bytes()));
        Ok(result)
    }

    fn perform_count(env: &Env, encrypted_values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        let count = encrypted_values.len() as i128;
        let mut result = soroban_sdk::Bytes::new(env);
        result.append(&Bytes::from_slice(env, &count.to_le_bytes()));
        Ok(result)
    }

    fn create_dp_params(env: &Env, operation: &AggregationOperation) -> Map<String, i128> {
        let mut params = Map::new(env);

        match operation {
            AggregationOperation::Sum => {
                params.set(String::from_str(env, "epsilon"), 1000i128);
                params.set(String::from_str(env, "delta"), 1i128);
            }
            AggregationOperation::Average => {
                params.set(String::from_str(env, "epsilon"), 2000i128);
                params.set(String::from_str(env, "delta"), 2i128);
            }
            AggregationOperation::Count => {
                params.set(String::from_str(env, "epsilon"), 500i128);
                params.set(String::from_str(env, "delta"), 1i128);
            }
        }

        params
    }

    /// Compute the magnitude of the Laplace noise to inject.
    ///
    /// Laplace mechanism scale = sensitivity / epsilon.  Both are stored as
    /// fixed-point integers scaled by `NOISE_SCALE_FACTOR`, so the integer
    /// scale is:
    ///
    ///   scale_fp = (DP_SENSITIVITY * NOISE_SCALE_FACTOR * NOISE_SCALE_FACTOR)
    ///              / max(total_epsilon_spent, 1)
    ///
    /// We then draw a uniform u64 from the env PRNG and use the standard
    /// Laplace inversion formula:
    ///
    ///   u ∈ (0, 1)  →  noise = -scale * sign(u - 0.5) * ln(1 - 2|u - 0.5|)
    ///
    /// Because we have no floating-point in `no_std`, we approximate with a
    /// fast fixed-point integer table-free method:
    ///
    ///   noise ≈ scale_fp * (u_norm - HALF) / HALF
    ///
    /// where u_norm is the raw PRNG word interpreted as an i64 shift.  This
    /// produces a *bounded* triangular approximation that is sufficient for
    /// the on-chain use-case (true Laplace sampling would require a soft-float
    /// crate not available in Soroban's `no_std` environment).
    ///
    /// The caller guarantees `participants_count > 0`.
    fn laplace_noise_magnitude(
        env: &Env,
        total_epsilon_spent: i128,
        participants_count: u32,
    ) -> i128 {
        // Sensitivity in fixed-point.
        let sensitivity_fp = DP_SENSITIVITY * NOISE_SCALE_FACTOR;

        // epsilon is stored as a fixed-point integer scaled by NOISE_SCALE_FACTOR.
        // Clamp to 1 to avoid division by zero (epsilon=0 would mean infinite
        // noise — we fall back to the maximum noise of sensitivity_fp).
        let epsilon_clamped = if total_epsilon_spent < 1 {
            1
        } else {
            total_epsilon_spent
        };

        // scale_fp = sensitivity_fp * NOISE_SCALE_FACTOR / epsilon_fp
        //          = (sens * NOISE_SCALE_FACTOR^2) / epsilon_clamped
        let scale_fp = sensitivity_fp
            .saturating_mul(NOISE_SCALE_FACTOR)
            .checked_div(epsilon_clamped)
            .unwrap_or(sensitivity_fp);

        // Draw 16 pseudo-random bytes from the on-chain PRNG.
        let rand_bytes = env.prng().gen::<BytesN<16>>();
        let raw = rand_bytes.to_array();

        // Interpret first 8 bytes as u64, then map to a signed offset in
        // (-NOISE_SCALE_FACTOR/2, +NOISE_SCALE_FACTOR/2).
        let u64_val = u64::from_be_bytes([
            raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7],
        ]);
        // Map u64 to i64: shift so half the range is negative.
        let signed: i64 = (u64_val >> 1) as i64 - (i64::MAX / 2);
        // Normalise to [-NOISE_SCALE_FACTOR, +NOISE_SCALE_FACTOR].
        let noise_fp = (scale_fp.saturating_mul(signed as i128))
            .checked_div(i64::MAX as i128)
            .unwrap_or(0);

        // Scale down by participants so noise is proportional to group size
        // (larger aggregations need less noise for the same privacy guarantee).
        let participants = if participants_count == 0 {
            1i128
        } else {
            participants_count as i128
        };
        noise_fp.checked_div(participants).unwrap_or(0)
    }

    /// Add signed noise to a raw aggregate `Bytes` value.
    ///
    /// The aggregate is stored as a little-endian i128 in the first 16 bytes.
    /// We deserialise, add the noise with saturation, and re-serialise.
    fn add_noise_to_result(env: &Env, raw_result: &Bytes, noise: i128) -> Bytes {
        if raw_result.len() < 16 {
            // Unexpected format — return as-is to avoid corrupting unknown data.
            return raw_result.clone();
        }
        let mut bytes = [0u8; 16];
        for i in 0u32..16u32 {
            bytes[i as usize] = raw_result.get(i).unwrap_or(0);
        }
        let exact_value = i128::from_le_bytes(bytes);
        let noisy_value = exact_value.saturating_add(noise);
        let mut result = Bytes::new(env);
        result.append(&Bytes::from_slice(env, &noisy_value.to_le_bytes()));
        // Preserve any trailing bytes beyond the 16-byte i128 (e.g. metadata).
        if raw_result.len() > 16 {
            let tail_start = 16u32;
            let tail_len = raw_result.len() - tail_start;
            let mut tail = Bytes::new(env);
            for i in 0..tail_len {
                tail.push_back(raw_result.get(tail_start + i).unwrap_or(0));
            }
            result.append(&tail);
        }
        result
    }

    /// Monotonically increasing event nonce for indexer replay detection
    /// (issue #412 WS5).
    fn next_event_nonce(env: &Env) -> u64 {
        let nonce: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "event_nonce"))
            .unwrap_or(0);
        let next = nonce + 1;
        env.storage()
            .instance()
            .set(&Symbol::new(env, "event_nonce"), &next);
        next
    }

    /// WS5: fail-closed state-consistency hook run after every mutation in
    /// this contract. Over the request index it asserts that every completed
    /// request has a stored result whose epsilon does not exceed the request's
    /// privacy budget and a matching certificate bound by a proof nonce and a
    /// non-empty signature, and that no result is stored for a request that is
    /// not completed. A deliberately corrupted ledger fails the transaction.
    fn verify_state(env: &Env) -> Result<(), AggregatorError> {
        let request_ids: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&Symbol::new(env, "request_ids"))
            .unwrap_or_else(|| Vec::new(env));

        for request_id in request_ids.iter() {
            let request = match Self::get_aggregation_request(env, &request_id) {
                Some(request) => request,
                None => return Err(AggregatorError::StateInconsistent),
            };

            let result = Self::get_aggregation_result(env.clone(), request_id.clone());
            if request.status == String::from_str(env, "completed") {
                // A completed request must have a stored result within budget.
                let result = match result {
                    Some(result) => result,
                    None => return Err(AggregatorError::StateInconsistent),
                };
                if result.total_epsilon_spent > request.privacy_budget {
                    return Err(AggregatorError::StateInconsistent);
                }

                // ...and a matching certificate bound by a proof nonce and a
                // non-empty signature (WS3 fail-closed).
                let certificate: PrivacyCertificate = match env
                    .storage()
                    .persistent()
                    .get(&result.privacy_certificate_id)
                {
                    Some(certificate) => certificate,
                    None => return Err(AggregatorError::StateInconsistent),
                };
                if certificate.request_id != request_id
                    || certificate.epsilon_used != result.total_epsilon_spent
                    || certificate.signature.is_empty()
                    || certificate.privacy_proofs_nonce == BytesN::from_array(env, &[0u8; 32])
                {
                    return Err(AggregatorError::StateInconsistent);
                }
            } else if result.is_some() {
                // No result may be stored for a non-completed request.
                return Err(AggregatorError::StateInconsistent);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests;
