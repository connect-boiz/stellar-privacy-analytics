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
            batch_id: None,
        };

        // Store request
        env.storage().persistent().set(&request_id, &request);

        // Deduct compute credits
        Self::update_user_credits(&env, &requester, -required_credits);

        Ok(request_id)
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

        // Collect encrypted data points
        let mut encrypted_values = Vec::new(&env);
        let mut total_epsilon_spent = 0i128;
        let mut participants_count = 0u32;

        for data_id in request.data_points.iter() {
            if let Some(data_point) = Self::get_data_point(&env, &data_id) {
                encrypted_values.push_back(data_point.encrypted_value.clone());
                total_epsilon_spent += data_point.epsilon_spent;
                participants_count += 1;
            }
        }

        // Perform aggregation based on operation
        let encrypted_result = match request.operation {
            AggregationOperation::Sum => Self::perform_sum(&env, &encrypted_values)?,
            AggregationOperation::Average => Self::perform_average(&env, &encrypted_values)?,
            AggregationOperation::Count => Self::perform_count(&env, &encrypted_values)?,
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
            signature: soroban_sdk::Bytes::new(&env), // Would be signed by oracle
        };

        // Store privacy certificate
        env.storage()
            .persistent()
            .set(&certificate_id, &privacy_certificate);

        // Create result
        let result_hash: BytesN<32> = env.crypto().sha256(&encrypted_result).into();
        let result = AggregationResult {
            request_id: request_id.clone(),
            encrypted_result: encrypted_result.clone(),
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
            completed_requests: Vec::new(&env),
            failed_requests: Vec::new(&env),
        };

        // Store initial batch
        env.storage().persistent().set(&batch_id, &batch);

        // Process each request, tracking successes and failures
        let mut completed_requests = Vec::new(&env);
        let mut failed_requests = Vec::new(&env);

        for request_id in request_ids.iter() {
            match Self::process_aggregation(env.clone(), request_id.clone(), processor.clone()) {
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
            status: batch_status,
            created_at: batch.created_at,
            completed_at: Some(env.ledger().timestamp()),
            completed_requests,
            failed_requests,
        };
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

    fn update_user_credits(env: &Env, user: &Address, delta: i128) {
        let current_credits = Self::get_user_credits(env, user);
        let new_credits = current_credits + delta;
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, "credits_"), user.clone()), &new_credits);
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

    fn calculate_noise(_env: &Env, participants_count: u32) -> i128 {
        // Simplified noise calculation based on participant count
        let base_noise = 1000i128;
        let scaling_factor = 1000i128 / (participants_count as i128);
        base_noise.checked_mul(scaling_factor).unwrap_or(base_noise)
    }
}
