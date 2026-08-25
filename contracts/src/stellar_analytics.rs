#![allow(clippy::too_many_arguments)]
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

        // Require the admin to authorize initialization. Without this an
        // attacker could front-run the deployer's setup transaction and
        // claim admin by passing their own address.
        admin.require_auth();

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
        // Requester must authorize the invocation. Without this, any caller
        // could supply a victim's address as `requester` and drain that
        // victim's privacy budget (spoofed requester argument).
        requester.require_auth();

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

        // If the privacy level requires consent, the data owner (the dataset's
        // uploader) must authorize this request. Requiring their signature at
        // the protocol level enforces consent; previously this was a no-op
        // comment that let restricted datasets be analyzed without consent.
        if privacy_level.require_consent {
            let dataset = Self::get_dataset(env.clone(), ipfs_cid.clone())?;
            dataset.uploader.require_auth();
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
        caller: Address,
        request_id: BytesN<32>,
        result_hash: BytesN<32>,
        privacy_budget_used: i128,
        accuracy: u32,
        privacy_proofs: Vec<BytesN<32>>,
    ) -> Result<(), StellarAnalyticsError> {
        // The submitting oracle must authorize the invocation. Deriving the
        // caller from current_contract_address() made this function
        // permanently unusable: the contract itself can never be an
        // authorized oracle.
        caller.require_auth();
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
    pub fn cancel_analysis(
        env: Env,
        caller: Address,
        request_id: BytesN<32>,
    ) -> Result<(), StellarAnalyticsError> {
        // The requester must authorize cancelling their own request so the
        // `caller` argument cannot be spoofed.
        caller.require_auth();

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
        caller: Address,
        user: Address,
        amount: i128,
    ) -> Result<(), StellarAnalyticsError> {
        // Only the admin can top up budgets; the admin must authorize the call.
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

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
    pub fn add_oracle(
        env: Env,
        caller: Address,
        oracle: Address,
    ) -> Result<(), StellarAnalyticsError> {
        // Only the admin can onboard oracles; the admin must authorize the call.
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;

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

    /// Remove an authorized oracle (admin only), revoking its ability to submit
    /// analysis results. Without this a compromised oracle key could never be
    /// rotated out.
    pub fn remove_oracle(
        env: Env,
        oracle: Address,
        caller: Address,
    ) -> Result<(), StellarAnalyticsError> {
        // Authenticate the caller. Because `caller` is supplied by the invoker,
        // the host-level auth check is what actually restricts this to the admin.
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(StellarAnalyticsError::NotAuthorizedOracle)?;
        if caller != admin {
            return Err(StellarAnalyticsError::NotAuthorizedOracle);
        }

        let oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "authorized_oracles"))
            .unwrap_or_else(|| Vec::new(&env));

        // Rebuild the list without the target oracle.
        let mut remaining = Vec::new(&env);
        for existing in oracles.iter() {
            if existing != oracle {
                remaining.push_back(existing);
            }
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "authorized_oracles"), &remaining);

        env.events()
            .publish((Symbol::new(&env, "oracle_removed"), oracle), ());

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

        if !(MIN_DATASET_SIZE_BYTES..=MAX_DATASET_SIZE_BYTES).contains(&size_bytes) {
            return Err(StellarAnalyticsError::InvalidInputRange);
        }

        if !(MIN_DATASET_VERSION..=MAX_DATASET_VERSION).contains(&version) {
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
        caller: Address,
        cid: String,
        available: bool,
        pin_count: u32,
        filecoin_deal_id: Option<u64>,
    ) -> Result<(), StellarAnalyticsError> {
        // Only the admin can update availability; the admin must authorize.
        caller.require_auth();

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
    pub fn pin_dataset(
        env: Env,
        caller: Address,
        cid: String,
    ) -> Result<(), StellarAnalyticsError> {
        // Only the admin can pin datasets; the admin must authorize.
        caller.require_auth();

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

        if !(MIN_DATASET_SIZE_BYTES..=MAX_DATASET_SIZE_BYTES).contains(&size_bytes) {
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
    use soroban_sdk::testutils::MockAuth;
    use soroban_sdk::testutils::MockAuthInvoke;
    use soroban_sdk::IntoVal;
    use soroban_sdk::Val;

    /// DEFAULT_PRIVACY_BUDGET (100 tokens).
    const BUDGET: i128 = 100_000_000_000_000_000;

    /// Register the contract, initialize it with a freshly generated admin, and
    /// return (contract address, client, admin, user, oracle).
    fn setup(
        env: &Env,
    ) -> (
        Address,
        StellarAnalyticsClient<'_>,
        Address,
        Address,
        Address,
    ) {
        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let user = Address::generate(env);
        let oracle = Address::generate(env);
        client.initialize(&admin);
        (contract_id, client, admin, user, oracle)
    }

    /// Register a dataset owned by `uploader`; returns its CID and hash.
    fn register_test_dataset(
        env: &Env,
        client: &StellarAnalyticsClient<'_>,
        uploader: &Address,
    ) -> (String, BytesN<32>) {
        let cid = String::from_str(env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        client.register_dataset(
            &cid,
            &dataset_hash,
            uploader,
            &1024u64,
            &false,
            &1u32,
            &no_key,
        );
        (cid, dataset_hash)
    }

    #[test]
    fn test_total_privacy_budget_decremented_on_complete_with_partial_usage() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, oracle) = setup(&env);

        client.add_oracle(&admin, &oracle);
        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        // Verify total_privacy_budget_used was incremented
        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, BUDGET);

        // Complete with 50% usage — 50 tokens refunded, counter should decrement
        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        let partial_budget: i128 = BUDGET / 2;
        client.complete_analysis(
            &oracle,
            &request_id,
            &result_hash,
            &partial_budget,
            &95u32,
            &privacy_proofs,
        );

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, BUDGET / 2);
    }

    #[test]
    fn test_total_privacy_budget_unchanged_on_complete_with_full_usage() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, oracle) = setup(&env);

        client.add_oracle(&admin, &oracle);
        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, BUDGET);

        // Complete with 100% usage — no refund, counter should be unchanged
        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        client.complete_analysis(
            &oracle,
            &request_id,
            &result_hash,
            &BUDGET,
            &95u32,
            &privacy_proofs,
        );

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, BUDGET);
    }

    #[test]
    fn test_total_privacy_budget_decremented_on_cancel() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, _oracle) = setup(&env);

        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let (_total, budget_used, _active) = client.get_stats();
        assert_eq!(budget_used, BUDGET);

        // Cancel the analysis — full refund, counter should go back to 0
        client.cancel_analysis(&user, &request_id);

        let (_total, budget_used_after, _active) = client.get_stats();
        assert_eq!(budget_used_after, 0);
    }

    /// Acceptance (#288): an oracle can be added and then revoked, after which
    /// is_authorized_oracle reports it as unauthorized.
    #[test]
    fn test_remove_oracle_revokes_authorization() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, client, admin, _user, _oracle) = setup(&env);

        let oracle = Address::generate(&env);
        client.add_oracle(&admin, &oracle);

        let authorized_before = env.as_contract(&contract_id, || {
            StellarAnalytics::is_authorized_oracle(env.clone(), oracle.clone())
        });
        assert!(authorized_before);

        // Admin revokes the oracle.
        client.remove_oracle(&oracle, &admin);

        let authorized_after = env.as_contract(&contract_id, || {
            StellarAnalytics::is_authorized_oracle(env.clone(), oracle.clone())
        });
        assert!(!authorized_after);
    }

    /// A non-admin caller cannot remove an oracle.
    #[test]
    fn test_remove_oracle_rejects_non_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, client, admin, _user, _oracle) = setup(&env);

        let oracle = Address::generate(&env);
        client.add_oracle(&admin, &oracle);

        // A different address (not the admin) is rejected.
        let stranger = Address::generate(&env);
        let res = client.try_remove_oracle(&oracle, &stranger);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));

        // The oracle remains authorized.
        let still_authorized = env.as_contract(&contract_id, || {
            StellarAnalytics::is_authorized_oracle(env.clone(), oracle.clone())
        });
        assert!(still_authorized);
    }

    /// Acceptance (#396): a real admin (not the contract address) can onboard
    /// an oracle, and that oracle can complete an analysis. Previously both
    /// operations were impossible because the contract derived the caller from
    /// env.current_contract_address().
    #[test]
    fn test_admin_can_add_oracle_and_oracle_completes_analysis() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, oracle) = setup(&env);

        client.add_oracle(&admin, &oracle);
        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        client.complete_analysis(
            &oracle,
            &request_id,
            &result_hash,
            &BUDGET,
            &95u32,
            &privacy_proofs,
        );

        let request = client.get_analysis_request(&request_id);
        assert!(request.completed);
        let result = client.get_analysis_result(&request_id);
        assert_eq!(result.result_hash, result_hash);
    }

    /// A non-admin caller is rejected by add_oracle.
    #[test]
    fn test_add_oracle_rejects_non_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, _admin, _user, _oracle) = setup(&env);

        let stranger = Address::generate(&env);
        let oracle = Address::generate(&env);
        let res = client.try_add_oracle(&stranger, &oracle);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));
    }

    /// A non-oracle caller cannot complete an analysis.
    #[test]
    fn test_complete_analysis_rejects_non_oracle() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, oracle) = setup(&env);

        client.add_oracle(&admin, &oracle);
        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        let stranger = Address::generate(&env);
        let result_hash = BytesN::<32>::from_array(&env, &[3u8; 32]);
        let privacy_proofs = Vec::new(&env);
        let res = client.try_complete_analysis(
            &stranger,
            &request_id,
            &result_hash,
            &BUDGET,
            &95u32,
            &privacy_proofs,
        );
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));
    }

    /// A non-admin caller cannot top up privacy budgets.
    #[test]
    fn test_add_privacy_budget_rejects_non_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, _admin, user, _oracle) = setup(&env);

        let stranger = Address::generate(&env);
        let res = client.try_add_privacy_budget(&stranger, &user, &BUDGET);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));
    }

    /// Only the admin can update data availability; non-admins are rejected.
    #[test]
    fn test_update_data_availability_requires_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, _user, _oracle) = setup(&env);

        let (cid, _dataset_hash) = register_test_dataset(&env, &client, &admin);

        // Non-admin rejected.
        let stranger = Address::generate(&env);
        let res = client.try_update_data_availability(&stranger, &cid, &false, &5u32, &None);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));

        // Admin succeeds.
        client.update_data_availability(&admin, &cid, &false, &5u32, &None);
        let availability = client.get_data_availability(&cid);
        assert!(!availability.available);
        assert_eq!(availability.pin_count, 5);
    }

    /// Only the admin can pin a dataset; non-admins are rejected.
    #[test]
    fn test_pin_dataset_requires_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, _user, _oracle) = setup(&env);

        let (cid, _dataset_hash) = register_test_dataset(&env, &client, &admin);

        // Non-admin rejected.
        let stranger = Address::generate(&env);
        let res = client.try_pin_dataset(&stranger, &cid);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::NotAuthorizedOracle)));

        // Admin succeeds.
        client.pin_dataset(&admin, &cid);
        let dataset = client.get_dataset(&cid);
        assert!(dataset.pinned);
    }

    /// Only the requester can cancel their own analysis.
    #[test]
    fn test_cancel_analysis_rejects_non_requester() {
        let env = Env::default();
        env.mock_all_auths();
        let (_contract_id, client, admin, user, _oracle) = setup(&env);

        client.add_privacy_budget(&admin, &user, &BUDGET);
        let (cid, dataset_hash) = register_test_dataset(&env, &client, &user);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard");
        let request_id =
            client.request_analysis(&user, &dataset_hash, &cid, &analysis_type, &privacy_level);

        // A non-requester cannot cancel.
        let stranger = Address::generate(&env);
        let res = client.try_cancel_analysis(&stranger, &request_id);
        assert_eq!(res, Err(Ok(StellarAnalyticsError::InvalidRequestId)));

        // The requester can cancel.
        client.cancel_analysis(&user, &request_id);
        let request = client.get_analysis_request(&request_id);
        assert!(request.cancelled);
    }

    /// Spoofing prevention: without the admin's signature the host must reject
    /// `add_oracle`. An attacker cannot onboard their own oracle by passing the
    /// stored admin address as `caller`.
    #[test]
    #[should_panic(expected = "Error(Auth, InvalidAction)")]
    fn test_add_oracle_requires_admin_signature() {
        let env = Env::default();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        // Authorize ONLY the initialize call for the admin.
        let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin);

        // Drop all auths: the attacker supplies `admin` as `caller` without
        // the admin ever signing the invocation.
        env.mock_auths(&[]);

        client.add_oracle(&admin, &oracle);
    }

    /// Spoofing prevention: without the requester's signature the host must
    /// reject `request_analysis`. An attacker cannot drain a victim's privacy
    /// budget by passing the victim's address as `requester`.
    #[test]
    #[should_panic(expected = "Error(Auth, InvalidAction)")]
    fn test_request_analysis_rejects_spoofed_requester() {
        let env = Env::default();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let victim = Address::generate(&env);

        // Authorize ONLY the initialize call for the admin.
        let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin);

        // Register a dataset (no auth required) so the request is otherwise
        // valid and the only thing missing is the requester's signature.
        let cid = String::from_str(&env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        let size_bytes: u64 = 1024;
        let encrypted: bool = false;
        let version: u32 = 1;
        client.register_dataset(
            &cid,
            &dataset_hash,
            &victim,
            &size_bytes,
            &encrypted,
            &version,
            &no_key,
        );

        // Drop all auths: the attacker supplies `victim` as `requester`
        // without the victim ever signing the invocation.
        env.mock_auths(&[]);

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "minimal"); // require_consent = false
        client.request_analysis(&victim, &dataset_hash, &cid, &analysis_type, &privacy_level);
    }

    /// Consent enforcement: for `require_consent` privacy levels the data owner
    /// (dataset uploader) must authorize the request. Authorizing only the
    /// requester leaves the owner's consent missing, so the call must fail.
    #[test]
    #[should_panic(expected = "Error(Auth, InvalidAction)")]
    fn test_request_analysis_requires_data_owner_consent() {
        let env = Env::default();

        let contract_id = env.register(StellarAnalytics, ());
        let client = StellarAnalyticsClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let requester = Address::generate(&env);
        let data_owner = Address::generate(&env);

        // Authorize ONLY the initialize call for the admin.
        let init_args: Vec<Val> = Vec::from_array(&env, [admin.clone().into_val(&env)]);
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: init_args,
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin);

        // Register a dataset owned by a distinct data owner (no auth needed).
        let cid = String::from_str(&env, "QmTest12345678901234567");
        let dataset_hash = BytesN::<32>::from_array(&env, &[1u8; 32]);
        let no_key: Option<BytesN<32>> = None;
        let size_bytes: u64 = 1024;
        let encrypted: bool = false;
        let version: u32 = 1;
        client.register_dataset(
            &cid,
            &dataset_hash,
            &data_owner,
            &size_bytes,
            &encrypted,
            &version,
            &no_key,
        );

        let analysis_type = String::from_str(&env, "descriptive");
        let privacy_level = String::from_str(&env, "standard"); // require_consent = true

        // Authorize ONLY the requester's request_analysis invocation. The data
        // owner has not provided consent, so the host must reject the call.
        let request_args: Vec<Val> = Vec::from_array(
            &env,
            [
                requester.clone().into_val(&env),
                dataset_hash.clone().into_val(&env),
                cid.clone().into_val(&env),
                analysis_type.clone().into_val(&env),
                privacy_level.clone().into_val(&env),
            ],
        );
        env.mock_auths(&[MockAuth {
            address: &requester,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "request_analysis",
                args: request_args,
                sub_invokes: &[],
            },
        }]);

        client.request_analysis(
            &requester,
            &dataset_hash,
            &cid,
            &analysis_type,
            &privacy_level,
        );
    }
}
