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
const MAX_ENTRY_SIZE: u32 = 65536; // 64KB in bytes
const MIN_STORAGE_FEE: i128 = 1000000; // 0.001 XLM

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
    pub fn initialize_ttl_storage(env: Env, admin: Address) {
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
        fees.set(symbol_short!("permanent"), 10000000i128); // 0.01 XLM/hour
        fees.set(symbol_short!("temporary"), 5000000i128); // 0.005 XLM/hour
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
        for chunk in chunks.iter() {
            env.storage().temporary().set(&chunk.chunk_id, &chunk);
        }

        // Create data entry
        let entry = DataEntry {
            entry_id: entry_id.clone(),
            owner: owner.clone(),
            data_hash: env.crypto().sha256(&data),
            chunk_count: chunks.len(),
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
            .set(&Self::fee_key(&env, &entry_id), &fee_record);

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
        let admin = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
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
        let fee_key = Self::fee_key(&env, &entry_id);
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
        let mut combined = Bytes::new(env);
        combined.append(&owner.clone().to_xdr(env));
        combined.append(data);
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
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
            data_len.div_ceil(MAX_ENTRY_SIZE)
        };

        for i in 0..chunk_count {
            let start = i * MAX_ENTRY_SIZE;
            let end = core::cmp::min(start + MAX_ENTRY_SIZE, data_len);

            if start >= data_len {
                break;
            }

            let chunk_data = data.slice(start..end);
            let chunk_id = Self::generate_chunk_id(env, entry_id, i);
            let checksum = env.crypto().sha256(&chunk_data);

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
        let mut combined = Bytes::new(env);
        combined.append(&Bytes::from(entry_id));
        combined.extend_from_array(&chunk_index.to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn reconstruct_data(env: &Env, entry: &DataEntry) -> Result<Bytes, TtlStorageError> {
        let mut reconstructed = Bytes::new(env);

        for i in 0..entry.chunk_count {
            let chunk_id = Self::generate_chunk_id(env, &entry.entry_id, i);
            if let Some(chunk) = env.storage().temporary().get::<_, DataChunk>(&chunk_id) {
                // Verify checksum
                let calculated_checksum = env.crypto().sha256(&chunk.data);
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
        let fee_key = Self::fee_key(env, entry_id);
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
            .get::<_, Map<Symbol, i128>>(&Symbol::new(env, "storage_fees"))
            .unwrap_or_else(|| Map::new(env));

        let fee_symbol = match fee_type {
            "temporary" => symbol_short!("temporary"),
            "permanent" => symbol_short!("permanent"),
            _ => symbol_short!("permanent"), // default
        };

        fees.get(fee_symbol).unwrap_or(MIN_STORAGE_FEE)
    }

    fn get_user_balance(env: &Env, user: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Self::balance_key(env, user))
            .unwrap_or(0i128)
    }

    fn update_user_balance(env: &Env, user: &Address, delta: i128) {
        let current_balance = Self::get_user_balance(env, user);
        let new_balance = current_balance + delta;
        env.storage()
            .persistent()
            .set(&Self::balance_key(env, user), &new_balance);
    }

    /// Storage key for a fee record: `fee_ || entry_id`.
    fn fee_key(env: &Env, entry_id: &BytesN<32>) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"fee_");
        key.append(&Bytes::from(entry_id));
        key
    }

    /// Storage key for a user balance: `balance_ || user`.
    fn balance_key(env: &Env, user: &Address) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"balance_");
        key.append(&user.clone().to_xdr(env));
        key
    }
}
