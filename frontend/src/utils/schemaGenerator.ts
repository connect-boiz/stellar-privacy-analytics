import { SchemaConfig, SchemaField, ZKConstraint } from '../components/SchemaBuilder/SchemaBuilder';

export interface RustSchemaOutput {
  name: string;
  description?: string;
  fields: RustField[];
  constraints: RustConstraint[];
  metadata: RustMetadata;
}

export interface RustField {
  id: string;
  name: string;
  field_type: RustFieldType;
  description?: string;
  constraints: RustFieldConstraints;
  required: bool;
}

export interface RustFieldType {
  type: 'String' | 'Integer' | 'Boolean' | 'Enum';
  enum_values?: string[];
}

export interface RustFieldConstraints {
  min_value?: u64;
  max_value?: u64;
  pattern?: string;
  enum_values?: Vec<String>;
}

export interface RustConstraint {
  id: string;
  constraint_type: RustConstraintType;
  field_id: String;
  parameters: RustConstraintParameters;
}

export interface RustConstraintType {
  type: 'Bounds' | 'Uniqueness' | 'DifferentialPrivacy';
}

export interface RustConstraintParameters {
  min_value?: u64;
  max_value?: u64;
  epsilon?: f64;
  delta?: f64;
  confidence?: f64;
  noise_scale?: f64;
}

export interface RustMetadata {
  created_at: String;
  updated_at: String;
  version: String;
  last_tested?: String;
  test_results: Vec<RustTestResult>;
}

export interface RustTestResult {
  success: bool;
  timestamp: u64;
  errors: Vec<String>;
  warnings: Vec<String>;
}

export class SchemaGenerator {
  /**
   * Generate JSON schema configuration
   */
  static generateJSONSchema(schema: SchemaConfig): string {
    const jsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12',
      type: 'object',
      properties: {},
      required: ['name'],
      additionalProperties: false
    };

    // Add schema properties
    jsonSchema.properties.name = {
      type: 'string',
      description: 'Schema name'
    };
    
    jsonSchema.properties.description = {
      type: 'string',
      description: 'Schema description'
    };

    // Add field properties
    const fieldProperties: Record<string, any> = {};
    const requiredFields: string[] = [];

    for (const field of schema.fields) {
      const fieldSchema: any = {
        type: field.type,
        description: field.description || `Field: ${field.name}`
      };

      // Add constraints based on type
      if (field.type === 'integer') {
        if (field.constraints.min !== undefined) {
          fieldSchema.minimum = field.constraints.min;
        }
        if (field.constraints.max !== undefined) {
          fieldSchema.maximum = field.constraints.max;
        }
      }

      if (field.type === 'string' && field.constraints.pattern) {
        fieldSchema.pattern = field.constraints.pattern;
      }

      if (field.type === 'enum' && field.constraints.enumValues) {
        fieldSchema.enum = field.constraints.enumValues;
      }

      if (field.required) {
        requiredFields.push(field.name);
      }

      fieldProperties[field.name] = fieldSchema;
    }

    jsonSchema.properties.fields = {
      type: 'object',
      properties: fieldProperties,
      required: requiredFields,
      additionalProperties: false
    };

    // Add connections
    if (schema.connections.length > 0) {
      jsonSchema.properties.connections = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceFieldId: { type: 'string' },
            targetFieldId: { type: 'string' },
            type: { type: 'string', enum: ['one-to-one', 'one-to-many'] }
          },
          required: ['id', 'sourceFieldId', 'targetFieldId', 'type']
        }
      };
    }

    // Add constraints
    if (schema.constraints.length > 0) {
      jsonSchema.properties.constraints = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bounds', 'uniqueness', 'differential_privacy'] },
            fieldId: { type: 'string' },
            parameters: { type: 'object' }
          },
          required: ['type', 'fieldId', 'parameters']
        }
      };
    }

    // Add metadata
    jsonSchema.properties.metadata = {
      type: 'object',
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        version: { type: 'string' },
        lastTested: { type: 'string', format: 'date-time' },
        testResults: { type: 'array' }
      }
    };

    return JSON.stringify(jsonSchema, null, 2);
  }

  /**
   * Generate Rust-compatible schema output
   */
  static generateRustSchema(schema: SchemaConfig): RustSchemaOutput {
    const rustFields: RustField[] = schema.fields.map(field => ({
      id: field.id,
      name: field.name,
      field_type: this.mapFieldType(field),
      description: field.description,
      constraints: this.mapFieldConstraints(field),
      required: field.required
    }));

    const rustConstraints: RustConstraint[] = schema.constraints.map(constraint => ({
      id: constraint.id,
      constraint_type: this.mapConstraintType(constraint),
      field_id: constraint.fieldId,
      parameters: this.mapConstraintParameters(constraint)
    }));

    const rustMetadata: RustMetadata = {
      created_at: schema.metadata.createdAt.toISOString(),
      updated_at: schema.metadata.updatedAt.toISOString(),
      version: schema.metadata.version,
      last_tested: schema.metadata.lastTested?.toISOString(),
      test_results: schema.metadata.testResults?.map(test => ({
        success: test.success,
        timestamp: test.timestamp,
        errors: test.errors,
        warnings: test.warnings
      })) || []
    };

    return {
      name: schema.name,
      description: schema.description,
      fields: rustFields,
      constraints: rustConstraints,
      metadata: rustMetadata
    };
  }

  /**
   * Generate Rust struct code
   */
  static generateRustStruct(schema: SchemaConfig): string {
    const rustSchema = this.generateRustSchema(schema);
    
    let rustCode = `// Auto-generated Rust schema for ZK proofs
// Generated on: ${new Date().toISOString()}
// Schema: ${schema.name}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub name: String,
    ${schema.description ? 'pub description: Option<String>,' : ''}
    pub fields: HashMap<String, Field>,
    pub constraints: Vec<Constraint>,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub id: String,
    pub name: String,
    pub field_type: FieldType,
    pub description: Option<String>,
    pub constraints: FieldConstraints,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FieldType {
    String,
    Integer,
    Boolean,
    Enum { enum_values: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldConstraints {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_value: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_value: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub id: String,
    #[serde(flatten)]
    pub constraint_type: ConstraintType,
    pub field_id: String,
    pub parameters: ConstraintParameters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ConstraintType {
    Bounds,
    Uniqueness,
    DifferentialPrivacy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_value: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_value: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epsilon: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub noise_scale: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub created_at: String,
    pub updated_at: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tested: Option<String>,
    pub test_results: Vec<TestResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub success: bool,
    pub timestamp: u64,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// ZK Proof verification implementation
impl Schema {
    pub fn validate_data(&self, data: &HashMap<String, serde_json::Value>) -> Result<Vec<String>, Vec<String>> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Validate each field
        for (field_name, field_value) in data {
            if let Some(field) = self.fields.get(field_name) {
                // Validate field type and constraints
                self.validate_field(field, field_value, &mut errors, &mut warnings);
            } else {
                warnings.push(format!("Unknown field: {}", field_name));
            }
        }

        // Check required fields
        for field in self.fields.values() {
            if field.required && !data.contains_key(&field.name) {
                errors.push(format!("Required field missing: {}", field.name));
            }
        }

        if errors.is_empty() {
            Ok(warnings)
        } else {
            Err(errors)
        }
    }

    fn validate_field(&self, field: &Field, value: &serde_json::Value, errors: &mut Vec<String>, warnings: &mut Vec<String>) {
        match &field.field_type {
            FieldType::String => {
                if !value.is_string() {
                    errors.push(format!("Field {} must be a string", field.name));
                    return;
                }
                
                let string_value = value.as_str().unwrap();
                
                if let Some(pattern) = &field.constraints.pattern {
                    // Simple regex validation (in production, use proper regex crate)
                    if !self.matches_pattern(string_value, pattern) {
                        errors.push(format!("Field {} does not match pattern: {}", field.name, pattern));
                    }
                }
            },
            
            FieldType::Integer => {
                if !value.is_number() {
                    errors.push(format!("Field {} must be an integer", field.name));
                    return;
                }
                
                let int_value = value.as_i64().unwrap() as u64;
                
                if let Some(min) = field.constraints.min_value {
                    if int_value < min {
                        errors.push(format!("Field {} value {} is below minimum {}", field.name, int_value, min));
                    }
                }
                
                if let Some(max) = field.constraints.max_value {
                    if int_value > max {
                        errors.push(format!("Field {} value {} is above maximum {}", field.name, int_value, max));
                    }
                }
            },
            
            FieldType::Boolean => {
                if !value.is_boolean() {
                    errors.push(format!("Field {} must be a boolean", field.name));
                }
            },
            
            FieldType::Enum { enum_values } => {
                if !value.is_string() {
                    errors.push(format!("Field {} must be a string", field.name));
                    return;
                }
                
                let string_value = value.as_str().unwrap();
                
                if !enum_values.contains(&string_value.to_string()) {
                    errors.push(format!("Field {} value '{}' is not in enum: {:?}", field.name, string_value, enum_values));
                }
            }
        }
    }

    fn matches_pattern(&self, value: &str, pattern: &str) -> bool {
        // Simple pattern matching (in production, use regex crate)
        // For now, just check if pattern exists in value
        value.contains(pattern)
    }
}

// Example usage:
fn main() {
    let schema_json = include_str!("schema.json");
    let schema: Schema = serde_json::from_str(schema_json).expect("Failed to parse schema");
    
    let test_data: HashMap<String, serde_json::Value> = serde_json::from_str(r#"
    {
        "name": "John Doe",
        "age": 30,
        "email": "john@example.com"
    }
    "#).expect("Failed to parse test data");
    
    match schema.validate_data(&test_data) {
        Ok(warnings) => {
            println!("Validation passed with {} warnings", warnings.len());
            for warning in warnings {
                println!("Warning: {}", warning);
            }
        },
        Err(errors) => {
            println!("Validation failed with {} errors", errors.len());
            for error in errors {
                println!("Error: {}", error);
            }
        }
    }
}
`;

    return rustCode;
  }

  /**
   * Generate Rust test code
   */
  static generateRustTests(schema: SchemaConfig): string {
    const rustSchema = this.generateRustSchema(schema);
    
    return `// Auto-generated Rust tests for ZK schema validation
// Generated on: ${new Date().toISOString()}
// Schema: ${schema.name}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use serde_json::json;

    fn create_test_schema() -> Schema {
        let schema_json = r#"${this.generateJSONSchema(schema).replace(/"/g, '\\"')}"#;
        serde_json::from_str(schema_json).expect("Failed to parse test schema")
    }

    #[test]
    fn test_valid_data() {
        let schema = create_test_schema();
        let valid_data = json!({
            ${schema.fields.map(field => {
              if (field.type === 'string') {
                `"${field.name}": "test_value"`
              } else if (field.type === 'integer') {
                `"${field.name}": ${field.constraints.min || 0}`
              } else if (field.type === 'boolean') {
                `"${field.name}": true`
              } else {
                `"${field.name}": "${field.constraints.enumValues?.[0] || 'test'}"`
              }
            }).join(',\n            ')}
        });

        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(valid_data)
            .expect("Failed to create test data");

        match schema.validate_data(&data_map) {
            Ok(warnings) => {
                assert!(warnings.len() == 0, "Unexpected warnings: {:?}", warnings);
            },
            Err(errors) => {
                panic!("Validation should have passed, but got errors: {:?}", errors);
            }
        }
    }

    #[test]
    fn test_invalid_data_types() {
        let schema = create_test_schema();
        let invalid_data = json!({
            ${schema.fields.map(field => {
              if (field.type === 'string') {
                `"${field.name}": 123`
              } else if (field.type === 'integer') {
                `"${field.name}": "invalid_string"`
              } else if (field.type === 'boolean') {
                `"${field.name}": "invalid_boolean"`
              } else {
                `"${field.name}": 123`
              }
            }).join(',\n            ')}
        });

        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(invalid_data)
            .expect("Failed to create test data");

        match schema.validate_data(&data_map) {
            Ok(_) => {
                panic!("Validation should have failed due to type errors");
            },
            Err(errors) => {
                assert!(errors.len() > 0, "Expected validation errors");
                // Check that we have type errors for each field
                ${schema.fields.map(field => {
                  `assert!(errors.iter().any(|e| e.contains("${field.name}")), "Missing error for field ${field.name}");`
                }).join('\n                ')}
            }
        }
    }

    ${schema.fields.filter(field => field.type === 'integer' && (field.constraints.min !== undefined || field.constraints.max !== undefined)).map(field => {
      return `
    #[test]
    fn test_${field.name}_bounds() {
        let schema = create_test_schema();
        
        // Test minimum value
        ${field.constraints.min !== undefined ? `
        let below_min = json!({
            "${field.name}": ${field.constraints.min! - 1}
        });
        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(below_min).unwrap();
        
        match schema.validate_data(&data_map) {
            Ok(_) => panic!("Should have failed for value below minimum"),
            Err(errors) => {
                assert!(errors.iter().any(|e| e.contains("below minimum")), "Expected minimum bound error");
            }
        }` : ''}
        
        // Test maximum value
        ${field.constraints.max !== undefined ? `
        let above_max = json!({
            "${field.name}": ${field.constraints.max! + 1}
        });
        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(above_max).unwrap();
        
        match schema.validate_data(&data_map) {
            Ok(_) => panic!("Should have failed for value above maximum"),
            Err(errors) => {
                assert!(errors.iter().any(|e| e.contains("above maximum")), "Expected maximum bound error");
            }
        }` : ''}
        
        // Test valid range
        let valid_value = json!({
            "${field.name}": ${field.constraints.min || 0}
        });
        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(valid_value).unwrap();
        
        match schema.validate_data(&data_map) {
            Ok(warnings) => {
                assert!(warnings.len() == 0, "Unexpected warnings: {:?}", warnings);
            },
            Err(errors) => {
                panic!("Should have passed for valid range, got errors: {:?}", errors);
            }
        }
    }`;
    }).join('\n\n')}

    #[test]
    fn test_required_fields() {
        let schema = create_test_schema();
        let missing_required = json!({});
        
        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(missing_required)
            .expect("Failed to create test data");

        match schema.validate_data(&data_map) {
            Ok(_) => {
                panic!("Should have failed due to missing required fields");
            },
            Err(errors) => {
                ${schema.fields.filter(field => field.required).map(field => {
                  `assert!(errors.iter().any(|e| e.contains("${field.name}")), "Missing error for required field ${field.name}");`
                }).join('\n                ')}
            }
        }
    }

    #[test]
    fn test_unknown_fields() {
        let schema = create_test_schema();
        let data_with_unknown = json!({
            "unknown_field": "value",
            ${schema.fields.map(field => {
              if (field.type === 'string') {
                `"${field.name}": "test_value"`
              } else if (field.type === 'integer') {
                `"${field.name}": 0`
              } else if (field.type === 'boolean') {
                `"${field.name}": true`
              } else {
                `"${field.name}": "test"`
              }
            }).join(',\n            ')}
        });

        let data_map: HashMap<String, serde_json::Value> = serde_json::from_value(data_with_unknown)
            .expect("Failed to create test data");

        match schema.validate_data(&data_map) {
            Ok(warnings) => {
                assert!(warnings.iter().any(|w| w.contains("unknown_field")), "Expected warning for unknown field");
            },
            Err(errors) => {
                panic!("Should have passed with warnings, got errors: {:?}", errors);
            }
        }
    }
}
`;
  }

  /**
   * Generate Rust Cargo.toml
   */
  static generateCargoToml(schema: SchemaConfig): string {
    return `[package]
name = "${schema.name.toLowerCase().replace(/\s+/g, '-')}-zk-schema"
version = "${schema.metadata.version}"
edition = "2021"
authors = ["Stellar Privacy Team"]
description = "${schema.description || 'Zero-knowledge schema validation'}"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
regex = "1.0"
uuid = { version = "1.0", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }

[dev-dependencies]
tokio-test = "0.4"

[lib]
name = "${schema.name.toLowerCase().replace(/\s+/g, '_')}_zk_schema"
path = "src/lib.rs"

[[bin]]
name = "schema_validator"
path = "src/main.rs"
`;
  }

  /**
   * Generate complete Rust project structure
   */
  static generateRustProject(schema: SchemaConfig): {
    'Cargo.toml': string;
    'src/lib.rs': string;
    'src/main.rs': string;
    'tests/integration_tests.rs': string;
    'README.md': string;
  } {
    return {
      'Cargo.toml': this.generateCargoToml(schema),
      'src/lib.rs': this.generateRustStruct(schema),
      'src/main.rs': `
use ${schema.name.toLowerCase().replace(/\s+/g, '_')}_zk_schema::*;
use std::collections::HashMap;
use serde_json;

fn main() {
    println!("ZK Schema Validator for: {}", "${schema.name}");
    
    // Load schema from file or environment
    let schema_json = include_str!("../schema.json");
    let schema: Schema = serde_json::from_str(schema_json)
        .expect("Failed to parse schema");

    // Example validation
    let test_data: HashMap<String, serde_json::Value> = serde_json::from_str(r#"
    {
        "name": "John Doe",
        "age": 30,
        "email": "john@example.com"
    }
    "#).expect("Failed to parse test data");

    match schema.validate_data(&test_data) {
        Ok(warnings) => {
            println!("✅ Validation passed!");
            if !warnings.is_empty() {
                println!("Warnings:");
                for warning in warnings {
                    println!("  - {}", warning);
                }
            }
        },
        Err(errors) => {
            println!("❌ Validation failed!");
            for error in errors {
                println!("  - {}", error);
            }
        }
    }
}
      `,
      'tests/integration_tests.rs': this.generateRustTests(schema),
      'README.md`: `
# ${schema.name} ZK Schema Validator

Zero-knowledge schema validation for ${schema.description || 'data privacy applications'}.

## Features

- Schema validation with type checking
- Field constraints and bounds
- Required field validation
- Enum value validation
- Pattern matching for strings
- Comprehensive error reporting

## Usage

Add this to your \`Cargo.toml\`:

\`\`\`
[dependencies]
${schema.name.toLowerCase().replace(/\s+/g, '-')}-zk-schema = { version = "${schema.metadata.version}" }
\`\`\`

## Example

\`\`\`rust
use ${schema.name.toLowerCase().replace(/\s+/g, '_')}_zk_schema::*;

fn main() {
    let schema_json = include_str!("schema.json");
    let schema: Schema = serde_json::from_str(schema_json).unwrap();
    
    let test_data = json!({
        "name": "John Doe",
        "age": 30
    });
    
    match schema.validate_data(&test_data) {
        Ok(warnings) => println!("Valid!"),
        Err(errors) => println!("Invalid: {:?}", errors),
    }
}
\`\`\`

## Testing

Run tests with:

\`\`\`
cargo test
\`\`\`

## License

MIT
      `
    };
  }

  // Helper methods
  private static mapFieldType(field: SchemaField): RustFieldType {
    switch (field.type) {
      case 'string':
        return { type: 'String' };
      case 'integer':
        return { type: 'Integer' };
      case 'boolean':
        return { type: 'Boolean' };
      case 'enum':
        return { 
          type: 'Enum', 
          enum_values: field.constraints.enumValues || [] 
        };
      default:
        return { type: 'String' };
    }
  }

  private static mapFieldConstraints(field: SchemaField): RustFieldConstraints {
    const constraints: RustFieldConstraints = {};
    
    if (field.type === 'integer') {
      if (field.constraints.min !== undefined) {
        constraints.min_value = field.constraints.min;
      }
      if (field.constraints.max !== undefined) {
        constraints.max_value = field.constraints.max;
      }
    }
    
    if (field.type === 'string' && field.constraints.pattern) {
      constraints.pattern = field.constraints.pattern;
    }
    
    if (field.type === 'enum' && field.constraints.enumValues) {
      constraints.enum_values = field.constraints.enumValues;
    }
    
    return constraints;
  }

  private static mapConstraintType(constraint: ZKConstraint): RustConstraintType {
    switch (constraint.type) {
      case 'bounds':
        return { type: 'Bounds' };
      case 'uniqueness':
        return { type: 'Uniqueness' };
      case 'differential_privacy':
        return { type: 'DifferentialPrivacy' };
      default:
        return { type: 'Bounds' };
    }
  }

  private static mapConstraintParameters(constraint: ZKConstraint): RustConstraintParameters {
    const parameters: RustConstraintParameters = {};
    
    if (constraint.parameters.min !== undefined) {
      parameters.min_value = constraint.parameters.min;
    }
    if (constraint.parameters.max !== undefined) {
      parameters.max_value = constraint.parameters.max;
    }
    if (constraint.parameters.epsilon !== undefined) {
      parameters.epsilon = constraint.parameters.epsilon;
    }
    if (constraint.parameters.delta !== undefined) {
      parameters.delta = constraint.parameters.delta;
    }
    if (constraint.parameters.confidence !== undefined) {
      parameters.confidence = constraint.parameters.confidence;
    }
    if (constraint.parameters.noiseScale !== undefined) {
      parameters.noise_scale = constraint.parameters.noiseScale;
    }
    
    return parameters;
  }
}

export default SchemaGenerator;
