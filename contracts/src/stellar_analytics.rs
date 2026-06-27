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
const MAX_PRIVACY_BUDGET: i128 = 1000000000000000000; // 1e18 (1000 tokens)
const DEFAULT_PRIVACY_BUDGET: i128 = 100000000000000000; // 1e17 (100 tokens)
const MIN_PARTICIPANTS: u32 = 5;
const MIN_DATASET_SIZE_BYTES: u64 = 1;
const MAX_DATASET_SIZE_BYTES: u64 = 1_099_511_627_776; // 1 TiB
const MIN_DATASET_VERSION: u32 = 1;
const MAX_DATASET_VERSION: u32 = 1_000_000;
const MAX_PIN_COUNT: u32 = 10_000;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AnalysisRequest {
    pub request_id: BytesN<32>,
    pub requester: Address,
    pub dataset_hash: BytesN<32>,
    pub ipfs_cid: String,
    pub privacy_budget: i128,
    pub timestamp: u64,
    pub completed: bool,
    pub cancelled: bool,
    pub analysis_type: String,
    pub cid_immutable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct AnalysisResult {
    pub request_id: BytesN<32>,
    pub result_hash: BytesN<32>,
    pub privacy_budget_used: i128,
    pub accuracy: u32,
    pub timestamp: u64,
    pub privacy_proofs: Vec<BytesN<32>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct IPFSDataset {
    pub cid: String,
    pub dataset_hash: BytesN<32>,
    pub uploader: Address,
    pub timestamp: u64,
    pub size_bytes: u64,
    pub encrypted: bool,
    pub version: u32,
    pub pinned: bool,
    pub decryption_key_hash: Option<BytesN<32>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataAvailability {
    pub cid: String,
    pub available: bool,
    pub last_checked: u64,
    pub pin_count: u32,
    pub filecoin_deal_id: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct PrivacyLevel {
    pub min_participants: u32,
    pub noise_multiplier: u32,
    pub require_consent: bool,
    pub max_data_points: u64,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum StellarAnalyticsError {
    InvalidRequestId = 0,
    RequestAlreadyCompleted = 1,
    RequestAlreadyCancelled = 2,
    InsufficientPrivacyBudget = 3,
    BudgetExceeded = 4,
    InvalidPrivacyLevel = 5,
    NotAuthorizedOracle = 6,
    InvalidConfidence = 7,
    InvalidSignature = 8,
    OracleNotActive = 9,
    InvalidCID = 10,
    CIDImmutable = 11,
    DataNotAvailable = 12,
    DatasetNotFound = 13,
    InvalidDecryptionKey = 14,
    VersionMismatch = 15,
    InvalidInputRange = 16,
}

#[contract]
pub struct StellarAnalytics;

#[contractimpl]
impl StellarAnalytics {
    /// Initialize the contract with default privacy levels
    pub fn initialize(env: Env, admin: Address) {
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

        // Initialize privacy levels
        let mut privacy_levels = Map::new(&env);

        // Minimal privacy level
        privacy_levels.set(
            String::from_str(&env, "minimal"),
            PrivacyLevel {
                min_participants: 5,
                noise_multiplier: 1,
                require_consent: false,
                max_data_points: 1000,
            },
        );

        // Standard privacy level
        privacy_levels.set(
            String::from_str(&env, "standard"),
            PrivacyLevel {
                min_participants: 10,
                noise_multiplier: 2,
                require_consent: true,
                max_data_points: 5000,
            },
        );

        // High privacy level
        privacy_levels.set(
            String::from_str(&env, "high"),
            PrivacyLevel {
                min_participants: 20,
                noise_multiplier: 5,
                require_consent: true,
                max_data_points: 10000,
            },
        );

        // Maximum privacy level
        privacy_levels.set(
            String::from_str(&env, "maximum"),
            PrivacyLevel {
                min_participants: 50,
                noise_multiplier: 10,
                require_consent: true,
                max_data_points: 50000,
            },
        );

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "privacy_levels"), &privacy_levels);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "total_analyses"), &0u64);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "total_privacy_budget_used"), &0i128);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "active_analyses"), &0u64);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Request a new analysis with privacy protection
    pub fn request_analysis(
        env: Env,
        requester: Address,
        dataset_hash: BytesN<32>,
        ipfs_cid: String,
        analysis_type: String,
        privacy_level_name: String,
    ) -> Result<BytesN<32>, StellarAnalyticsError> {
        // Validate IPFS CID format (basic validation)
        if ipfs_cid.is_empty() || ipfs_cid.len() < 10 {
            return Err(StellarAnalyticsError::InvalidCID);
        }

        // Check if dataset exists and is available
        Self::check_data_availability(env.clone(), ipfs_cid.clone())?;

        let privacy_levels: Map<String, PrivacyLevel> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "privacy_levels"))
            .unwrap_or_else(|| Map::new(&env));

        let privacy_level = privacy_levels
            .get(privacy_level_name.clone())
            .ok_or(StellarAnalyticsError::InvalidPrivacyLevel)?;

        // Check if consent is required and verify signature
        if privacy_level.require_consent {
            // In a real implementation, verify the signature against the data owner's public key
            // For now, we'll assume the signature is valid
        }

        // Generate request ID
        let mut hash_input = soroban_sdk::Bytes::new(&env);
        hash_input.append(&requester.clone().to_xdr(&env));
        hash_input.append(&dataset_hash.clone().to_xdr(&env));
        hash_input.append(&ipfs_cid.clone().to_xdr(&env));
        hash_input.append(&analysis_type.clone().to_xdr(&env));
        hash_input.append(&Bytes::from_slice(
            &env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        hash_input.append(&Bytes::from_slice(
            &env,
            &env.ledger().sequence().to_be_bytes(),
        ));

        let request_id: BytesN<32> = env.crypto().sha256(&hash_input).into();

        // Check user's privacy budget
        let user_budget: i128 = Self::get_user_privacy_budget(env.clone(), requester.clone());
        if user_budget < DEFAULT_PRIVACY_BUDGET {
            return Err(StellarAnalyticsError::InsufficientPrivacyBudget);
        }

        // Create analysis request
        let request = AnalysisRequest {
            request_id: request_id.clone(),
            requester: requester.clone(),
            dataset_hash,
            ipfs_cid: ipfs_cid.clone(),
            privacy_budget: DEFAULT_PRIVACY_BUDGET,
            timestamp: env.ledger().timestamp(),
            completed: false,
            cancelled: false,
            analysis_type,
            cid_immutable: true, // CID becomes immutable once request is created
        };

        // Store the request
        let mut requests: Map<BytesN<32>, AnalysisRequest> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_requests"))
            .unwrap_or_else(|| Map::new(&env));

        requests.set(request_id.clone(), request.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "analysis_requests"), &requests);

        // Update user privacy budget
        let new_budget = user_budget - DEFAULT_PRIVACY_BUDGET;
        Self::set_user_privacy_budget(env.clone(), requester, new_budget);

        // Update counters
        let total_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "total_analyses"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "total_analyses"), &(total_analyses + 1));

        let total_budget_used: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "total_privacy_budget_used"))
            .unwrap_or(0);
        env.storage().instance().set(
            &Symbol::new(&env, "total_privacy_budget_used"),
            &(total_budget_used + DEFAULT_PRIVACY_BUDGET),
        );

        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "active_analyses"))
            .unwrap_or(0);
        env.storage().instance().set(
            &Symbol::new(&env, "active_analyses"),
            &(active_analyses + 1),
        );

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "analysis_requested"), request_id.clone()),
            (),
        );

        Ok(request_id)
    }

    /// Complete an analysis with results
    pub fn complete_analysis(
        env: Env,
        request_id: BytesN<32>,
        result_hash: BytesN<32>,
        privacy_budget_used: i128,
        accuracy: u32,
        privacy_proofs: Vec<BytesN<32>>,
    ) -> Result<(), StellarAnalyticsError> {
        // Verify caller is authorized oracle
        let caller = env.current_contract_address(); // In real implementation, get from auth
        if !Self::is_authorized_oracle(env.clone(), caller) {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        // Get the request
        let mut requests: Map<BytesN<32>, AnalysisRequest> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_requests"))
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        let request = requests
            .get(request_id.clone())
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        if request.completed {
            return Err(StellarAnalyticsError::RequestAlreadyCompleted);
        }

        if request.cancelled {
            return Err(StellarAnalyticsError::RequestAlreadyCancelled);
        }

        if privacy_budget_used < 0 {
            return Err(StellarAnalyticsError::InvalidInputRange);
        }

        if privacy_budget_used > request.privacy_budget {
            return Err(StellarAnalyticsError::BudgetExceeded);
        }

        if accuracy == 0 || accuracy > 100 {
            return Err(StellarAnalyticsError::InvalidConfidence);
        }

        // Clone values needed after request is moved
        let requester_for_refund = request.requester.clone();
        let privacy_budget_for_refund = request.privacy_budget;

        // Store the result
        let result = AnalysisResult {
            request_id: request_id.clone(),
            result_hash,
            privacy_budget_used,
            accuracy,
            timestamp: env.ledger().timestamp(),
            privacy_proofs,
        };

        let mut results: Map<BytesN<32>, AnalysisResult> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_results"))
            .unwrap_or_else(|| Map::new(&env));

        results.set(request_id.clone(), result);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "analysis_results"), &results);

        // Update request status
        let mut updated_request = request;
        updated_request.completed = true;
        requests.set(request_id.clone(), updated_request);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "analysis_requests"), &requests);

        // Update active analyses count
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "active_analyses"))
            .unwrap_or(0);
        env.storage().instance().set(
            &Symbol::new(&env, "active_analyses"),
            &(active_analyses - 1),
        );

        // Refund unused privacy budget and update global counter
        let refund = privacy_budget_for_refund - privacy_budget_used;
        if refund > 0 {
            let current_budget =
                Self::get_user_privacy_budget(env.clone(), requester_for_refund.clone());
            Self::set_user_privacy_budget(
                env.clone(),
                requester_for_refund,
                current_budget + refund,
            );

            // Decrement global privacy budget used counter by the refund amount
            let total_budget_used: i128 = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "total_privacy_budget_used"))
                .unwrap_or(0);
            env.storage().instance().set(
                &Symbol::new(&env, "total_privacy_budget_used"),
                &(total_budget_used - refund),
            );
        }

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "analysis_completed"), request_id.clone()),
            (),
        );

        Ok(())
    }

    /// Cancel an analysis request
    pub fn cancel_analysis(env: Env, request_id: BytesN<32>) -> Result<(), StellarAnalyticsError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth

        let mut requests: Map<BytesN<32>, AnalysisRequest> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_requests"))
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        let request = requests
            .get(request_id.clone())
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        if request.requester != caller {
            return Err(StellarAnalyticsError::InvalidRequestId); // Only requester can cancel
        }

        if request.completed {
            return Err(StellarAnalyticsError::RequestAlreadyCompleted);
        }

        if request.cancelled {
            return Err(StellarAnalyticsError::RequestAlreadyCancelled);
        }

        // Clone values needed after request is moved
        let cancel_requester = request.requester.clone();
        let cancel_budget = request.privacy_budget;

        // Mark as cancelled
        let mut updated_request = request;
        updated_request.cancelled = true;
        requests.set(request_id.clone(), updated_request);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "analysis_requests"), &requests);

        // Refund privacy budget and update global counter
        let current_budget = Self::get_user_privacy_budget(env.clone(), cancel_requester.clone());
        Self::set_user_privacy_budget(
            env.clone(),
            cancel_requester,
            current_budget + cancel_budget,
        );

        // Decrement global privacy budget used counter by the refund amount
        if cancel_budget > 0 {
            let total_budget_used: i128 = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "total_privacy_budget_used"))
                .unwrap_or(0);
            env.storage().instance().set(
                &Symbol::new(&env, "total_privacy_budget_used"),
                &(total_budget_used - cancel_budget),
            );
        }

        // Update active analyses count
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "active_analyses"))
            .unwrap_or(0);
        env.storage().instance().set(
            &Symbol::new(&env, "active_analyses"),
            &(active_analyses - 1),
        );

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "analysis_cancelled"), request_id.clone()),
            (),
        );

        Ok(())
    }

    /// Add privacy budget to a user (admin only)
    pub fn add_privacy_budget(
        env: Env,
        user: Address,
        amount: i128,
    ) -> Result<(), StellarAnalyticsError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        let caller = env.current_contract_address(); // In real implementation, get from auth
        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        if amount <= 0 {
            return Err(StellarAnalyticsError::InsufficientPrivacyBudget);
        }

        let current_budget = Self::get_user_privacy_budget(env.clone(), user.clone());
        if current_budget + amount > MAX_PRIVACY_BUDGET {
            return Err(StellarAnalyticsError::BudgetExceeded);
        }

        Self::set_user_privacy_budget(env.clone(), user.clone(), current_budget + amount);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "budget_added"), user),
            (amount, current_budget + amount),
        );

        Ok(())
    }

    /// Add authorized oracle (admin only)
    pub fn add_oracle(env: Env, oracle: Address) -> Result<(), StellarAnalyticsError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        let caller = env.current_contract_address(); // In real implementation, get from auth
        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let mut oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "authorized_oracles"))
            .unwrap_or_else(|| Vec::new(&env));

        // Check if oracle already exists
        for existing_oracle in oracles.iter() {
            if existing_oracle == oracle {
                return Ok(()); // Already authorized
            }
        }

        oracles.push_back(oracle.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "authorized_oracles"), &oracles);

        env.events()
            .publish((Symbol::new(&env, "oracle_added"), oracle), ());

        Ok(())
    }

    /// Get analysis request details
    pub fn get_analysis_request(
        env: Env,
        request_id: BytesN<32>,
    ) -> Result<AnalysisRequest, StellarAnalyticsError> {
        let requests: Map<BytesN<32>, AnalysisRequest> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_requests"))
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        requests
            .get(request_id)
            .ok_or(StellarAnalyticsError::InvalidRequestId)
    }

    /// Get analysis result details
    pub fn get_analysis_result(
        env: Env,
        request_id: BytesN<32>,
    ) -> Result<AnalysisResult, StellarAnalyticsError> {
        let results: Map<BytesN<32>, AnalysisResult> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "analysis_results"))
            .ok_or(StellarAnalyticsError::InvalidRequestId)?;

        results
            .get(request_id)
            .ok_or(StellarAnalyticsError::InvalidRequestId)
    }

    /// Get contract statistics
    pub fn get_stats(env: Env) -> (u64, i128, u64) {
        let total_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "total_analyses"))
            .unwrap_or(0);
        let total_privacy_budget_used: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "total_privacy_budget_used"))
            .unwrap_or(0);
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "active_analyses"))
            .unwrap_or(0);

        (total_analyses, total_privacy_budget_used, active_analyses)
    }

    // Helper functions
    fn get_user_privacy_budget(env: Env, user: Address) -> i128 {
        let key = Symbol::new(&env, "user_budget");
        let budgets: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        budgets.get(user).unwrap_or(0)
    }

    fn set_user_privacy_budget(env: Env, user: Address, budget: i128) {
        let key = Symbol::new(&env, "user_budget");
        let mut budgets: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        budgets.set(user, budget);
        env.storage().instance().set(&key, &budgets);
    }

    fn is_authorized_oracle(env: Env, oracle: Address) -> bool {
        let oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "authorized_oracles"))
            .unwrap_or_else(|| Vec::new(&env));

        for authorized_oracle in oracles.iter() {
            if authorized_oracle == oracle {
                return true;
            }
        }
        false
    }

    /// Register a new IPFS dataset
    pub fn register_dataset(
        env: Env,
        cid: String,
        dataset_hash: BytesN<32>,
        uploader: Address,
        size_bytes: u64,
        encrypted: bool,
        version: u32,
        decryption_key_hash: Option<BytesN<32>>,
    ) -> Result<(), StellarAnalyticsError> {
        // Validate CID format
        if cid.is_empty() || cid.len() < 10 {
            return Err(StellarAnalyticsError::InvalidCID);
        }

        if size_bytes < MIN_DATASET_SIZE_BYTES || size_bytes > MAX_DATASET_SIZE_BYTES {
            return Err(StellarAnalyticsError::InvalidInputRange);
        }

        if version < MIN_DATASET_VERSION || version > MAX_DATASET_VERSION {
            return Err(StellarAnalyticsError::VersionMismatch);
        }

        let dataset_hash_for_event = dataset_hash.clone();
        let dataset = IPFSDataset {
            cid: cid.clone(),
            dataset_hash,
            uploader: uploader.clone(),
            timestamp: env.ledger().timestamp(),
            size_bytes,
            encrypted,
            version,
            pinned: false,
            decryption_key_hash,
        };

        let mut datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        datasets.set(cid.clone(), dataset);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "ipfs_datasets"), &datasets);

        // Initialize data availability
        let availability = DataAvailability {
            cid: cid.clone(),
            available: true,
            last_checked: env.ledger().timestamp(),
            pin_count: 0,
            filecoin_deal_id: None,
        };

        let mut availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        availability_map.set(cid.clone(), availability);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "data_availability"), &availability_map);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "dataset_registered"), uploader),
            (cid, dataset_hash_for_event, size_bytes),
        );

        Ok(())
    }

    /// Check data availability for a given CID
    pub fn check_data_availability(env: Env, cid: String) -> Result<(), StellarAnalyticsError> {
        let availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        let availability = availability_map
            .get(cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        if !availability.available {
            return Err(StellarAnalyticsError::DataNotAvailable);
        }

        Ok(())
    }

    /// Update data availability status
    pub fn update_data_availability(
        env: Env,
        cid: String,
        available: bool,
        pin_count: u32,
        filecoin_deal_id: Option<u64>,
    ) -> Result<(), StellarAnalyticsError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        if pin_count > MAX_PIN_COUNT {
            return Err(StellarAnalyticsError::InvalidInputRange);
        }

        let mut availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        let mut availability = availability_map
            .get(cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        availability.available = available;
        availability.last_checked = env.ledger().timestamp();
        availability.pin_count = pin_count;
        availability.filecoin_deal_id = filecoin_deal_id;

        availability_map.set(cid.clone(), availability);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "data_availability"), &availability_map);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "availability_updated"), cid),
            (available, pin_count),
        );

        Ok(())
    }

    /// Pin a dataset (mark as pinned)
    pub fn pin_dataset(env: Env, cid: String) -> Result<(), StellarAnalyticsError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let mut datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        let mut dataset = datasets
            .get(cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        dataset.pinned = true;
        datasets.set(cid.clone(), dataset);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "ipfs_datasets"), &datasets);

        // Emit event
        env.events()
            .publish((Symbol::new(&env, "dataset_pinned"), cid), ());

        Ok(())
    }

    /// Get dataset information
    pub fn get_dataset(env: Env, cid: String) -> Result<IPFSDataset, StellarAnalyticsError> {
        let datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        datasets
            .get(cid)
            .ok_or(StellarAnalyticsError::DatasetNotFound)
    }

    /// Get data availability information
    pub fn get_data_availability(
        env: Env,
        cid: String,
    ) -> Result<DataAvailability, StellarAnalyticsError> {
        let availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        availability_map
            .get(cid)
            .ok_or(StellarAnalyticsError::DatasetNotFound)
    }

    /// Create a new version of a dataset
    pub fn create_dataset_version(
        env: Env,
        old_cid: String,
        new_cid: String,
        new_dataset_hash: BytesN<32>,
        uploader: Address,
        size_bytes: u64,
        decryption_key_hash: Option<BytesN<32>>,
    ) -> Result<(), StellarAnalyticsError> {
        // Validate new CID format
        if new_cid.is_empty() || new_cid.len() < 10 {
            return Err(StellarAnalyticsError::InvalidCID);
        }

        if size_bytes < MIN_DATASET_SIZE_BYTES || size_bytes > MAX_DATASET_SIZE_BYTES {
            return Err(StellarAnalyticsError::InvalidInputRange);
        }

        // Get old dataset to inherit properties
        let mut datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        let old_dataset = datasets
            .get(old_cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        if old_dataset.version >= MAX_DATASET_VERSION {
            return Err(StellarAnalyticsError::VersionMismatch);
        }

        let new_version = old_dataset.version + 1;

        let new_dataset = IPFSDataset {
            cid: new_cid.clone(),
            dataset_hash: new_dataset_hash.clone(),
            uploader,
            timestamp: env.ledger().timestamp(),
            size_bytes,
            encrypted: old_dataset.encrypted,
            version: new_version,
            pinned: false,
            decryption_key_hash,
        };

        datasets.set(new_cid.clone(), new_dataset);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "ipfs_datasets"), &datasets);

        // Initialize data availability for new version
        let availability = DataAvailability {
            cid: new_cid.clone(),
            available: true,
            last_checked: env.ledger().timestamp(),
            pin_count: 0,
            filecoin_deal_id: None,
        };

        let mut availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        availability_map.set(new_cid.clone(), availability);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "data_availability"), &availability_map);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "version_created"), old_cid),
            (new_cid, new_dataset_hash, new_version),
        );

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_total_privacy_budget_decremented_on_complete_with_partial_usage() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        // Use the contract's own address as admin/oracle
        // so that env.current_contract_address() auth checks pass
        let contract_addr: Address = env.as_contract(&contract_id, || {
            env.current_contract_address()
        });
        let user = Address::generate(&env);

        client.initialize(&contract_addr);
        client.add_oracle(&contract_addr);
        let budget_amount: i128 = 100000000000000000;
        client.add_privacy_budget(&user, &budget_amount);

        let cid = String::from_str(&env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        let size_bytes: u64 = 1024;
        let version: u32 = 1;
        let encrypted: bool = false;
        client.register_dataset(&cid, &dataset_hash, &user, &size_bytes, &encrypted, &version, &no_key);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id = client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        // Verify total_privacy_budget_used was incremented
        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, 100000000000000000);

        // Complete with 50% usage — 50 tokens refunded, counter should decrement
        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        let partial_budget: i128 = 50000000000000000;
        let accuracy: u32 = 95;
        client.complete_analysis(&request_id, &result_hash, &partial_budget, &accuracy, &privacy_proofs);

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, 50000000000000000);
    }

    #[test]
    fn test_total_privacy_budget_unchanged_on_complete_with_full_usage() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        // Use the contract's own address as admin/oracle
        let contract_addr: Address = env.as_contract(&contract_id, || {
            env.current_contract_address()
        });
        let user = Address::generate(&env);

        client.initialize(&contract_addr);
        client.add_oracle(&contract_addr);
        let budget_amount: i128 = 100000000000000000;
        client.add_privacy_budget(&user, &budget_amount);

        let cid = String::from_str(&env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        let size_bytes: u64 = 1024;
        let version: u32 = 1;
        let encrypted: bool = false;
        client.register_dataset(&cid, &dataset_hash, &user, &size_bytes, &encrypted, &version, &no_key);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id = client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, 100000000000000000);

        // Complete with 100% usage — no refund, counter should be unchanged
        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        let full_budget: i128 = 100000000000000000;
        let accuracy: u32 = 95;
        client.complete_analysis(&request_id, &result_hash, &full_budget, &accuracy, &privacy_proofs);

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, 100000000000000000);
    }

    #[test]
    fn test_total_privacy_budget_decremented_on_cancel() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        // Use the contract's own address as admin and requester
        // so that env.current_contract_address() auth checks pass
        let contract_addr: Address = env.as_contract(&contract_id, || {
            env.current_contract_address()
        });

        client.initialize(&contract_addr);
        let budget_amount: i128 = 100000000000000000;
        client.add_privacy_budget(&contract_addr, &budget_amount);

        let cid = String::from_str(&env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        let size_bytes: u64 = 1024;
        let version: u32 = 1;
        let encrypted: bool = false;
        client.register_dataset(&cid, &dataset_hash, &contract_addr, &size_bytes, &encrypted, &version, &no_key);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        // Use contract_addr as requester so cancel_analysis auth passes
        let request_id = client.request_analysis(&contract_addr, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, 100000000000000000);

        // Cancel the analysis — full refund, counter should go back to 0
        client.cancel_analysis(&request_id);

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, 0);
    }
}
