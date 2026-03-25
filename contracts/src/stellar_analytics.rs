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
const ANALYSIS_REQUESTS_KEY: &str = "ANALYSIS_REQUESTS";
const ANALYSIS_RESULTS_KEY: &str = "ANALYSIS_RESULTS";
const USER_PRIVACY_BUDGET_KEY: &str = "USER_PRIVACY_BUDGET";
const PRIVACY_LEVELS_KEY: &str = "PRIVACY_LEVELS";
const AUTHORIZED_ORACLES_KEY: &str = "AUTHORIZED_ORACLES";
const TOTAL_ANALYSES_KEY: &str = "TOTAL_ANALYSES";
const TOTAL_PRIVACY_BUDGET_USED_KEY: &str = "TOTAL_PRIVACY_BUDGET_USED";
const ACTIVE_ANALYSES_KEY: &str = "ACTIVE_ANALYSES";
const IPFS_DATASETS_KEY: &str = "IPFS_DATASETS";
const DATA_AVAILABILITY_KEY: &str = "DATA_AVAILABILITY";

// Constants
const MAX_PRIVACY_BUDGET: i128 = 1000000000000000000; // 1e18 (1000 tokens)
const DEFAULT_PRIVACY_BUDGET: i128 = 100000000000000000; // 1e17 (100 tokens)
const MIN_PARTICIPANTS: u32 = 5;

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

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum PrivacyLevelName {
    Minimal,
    Standard,
    High,
    Maximum,
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
}

pub struct StellarAnalytics;

#[contractimpl]
impl StellarAnalytics {
    /// Initialize the contract with default privacy levels
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol!("initialized")) {
            return; // Already initialized
        }

        // Set admin
        env.storage().instance().set(&symbol!("admin"), &admin);

        // Initialize privacy levels
        let mut privacy_levels = Map::new(&env);

        // Minimal privacy level
        privacy_levels.set(
            symbol_short!("minimal"),
            &PrivacyLevel {
                min_participants: 5,
                noise_multiplier: 1,
                require_consent: false,
                max_data_points: 1000,
            },
        );

        // Standard privacy level
        privacy_levels.set(
            symbol_short!("standard"),
            &PrivacyLevel {
                min_participants: 10,
                noise_multiplier: 2,
                require_consent: true,
                max_data_points: 5000,
            },
        );

        // High privacy level
        privacy_levels.set(
            symbol_short!("high"),
            &PrivacyLevel {
                min_participants: 20,
                noise_multiplier: 5,
                require_consent: true,
                max_data_points: 10000,
            },
        );

        // Maximum privacy level
        privacy_levels.set(
            symbol_short!("maximum"),
            &PrivacyLevel {
                min_participants: 50,
                noise_multiplier: 10,
                require_consent: true,
                max_data_points: 50000,
            },
        );

        env.storage().instance().set(&symbol!("privacy_levels"), &privacy_levels);
        env.storage().instance().set(&symbol!("total_analyses"), &0u64);
        env.storage().instance().set(&symbol!("total_privacy_budget_used"), &0i128);
        env.storage().instance().set(&symbol!("active_analyses"), &0u64);
        env.storage().instance().set(&symbol!("initialized"), &true);
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
            .get(&symbol!("privacy_levels"))
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
        let mut input_data = Vec::new(&env);
        input_data.push_back(requester.clone().into());
        input_data.push_back(dataset_hash.clone().into());
        input_data.push_back(ipfs_cid.clone().into());
        input_data.push_back(analysis_type.clone().into());
        input_data.push_back(env.ledger().timestamp().into());
        input_data.push_back(env.ledger().sequence().into());

        let request_id = sha256(&input_data.to_xdr(env));

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
            .get(&symbol!("analysis_requests"))
            .unwrap_or_else(|| Map::new(&env));

        requests.set(request_id.clone(), request.clone());
        env.storage().instance().set(&symbol!("analysis_requests"), &requests);

        // Update user privacy budget
        let new_budget = user_budget - DEFAULT_PRIVACY_BUDGET;
        Self::set_user_privacy_budget(env.clone(), requester, new_budget);

        // Update counters
        let total_analyses: u64 = env
            .storage()
            .instance()
            .get(&symbol!("total_analyses"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("total_analyses"), &(total_analyses + 1));

        let total_budget_used: i128 = env
            .storage()
            .instance()
            .get(&symbol!("total_privacy_budget_used"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("total_privacy_budget_used"), &(total_budget_used + DEFAULT_PRIVACY_BUDGET));

        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&symbol!("active_analyses"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("active_analyses"), &(active_analyses + 1));

        // Emit event
        env.events()
            .publish((symbol!("analysis_requested"), request_id.clone()), ());

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
            .get(&symbol!("analysis_requests"))
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

        if privacy_budget_used > request.privacy_budget {
            return Err(StellarAnalyticsError::BudgetExceeded);
        }

        if accuracy > 100 {
            return Err(StellarAnalyticsError::InvalidConfidence);
        }

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
            .get(&symbol!("analysis_results"))
            .unwrap_or_else(|| Map::new(&env));

        results.set(request_id.clone(), result);
        env.storage().instance().set(&symbol!("analysis_results"), &results);

        // Update request status
        let mut updated_request = request;
        updated_request.completed = true;
        requests.set(request_id.clone(), updated_request);
        env.storage().instance().set(&symbol!("analysis_requests"), &requests);

        // Update active analyses count
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&symbol!("active_analyses"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("active_analyses"), &(active_analyses - 1));

        // Refund unused privacy budget
        let refund = request.privacy_budget - privacy_budget_used;
        if refund > 0 {
            let current_budget = Self::get_user_privacy_budget(env.clone(), request.requester);
            Self::set_user_privacy_budget(env.clone(), request.requester, current_budget + refund);
        }

        // Emit event
        env.events()
            .publish((symbol!("analysis_completed"), request_id.clone()), ());

        Ok(())
    }

    /// Cancel an analysis request
    pub fn cancel_analysis(env: Env, request_id: BytesN<32>) -> Result<(), StellarAnalyticsError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth

        let mut requests: Map<BytesN<32>, AnalysisRequest> = env
            .storage()
            .instance()
            .get(&symbol!("analysis_requests"))
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

        // Mark as cancelled
        let mut updated_request = request;
        updated_request.cancelled = true;
        requests.set(request_id.clone(), updated_request);
        env.storage().instance().set(&symbol!("analysis_requests"), &requests);

        // Refund privacy budget
        let current_budget = Self::get_user_privacy_budget(env.clone(), request.requester);
        Self::set_user_privacy_budget(env.clone(), request.requester, current_budget + request.privacy_budget);

        // Update active analyses count
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&symbol!("active_analyses"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol!("active_analyses"), &(active_analyses - 1));

        // Emit event
        env.events()
            .publish((symbol!("analysis_cancelled"), request_id.clone()), ());

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
            .get(&symbol!("admin"))
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

        Self::set_user_privacy_budget(env, user, current_budget + amount);
        Ok(())
    }

    /// Add authorized oracle (admin only)
    pub fn add_oracle(env: Env, oracle: Address) -> Result<(), StellarAnalyticsError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol!("admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        let caller = env.current_contract_address(); // In real implementation, get from auth
        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let mut oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol!("authorized_oracles"))
            .unwrap_or_else(|| Vec::new(&env));

        // Check if oracle already exists
        for existing_oracle in oracles.iter() {
            if existing_oracle == oracle {
                return Ok(()); // Already authorized
            }
        }

        oracles.push_back(oracle);
        env.storage()
            .instance()
            .set(&symbol!("authorized_oracles"), &oracles);

        env.events()
            .publish((symbol!("oracle_added"), oracle.clone()), ());

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
            .get(&symbol!("analysis_requests"))
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
            .get(&symbol!("analysis_results"))
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
            .get(&symbol!("total_analyses"))
            .unwrap_or(0);
        let total_privacy_budget_used: i128 = env
            .storage()
            .instance()
            .get(&symbol!("total_privacy_budget_used"))
            .unwrap_or(0);
        let active_analyses: u64 = env
            .storage()
            .instance()
            .get(&symbol!("active_analyses"))
            .unwrap_or(0);

        (total_analyses, total_privacy_budget_used, active_analyses)
    }

    // Helper functions
    fn get_user_privacy_budget(env: Env, user: Address) -> i128 {
        let key = symbol!("user_budget");
        let budgets: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        budgets.get(user).unwrap_or(0)
    }

    fn set_user_privacy_budget(env: Env, user: Address, budget: i128) {
        let key = symbol!("user_budget");
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
            .get(&symbol!("authorized_oracles"))
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

        let dataset = IPFSDataset {
            cid: cid.clone(),
            dataset_hash,
            uploader,
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
            .get(&symbol!("ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        datasets.set(cid.clone(), dataset);
        env.storage().instance().set(&symbol!("ipfs_datasets"), &datasets);

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
            .get(&symbol!("data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        availability_map.set(cid, availability);
        env.storage().instance().set(&symbol!("data_availability"), &availability_map);

        Ok(())
    }

    /// Check data availability for a given CID
    pub fn check_data_availability(env: Env, cid: String) -> Result<(), StellarAnalyticsError> {
        let availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&symbol!("data_availability"))
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
            .get(&symbol!("admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let mut availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&symbol!("data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        let mut availability = availability_map
            .get(cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        availability.available = available;
        availability.last_checked = env.ledger().timestamp();
        availability.pin_count = pin_count;
        availability.filecoin_deal_id = filecoin_deal_id;

        availability_map.set(cid, availability);
        env.storage().instance().set(&symbol!("data_availability"), &availability_map);

        Ok(())
    }

    /// Pin a dataset (mark as pinned)
    pub fn pin_dataset(env: Env, cid: String) -> Result<(), StellarAnalyticsError> {
        let caller = env.current_contract_address(); // In real implementation, get from auth
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol!("admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let mut datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&symbol!("ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        let mut dataset = datasets
            .get(cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        dataset.pinned = true;
        datasets.set(cid, dataset);
        env.storage().instance().set(&symbol!("ipfs_datasets"), &datasets);

        Ok(())
    }

    /// Get dataset information
    pub fn get_dataset(env: Env, cid: String) -> Result<IPFSDataset, StellarAnalyticsError> {
        let datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&symbol!("ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        datasets
            .get(cid)
            .ok_or(StellarAnalyticsError::DatasetNotFound)
    }

    /// Get data availability information
    pub fn get_data_availability(env: Env, cid: String) -> Result<DataAvailability, StellarAnalyticsError> {
        let availability_map: Map<String, DataAvailability> = env
            .storage()
            .instance()
            .get(&symbol!("data_availability"))
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

        // Get old dataset to inherit properties
        let datasets: Map<String, IPFSDataset> = env
            .storage()
            .instance()
            .get(&symbol!("ipfs_datasets"))
            .unwrap_or_else(|| Map::new(&env));

        let old_dataset = datasets
            .get(old_cid.clone())
            .ok_or(StellarAnalyticsError::DatasetNotFound)?;

        let new_version = old_dataset.version + 1;

        let new_dataset = IPFSDataset {
            cid: new_cid.clone(),
            dataset_hash: new_dataset_hash,
            uploader,
            timestamp: env.ledger().timestamp(),
            size_bytes,
            encrypted: old_dataset.encrypted,
            version: new_version,
            pinned: false,
            decryption_key_hash,
        };

        let mut datasets_mut = datasets;
        datasets_mut.set(new_cid.clone(), new_dataset);
        env.storage().instance().set(&symbol!("ipfs_datasets"), &datasets_mut);

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
            .get(&symbol!("data_availability"))
            .unwrap_or_else(|| Map::new(&env));

        availability_map.set(new_cid, availability);
        env.storage().instance().set(&symbol!("data_availability"), &availability_map);

        Ok(())
    }
}
