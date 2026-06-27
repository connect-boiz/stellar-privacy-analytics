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

// Contract state storage keys
const DATA_ENTRIES_KEY: &str = "DATA_ENTRIES";
const TEMP_DATA_KEY: &str = "TEMP_DATA";
const STORAGE_FEES_KEY: &str = "STORAGE_FEES";
const CLEANUP_WORKER_KEY: &str = "CLEANUP_WORKER";
const USER_BALANCES_KEY: &str = "USER_BALANCES";

// Constants
const MAX_ENTRY_SIZE: u32 = 65536; // 64KB in bytes
const DEFAULT_TTL: u64 = 86400; // 24 hours in seconds
const EXTENSION_TTL: u64 = 3600; // 1 hour in seconds
const MIN_STORAGE_FEE: i128 = 1000000; // 0.001 XLM
const CLEANUP_INTERVAL: u64 = 3600; // 1 hour

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataEntry {
    pub entry_id: BytesN<32>,
    pub owner: Address,
    pub data_hash: BytesN<32>,
    pub chunk_count: u32,
    pub created_at: u64,
    pub expires_at: u64,
    pub ttl_extension_count: u32,
    pub storage_fee_paid: i128,
    pub is_temporary: bool,
    pub metadata: Map<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataChunk {
    pub chunk_id: BytesN<32>,
    pub entry_id: BytesN<32>,
    pub chunk_index: u32,
    pub data: Bytes,
    pub checksum: BytesN<32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct StorageFee {
    pub entry_id: BytesN<32>,
    pub fee_per_hour: i128,
    pub total_fee: i128,
    pub paid_until: u64,
    pub auto_renew: bool,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum TtlStorageError {
    InvalidEntryId = 0,
    EntryNotFound = 1,
    EntryExpired = 2,
    InsufficientFee = 3,
    ChunkTooLarge = 4,
    InvalidChecksum = 5,
    NotAuthorized = 6,
    MaxExtensionsReached = 7,
    CleanupInProgress = 8,
}

#[contract]
pub struct TtlStorage;

#[contractimpl]
impl TtlStorage {
    /// Initialize the TTL storage contract
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

        // Initialize cleanup worker
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "cleanup_worker"), &admin);

        // Set default storage fees
        let mut fees = Map::new(&env);
        fees.set(Symbol::new(&env, "permanent"), 10000000i128); // 0.01 XLM/hour
        fees.set(Symbol::new(&env, "temporary"), 5000000i128); // 0.005 XLM/hour
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "storage_fees"), &fees);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Store data with TTL support, automatically chunked if needed
    pub fn store_data(
        env: Env,
        owner: Address,
        data: Bytes,
        is_temporary: bool,
        ttl_hours: u32,
        metadata: Map<String, String>,
    ) -> Result<BytesN<32>, TtlStorageError> {
        // Verify owner authorization
        owner.require_auth();

        // Calculate entry ID
        let entry_id = Self::generate_entry_id(&env, &owner, &data);

        // Check if entry already exists
        if Self::get_data_entry(&env, &entry_id).is_some() {
            return Err(TtlStorageError::InvalidEntryId);
        }

        // Calculate TTL
        let current_time = env.ledger().timestamp();
        let ttl_seconds = (ttl_hours as u64) * 3600;
        let expires_at = current_time + ttl_seconds;

        // Calculate storage fee
        let fee_type = if is_temporary {
            "temporary"
        } else {
            "permanent"
        };
        let fee_per_hour = Self::get_storage_fee(&env, fee_type);
        let total_fee = fee_per_hour * (ttl_hours as i128);

        // Check if user has sufficient balance
        let user_balance = Self::get_user_balance(&env, &owner);
        if user_balance < total_fee {
            return Err(TtlStorageError::InsufficientFee);
        }

        // Deduct storage fee
        Self::update_user_balance(&env, &owner, -total_fee);

        // Split data into chunks if necessary
        let chunks = Self::split_into_chunks(&env, &data, &entry_id)?;

        // Store chunks
        for chunk in &chunks {
            env.storage().temporary().set(&chunk.chunk_id, &chunk);
        }

        // Create data entry
        let chunk_count = chunks.len() as u32;
        let entry = DataEntry {
            entry_id: entry_id.clone(),
            owner: owner.clone(),
            data_hash: env.crypto().sha256(&data).into(),
            chunk_count,
            created_at: current_time,
            expires_at,
            ttl_extension_count: 0,
            storage_fee_paid: total_fee,
            is_temporary,
            metadata,
        };

        // Store entry
        env.storage().persistent().set(&entry_id, &entry);

        // Create storage fee record
        let fee_record = StorageFee {
            entry_id: entry_id.clone(),
            fee_per_hour,
            total_fee,
            paid_until: expires_at,
            auto_renew: !is_temporary,
        };
        env.storage()
            .persistent()
            .set(&(Symbol::new(&env, "fee_"), entry_id.clone()), &fee_record);

        Ok(entry_id)
    }

    /// Retrieve stored data by entry ID
    pub fn retrieve_data(
        env: Env,
        entry_id: BytesN<32>,
        requester: Address,
    ) -> Result<Bytes, TtlStorageError> {
        let entry = Self::get_data_entry(&env, &entry_id).ok_or(TtlStorageError::EntryNotFound)?;

        // Check if entry has expired
        if env.ledger().timestamp() > entry.expires_at {
            return Err(TtlStorageError::EntryExpired);
        }

        // Verify requester authorization (owner or admin)
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(TtlStorageError::NotAuthorized)?;
        if requester != entry.owner && requester != admin {
            return Err(TtlStorageError::NotAuthorized);
        }

        // Reconstruct data from chunks
        Self::reconstruct_data(&env, &entry)
    }

    /// Extend TTL for a data entry
    pub fn bump_instance_ttl(
        env: Env,
        entry_id: BytesN<32>,
        requester: Address,
        extension_hours: u32,
    ) -> Result<(), TtlStorageError> {
        let mut entry =
            Self::get_data_entry(&env, &entry_id).ok_or(TtlStorageError::EntryNotFound)?;

        // Verify owner authorization
        if requester != entry.owner {
            return Err(TtlStorageError::NotAuthorized);
        }

        // Check max extensions (prevent infinite extensions)
        if entry.ttl_extension_count >= 10 {
            return Err(TtlStorageError::MaxExtensionsReached);
        }

        // Calculate extension fee
        let fee_type = if entry.is_temporary {
            "temporary"
        } else {
            "permanent"
        };
        let fee_per_hour = Self::get_storage_fee(&env, fee_type);
        let extension_fee = fee_per_hour * (extension_hours as i128);

        // Check user balance
        let user_balance = Self::get_user_balance(&env, &requester);
        if user_balance < extension_fee {
            return Err(TtlStorageError::InsufficientFee);
        }

        // Deduct fee and update TTL
        Self::update_user_balance(&env, &requester, -extension_fee);
        entry.expires_at += (extension_hours as u64) * 3600;
        entry.ttl_extension_count += 1;
        entry.storage_fee_paid += extension_fee;

        // Update entry
        env.storage().persistent().set(&entry_id, &entry);

        // Update fee record
        let fee_key = (Symbol::new(&env, "fee_"), entry_id);
        if let Some(mut fee_record) = env.storage().persistent().get::<_, StorageFee>(&fee_key) {
            fee_record.total_fee += extension_fee;
            fee_record.paid_until = entry.expires_at;
            env.storage().persistent().set(&fee_key, &fee_record);
        }

        Ok(())
    }

    /// Cleanup expired temporary data (called by cleanup worker)
    pub fn cleanup_expired_data(env: Env, worker: Address) -> Result<u32, TtlStorageError> {
        // Verify cleanup worker authorization
        let cleanup_worker = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "cleanup_worker"))
            .ok_or(TtlStorageError::NotAuthorized)?;
        if worker != cleanup_worker {
            return Err(TtlStorageError::NotAuthorized);
        }

        let current_time = env.ledger().timestamp();
        let mut cleaned_count = 0;

        // Get all data entries (this is a simplified approach)
        // In production, you'd want to maintain an index of temporary entries
        let entries_key = Symbol::new(&env, "data_entries");
        if let Some(entries) = env
            .storage()
            .persistent()
            .get::<_, Vec<BytesN<32>>>(&entries_key)
        {
            let mut remaining_entries = Vec::new(&env);

            for entry_id in entries {
                if let Some(entry) = Self::get_data_entry(&env, &entry_id) {
                    if entry.is_temporary && current_time > entry.expires_at {
                        // Remove expired entry and its chunks
                        Self::remove_entry(&env, &entry_id);
                        cleaned_count += 1;
                    } else {
                        remaining_entries.push_back(entry_id);
                    }
                }
            }

            // Update entries list
            env.storage()
                .persistent()
                .set(&entries_key, &remaining_entries);
        }

        Ok(cleaned_count)
    }

    /// Add storage credits to user balance
    pub fn add_storage_credits(
        env: Env,
        user: Address,
        amount: i128,
    ) -> Result<(), TtlStorageError> {
        // Verify admin authorization
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .ok_or(TtlStorageError::NotAuthorized)?;
        admin.require_auth();

        Self::update_user_balance(&env, &user, amount);
        Ok(())
    }

    /// Get user's current storage balance
    pub fn get_user_storage_balance(env: Env, user: Address) -> i128 {
        Self::get_user_balance(&env, &user)
    }

    /// Get data entry information
    pub fn get_data_entry_info(
        env: Env,
        entry_id: BytesN<32>,
    ) -> Result<DataEntry, TtlStorageError> {
        Self::get_data_entry(&env, &entry_id).ok_or(TtlStorageError::EntryNotFound)
    }

    // Helper functions

    fn generate_entry_id(env: &Env, owner: &Address, data: &Bytes) -> BytesN<32> {
        let mut combined = soroban_sdk::Bytes::new(env);
        combined.append(&owner.to_xdr(env));
        combined.append(data);
        combined.append(&Bytes::from_slice(
            env,
            &env.ledger().timestamp().to_be_bytes(),
        ));
        env.crypto().sha256(&combined).into()
    }

    fn get_data_entry(env: &Env, entry_id: &BytesN<32>) -> Option<DataEntry> {
        env.storage().persistent().get(entry_id)
    }

    fn split_into_chunks(
        env: &Env,
        data: &Bytes,
        entry_id: &BytesN<32>,
    ) -> Result<Vec<DataChunk>, TtlStorageError> {
        let mut chunks = Vec::new(env);
        let data_len = data.len();
        let chunk_count = if data_len <= MAX_ENTRY_SIZE {
            1
        } else {
            (data_len + MAX_ENTRY_SIZE - 1) / MAX_ENTRY_SIZE
        };

        for i in 0..chunk_count {
            let start = i * MAX_ENTRY_SIZE;
            let end = std::cmp::min(start + MAX_ENTRY_SIZE, data_len);

            if start >= data_len {
                break;
            }

            let chunk_data = data.slice(start..end);
            let chunk_id = Self::generate_chunk_id(env, entry_id, i);
            let checksum: BytesN<32> = env.crypto().sha256(&chunk_data).into();

            if chunk_data.len() > MAX_ENTRY_SIZE {
                return Err(TtlStorageError::ChunkTooLarge);
            }

            let chunk = DataChunk {
                chunk_id: chunk_id.clone(),
                entry_id: entry_id.clone(),
                chunk_index: i,
                data: chunk_data,
                checksum,
            };

            chunks.push_back(chunk);
        }

        Ok(chunks)
    }

    fn generate_chunk_id(env: &Env, entry_id: &BytesN<32>, chunk_index: u32) -> BytesN<32> {
        let mut combined = soroban_sdk::Bytes::new(env);
        combined.append(&entry_id.to_xdr(env));
        combined.append(&Bytes::from_slice(env, &chunk_index.to_be_bytes()));
        env.crypto().sha256(&combined).into()
    }

    fn reconstruct_data(env: &Env, entry: &DataEntry) -> Result<Bytes, TtlStorageError> {
        let mut reconstructed = soroban_sdk::Bytes::new(env);

        for i in 0..entry.chunk_count {
            let chunk_id = Self::generate_chunk_id(env, &entry.entry_id, i);
            if let Some(chunk) = env.storage().temporary().get::<_, DataChunk>(&chunk_id) {
                // Verify checksum
                let calculated_checksum: BytesN<32> = env.crypto().sha256(&chunk.data).into();
                if calculated_checksum != chunk.checksum {
                    return Err(TtlStorageError::InvalidChecksum);
                }
                reconstructed.append(&chunk.data);
            } else {
                return Err(TtlStorageError::EntryNotFound);
            }
        }

        Ok(reconstructed)
    }

    fn remove_entry(env: &Env, entry_id: &BytesN<32>) {
        // Remove entry
        env.storage().persistent().remove(entry_id);

        // Remove fee record
        let fee_key = (Symbol::new(&env, "fee_"), entry_id.clone());
        env.storage().persistent().remove(&fee_key);

        // Remove chunks (if they exist)
        if let Some(entry) = Self::get_data_entry(env, entry_id) {
            for i in 0..entry.chunk_count {
                let chunk_id = Self::generate_chunk_id(env, entry_id, i);
                env.storage().temporary().remove(&chunk_id);
            }
        }
    }

    fn get_storage_fee(env: &Env, fee_type: &str) -> i128 {
        let fees = env
            .storage()
            .instance()
            .get::<_, Map<Symbol, i128>>(&Symbol::new(&env, "storage_fees"))
            .unwrap_or_else(|| Map::new(env));

        let fee_symbol = match fee_type {
            "temporary" => Symbol::new(&env, "temporary"),
            "permanent" => Symbol::new(&env, "permanent"),
            _ => Symbol::new(&env, "permanent"), // default
        };

        fees.get(fee_symbol).unwrap_or(MIN_STORAGE_FEE)
    }

    fn get_user_balance(env: &Env, user: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "balance_"), user.clone()))
            .unwrap_or(0i128)
    }

    fn update_user_balance(env: &Env, user: &Address, delta: i128) {
        let current_balance = Self::get_user_balance(env, user);
        let new_balance = current_balance + delta;
        env.storage()
            .persistent()
            .set(&(Symbol::new(&env, "balance_"), user.clone()), &new_balance);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_retrieve_data_from_uninitialized_contract_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TtlStorage, ());
        let client = TtlStorageClient::new(&env, &contract_id);

        let requester = Address::generate(&env);
        let entry_id = BytesN::<32>::from_array(&env, &[1u8; 32]);

        // Attempting to retrieve data from an uninitialized contract
        // should return Err (NotAuthorized) instead of panicking
        let result = client.try_retrieve_data(&entry_id, &requester);
        assert!(result.is_err());
    }

    #[test]
    fn test_retrieve_data_from_initialized_contract_succeeds() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TtlStorage, ());
        let client = TtlStorageClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let stranger = Address::generate(&env);

        // Initialize the contract
        client.initialize(&admin);

        // Add storage credits to the owner so store_data won't fail with InsufficientFee
        let credits: i128 = 1000000000; // 1000 XLM-equivalent credits
        client.add_storage_credits(&owner, &credits);

        // Store some data
        let data = Bytes::from_slice(&env, &[42u8; 100]);
        let mut metadata = Map::new(&env);
        metadata.set(
            String::from_str(&env, "key"),
            String::from_str(&env, "value"),
        );

        let ttl_hours: u32 = 24;
        let is_temp: bool = false;
        let entry_id = client.store_data(&owner, &data, &is_temp, &ttl_hours, &metadata);

        // Retrieve data as the owner — should succeed
        let retrieved = client.retrieve_data(&entry_id, &owner);
        assert!(!retrieved.is_empty());

        // Retrieve data as admin — should succeed
        let retrieved = client.retrieve_data(&entry_id, &admin);
        assert!(!retrieved.is_empty());

        // Retrieve data as a stranger (not owner, not admin) — should fail with NotAuthorized
        let result = client.try_retrieve_data(&entry_id, &stranger);
        assert!(result.is_err());
    }
}
