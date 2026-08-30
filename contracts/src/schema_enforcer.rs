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

// Constants
const MAX_SCHEMA_FIELDS: u32 = 50;
const MAX_FIELD_NAME_LENGTH: u32 = 256;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum SchemaFieldType {
    String,
    Integer,
    Float,
    Boolean,
    Array,
    Object,
    EncryptedString,
    EncryptedInteger,
    EncryptedFloat,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct SchemaField {
    pub name: String,
    pub field_type: SchemaFieldType,
    pub required: bool,
    pub min_length: Option<u32>,
    pub max_length: Option<u32>,
    pub min_value: Option<i128>,
    pub max_value: Option<i128>,
    pub validation_pattern: String, // empty string when no pattern is set
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct DataSchema {
    pub schema_id: BytesN<32>,
    pub org_id: Address,
    pub name: String,
    pub version: String,
    pub fields: Vec<SchemaField>,
    pub required_metadata: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub is_active: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct EncryptedPayload {
    pub payload_id: BytesN<32>,
    pub schema_id: BytesN<32>,
    pub provider_id: Address,
    pub data_hash: BytesN<32>,
    pub encrypted_fields: Map<String, Bytes>,
    pub metadata: Map<String, String>,
    pub timestamp: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct ValidationLog {
    pub log_id: BytesN<32>,
    pub payload_id: BytesN<32>,
    pub provider_id: Address,
    pub schema_id: BytesN<32>,
    pub validation_result: bool,
    pub error_messages: Vec<String>,
    pub timestamp: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct RejectionEvent {
    pub event_id: BytesN<32>,
    pub payload_id: BytesN<32>,
    pub provider_id: Address,
    pub schema_id: BytesN<32>,
    pub rejection_reason: String,
    pub timestamp: u64,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum SchemaValidationError {
    InvalidSchemaId = 0,
    SchemaNotFound = 1,
    SchemaInactive = 2,
    InvalidPayload = 3,
    MissingRequiredField = 4,
    InvalidFieldType = 5,
    FieldValidationFailed = 6,
    MissingRequiredMetadata = 7,
    EncryptedFieldMismatch = 8,
    MaxFieldsExceeded = 9,
    FieldNameTooLong = 10,
    SchemaTooLarge = 11,
    NotAuthorized = 12,
}

#[contract]
pub struct SchemaEnforcer;

#[contractimpl]
impl SchemaEnforcer {
    /// Initialize the schema enforcement contract
    pub fn initialize_schema_enforcer(env: Env, admin: Address) {
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

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
    }

    /// Create a new data schema for an organization
    pub fn create_schema(
        env: Env,
        org_id: Address,
        name: String,
        version: String,
        fields: Vec<SchemaField>,
        required_metadata: Vec<String>,
    ) -> Result<BytesN<32>, SchemaValidationError> {
        // Verify organization authorization
        org_id.require_auth();

        // Validate schema constraints
        if fields.len() > MAX_SCHEMA_FIELDS {
            return Err(SchemaValidationError::MaxFieldsExceeded);
        }

        // Validate field names
        for field in fields.iter() {
            if field.name.len() > MAX_FIELD_NAME_LENGTH {
                return Err(SchemaValidationError::FieldNameTooLong);
            }
        }

        // Generate schema ID
        let schema_id = Self::generate_schema_id(&env, &org_id, &name, &version);

        // Check if schema already exists
        if Self::get_schema(&env, &schema_id).is_some() {
            return Err(SchemaValidationError::InvalidSchemaId);
        }

        let current_time = env.ledger().timestamp();

        let schema = DataSchema {
            schema_id: schema_id.clone(),
            org_id: org_id.clone(),
            name,
            version,
            fields,
            required_metadata,
            created_at: current_time,
            updated_at: current_time,
            is_active: true,
        };

        // Store schema
        env.storage().persistent().set(&schema_id, &schema);

        // Add to organization's schemas
        let org_schemas_key = Self::org_schemas_key(&env, &org_id);
        let mut org_schemas: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&org_schemas_key)
            .unwrap_or_else(|| Vec::new(&env));
        org_schemas.push_back(schema_id.clone());
        env.storage()
            .persistent()
            .set(&org_schemas_key, &org_schemas);

        // Add to active schemas
        let mut active_schemas: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "active_schemas"))
            .unwrap_or_else(|| Vec::new(&env));
        active_schemas.push_back(schema_id.clone());
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "active_schemas"), &active_schemas);

        Ok(schema_id)
    }

    /// Validate an encrypted payload against a schema
    pub fn validate_payload(
        env: Env,
        payload: EncryptedPayload,
    ) -> Result<BytesN<32>, SchemaValidationError> {
        // Get schema
        let schema = Self::get_schema(&env, &payload.schema_id)
            .ok_or(SchemaValidationError::SchemaNotFound)?;

        // Check if schema is active
        if !schema.is_active {
            return Err(SchemaValidationError::SchemaInactive);
        }

        // Create validation log
        let log_id = Self::generate_log_id(&env, &payload.payload_id);
        let mut validation_log = ValidationLog {
            log_id: log_id.clone(),
            payload_id: payload.payload_id.clone(),
            provider_id: payload.provider_id.clone(),
            schema_id: payload.schema_id.clone(),
            validation_result: true,
            error_messages: Vec::new(&env),
            timestamp: env.ledger().timestamp(),
        };

        // Validate required metadata
        for required_meta in schema.required_metadata.iter() {
            if !payload.metadata.contains_key(required_meta) {
                validation_log.validation_result = false;
                validation_log
                    .error_messages
                    .push_back(String::from_str(&env, "Missing required metadata"));
            }
        }

        // Validate encrypted fields against schema
        let schema_field_map = Self::create_field_map(&env, &schema.fields);

        for (field_name, _encrypted_data) in payload.encrypted_fields.iter() {
            if let Some(expected_field) = schema_field_map.get(field_name.clone()) {
                // Validate field type (basic check - encrypted data type validation)
                if !Self::validate_encrypted_field_type(
                    expected_field.field_type.clone(),
                    &_encrypted_data,
                ) {
                    validation_log.validation_result = false;
                    validation_log
                        .error_messages
                        .push_back(String::from_str(&env, "Invalid field type"));
                }
            } else {
                validation_log.validation_result = false;
                validation_log
                    .error_messages
                    .push_back(String::from_str(&env, "Unexpected field in payload"));
            }
        }

        // Check for missing required fields
        for field in schema.fields.iter() {
            if field.required && !payload.encrypted_fields.contains_key(field.name.clone()) {
                validation_log.validation_result = false;
                validation_log
                    .error_messages
                    .push_back(String::from_str(&env, "Missing required field"));
            }
        }

        // Store validation log
        env.storage().persistent().set(&log_id, &validation_log);

        // If validation failed, create rejection event
        if !validation_log.validation_result {
            let rejection_id = Self::generate_rejection_id(&env, &payload.payload_id);
            let rejection_event = RejectionEvent {
                event_id: rejection_id,
                payload_id: payload.payload_id.clone(),
                provider_id: payload.provider_id.clone(),
                schema_id: payload.schema_id.clone(),
                rejection_reason: validation_log
                    .error_messages
                    .get(0)
                    .unwrap_or_else(|| String::from_str(&env, "Validation failed")),
                timestamp: env.ledger().timestamp(),
            };

            // Store rejection event
            env.storage().persistent().set(
                &Self::rejection_key(&env, &payload.payload_id),
                &rejection_event,
            );

            return Err(SchemaValidationError::InvalidPayload);
        }

        Ok(log_id)
    }

    /// Update an existing schema
    pub fn update_schema(
        env: Env,
        schema_id: BytesN<32>,
        org_id: Address,
        new_fields: Vec<SchemaField>,
        new_required_metadata: Vec<String>,
    ) -> Result<(), SchemaValidationError> {
        // Verify organization authorization
        org_id.require_auth();

        let mut schema =
            Self::get_schema(&env, &schema_id).ok_or(SchemaValidationError::SchemaNotFound)?;

        // Verify ownership
        if schema.org_id != org_id {
            return Err(SchemaValidationError::NotAuthorized);
        }

        // Validate new schema constraints
        if new_fields.len() > MAX_SCHEMA_FIELDS {
            return Err(SchemaValidationError::MaxFieldsExceeded);
        }

        // Update schema
        schema.fields = new_fields;
        schema.required_metadata = new_required_metadata;
        schema.updated_at = env.ledger().timestamp();

        // Store updated schema
        env.storage().persistent().set(&schema_id, &schema);

        Ok(())
    }

    /// Deactivate a schema
    pub fn deactivate_schema(
        env: Env,
        schema_id: BytesN<32>,
        org_id: Address,
    ) -> Result<(), SchemaValidationError> {
        // Verify organization authorization
        org_id.require_auth();

        let mut schema =
            Self::get_schema(&env, &schema_id).ok_or(SchemaValidationError::SchemaNotFound)?;

        // Verify ownership
        if schema.org_id != org_id {
            return Err(SchemaValidationError::NotAuthorized);
        }

        // Deactivate schema
        schema.is_active = false;
        schema.updated_at = env.ledger().timestamp();

        // Store updated schema
        env.storage().persistent().set(&schema_id, &schema);

        // Remove from active schemas
        let mut active_schemas: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "active_schemas"))
            .unwrap_or_else(|| Vec::new(&env));

        let mut updated = Vec::new(&env);
        for id in active_schemas.iter() {
            if id != schema_id {
                updated.push_back(id);
            }
        }
        active_schemas = updated;

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "active_schemas"), &active_schemas);

        Ok(())
    }

    /// Get schema details
    pub fn get_schema_details(
        env: Env,
        schema_id: BytesN<32>,
    ) -> Result<DataSchema, SchemaValidationError> {
        Self::get_schema(&env, &schema_id).ok_or(SchemaValidationError::SchemaNotFound)
    }

    /// Get all schemas for an organization
    pub fn get_org_schemas(env: Env, org_id: Address) -> Vec<BytesN<32>> {
        let org_schemas_key = Self::org_schemas_key(&env, &org_id);
        env.storage()
            .persistent()
            .get(&org_schemas_key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get validation log for a payload
    pub fn get_validation_log(env: Env, payload_id: BytesN<32>) -> Option<ValidationLog> {
        // Find log by payload_id (simplified approach)
        // In production, you'd maintain an index
        let logs_key = Symbol::new(&env, "validation_logs");
        if let Some(logs) = env
            .storage()
            .persistent()
            .get::<_, Vec<BytesN<32>>>(&logs_key)
        {
            for log_id in logs.iter() {
                if let Some(log) = env.storage().persistent().get::<_, ValidationLog>(&log_id) {
                    if log.payload_id == payload_id {
                        return Some(log);
                    }
                }
            }
        }
        None
    }

    /// Get rejection event for a payload
    pub fn get_rejection_event(env: Env, payload_id: BytesN<32>) -> Option<RejectionEvent> {
        env.storage()
            .persistent()
            .get(&Self::rejection_key(&env, &payload_id))
    }

    // Helper functions

    fn generate_schema_id(
        env: &Env,
        org_id: &Address,
        name: &String,
        version: &String,
    ) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&org_id.clone().to_xdr(env));
        combined.append(&name.clone().to_xdr(env));
        combined.append(&version.clone().to_xdr(env));
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn generate_log_id(env: &Env, payload_id: &BytesN<32>) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&Bytes::from(payload_id));
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn generate_rejection_id(env: &Env, payload_id: &BytesN<32>) -> BytesN<32> {
        let mut combined = Bytes::new(env);
        combined.append(&Bytes::from(payload_id));
        combined.extend_from_array(b"rejection");
        combined.extend_from_array(&env.ledger().timestamp().to_be_bytes());
        env.crypto().sha256(&combined)
    }

    fn get_schema(env: &Env, schema_id: &BytesN<32>) -> Option<DataSchema> {
        env.storage().persistent().get(schema_id)
    }

    fn create_field_map(env: &Env, fields: &Vec<SchemaField>) -> Map<String, SchemaField> {
        let mut field_map = Map::new(env);
        for field in fields.iter() {
            field_map.set(field.name.clone(), field.clone());
        }
        field_map
    }

    fn validate_encrypted_field_type(field_type: SchemaFieldType, _encrypted_data: &Bytes) -> bool {
        // Basic validation - in production, you'd have more sophisticated checks
        // For encrypted data, we mainly check that data exists and has reasonable length
        match field_type {
            SchemaFieldType::EncryptedString
            | SchemaFieldType::EncryptedInteger
            | SchemaFieldType::EncryptedFloat => !_encrypted_data.is_empty(),
            _ => false, // Non-encrypted types shouldn't be in encrypted fields
        }
    }

    /// Storage key for an organization's schema list: `org_schemas_ || org_id`.
    fn org_schemas_key(env: &Env, org_id: &Address) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"org_schemas_");
        key.append(&org_id.clone().to_xdr(env));
        key
    }

    /// Storage key for a rejection event: `rejection_ || payload_id`.
    fn rejection_key(env: &Env, payload_id: &BytesN<32>) -> Bytes {
        let mut key = Bytes::new(env);
        key.extend_from_array(b"rejection_");
        key.append(&Bytes::from(payload_id));
        key
    }
}
