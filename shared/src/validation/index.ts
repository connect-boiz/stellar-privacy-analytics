import { z } from "zod";
import {
  PrivacyLevel,
  DataType,
  AnonymizationTechnique,
  PrivacySettings,
  DataField,
  DataSchema,
} from "../types/privacy";
import {
  AnalysisType,
  VisualizationType,
  AggregationType,
  NoiseMechanism,
  AnonymizationLevel,
  AnalysisStatus,
  AnalysisParameters,
  XRayAnalysis,
  VisualizationConfig,
} from "../types/analytics";

// Privacy Settings Validation
export const PrivacySettingsSchema = z.object({
  level: z.nativeEnum(PrivacyLevel),
  dataRetentionDays: z.number().min(1).max(3650),
  allowDataExport: z.boolean(),
  allowSharing: z.boolean(),
  differentialPrivacyEpsilon: z.number().min(0.01).max(10),
  minimumParticipants: z.number().min(2),
  anonymizationTechnique: z.nativeEnum(AnonymizationTechnique),
});

// Data Field Validation
export const DataFieldSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.nativeEnum(DataType),
  required: z.boolean(),
  sensitive: z.boolean(),
  encryptionRequired: z.boolean(),
  validationRules: z
    .array(
      z.object({
        type: z.enum(["range", "pattern", "enum", "length"]),
        value: z.any(),
        message: z.string(),
      }),
    )
    .optional(),
});

// Data Schema Validation
export const DataSchemaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  fields: z.array(DataFieldSchema),
  privacySettings: PrivacySettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Analysis Parameters Validation
export const AnalysisParametersSchema = z.object({
  fields: z.array(z.string()).min(1),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "contains",
        ]),
        value: z.any(),
      }),
    )
    .optional(),
  groupBy: z.array(z.string()).optional(),
  aggregations: z.array(z.nativeEnum(AggregationType)).optional(),
  timeRange: z
    .object({
      start: z.date(),
      end: z.date(),
    })
    .optional(),
  privacyBudget: z.number().min(0.01).max(10),
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
    noiseMechanism: z.nativeEnum(NoiseMechanism),
    anonymizationLevel: z.nativeEnum(AnonymizationLevel),
  }),
  status: z.nativeEnum(AnalysisStatus),
  results: z.any().optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
});

// Visualization Config Validation
export const VisualizationConfigSchema = z.object({
  type: z.nativeEnum(VisualizationType),
  title: z.string().min(1).max(255),
  dataSource: z.string(),
  config: z.record(z.any()),
  privacyAnnotations: z
    .array(
      z.object({
        type: z.enum(["noise_level", "sample_size", "confidence_interval"]),
        message: z.string(),
        level: z.enum(["info", "warning", "error"]),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types (QI-039)
//
// Canonical, schema-derived types so consumers never re-declare a shape by
// hand. None of the schemas above use transforms/coercion, so the inferred
// output type (`z.infer`) is identical to the input type.
//
// The plain domain names (`PrivacySettings`, `DataSchema`, ...) are already
// exported as hand-written interfaces from `../types/*` and re-exported through
// the package barrel, so these inferred aliases use a `Validated` prefix to
// stay collision-free while remaining unambiguously the schema's source of
// truth. The drift guards below fail `tsc --noEmit` if a schema and its
// canonical interface ever diverge.
// ---------------------------------------------------------------------------
export type ValidatedPrivacySettings = z.infer<typeof PrivacySettingsSchema>;
export type ValidatedDataField = z.infer<typeof DataFieldSchema>;
export type ValidatedDataSchema = z.infer<typeof DataSchemaSchema>;
export type ValidatedAnalysisParameters = z.infer<
  typeof AnalysisParametersSchema
>;
export type ValidatedXRayAnalysis = z.infer<typeof XRayAnalysisSchema>;
export type ValidatedVisualizationConfig = z.infer<
  typeof VisualizationConfigSchema
>;

// --- Compile-time drift guards --------------------------------------------
// `Expect<...>` only accepts `true`, so a divergence collapses the argument to
// `false` and raises a type error under `tsc --noEmit`, keeping each schema in
// step with its canonical domain interface.
//
// The invariant asserted is: every canonical domain object is a valid instance
// of the schema-inferred type. (Exact bidirectional equality is intentionally
// not used: `z.any()` fields such as `validationRules[].value` are inferred as
// optional, which never exactly equals a required interface field even though
// the shapes are compatible.) This catches the realistic drifts — a schema
// adding/renaming a required field, or changing a field's/enum's type.
type Expect<T extends true> = T;
type CanonicalIsValid<Canonical, Validated> = [Canonical] extends [Validated]
  ? true
  : false;

/* eslint-disable @typescript-eslint/no-unused-vars -- guards exist only for their compile-time check */
type _GuardPrivacySettings = Expect<
  CanonicalIsValid<PrivacySettings, ValidatedPrivacySettings>
>;
type _GuardDataField = Expect<CanonicalIsValid<DataField, ValidatedDataField>>;
type _GuardDataSchema = Expect<
  CanonicalIsValid<DataSchema, ValidatedDataSchema>
>;
type _GuardVisualizationConfig = Expect<
  CanonicalIsValid<VisualizationConfig, ValidatedVisualizationConfig>
>;
type _GuardAnalysisParameters = Expect<
  CanonicalIsValid<AnalysisParameters, ValidatedAnalysisParameters>
>;
type _GuardXRayAnalysis = Expect<
  CanonicalIsValid<XRayAnalysis, ValidatedXRayAnalysis>
>;
/* eslint-enable @typescript-eslint/no-unused-vars */

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
        return typeof value === "number" && !isNaN(value);
      case DataType.CATEGORICAL:
        return typeof value === "string" && value.length > 0;
      case DataType.TEXT:
        return typeof value === "string";
      case DataType.TEMPORAL:
        return value instanceof Date || !isNaN(Date.parse(value));
      case DataType.GEOGRAPHICAL:
        return (
          typeof value === "object" &&
          value !== null &&
          "latitude" in value &&
          "longitude" in value &&
          typeof value.latitude === "number" &&
          typeof value.longitude === "number"
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
    public code?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PrivacyValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field, "PRIVACY_VALIDATION_ERROR");
    this.name = "PrivacyValidationError";
  }
}

export class DataValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field, "DATA_VALIDATION_ERROR");
    this.name = "DataValidationError";
  }
}
