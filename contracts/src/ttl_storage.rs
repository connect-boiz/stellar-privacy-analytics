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
const MAX_ENTRY_SIZE: u32 = 65536; // 64KB in bytes
const MIN_STORAGE_FEE: i128 = 1000000; // 0.001 XLM
const LEDGERS_PER_HOUR: u32 = 720; // ~5s per ledger; converts hour TTLs to ledger TTLs

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

        // Require the admin to authorize initialization. Without this an
        // attacker could front-run the deployer's setup transaction and
        // claim admin by passing their own address.
        admin.require_auth();

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

        // Chunks live in temporary storage, which otherwise expires at the
        // default (~24h) TTL regardless of how much storage was paid for. Extend
        // each chunk's TTL to match the entry lifetime so the data survives
        // until expires_at instead of being silently lost (reconstruct_data
        // would otherwise fail with EntryNotFound).
        Self::extend_chunk_ttls(&env, &entry_id, chunks.len(), ttl_hours);

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

        // Append the entry id to the data_entries index that
        // cleanup_expired_data scans. Without this the index stays empty, so
        // cleanup can never find expired entries and always returns Ok(0).
        let entries_key = Symbol::new(&env, "data_entries");
        let mut data_entries: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&entries_key)
            .unwrap_or_else(|| Vec::new(&env));
        data_entries.push_back(entry_id.clone());
        env.storage().persistent().set(&entries_key, &data_entries);

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

        // Keep the chunk TTLs in step with the newly-extended entry lifetime,
        // otherwise the chunks would still expire at their original TTL.
        let now = env.ledger().timestamp();
        let remaining_hours = entry.expires_at.saturating_sub(now).div_ceil(3600) as u32;
        Self::extend_chunk_ttls(&env, &entry_id, entry.chunk_count, remaining_hours);

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

    /// Extend the temporary-storage TTL of every chunk so it survives `ttl_hours`
    /// of the entry's lifetime. Temporary entries expire by ledger, so hours are
    /// converted to ledgers and capped at the network maximum entry TTL.
    fn extend_chunk_ttls(env: &Env, entry_id: &BytesN<32>, chunk_count: u32, ttl_hours: u32) {
        let ttl_ledgers = ttl_hours
            .saturating_mul(LEDGERS_PER_HOUR)
            .min(env.storage().max_ttl());
        for i in 0..chunk_count {
            let chunk_id = Self::generate_chunk_id(env, entry_id, i);
            env.storage()
                .temporary()
                .extend_ttl(&chunk_id, ttl_ledgers, ttl_ledgers);
        }
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
    use soroban_sdk::testutils::Ledger;

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

    fn setup_with_owner(env: &Env) -> (TtlStorageClient<'_>, Address) {
        env.mock_all_auths();
        let contract_id = env.register(TtlStorage, ());
        let client = TtlStorageClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let owner = Address::generate(env);
        client.initialize(&admin);
        // Generous credit so multi-hour TTLs (e.g. 168h permanent) are affordable.
        client.add_storage_credits(&owner, &100_000_000_000i128);
        (client, owner)
    }

    /// Acceptance (#285): after the chunk TTLs are extended, data stored with a
    /// long entry TTL survives past the default temporary-storage TTL.
    #[test]
    fn test_chunks_survive_past_default_temp_ttl_within_entry_ttl() {
        let env = Env::default();
        let (client, owner) = setup_with_owner(&env);

        let data = Bytes::from_slice(&env, &[42u8; 200]);
        let metadata = Map::new(&env);
        // 7-day TTL — far beyond the default temporary-storage TTL.
        let entry_id = client.store_data(&owner, &data, &false, &168u32, &metadata);

        // Advance the ledger sequence well past the default temporary TTL but
        // within the entry's lifetime. Without the chunk extend_ttl the chunks
        // would have expired and retrieval would fail with EntryNotFound.
        let seq = env.ledger().sequence();
        env.ledger().set_sequence_number(seq + 1000);

        let retrieved = client.retrieve_data(&entry_id, &owner);
        assert_eq!(retrieved, data);
    }

    /// Acceptance (#285): once the entry's own (timestamp-based) TTL passes,
    /// retrieval fails with EntryExpired.
    #[test]
    fn test_retrieve_after_entry_ttl_fails_expired() {
        let env = Env::default();
        let (client, owner) = setup_with_owner(&env);

        let data = Bytes::from_slice(&env, &[7u8; 64]);
        let metadata = Map::new(&env);
        let entry_id = client.store_data(&owner, &data, &false, &1u32, &metadata);

        // Advance time past the entry's 1-hour TTL.
        let ts = env.ledger().timestamp();
        env.ledger().set_timestamp(ts + 2 * 3600);

        let result = client.try_retrieve_data(&entry_id, &owner);
        assert_eq!(result, Err(Ok(TtlStorageError::EntryExpired)));
    }

    /// bump_instance_ttl must keep chunks alive for the extended lifetime too.
    #[test]
    fn test_bump_ttl_keeps_chunks_alive() {
        let env = Env::default();
        let (client, owner) = setup_with_owner(&env);

        let data = Bytes::from_slice(&env, &[9u8; 128]);
        let metadata = Map::new(&env);
        let entry_id = client.store_data(&owner, &data, &false, &1u32, &metadata);

        // Extend the entry by a further 5 hours; chunk TTLs should follow.
        client.bump_instance_ttl(&entry_id, &owner, &5u32);

        let seq = env.ledger().sequence();
        env.ledger().set_sequence_number(seq + 1000);

        let retrieved = client.retrieve_data(&entry_id, &owner);
        assert_eq!(retrieved, data);
    }

    /// Acceptance (#284): a temporary entry past its TTL is found via the
    /// data_entries index and removed by cleanup_expired_data.
    #[test]
    fn test_cleanup_removes_expired_temporary_entry() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TtlStorage, ());
        let client = TtlStorageClient::new(&env, &contract_id);

        // initialize sets the cleanup worker to the admin.
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        client.initialize(&admin);
        client.add_storage_credits(&owner, &1_000_000_000i128);

        // Store a temporary entry with a 1-hour TTL.
        let data = Bytes::from_slice(&env, &[42u8; 64]);
        let metadata = Map::new(&env);
        let entry_id = client.store_data(&owner, &data, &true, &1u32, &metadata);

        // The entry exists before expiry.
        assert!(client.try_get_data_entry_info(&entry_id).is_ok());

        // Advance time past the TTL (2 hours).
        env.ledger()
            .set_timestamp(env.ledger().timestamp() + 2 * 3600);

        // Cleanup must find the entry via the index and remove it.
        let cleaned = client.cleanup_expired_data(&admin);
        assert_eq!(cleaned, 1);

        // The expired entry is gone.
        assert!(client.try_get_data_entry_info(&entry_id).is_err());
    }

    /// A non-expired (permanent) entry must survive cleanup, and only the
    /// worker recorded at initialization may run cleanup.
    #[test]
    fn test_cleanup_preserves_live_entry_and_rejects_non_worker() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TtlStorage, ());
        let client = TtlStorageClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        client.initialize(&admin);
        client.add_storage_credits(&owner, &1_000_000_000i128);

        // Permanent (non-temporary) entry with a 24-hour TTL.
        let data = Bytes::from_slice(&env, &[7u8; 32]);
        let metadata = Map::new(&env);
        let entry_id = client.store_data(&owner, &data, &false, &24u32, &metadata);

        // A non-worker cannot run cleanup.
        let stranger = Address::generate(&env);
        assert!(client.try_cleanup_expired_data(&stranger).is_err());

        // Worker cleanup runs but removes nothing (entry is live).
        let cleaned = client.cleanup_expired_data(&admin);
        assert_eq!(cleaned, 0);
        assert!(client.try_get_data_entry_info(&entry_id).is_ok());
    }
}
