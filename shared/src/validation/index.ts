import { z } from 'zod';
import { PrivacyLevel, DataType, AnonymizationTechnique } from '../types/privacy';
import { AnalysisType, VisualizationType } from '../types/analytics';

// Privacy Settings Validation
export const PrivacySettingsSchema = z.object({
  level: z.nativeEnum(PrivacyLevel),
  dataRetentionDays: z.number().min(1).max(3650),
  allowDataExport: z.boolean(),
  allowSharing: z.boolean(),
  differentialPrivacyEpsilon: z.number().min(0.01).max(10),
  minimumParticipants: z.number().min(2),
  anonymizationTechnique: z.nativeEnum(AnonymizationTechnique)
});

// Data Field Validation
export const DataFieldSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.nativeEnum(DataType),
  required: z.boolean(),
  sensitive: z.boolean(),
  encryptionRequired: z.boolean(),
  validationRules: z.array(z.object({
    type: z.enum(['range', 'pattern', 'enum', 'length']),
    value: z.any(),
    message: z.string()
  })).optional()
});

// Data Schema Validation
export const DataSchemaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  fields: z.array(DataFieldSchema),
  privacySettings: PrivacySettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

// Analysis Parameters Validation
export const AnalysisParametersSchema = z.object({
  fields: z.array(z.string()).min(1),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
    value: z.any()
  })).optional(),
  groupBy: z.array(z.string()).optional(),
  aggregations: z.array(z.enum(['count', 'sum', 'average', 'median', 'min', 'max', 'std_dev'])).optional(),
  timeRange: z.object({
    start: z.date(),
    end: z.date()
  }).optional(),
  privacyBudget: z.number().min(0.01).max(10)
});

// X-Ray Analysis Validation
export const XRayAnalysisSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000),
  type: z.nativeEnum(AnalysisType),
  parameters: AnalysisParametersSchema,
  privacySettings: z.object({
    differentialPrivacyEpsilon: z.number().min(0.01).max(10),
    minimumSampleSize: z.number().min(2),
    noiseMechanism: z.enum(['laplace', 'gaussian', 'exponential']),
    anonymizationLevel: z.enum(['none', 'low', 'medium', 'high'])
  }),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  results: z.any().optional(),
  createdAt: z.date(),
  completedAt: z.date().optional()
});

// Visualization Config Validation
export const VisualizationConfigSchema = z.object({
  type: z.nativeEnum(VisualizationType),
  title: z.string().min(1).max(255),
  dataSource: z.string(),
  config: z.record(z.any()),
  privacyAnnotations: z.array(z.object({
    type: z.enum(['noise_level', 'sample_size', 'confidence_interval']),
    message: z.string(),
    level: z.enum(['info', 'warning', 'error'])
  })).optional()
});

// Validation Utilities
export class ValidationService {
  /**
   * Validates privacy settings
   */
  static validatePrivacySettings(settings: unknown) {
    return PrivacySettingsSchema.safeParse(settings);
  }

  /**
   * Validates data schema
   */
  static validateDataSchema(schema: unknown) {
    return DataSchemaSchema.safeParse(schema);
  }

  /**
   * Validates analysis parameters
   */
  static validateAnalysisParameters(params: unknown) {
    return AnalysisParametersSchema.safeParse(params);
  }

  /**
   * Validates X-Ray analysis
   */
  static validateXRayAnalysis(analysis: unknown) {
    return XRayAnalysisSchema.safeParse(analysis);
  }

  /**
   * Validates visualization config
   */
  static validateVisualizationConfig(config: unknown) {
    return VisualizationConfigSchema.safeParse(config);
  }

  /**
   * Custom validation for data values based on field type
   */
  static validateDataValue(value: any, fieldType: DataType): boolean {
    switch (fieldType) {
      case DataType.NUMERICAL:
        return typeof value === 'number' && !isNaN(value);
      case DataType.CATEGORICAL:
        return typeof value === 'string' && value.length > 0;
      case DataType.TEXT:
        return typeof value === 'string';
      case DataType.TEMPORAL:
        return value instanceof Date || !isNaN(Date.parse(value));
      case DataType.GEOGRAPHICAL:
        return (
          typeof value === 'object' &&
          value !== null &&
          'latitude' in value &&
          'longitude' in value &&
          typeof value.latitude === 'number' &&
          typeof value.longitude === 'number'
        );
      default:
        return false;
    }
  }

  /**
   * Validates privacy budget constraints
   */
  static validatePrivacyBudget(requested: number, remaining: number): boolean {
    return requested <= remaining && requested > 0;
  }

  /**
   * Validates minimum sample size requirements
   */
  static validateSampleSize(sampleSize: number, minimum: number): boolean {
    return sampleSize >= minimum;
  }

  /**
   * Validates epsilon values for differential privacy
   */
  static validateEpsilon(epsilon: number): boolean {
    return epsilon > 0 && epsilon <= 10;
  }
}

// Error Types
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PrivacyValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field, 'PRIVACY_VALIDATION_ERROR');
    this.name = 'PrivacyValidationError';
  }
}

export class DataValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field, 'DATA_VALIDATION_ERROR');
    this.name = 'DataValidationError';
  }
}
