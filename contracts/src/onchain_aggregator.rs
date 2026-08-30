use soroban_sdk::contract;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::contracttype;
use soroban_sdk::symbol_short;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::Address;
use soroban_sdk::Bytes;
use soroban_sdk::BytesN;
use soroban_sdk::Env;
use soroban_sdk::Map;
use soroban_sdk::String;
use soroban_sdk::Symbol;
use soroban_sdk::Vec;

// Contract state storage keys

// Constants
const MAX_BATCH_SIZE: u32 = 100;
const MIN_CREDITS_FOR_SUM: i128 = 1000000; // 0.001 XLM
const MIN_CREDITS_FOR_AVG: i128 = 2000000; // 0.002 XLM
const MIN_CREDITS_FOR_COUNT: i128 = 500000; // 0.0005 XLM
const PRIVACY_BUDGET_COST: i128 = 100000; // 0.0001 XLM per operation

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum AggregationOperation {
    Sum,
    Average,
    Count,
}

/// A data point contributed by a provider.
///
/// IMPORTANT: This demonstration contract stores `value` as raw
/// little-endian `i128` bytes. It is *not* encrypted and must never be
/// treated as private by itself. Access control is enforced at the
/// contract level: only the owning provider (`provider_id`) or an address
/// explicitly granted access may reference the data point in an
/// aggregation, and only authorized parties may read aggregation results.
///
/// Production deployments must use real client-side encryption of values
/// together with a homomorphic aggregation scheme; until then the plaintext
/// values must only ever be handled through the access controls in this
/// contract.
#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataPoint {
    pub data_id: BytesN<32>,
    pub value: Bytes,
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
    pub batch_id: BytesN<32>, // all-zero bytes when not part of a batch
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AggregationResult {
    pub request_id: BytesN<32>,
    pub result_value: Bytes,
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
    /// The requester neither owns nor holds an access grant for a
    /// referenced data point.
    NotDataPointOwner = 11,
}

#[contract]
pub struct OnChainAggregator;

#[contractimpl]
impl OnChainAggregator {
    /// Initialize the aggregator contract
    pub fn initialize_aggregator(env: Env, admin: Address) {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, "initialized"))
        {
            return; // Already initialized
        }

        // Set admin
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);

        // Initialize default compute credit prices
        let mut credit_prices = Map::new(&env);
        credit_prices.set(symbol_short!("sum"), MIN_CREDITS_FOR_SUM);
        credit_prices.set(symbol_short!("avg"), MIN_CREDITS_FOR_AVG);
        credit_prices.set(symbol_short!("count"), MIN_CREDITS_FOR_COUNT);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "credit_prices"), &credit_prices);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Submit a new aggregation request.
    ///
    /// The authenticated `requester` must own every referenced data point
    /// (i.e. be the `provider_id` recorded for it) or hold an explicit
    /// access grant for it (see [`grant_data_access`]). Referencing data
    /// points owned by other users is rejected with
    /// [`AggregatorError::NotDataPointOwner`].
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

        // Verify all data points exist and are valid, and that the
        // requester owns or is authorized for every referenced data point.
        for data_id in data_point_ids.iter() {
            if !Self::data_point_exists(&env, &data_id) {
                return Err(AggregatorError::DataPointNotFound);
            }
            if !Self::can_access_data_point(&env, &requester, &data_id) {
                return Err(AggregatorError::NotDataPointOwner);
            }
        }

        // Generate request ID
        let request_id = Self::generate_request_id(&env, &requester, &operation);

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
            batch_id: BytesN::from_array(&env, &[0u8; 32]),
        };

        // Store request
        env.storage().persistent().set(&request_id, &request);

        // Deduct compute credits
        Self::update_user_credits(&env, &requester, -required_credits);

        Ok(request_id)
    }

    /// Grant `grantee` explicit access to a data point owned by `owner`.
    ///
    /// Only the recorded provider (`provider_id`) of the data point may
    /// grant access. Once granted, the grantee may reference the data point
    /// in aggregation requests and read results that include it.
    pub fn grant_data_access(
        env: Env,
        owner: Address,
        data_id: BytesN<32>,
        grantee: Address,
    ) -> Result<(), AggregatorError> {
        owner.require_auth();

        let data_point =
            Self::get_data_point(&env, &data_id).ok_or(AggregatorError::DataPointNotFound)?;
        if data_point.provider_id != owner {
            return Err(AggregatorError::NotAuthorized);
        }

        let key = Self::access_key(&env, &data_id);
        let mut grantees: Vec<Address> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        if !grantees.contains(&grantee) {
            grantees.push_back(grantee);
            env.storage().persistent().set(&key, &grantees);
        }

        Ok(())
    }

    /// Revoke an explicit access grant for a data point owned by `owner`.
    pub fn revoke_data_access(
        env: Env,
        owner: Address,
        data_id: BytesN<32>,
        grantee: Address,
    ) -> Result<(), AggregatorError> {
        owner.require_auth();

        let data_point =
            Self::get_data_point(&env, &data_id).ok_or(AggregatorError::DataPointNotFound)?;
        if data_point.provider_id != owner {
            return Err(AggregatorError::NotAuthorized);
        }

        let key = Self::access_key(&env, &data_id);
        let grantees: Vec<Address> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut updated = Vec::new(&env);
        for g in grantees.iter() {
            if g != grantee {
                updated.push_back(g);
            }
        }
        env.storage().persistent().set(&key, &updated);

        Ok(())
    }

    /// Process aggregation request (simplified for demonstration)
    pub fn process_aggregation(
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

        // Check if request is already completed
        if request.status == String::from_str(&env, "completed") {
            return Err(AggregatorError::RequestAlreadyCompleted);
        }

        // Update status to processing
        request.status = String::from_str(&env, "processing");
        env.storage().persistent().set(&request_id, &request);

        // Collect data point values
        let mut values = Vec::new(&env);
        let mut total_epsilon_spent = 0i128;
        let mut participants_count = 0u32;

        for data_id in request.data_points.iter() {
            if let Some(data_point) = Self::get_data_point(&env, &data_id) {
                values.push_back(data_point.value.clone());
                total_epsilon_spent += data_point.epsilon_spent;
                participants_count += 1;
            }
        }

        // Perform aggregation based on operation
        let result_value = match request.operation {
            AggregationOperation::Sum => Self::perform_sum(&env, &values)?,
            AggregationOperation::Average => Self::perform_average(&env, &values)?,
            AggregationOperation::Count => Self::perform_count(&env, &values)?,
        };

        // Generate privacy certificate
        let certificate_id = Self::generate_certificate_id(&env, &request_id);
        let privacy_certificate = PrivacyCertificate {
            certificate_id: certificate_id.clone(),
            request_id: request_id.clone(),
            differential_privacy_params: Self::create_dp_params(&env, &request.operation),
            noise_added: Self::calculate_noise(&env, participants_count),
            epsilon_used: total_epsilon_spent,
            delta_used: total_epsilon_spent / 1000, // Simplified delta calculation
            timestamp: env.ledger().timestamp(),
            signature: Bytes::new(&env), // Would be signed by oracle
        };

        // Store privacy certificate
        env.storage()
            .persistent()
            .set(&certificate_id, &privacy_certificate);

        // Create result
        let result_hash = env.crypto().sha256(&result_value);
        let result = AggregationResult {
            request_id: request_id.clone(),
            result_value: result_value.clone(),
            result_hash,
            privacy_certificate_id: certificate_id.clone(),
            timestamp: env.ledger().timestamp(),
            participants_count,
            total_epsilon_spent,
        };

        // Store result under a key derived from the request ID.
        // Reads of the result are gated by authorization (see
        // get_aggregation_result).
        env.storage()
            .persistent()
            .set(&Self::result_key(&env, &request_id), &result);

        // Update request status
        request.status = String::from_str(&env, "completed");
        env.storage().persistent().set(&request_id, &request);

        Ok(certificate_id)
    }

    /// Batch process multiple aggregation requests
    pub fn batch_process(
        env: Env,
        request_ids: Vec<BytesN<32>>,
        processor: Address,
    ) -> Result<BytesN<32>, AggregatorError> {
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
        };

        // Store batch
        env.storage().persistent().set(&batch_id, &batch);

        // Process each request
        let mut certificate_ids = Vec::new(&env);
        for request_id in request_ids.iter() {
            if let Ok(certificate_id) =
                Self::process_aggregation(env.clone(), request_id.clone(), processor.clone())
            {
                certificate_ids.push_back(certificate_id);
            }
        }

        // Update batch status
        let mut updated_batch = batch;
        updated_batch.status = String::from_str(&env, "completed");
        updated_batch.completed_at = Some(env.ledger().timestamp());
        env.storage().persistent().set(&batch_id, &updated_batch);

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

        Self::update_user_credits(&env, &user, amount);
        Ok(())
    }

    /// Get user's compute credit balance
    pub fn get_user_compute_credits(env: Env, user: Address) -> i128 {
        Self::get_user_credits(&env, &user)
    }

    /// Get aggregation result.
    ///
    /// The authenticated `caller` must be the requester of the aggregation,
    /// the contract admin, or a participant (owner or grantee) of at least
    /// one of the data points included in the request. Unauthorized callers
    /// receive [`AggregatorError::NotAuthorized`], closing the
    /// guessable-key read hole from the original design.
    pub fn get_aggregation_result(
        env: Env,
        request_id: BytesN<32>,
        caller: Address,
    ) -> Result<AggregationResult, AggregatorError> {
        caller.require_auth();

        let result: AggregationResult = env
            .storage()
            .persistent()
            .get(&Self::result_key(&env, &request_id))
            .ok_or(AggregatorError::RequestNotFound)?;

        // Load the request to determine the authorized set.
        let request = Self::get_aggregation_request(&env, &request_id)
            .ok_or(AggregatorError::RequestNotFound)?;

        // 1. The requester who paid for the aggregation may read it.
        let mut authorized = caller == request.requester;

        // 2. The contract admin may read any result.
        if !authorized {
            if let Some(admin) = env
                .storage()
                .instance()
                .get::<_, Address>(&Symbol::new(&env, "admin"))
            {
                authorized = caller == admin;
            }
        }

        // 3. A participant (owner or grantee of any referenced data point)
        //    may read the aggregated result of the group they contributed to.
        if !authorized {
            for data_id in request.data_points.iter() {
                if Self::can_access_data_point(&env, &caller, &data_id) {
                    authorized = true;
                    break;
                }
            }
        }

        if !authorized {
            return Err(AggregatorError::NotAuthorized);
        }

        Ok(result)
    }

    /// Get privacy certificate
    pub fn get_privacy_certificate(
        env: Env,
        certificate_id: BytesN<32>,
    ) -> Option<PrivacyCertificate> {
        env.storage().persistent().get(&certificate_id)
    }

    // Helper functions

    fn generate_request_id(
        env: &Env,
        requester: &Address,
        operation: &AggregationOperation,
    ) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&requester.clone().to_xdr(env));
        combined.append(&match operation {
            AggregationOperation::Sum => Bytes::from_slice(env, b"sum"),
            AggregationOperation::Average => Bytes::from_slice(env, b"avg"),
            AggregationOperation::Count => Bytes::from_slice(env, b"count"),
        });
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn generate_certificate_id(env: &Env, request_id: &BytesN<32>) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&Bytes::from(request_id));
        combined.extend_from_array(b"certificate");
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn generate_batch_id(env: &Env, processor: &Address) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&processor.clone().to_xdr(env));
        combined.extend_from_array(b"batch");
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn get_aggregation_request(env: &Env, request_id: &BytesN<32>) -> Option<AggregationRequest> {
        env.storage().persistent().get(request_id)
    }

    fn get_data_point(env: &Env, data_id: &BytesN<32>) -> Option<DataPoint> {
        env.storage().persistent().get(data_id)
    }

    fn data_point_exists(env: &Env, data_id: &BytesN<32>) -> bool {
        env.storage().persistent().has(data_id)
    }

    /// Returns `true` if `user` owns `data_id` (is its `provider_id`) or
    /// holds an explicit access grant for it.
    fn can_access_data_point(env: &Env, user: &Address, data_id: &BytesN<32>) -> bool {
        if let Some(data_point) = Self::get_data_point(env, data_id) {
            if data_point.provider_id == *user {
                return true;
            }
        }

        let grantees: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Self::access_key(env, data_id))
            .unwrap_or_else(|| Vec::new(env));

        grantees.contains(user)
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
            .get(&Self::credits_key(env, user))
            .unwrap_or(0i128)
    }

    fn update_user_credits(env: &Env, user: &Address, delta: i128) {
        let current_credits = Self::get_user_credits(env, user);
        let new_credits = current_credits + delta;
        env.storage()
            .persistent()
            .set(&Self::credits_key(env, user), &new_credits);
    }

    /// Compute the sum of the (plaintext little-endian i128) values.
    ///
    /// NOTE: This is a demonstration implementation that operates on
    /// plaintext values. A production deployment must use client-side
    /// encryption with a homomorphic aggregation scheme so that plaintext
    /// values never appear on-chain. The access controls in this contract
    /// are the only thing keeping these values private today.
    fn perform_sum(env: &Env, values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        let mut sum = 0i128;

        for value in values.iter() {
            // This is a placeholder - real implementation would use homomorphic encryption
            if value.len() >= 16 {
                let mut bytes = [0u8; 16];
                for (i, byte) in bytes.iter_mut().enumerate() {
                    *byte = value.get(i as u32).unwrap_or(0);
                }
                let val = i128::from_le_bytes(bytes);
                sum = sum.checked_add(val).ok_or(AggregatorError::OverflowError)?;
            }
        }

        let mut result = Bytes::new(env);
        result.extend_from_array(&sum.to_le_bytes());
        Ok(result)
    }

    /// Compute the average of the (plaintext little-endian i128) values.
    fn perform_average(env: &Env, values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        let sum_result = Self::perform_sum(env, values)?;
        let count = values.len() as i128;

        if count == 0 {
            return Err(AggregatorError::InvalidOperation);
        }

        // Extract sum from result
        let mut sum_bytes = [0u8; 16];
        for (i, byte) in sum_bytes.iter_mut().enumerate() {
            *byte = sum_result.get(i as u32).unwrap_or(0);
        }
        let sum = i128::from_le_bytes(sum_bytes);

        let average = sum / count;

        let mut result = Bytes::new(env);
        result.extend_from_array(&average.to_le_bytes());
        Ok(result)
    }

    /// Compute the count of contributed values.
    fn perform_count(env: &Env, values: &Vec<Bytes>) -> Result<Bytes, AggregatorError> {
        let count = values.len() as i128;
        let mut result = Bytes::new(env);
        result.extend_from_array(&count.to_le_bytes());
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

    fn calculate_noise(_env: &Env, participants_count: u32) -> i128 {
        // Simplified noise calculation based on participant count
        let base_noise = 1000i128;
        let scaling_factor = 1000i128 / (participants_count as i128);
        base_noise.checked_mul(scaling_factor).unwrap_or(base_noise)
    }

    /// Storage key for an aggregation result: `result_ || request_id`.
    fn result_key(env: &Env, request_id: &BytesN<32>) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"result_");
        key.append(&Bytes::from(request_id));
        key
    }

    /// Storage key for a data point access grant list: `access_ || data_id`.
    fn access_key(env: &Env, data_id: &BytesN<32>) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"access_");
        key.append(&Bytes::from(data_id));
        key
    }

    /// Storage key for a user's compute credit balance: `credits_ || user`.
    fn credits_key(env: &Env, user: &Address) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"credits_");
        key.append(&user.clone().to_xdr(env));
        key
    }
}
