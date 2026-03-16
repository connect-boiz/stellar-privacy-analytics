use soroban_sdk::contracttype;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::Address;
use soroban_sdk::Env;
use soroban_sdk::Vec;
use soroban_sdk::String;
use soroban_sdk::symbol_short;
use soroban_sdk::symbol;
use soroban_sdk::Map;
use soroban_sdk::BytesN;
use soroban_sdk::crypto::sha256;
use soroban_sdk::xdr::ScVal;

// Contract state storage keys
const DATA_REQUESTS_KEY: &str = "DATA_REQUESTS";
const DATA_RESPONSES_KEY: &str = "DATA_RESPONSES";
const ORACLE_NODES_KEY: &str = "ORACLE_NODES";
const DATA_SOURCE_FEES_KEY: &str = "DATA_SOURCE_FEES";
const USER_DEPOSITS_KEY: &str = "USER_DEPOSITS";
const PENDING_REQUESTS_KEY: &str = "PENDING_REQUESTS";
const ACTIVE_ORACLE_NODES_KEY: &str = "ACTIVE_ORACLE_NODES";

// Constants
const MIN_FEE: i128 = 10000000; // 0.01 XLM (10^7 stroops)
const MAX_FEE: i128 = 1000000000; // 1 XLM (10^9 stroops)
const MIN_REPUTATION: u32 = 50;
const RESPONSE_TIMEOUT: u64 = 3600; // 1 hour in seconds

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataRequest {
    pub request_id: BytesN<32>,
    pub requester: Address,
    pub data_source: String,
    pub data_hash: BytesN<32>,
    pub privacy_level: u32,
    pub timestamp: u64,
    pub fulfilled: bool,
    pub cancelled: bool,
    pub fee: i128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataResponse {
    pub request_id: BytesN<32>,
    pub result_hash: BytesN<32>,
    pub timestamp: u64,
    pub privacy_proofs: Vec<BytesN<32>>,
    pub confidence: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct OracleNode {
    pub node_address: Address,
    pub endpoint: String,
    pub active: bool,
    pub reputation: u32,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub last_response_time: u64,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum PrivacyOracleError {
    InvalidRequestId = 0,
    RequestAlreadyFulfilled = 1,
    RequestAlreadyCancelled = 2,
    InsufficientDeposit = 3,
    InvalidFee = 4,
    InvalidPrivacyLevel = 5,
    NotActiveOracle = 6,
    InvalidConfidence = 7,
    OracleNotFound = 8,
    OracleAlreadyExists = 9,
    Unauthorized = 10,
}

pub struct PrivacyOracle;

#[contractimpl]
impl PrivacyOracle {
    /// Initialize the contract with default data source fees
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol!("initialized")) {
            return; // Already initialized
        }

        // Set admin
        env.storage().instance().set(&symbol!("admin"), &admin);

        // Initialize default data source fees
        let mut fees = Map::new(&env);
        fees.set(symbol_short!("market_data"), &50000000i128); // 0.05 XLM
        fees.set(symbol_short!("weather_data"), &20000000i128); // 0.02 XLM
        fees.set(symbol_short!("social_metrics"), &30000000i128); // 0.03 XLM
        fees.set(symbol_short!("financial_data"), &100000000i128); // 0.1 XLM

        env.storage().instance().set(&symbol!("data_source_fees"), &fees);
        env.storage().instance().set(&symbol!("total_requests"), &0u64);
        env.storage().instance().set(&symbol!("total_fees_collected"), &0i128);
        env.storage().instance().set(&symbol!("initialized"), &true);
    }

    /// Request data from external source with privacy protection
    pub fn request_data(
        env: Env,
        data_source: String,
        data_hash: BytesN<32>,
        privacy_level: u32,
    ) -> Result<BytesN<32>, PrivacyOracleError> {
        let requester = env.current_contract_address(); // In real implementation, get from auth

        // Validate privacy level (1-4)
        if privacy_level < 1 || privacy_level > 4 {
            return Err(PrivacyOracleError::InvalidPrivacyLevel);
        }

        // Get fee for data source
        let fees: Map<String, i128> = env
            .storage()
            .instance()
            .get(&symbol!("data_source_fees"))
            .unwrap_or_else(|| Map::new(&env));

        let fee = fees
            .get(data_source.clone())
            .ok_or(PrivacyOracleError::InvalidFee)?;

        if fee < MIN_FEE || fee > MAX_FEE {
            return Err(PrivacyOracleError::InvalidFee);
        }

        // Check user's deposit
        let user_deposit = Self::get_user_deposit(env.clone(), requester.clone());
        if user_deposit < fee {
            return Err(PrivacyOracleError::InsufficientDeposit);
        }

        // Generate request ID
        let mut input_data = Vec::new(&env);
        input_data.push_back(requester.clone().into());
        input_data.push_back(data_source.clone().into());
        input_data.push_back(data_hash.clone().into());
        input_data.push_back(privacy_level.into());
        input_data.push_back(env.ledger().timestamp().into());
        input_data.push_back(env.ledger().sequence().into());

        let request_id = sha256(&input_data.to_xdr(env));

        // Create data request
        let request = DataRequest {
            request_id: request_id.clone(),
            requester: requester.clone(),
            data_source: data_source.clone(),
            data_hash,
            privacy_level,
            timestamp: env.ledger().timestamp(),
            fulfilled: false,
            cancelled: false,
            fee,
        };

        // Store the request
        let mut requests: Map<BytesN<32>, DataRequest> = env
            .storage()
            .instance()
            .get(&symbol!("data_requests"))
            .unwrap_or_else(|| Map::new(&env));

        requests.set(request_id.clone(), request.clone());
        env.storage().instance().set(&symbol!("data_requests"), &requests);

        // Add to pending requests
        let mut pending_requests: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&symbol!("pending_requests"))
            .unwrap_or_else(|| Vec::new(&env));

        pending_requests.push_back(request_id.clone());
        env.storage()
            .instance()
            .set(&symbol!("pending_requests"), &pending_requests);

        // Deduct fee from deposit
        let new_deposit = user_deposit - fee;
        Self::set_user_deposit(env.clone(), requester, new_deposit);

        // Update counters
        let total_requests: u64 = env
            .storage()
            .instance()
            .get(&symbol!("total_requests"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("total_requests"), &(total_requests + 1));

        let total_fees_collected: i128 = env
            .storage()
            .instance()
            .get(&symbol!("total_fees_collected"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("total_fees_collected"), &(total_fees_collected + fee));

        // Emit event
        env.events()
            .publish(
                (
                    symbol!("data_requested"),
                    request_id.clone(),
                    data_source.clone(),
                ),
                (),
            );

        Ok(request_id)
    }

    /// Fulfill a data request with privacy-protected results
    pub fn fulfill_request(
        env: Env,
        request_id: BytesN<32>,
        result_hash: BytesN<32>,
        privacy_proofs: Vec<BytesN<32>>,
        confidence: u32,
    ) -> Result<(), PrivacyOracleError> {
        let oracle = env.current_contract_address(); // In real implementation, get from auth

        // Verify oracle is active
        if !Self::is_active_oracle(env.clone(), oracle) {
            return Err(PrivacyOracleError::NotActiveOracle);
        }

        // Get the request
        let mut requests: Map<BytesN<32>, DataRequest> = env
            .storage()
            .instance()
            .get(&symbol!("data_requests"))
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        let request = requests
            .get(request_id.clone())
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        if request.fulfilled {
            return Err(PrivacyOracleError::RequestAlreadyFulfilled);
        }

        if request.cancelled {
            return Err(PrivacyOracleError::RequestAlreadyCancelled);
        }

        if confidence > 100 {
            return Err(PrivacyOracleError::InvalidConfidence);
        }

        // Store the response
        let response = DataResponse {
            request_id: request_id.clone(),
            result_hash,
            timestamp: env.ledger().timestamp(),
            privacy_proofs,
            confidence,
        };

        let mut responses: Map<BytesN<32>, DataResponse> = env
            .storage()
            .instance()
            .get(&symbol!("data_responses"))
            .unwrap_or_else(|| Map::new(&env));

        responses.set(request_id.clone(), response);
        env.storage().instance().set(&symbol!("data_responses"), &responses);

        // Update request status
        let mut updated_request = request;
        updated_request.fulfilled = true;
        requests.set(request_id.clone(), updated_request);
        env.storage().instance().set(&symbol!("data_requests"), &requests);

        // Update oracle statistics
        Self::update_oracle_stats(env.clone(), oracle, confidence);

        // Remove from pending requests
        Self::remove_from_pending(env.clone(), request_id.clone());

        // Emit event
        env.events()
            .publish(
                (
                    symbol!("data_fulfilled"),
                    request_id.clone(),
                    oracle.clone(),
                ),
                (),
            );

        Ok(())
    }

    /// Cancel a data request
    pub fn cancel_request(env: Env, request_id: BytesN<32>) -> Result<(), PrivacyOracleError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth

        let mut requests: Map<BytesN<32>, DataRequest> = env
            .storage()
            .instance()
            .get(&symbol!("data_requests"))
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        let request = requests
            .get(request_id.clone())
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        if request.requester != caller {
            return Err(PrivacyOracleError::Unauthorized);
        }

        if request.fulfilled {
            return Err(PrivacyOracleError::RequestAlreadyFulfilled);
        }

        if request.cancelled {
            return Err(PrivacyOracleError::RequestAlreadyCancelled);
        }

        // Mark as cancelled
        let mut updated_request = request;
        updated_request.cancelled = true;
        requests.set(request_id.clone(), updated_request);
        env.storage().instance().set(&symbol!("data_requests"), &requests);

        // Refund 50% of the fee
        let refund = request.fee / 2;
        let current_deposit = Self::get_user_deposit(env.clone(), request.requester);
        Self::set_user_deposit(env.clone(), request.requester, current_deposit + refund);

        // Remove from pending requests
        Self::remove_from_pending(env.clone(), request_id.clone());

        // Emit event
        env.events()
            .publish((symbol!("request_cancelled"), request_id.clone()), ());

        Ok(())
    }

    /// Add a new oracle node (admin only)
    pub fn add_oracle_node(
        env: Env,
        node: Address,
        endpoint: String,
    ) -> Result<(), PrivacyOracleError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol!("admin"))
            .ok_or(PrivacyOracleError::Unauthorized)?;

        let caller = env.current_contract_address(); // In real implementation, get from auth
        if caller != admin {
            return Err(PrivacyOracleError::Unauthorized);
        }

        let mut nodes: Map<Address, OracleNode> = env
            .storage()
            .instance()
            .get(&symbol!("oracle_nodes"))
            .unwrap_or_else(|| Map::new(&env));

        if nodes.contains_key(node.clone()) {
            return Err(PrivacyOracleError::OracleAlreadyExists);
        }

        let oracle_node = OracleNode {
            node_address: node.clone(),
            endpoint,
            active: true,
            reputation: 100, // Start with perfect reputation
            total_requests: 0,
            successful_requests: 0,
            last_response_time: 0,
        };

        nodes.set(node.clone(), oracle_node);
        env.storage().instance().set(&symbol!("oracle_nodes"), &nodes);

        // Add to active nodes list
        let mut active_nodes: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol!("active_oracle_nodes"))
            .unwrap_or_else(|| Vec::new(&env));

        active_nodes.push_back(node.clone());
        env.storage()
            .instance()
            .set(&symbol!("active_oracle_nodes"), &active_nodes);

        // Emit event
        env.events()
            .publish((symbol!("oracle_added"), node.clone()), ());

        Ok(())
    }

    /// Remove an oracle node (admin only)
    pub fn remove_oracle_node(env: Env, node: Address) -> Result<(), PrivacyOracleError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol!("admin"))
            .ok_or(PrivacyOracleError::Unauthorized)?;

        let caller = env.current_contract_address(); // In real implementation, get from auth
        if caller != admin {
            return Err(PrivacyOracleError::Unauthorized);
        }

        let mut nodes: Map<Address, OracleNode> = env
            .storage()
            .instance()
            .get(&symbol!("oracle_nodes"))
            .ok_or(PrivacyOracleError::OracleNotFound)?;

        let mut oracle_node = nodes
            .get(node.clone())
            .ok_or(PrivacyOracleError::OracleNotFound)?;

        oracle_node.active = false;
        nodes.set(node.clone(), oracle_node);
        env.storage().instance().set(&symbol!("oracle_nodes"), &nodes);

        // Remove from active nodes list
        Self::remove_from_active_nodes(env.clone(), node.clone());

        // Emit event
        env.events()
            .publish((symbol!("oracle_removed"), node.clone()), ());

        Ok(())
    }

    /// Add deposit to user account
    pub fn add_deposit(env: Env, amount: i128) -> Result<(), PrivacyOracleError> {
        let user = env.current_contract_address(); // In real implementation, get from auth

        if amount <= 0 {
            return Err(PrivacyOracleError::InvalidFee);
        }

        let current_deposit = Self::get_user_deposit(env.clone(), user.clone());
        Self::set_user_deposit(env, user, current_deposit + amount);

        // Emit event
        env.events()
            .publish((symbol!("deposit_added"), user.clone()), ());

        Ok(())
    }

    /// Withdraw deposit
    pub fn withdraw(env: Env, amount: i128) -> Result<(), PrivacyOracleError> {
        let user = env.current_contract_address(); // In real implementation, get from auth

        if amount <= 0 {
            return Err(PrivacyOracleError::InvalidFee);
        }

        let current_deposit = Self::get_user_deposit(env.clone(), user.clone());
        if current_deposit < amount {
            return Err(PrivacyOracleError::InsufficientDeposit);
        }

        Self::set_user_deposit(env, user.clone(), current_deposit - amount);

        // Emit event
        env.events()
            .publish((symbol!("withdrawn"), user.clone()), ());

        Ok(())
    }

    /// Get data request details
    pub fn get_data_request(
        env: Env,
        request_id: BytesN<32>,
    ) -> Result<DataRequest, PrivacyOracleError> {
        let requests: Map<BytesN<32>, DataRequest> = env
            .storage()
            .instance()
            .get(&symbol!("data_requests"))
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        requests
            .get(request_id)
            .ok_or(PrivacyOracleError::InvalidRequestId)
    }

    /// Get data response details
    pub fn get_data_response(
        env: Env,
        request_id: BytesN<32>,
    ) -> Result<DataResponse, PrivacyOracleError> {
        let responses: Map<BytesN<32>, DataResponse> = env
            .storage()
            .instance()
            .get(&symbol!("data_responses"))
            .ok_or(PrivacyOracleError::InvalidRequestId)?;

        responses
            .get(request_id)
            .ok_or(PrivacyOracleError::InvalidRequestId)
    }

    /// Get oracle node details
    pub fn get_oracle_node(env: Env, node: Address) -> Result<OracleNode, PrivacyOracleError> {
        let nodes: Map<Address, OracleNode> = env
            .storage()
            .instance()
            .get(&symbol!("oracle_nodes"))
            .ok_or(PrivacyOracleError::OracleNotFound)?;

        nodes
            .get(node)
            .ok_or(PrivacyOracleError::OracleNotFound)
    }

    /// Get contract statistics
    pub fn get_stats(env: Env) -> (u64, i128, u32) {
        let total_requests: u64 = env
            .storage()
            .instance()
            .get(&symbol!("total_requests"))
            .unwrap_or(0);
        let total_fees_collected: i128 = env
            .storage()
            .instance()
            .get(&symbol!("total_fees_collected"))
            .unwrap_or(0);
        
        let active_nodes: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol!("active_oracle_nodes"))
            .unwrap_or_else(|| Vec::new(&env));

        (total_requests, total_fees_collected, active_nodes.len() as u32)
    }

    // Helper functions
    fn get_user_deposit(env: Env, user: Address) -> i128 {
        let deposits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&symbol!("user_deposits"))
            .unwrap_or_else(|| Map::new(&env));

        deposits.get(user).unwrap_or(0)
    }

    fn set_user_deposit(env: Env, user: Address, deposit: i128) {
        let mut deposits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&symbol!("user_deposits"))
            .unwrap_or_else(|| Map::new(&env));

        deposits.set(user, deposit);
        env.storage().instance().set(&symbol!("user_deposits"), &deposits);
    }

    fn is_active_oracle(env: Env, oracle: Address) -> bool {
        let nodes: Map<Address, OracleNode> = env
            .storage()
            .instance()
            .get(&symbol!("oracle_nodes"))
            .unwrap_or_else(|| Map::new(&env));

        if let Some(node) = nodes.get(oracle) {
            return node.active;
        }
        false
    }

    fn update_oracle_stats(env: Env, oracle: Address, confidence: u32) {
        let mut nodes: Map<Address, OracleNode> = env
            .storage()
            .instance()
            .get(&symbol!("oracle_nodes"))
            .unwrap_or_else(|| Map::new(&env));

        if let Some(mut node) = nodes.get(oracle) {
            node.total_requests += 1;
            node.successful_requests += 1;
            node.last_response_time = env.ledger().timestamp();

            // Update reputation based on confidence
            let reputation_change = (confidence as i32 - 50) / 10; // Scale confidence to reputation change
            let new_reputation = (node.reputation as i32 + reputation_change).max(0).min(100);
            node.reputation = new_reputation as u32;

            nodes.set(oracle, node);
            env.storage().instance().set(&symbol!("oracle_nodes"), &nodes);
        }
    }

    fn remove_from_pending(env: Env, request_id: BytesN<32>) {
        let mut pending_requests: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&symbol!("pending_requests"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        let mut new_pending = Vec::new(&env);

        for req_id in pending_requests.iter() {
            if req_id == request_id && !found {
                found = true;
            } else {
                new_pending.push_back(req_id);
            }
        }

        env.storage()
            .instance()
            .set(&symbol!("pending_requests"), &new_pending);
    }

    fn remove_from_active_nodes(env: Env, node: Address) {
        let mut active_nodes: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol!("active_oracle_nodes"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        let mut new_active = Vec::new(&env);

        for active_node in active_nodes.iter() {
            if active_node == node && !found {
                found = true;
            } else {
                new_active.push_back(active_node);
            }
        }

        env.storage()
            .instance()
            .set(&symbol!("active_oracle_nodes"), &new_active);
    }
}
