import { SchemaConfig, SchemaField, TestResult } from '../components/SchemaBuilder/SchemaBuilder';

export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  testData: Record<string, any>;
  executionTime: number;
}

export interface ValidationError {
  field?: string;
  code: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  field?: string;
  code: string;
  message: string;
  severity: 'warning';
}

export interface ValidationRule {
  name: string;
  description: string;
  validate: (field: SchemaField, value: any) => ValidationError | null;
}

export class SchemaValidator {
  private rules: Map<string, ValidationRule[]> = new Map();

  constructor() {
    this.initializeRules();
  }

  /**
   * Validate schema with test data
   */
  async validateSchema(schema: SchemaConfig): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      // Generate test data
      const testData = this.generateTestData(schema);
      
      // Validate the test data against the schema
      const validationErrors: ValidationError[] = [];
      const validationWarnings: ValidationWarning[] = [];

      // Validate each field
      for (const field of schema.fields) {
        const fieldValue = testData[field.name];
        
        if (fieldValue === undefined) {
          if (field.required) {
            validationErrors.push({
              field: field.name,
              code: 'REQUIRED_FIELD_MISSING',
              message: `Required field '${field.name}' is missing`,
              severity: 'error'
            });
          }
          continue;
        }

        // Apply validation rules for this field type
        const fieldRules = this.rules.get(field.type) || [];
        
        for (const rule of fieldRules) {
          const error = rule.validate(field, fieldValue);
          if (error) {
            if (error.severity === 'error') {
              validationErrors.push(error);
            } else {
              validationWarnings.push({
                field: error.field,
                code: error.code,
                message: error.message,
                severity: 'warning'
              });
            }
          }
        }

        // Validate field-specific constraints
        this.validateFieldConstraints(field, fieldValue, validationErrors, validationWarnings);
      }

      // Check for unknown fields
      const knownFieldNames = new Set(schema.fields.map(f => f.name));
      for (const dataFieldName of Object.keys(testData)) {
        if (!knownFieldNames.has(dataFieldName)) {
          validationWarnings.push({
            code: 'UNKNOWN_FIELD',
            message: `Unknown field '${dataFieldName}' found in test data`,
            severity: 'warning'
          });
        }
      }

      // Validate schema-level constraints
      this.validateSchemaConstraints(schema, testData, validationErrors, validationWarnings);

      const executionTime = Date.now() - startTime;

      return {
        success: validationErrors.length === 0,
        errors: validationErrors,
        warnings: validationWarnings,
        testData,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: error.message,
          severity: 'error'
        }],
        warnings: [],
        testData: {},
        executionTime
      };
    }
  }

  /**
   * Validate field constraints
   */
  private validateFieldConstraints(
    field: SchemaField, 
    value: any, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field: field.name,
            code: 'TYPE_MISMATCH',
            message: `Field '${field.name}' must be a string, got ${typeof value}`,
            severity: 'error'
          });
          return;
        }

        // Validate pattern if specified
        if (field.constraints.pattern) {
          try {
            const regex = new RegExp(field.constraints.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: field.name,
                code: 'PATTERN_MISMATCH',
                message: `Field '${field.name}' does not match pattern: ${field.constraints.pattern}`,
                severity: 'error'
              });
            }
          } catch (regexError) {
            errors.push({
              field: field.name,
              code: 'INVALID_PATTERN',
              message: `Invalid pattern for field '${field.name}': ${field.constraints.pattern}`,
              severity: 'error'
            });
          }
        }

        // Validate string length
        if (value.length === 0 && field.required) {
          errors.push({
            field: field.name,
            code: 'EMPTY_STRING',
            message: `Field '${field.name}' cannot be empty`,
            severity: 'error'
          });
        }

        if (value.length > 10000) {
          warnings.push({
            field: field.name,
            code: 'LONG_STRING',
            message: `Field '${field.name}' is very long (${value.length} characters)`,
            severity: 'warning'
          });
        }
        break;

      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push({
            field: field.name,
            code: 'TYPE_MISMATCH',
            message: `Field '${field.name}' must be an integer, got ${typeof value}`,
            severity: 'error'
          });
          return;
        }

        const intValue = value as number;

        // Validate minimum value
        if (field.constraints.min !== undefined && intValue < field.constraints.min) {
          errors.push({
            field: field.name,
            code: 'MIN_VALUE_VIOLATION',
            message: `Field '${field.name}' value ${intValue} is below minimum ${field.constraints.min}`,
            severity: 'error'
          });
        }

        // Validate maximum value
        if (field.constraints.max !== undefined && intValue > field.constraints.max) {
          errors.push({
            field: field.name,
            code: 'MAX_VALUE_VIOLATION',
            message: `Field '${field.name}' value ${intValue} is above maximum ${field.constraints.max}`,
            severity: 'error'
          });
        }

        // Check for reasonable range
        if (intValue > Number.MAX_SAFE_INTEGER) {
          warnings.push({
            field: field.name,
            code: 'LARGE_INTEGER',
            message: `Field '${field.name}' value ${intValue} is very large`,
            severity: 'warning'
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: field.name,
            code: 'TYPE_MISMATCH',
            message: `Field '${field.name}' must be a boolean, got ${typeof value}`,
            severity: 'error'
          });
        }
        break;

      case 'enum':
        if (typeof value !== 'string') {
          errors.push({
            field: field.name,
            code: 'TYPE_MISMATCH',
            message: `Field '${field.name}' must be a string for enum type, got ${typeof value}`,
            severity: 'error'
          });
          return;
        }

        const enumValues = field.constraints.enumValues || [];
        if (!enumValues.includes(value)) {
          errors.push({
            field: field.name,
            code: 'INVALID_ENUM_VALUE',
            message: `Field '${field.name}' value '${value}' is not in enum: [${enumValues.join(', ')}]`,
            severity: 'error'
          });
        }

        // Check for empty enum values
        if (enumValues.length === 0) {
          warnings.push({
            field: field.name,
            code: 'EMPTY_ENUM',
            message: `Field '${field.name}' has no enum values defined`,
            severity: 'warning'
          });
        }
        break;
    }
  }

  /**
   * Validate schema-level constraints
   */
  private validateSchemaConstraints(
    schema: SchemaConfig, 
    testData: Record<string, any>, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Check for schema name
    if (!schema.name || schema.name.trim() === '') {
      errors.push({
        code: 'SCHEMA_NAME_MISSING',
        message: 'Schema name is required',
        severity: 'error'
      });
    }

    // Check for empty schema
    if (schema.fields.length === 0) {
      errors.push({
        code: 'EMPTY_SCHEMA',
        message: 'Schema must have at least one field',
        severity: 'error'
      });
    }

    // Check for duplicate field names
    const fieldNames = schema.fields.map(f => f.name);
    const duplicateNames = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    
    if (duplicateNames.length > 0) {
      errors.push({
        code: 'DUPLICATE_FIELD_NAMES',
        message: `Duplicate field names found: [${[...new Set(duplicateNames)].join(', ')}]`,
        severity: 'error'
      });
    }

    // Check for invalid field names
    const invalidFieldNames = fieldNames.filter(name => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));
    if (invalidFieldNames.length > 0) {
      warnings.push({
        code: 'INVALID_FIELD_NAMES',
        message: `Field names should follow naming conventions: [${invalidFieldNames.join(', ')}]`,
        severity: 'warning'
      });
    }

    // Check for too many fields
    if (schema.fields.length > 100) {
      warnings.push({
        code: 'MANY_FIELDS',
        message: `Schema has ${schema.fields.length} fields, consider breaking it down`,
        severity: 'warning'
      });
    }
  }

  /**
   * Generate test data based on schema
   */
  private generateTestData(schema: SchemaConfig): Record<string, any> {
    const testData: Record<string, any> = {};
    
    for (const field of schema.fields) {
      switch (field.type) {
        case 'string':
          testData[field.name] = this.generateStringTestValue(field);
          break;
        case 'integer':
          testData[field.name] = this.generateIntegerTestValue(field);
          break;
        case 'boolean':
          testData[field.name] = Math.random() > 0.5;
          break;
        case 'enum':
          testData[field.name] = this.generateEnumTestValue(field);
          break;
        default:
          testData[field.name] = null;
          break;
      }
    }
    
    return testData;
  }

  /**
   * Generate string test value
   */
  private generateStringTestValue(field: SchemaField): string {
    if (field.constraints.pattern) {
      // For patterns, generate a simple test string
      return 'test_string';
    }
    
    if (field.description) {
      return field.description;
    }
    
    return field.name;
  }

  /**
   * Generate integer test value
   */
  private generateIntegerTestValue(field: SchemaField): number {
    const min = field.constraints.min || 0;
    const max = field.constraints.max || min + 100;
    
    // Generate a value within the valid range
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * Generate enum test value
   */
  private generateEnumTestValue(field: SchemaField): string {
    const enumValues = field.constraints.enumValues || [];
    
    if (enumValues.length === 0) {
      return 'test_enum_value';
    }
    
    return enumValues[0];
  }

  /**
   * Initialize validation rules
   */
  private initializeRules(): void {
    // String validation rules
    this.rules.set('string', [
      {
        name: 'String Type Check',
        description: 'Ensure the value is a string',
        validate: (field, value) => {
          if (typeof value !== 'string') {
            return {
              field: field.name,
              code: 'TYPE_MISMATCH',
              message: `Expected string, got ${typeof value}`,
              severity: 'error'
            };
          }
          return null;
        }
      },
      {
        name: 'String Length Check',
        description: 'Check string length is reasonable',
        validate: (field, value) => {
          if (typeof value === 'string' && value.length > 10000) {
            return {
              field: field.name,
              code: 'LONG_STRING',
              message: `String is very long (${value.length} characters)`,
              severity: 'warning'
            };
          }
          return null;
        }
      }
    ]);

    // Integer validation rules
    this.rules.set('integer', [
      {
        name: 'Integer Type Check',
        description: 'Ensure the value is an integer',
        validate: (field, value) => {
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            return {
              field: field.name,
              code: 'TYPE_MISMATCH',
              message: `Expected integer, got ${typeof value}`,
              severity: 'error'
            };
          }
          return null;
        }
      },
      {
        name: 'Integer Range Check',
        description: 'Check integer is within safe range',
        validate: (field, value) => {
          if (typeof value === 'number' && value > Number.MAX_SAFE_INTEGER) {
            return {
              field: field.name,
              code: 'LARGE_INTEGER',
              message: `Integer is very large (${value})`,
              severity: 'warning'
            };
          }
          return null;
        }
      }
    ]);

    // Boolean validation rules
    this.rules.set('boolean', [
      {
        name: 'Boolean Type Check',
        description: 'Ensure the value is a boolean',
        validate: (field, value) => {
          if (typeof value !== 'boolean') {
            return {
              field: field.name,
              code: 'TYPE_MISMATCH',
              message: `Expected boolean, got ${typeof value}`,
              severity: 'error'
            };
          }
          return null;
        }
      }
    ]);

    // Enum validation rules
    this.rules.set('enum', [
      {
        name: 'Enum Type Check',
        description: 'Ensure the value is a string for enum',
        validate: (field, value) => {
          if (typeof value !== 'string') {
            return {
              field: field.name,
              code: 'TYPE_MISMATCH',
              message: `Expected string for enum, got ${typeof value}`,
              severity: 'error'
            };
          }
          return null;
        }
      },
      {
        name: 'Enum Values Check',
        description: 'Check enum has valid values',
        validate: (field, value) => {
          const enumValues = field.constraints.enumValues || [];
          if (enumValues.length === 0) {
            return {
              field: field.name,
              code: 'EMPTY_ENUM',
              message: 'Enum has no values defined',
              severity: 'warning'
            };
          }
          return null;
        }
      }
    ]);
  }

  /**
   * Add custom validation rule
   */
  addRule(fieldType: string, rule: ValidationRule): void {
    if (!this.rules.has(fieldType)) {
      this.rules.set(fieldType, []);
    }
    this.rules.get(fieldType)!.push(rule);
  }

  /**
   * Remove validation rule
   */
  removeRule(fieldType: string, ruleName: string): void {
    const rules = this.rules.get(fieldType);
    if (rules) {
      const index = rules.findIndex(rule => rule.name === ruleName);
      if (index >= 0) {
        rules.splice(index, 1);
      }
    }
  }

  /**
   * Get all validation rules for a field type
   */
  getRules(fieldType: string): ValidationRule[] {
    return this.rules.get(fieldType) || [];
  }

  /**
   * Validate single field value
   */
  validateFieldValue(field: SchemaField, value: any): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    this.validateFieldConstraints(field, value, errors, warnings);

    return { errors, warnings };
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalRules: number;
    rulesByType: Record<string, number>;
  } {
    const stats = {
      totalRules: 0,
      rulesByType: {} as Record<string, number>
    };

    for (const [fieldType, rules] of this.rules) {
      stats.rulesByType[fieldType] = rules.length;
      stats.totalRules += rules.length;
    }

    return stats;
  }
}

export default SchemaValidator;
