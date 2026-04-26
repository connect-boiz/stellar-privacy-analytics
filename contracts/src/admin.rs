use soroban_sdk::contracttype;
use soroban_sdk::contracterror;
use soroban_sdk::contractimpl;
use soroban_sdk::Address;
use soroban_sdk::Env;
use soroban_sdk::Vec;
use soroban_sdk::String;
use soroban_sdk::Map;
use soroban_sdk::BytesN;

// Contract state storage keys
const OWNERS_KEY: &str = "OWNERS";
const THRESHOLD_KEY: &str = "THRESHOLD";
const NONCE_KEY: &str = "NONCE";
const EXECUTIONS_KEY: &str = "EXECUTIONS";
const CONFIRMATIONS_KEY: &str = "CONFIRMATIONS";

// Constants
const MAX_OWNERS: u32 = 50;
const MIN_OWNERS: u32 = 1;
const MAX_THRESHOLD: u32 = 50;
const MIN_THRESHOLD: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Transaction {
    pub destination: Address,
    pub value: i128,
    pub data: BytesN<32>,
    pub executed: bool,
    pub nonce: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Confirmation {
    pub owner: Address,
    pub transaction_hash: BytesN<32>,
    pub confirmed: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MultiSigError {
    NotOwner = 1,
    InvalidOwner = 2,
    InvalidThreshold = 3,
    OwnerExists = 4,
    OwnerNotFound = 5,
    TransactionNotFound = 6,
    TransactionAlreadyExecuted = 7,
    AlreadyConfirmed = 8,
    NotConfirmed = 9,
    InsufficientConfirmations = 10,
    InvalidTransaction = 11,
    NotInitialized = 12,
    AlreadyInitialized = 13,
}

pub struct MultiSigAdmin;

#[contractimpl]
impl MultiSigAdmin {
    /// Initialize the multi-signature wallet with owners and threshold
    pub fn initialize(env: Env, owners: Vec<Address>, threshold: u32) -> Result<(), MultiSigError> {
        // Check if already initialized
        if env.storage().instance().has(&String::from_str(&env, OWNERS_KEY)) {
            return Err(MultiSigError::AlreadyInitialized);
        }

        // Validate owners
        if owners.len() < MIN_OWNERS as usize || owners.len() > MAX_OWNERS as usize {
            return Err(MultiSigError::InvalidOwner);
        }

        // Validate threshold
        if threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD || threshold > owners.len() as u32 {
            return Err(MultiSigError::InvalidThreshold);
        }

        // Check for duplicate owners
        let mut unique_owners = Vec::new(&env);
        for owner in owners.iter() {
            if unique_owners.contains(owner) {
                return Err(MultiSigError::OwnerExists);
            }
            unique_owners.push_back(owner);
        }

        // Set owners
        env.storage().instance().set(
            &String::from_str(&env, OWNERS_KEY),
            &unique_owners,
        );

        // Set threshold
        env.storage().instance().set(
            &String::from_str(&env, THRESHOLD_KEY),
            &threshold,
        );

        // Initialize nonce
        env.storage().instance().set(
            &String::from_str(&env, NONCE_KEY),
            &0u64,
        );

        // Emit initialized event
        env.events().publish(
            (String::from_str(&env, "multisig_initialized"),),
            (unique_owners, threshold),
        );

        Ok(())
    }

    /// Get current owners
    pub fn get_owners(env: Env) -> Result<Vec<Address>, MultiSigError> {
        if !env.storage().instance().has(&String::from_str(&env, OWNERS_KEY)) {
            return Err(MultiSigError::NotInitialized);
        }

        Ok(env.storage()
            .instance()
            .get(&String::from_str(&env, OWNERS_KEY))
            .unwrap())
    }

    /// Get current threshold
    pub fn get_threshold(env: Env) -> Result<u32, MultiSigError> {
        if !env.storage().instance().has(&String::from_str(&env, THRESHOLD_KEY)) {
            return Err(MultiSigError::NotInitialized);
        }

        Ok(env.storage()
            .instance()
            .get(&String::from_str(&env, THRESHOLD_KEY))
            .unwrap())
    }

    /// Add a new owner (requires multi-sig)
    pub fn add_owner(
        env: Env,
        new_owner: Address,
        caller: Address,
    ) -> Result<(), MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        let mut owners = Self::get_owners(env.clone())?;
        
        // Check if owner already exists
        if owners.contains(&new_owner) {
            return Err(MultiSigError::OwnerExists);
        }

        // Check max owners
        if owners.len() >= MAX_OWNERS as usize {
            return Err(MultiSigError::InvalidOwner);
        }

        // Add new owner
        owners.push_back(new_owner);
        env.storage().instance().set(
            &String::from_str(&env, OWNERS_KEY),
            &owners,
        );

        // Emit owner added event
        env.events().publish(
            (String::from_str(&env, "owner_added"),),
            new_owner,
        );

        Ok(())
    }

    /// Remove an owner (requires multi-sig)
    pub fn remove_owner(
        env: Env,
        owner_to_remove: Address,
        caller: Address,
    ) -> Result<(), MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        let mut owners = Self::get_owners(env.clone())?;
        let threshold = Self::get_threshold(env.clone())?;

        // Find and remove owner
        let mut found = false;
        let mut new_owners = Vec::new(&env);
        for owner in owners.iter() {
            if owner == owner_to_remove {
                found = true;
            } else {
                new_owners.push_back(owner);
            }
        }

        if !found {
            return Err(MultiSigError::OwnerNotFound);
        }

        // Check minimum owners
        if new_owners.len() < MIN_OWNERS as usize {
            return Err(MultiSigError::InvalidOwner);
        }

        // Adjust threshold if necessary
        let new_threshold = if threshold > new_owners.len() as u32 {
            new_owners.len() as u32
        } else {
            threshold
        };

        // Update owners and threshold
        env.storage().instance().set(
            &String::from_str(&env, OWNERS_KEY),
            &new_owners,
        );

        if new_threshold != threshold {
            env.storage().instance().set(
                &String::from_str(&env, THRESHOLD_KEY),
                &new_threshold,
            );
        }

        // Emit owner removed event
        env.events().publish(
            (String::from_str(&env, "owner_removed"),),
            owner_to_remove,
        );

        Ok(())
    }

    /// Change threshold (requires multi-sig)
    pub fn change_threshold(
        env: Env,
        new_threshold: u32,
        caller: Address,
    ) -> Result<(), MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        let owners = Self::get_owners(env.clone())?;

        // Validate new threshold
        if new_threshold < MIN_THRESHOLD 
            || new_threshold > MAX_THRESHOLD 
            || new_threshold > owners.len() as u32 {
            return Err(MultiSigError::InvalidThreshold);
        }

        env.storage().instance().set(
            &String::from_str(&env, THRESHOLD_KEY),
            &new_threshold,
        );

        // Emit threshold changed event
        env.events().publish(
            (String::from_str(&env, "threshold_changed"),),
            new_threshold,
        );

        Ok(())
    }

    /// Submit a transaction for confirmation
    pub fn submit_transaction(
        env: Env,
        destination: Address,
        value: i128,
        data: BytesN<32>,
        caller: Address,
    ) -> Result<BytesN<32>, MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        // Get current nonce
        let nonce = env.storage()
            .instance()
            .get::<_, u64>(&String::from_str(&env, NONCE_KEY))
            .unwrap_or(0);

        // Create transaction
        let transaction = Transaction {
            destination: destination.clone(),
            value,
            data,
            executed: false,
            nonce,
        };

        // Calculate transaction hash
        let transaction_hash = Self::hash_transaction(env.clone(), &transaction);

        // Store transaction
        let mut executions = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Transaction>>(&String::from_str(&env, EXECUTIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));
        
        executions.set(transaction_hash, transaction);
        env.storage().instance().set(
            &String::from_str(&env, EXECUTIONS_KEY),
            &executions,
        );

        // Increment nonce
        env.storage().instance().set(
            &String::from_str(&env, NONCE_KEY),
            &(nonce + 1),
        );

        // Emit transaction submitted event
        env.events().publish(
            (String::from_str(&env, "transaction_submitted"),),
            (transaction_hash, destination, value, nonce),
        );

        Ok(transaction_hash)
    }

    /// Confirm a transaction
    pub fn confirm_transaction(
        env: Env,
        transaction_hash: BytesN<32>,
        caller: Address,
    ) -> Result<(), MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        // Get transaction
        let mut executions = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Transaction>>(&String::from_str(&env, EXECUTIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let transaction = executions.get(transaction_hash)
            .ok_or(MultiSigError::TransactionNotFound)?;

        // Check if already executed
        if transaction.executed {
            return Err(MultiSigError::TransactionAlreadyExecuted);
        }

        // Get confirmations
        let mut confirmations = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Vec<Address>>>(&String::from_str(&env, CONFIRMATIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let mut tx_confirmations = confirmations.get(transaction_hash)
            .unwrap_or_else(|| Vec::new(&env));

        // Check if already confirmed
        if tx_confirmations.contains(&caller) {
            return Err(MultiSigError::AlreadyConfirmed);
        }

        // Add confirmation
        tx_confirmations.push_back(caller);
        confirmations.set(transaction_hash, tx_confirmations);
        env.storage().instance().set(
            &String::from_str(&env, CONFIRMATIONS_KEY),
            &confirmations,
        );

        // Emit confirmation event
        env.events().publish(
            (String::from_str(&env, "transaction_confirmed"),),
            (transaction_hash, caller),
        );

        Ok(())
    }

    /// Execute a transaction if enough confirmations
    pub fn execute_transaction(
        env: Env,
        transaction_hash: BytesN<32>,
        caller: Address,
    ) -> Result<(), MultiSigError> {
        // Check if caller is owner
        if !Self::is_owner(env.clone(), caller)? {
            return Err(MultiSigError::NotOwner);
        }

        // Get transaction
        let mut executions = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Transaction>>(&String::from_str(&env, EXECUTIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let mut transaction = executions.get(transaction_hash)
            .ok_or(MultiSigError::TransactionNotFound)?;

        // Check if already executed
        if transaction.executed {
            return Err(MultiSigError::TransactionAlreadyExecuted);
        }

        // Get confirmations
        let confirmations = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Vec<Address>>>(&String::from_str(&env, CONFIRMATIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        let tx_confirmations = confirmations.get(transaction_hash)
            .unwrap_or_else(|| Vec::new(&env));

        // Check if enough confirmations
        let threshold = Self::get_threshold(env.clone())?;
        if tx_confirmations.len() < threshold as usize {
            return Err(MultiSigError::InsufficientConfirmations);
        }

        // Mark as executed
        transaction.executed = true;
        executions.set(transaction_hash, transaction);
        env.storage().instance().set(
            &String::from_str(&env, EXECUTIONS_KEY),
            &executions,
        );

        // Emit execution event
        env.events().publish(
            (String::from_str(&env, "transaction_executed"),),
            (transaction_hash, transaction.destination, transaction.value),
        );

        Ok(())
    }

    /// Get transaction details
    pub fn get_transaction(env: Env, transaction_hash: BytesN<32>) -> Result<Transaction, MultiSigError> {
        let executions = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Transaction>>(&String::from_str(&env, EXECUTIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        executions.get(transaction_hash)
            .ok_or(MultiSigError::TransactionNotFound)
    }

    /// Get confirmations for a transaction
    pub fn get_confirmations(env: Env, transaction_hash: BytesN<32>) -> Result<Vec<Address>, MultiSigError> {
        let confirmations = env.storage()
            .instance()
            .get::<_, Map<BytesN<32>, Vec<Address>>>(&String::from_str(&env, CONFIRMATIONS_KEY))
            .unwrap_or_else(|| Map::new(&env));

        Ok(confirmations.get(transaction_hash)
            .unwrap_or_else(|| Vec::new(&env)))
    }

    /// Check if an address is an owner
    pub fn is_owner(env: Env, address: Address) -> Result<bool, MultiSigError> {
        if !env.storage().instance().has(&String::from_str(&env, OWNERS_KEY)) {
            return Err(MultiSigError::NotInitialized);
        }

        let owners = env.storage()
            .instance()
            .get::<_, Vec<Address>>(&String::from_str(&env, OWNERS_KEY))
            .unwrap();

        Ok(owners.contains(&address))
    }

    /// Get current nonce
    pub fn get_nonce(env: Env) -> Result<u64, MultiSigError> {
        if !env.storage().instance().has(&String::from_str(&env, NONCE_KEY)) {
            return Err(MultiSigError::NotInitialized);
        }

        Ok(env.storage()
            .instance()
            .get(&String::from_str(&env, NONCE_KEY))
            .unwrap())
    }

    /// Helper function to hash a transaction
    fn hash_transaction(env: Env, transaction: &Transaction) -> BytesN<32> {
        use soroban_sdk::crypto::sha256;
        
        let mut data = Vec::new(&env);
        data.push_back(transaction.destination.clone());
        data.push_back(transaction.value.into());
        data.push_back(transaction.data.clone());
        data.push_back(transaction.nonce.into());
        data.push_back(transaction.executed.into());
        
        sha256(&env, data.to_xdr(&env))
    }
}
