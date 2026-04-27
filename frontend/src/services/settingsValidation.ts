import { z } from 'zod';

/**
 * Settings validation schemas using Zod
 * Provides type-safe validation for privacy settings
 */

// Differential Privacy Parameters Schema
export const DifferentialPrivacySchema = z.object({
  epsilon: z.number()
    .min(0.01, 'Epsilon must be at least 0.01')
    .max(100, 'Epsilon must not exceed 100')
    .refine(val => val > 0, 'Epsilon must be greater than 0'),
  delta: z.number()
    .min(1e-10, 'Delta must be at least 1e-10')
    .max(0.9999999999, 'Delta must be less than 1')
    .refine(val => val > 0 && val < 1, 'Delta must be between 0 and 1 (exclusive)'),
  mechanism: z.enum(['laplace', 'gaussian']),
  sensitivity: z.number()
    .min(0.01, 'Sensitivity must be at least 0.01')
    .max(1000, 'Sensitivity must not exceed 1000')
    .refine(val => val > 0, 'Sensitivity must be greater than 0')
});

export type DifferentialPrivacySettings = z.infer<typeof DifferentialPrivacySchema>;

// Privacy Budget Schema
export const PrivacyBudgetSchema = z.object({
  totalEpsilon: z.number()
    .min(0.1, 'Total epsilon must be at least 0.1')
    .max(1000, 'Total epsilon must not exceed 1000'),
  usedEpsilon: z.number()
    .min(0, 'Used epsilon cannot be negative')
    .refine(val => val >= 0, 'Used epsilon must be non-negative'),
  remainingEpsilon: z.number()
    .min(0, 'Remaining epsilon cannot be negative')
    .refine(val => val >= 0, 'Remaining epsilon must be non-negative'),
  status: z.enum(['healthy', 'warning', 'critical'])
});

export type PrivacyBudgetSettings = z.infer<typeof PrivacyBudgetSchema>;

// Data Retention Schema
export const DataRetentionSchema = z.object({
  policyName: z.string()
    .min(1, 'Policy name is required')
    .max(100, 'Policy name must not exceed 100 characters'),
  retentionDays: z.number()
    .int('Retention days must be an integer')
    .min(1, 'Retention period must be at least 1 day')
    .max(3650, 'Retention period must not exceed 10 years'),
  dataCategories: z.array(z.string())
    .min(1, 'At least one data category is required')
    .max(50, 'Cannot exceed 50 data categories'),
  autoDelete: z.boolean(),
  lastReviewDate: z.string()
    .datetime('Invalid date format')
});

export type DataRetentionSettings = z.infer<typeof DataRetentionSchema>;

// Privacy Level Schema
export const PrivacyLevelSchema = z.object({
  id: z.string()
    .min(1, 'Privacy level ID is required'),
  name: z.string()
    .min(1, 'Privacy level name is required')
    .max(50, 'Privacy level name must not exceed 50 characters'),
  description: z.string()
    .min(1, 'Description is required')
    .max(500, 'Description must not exceed 500 characters'),
  epsilonLimit: z.number()
    .min(0.01, 'Epsilon limit must be at least 0.01')
    .max(100, 'Epsilon limit must not exceed 100'),
  deltaLimit: z.number()
    .min(1e-10, 'Delta limit must be at least 1e-10')
    .max(0.9999999999, 'Delta limit must be less than 1'),
  features: z.array(z.string())
    .min(1, 'At least one feature is required')
    .max(20, 'Cannot exceed 20 features')
});

export type PrivacyLevelSettings = z.infer<typeof PrivacyLevelSchema>;

// ZK Proof Settings Schema
export const ZKProofSettingsSchema = z.object({
  proofType: z.enum(['groth16', 'plonk', 'bulletproofs']),
  trustedSetup: z.boolean(),
  proverTimeout: z.number()
    .int('Timeout must be an integer')
    .min(1000, 'Timeout must be at least 1 second')
    .max(600000, 'Timeout must not exceed 10 minutes'),
  verificationTimeout: z.number()
    .int('Timeout must be an integer')
    .min(100, 'Timeout must be at least 100ms')
    .max(60000, 'Timeout must not exceed 1 minute')
});

export type ZKProofSettings = z.infer<typeof ZKProofSettingsSchema>;

// SMPC Settings Schema
export const SMPCSettingsSchema = z.object({
  maxParticipants: z.number()
    .int('Max participants must be an integer')
    .min(2, 'At least 2 participants required')
    .max(1000, 'Cannot exceed 1000 participants'),
  sessionTimeout: z.number()
    .int('Timeout must be an integer')
    .min(60000, 'Timeout must be at least 1 minute')
    .max(86400000, 'Timeout must not exceed 24 hours'),
  enableLogging: z.boolean(),
  compressionLevel: z.number()
    .int('Compression level must be an integer')
    .min(0, 'Compression level must be at least 0')
    .max(9, 'Compression level must not exceed 9')
});

export type SMPCSettings = z.infer<typeof SMPCSettingsSchema>;

// General Settings Schema
export const GeneralSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']),
  language: z.string()
    .min(2, 'Language code must be at least 2 characters')
    .max(10, 'Language code must not exceed 10 characters'),
  timezone: z.string()
    .min(1, 'Timezone is required'),
  notifications: z.boolean(),
  autoSync: z.boolean()
});

export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

/**
 * Validation result interface
 */
interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
}

/**
 * Validate settings against schema
 */
export function validateSettings<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validatedData = schema.parse(data);
    return {
      success: true,
      data: validatedData,
      errors: []
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return {
        success: false,
        errors
      };
    }
    return {
      success: false,
      errors: ['Validation failed with unknown error']
    };
  }
}

/**
 * Sanitize settings by removing unknown fields
 */
export function sanitizeSettings<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    // If validation fails, try to partial parse
    const partialSchema = schema.partial();
    return partialSchema.parse(data) as T;
  }
}

/**
 * Get default values for a schema
 */
export function getDefaultSettings<T>(schema: z.ZodSchema<T>): Partial<T> {
  // This is a simplified version - in production, you might use a library
  // that can extract defaults from Zod schemas
  const defaults: any = {};
  
  if (schema === DifferentialPrivacySchema) {
    defaults.epsilon = 1.0;
    defaults.delta = 1e-5;
    defaults.mechanism = 'laplace';
    defaults.sensitivity = 1.0;
  } else if (schema === PrivacyBudgetSchema) {
    defaults.totalEpsilon = 3.0;
    defaults.usedEpsilon = 0;
    defaults.remainingEpsilon = 3.0;
    defaults.status = 'healthy';
  } else if (schema === DataRetentionSchema) {
    defaults.policyName = 'Standard';
    defaults.retentionDays = 90;
    defaults.dataCategories = ['User Analytics'];
    defaults.autoDelete = true;
    defaults.lastReviewDate = new Date().toISOString();
  } else if (schema === GeneralSettingsSchema) {
    defaults.theme = 'auto';
    defaults.language = 'en';
    defaults.timezone = 'UTC';
    defaults.notifications = true;
    defaults.autoSync = true;
  }
  
  return defaults as Partial<T>;
}

/**
 * Validate and sanitize settings with error handling
 */
export async function validateAndStoreSettings<T>(
  key: string,
  schema: z.ZodSchema<T>,
  data: unknown,
  storage: any
): Promise<{ success: boolean; errors: string[] }> {
  try {
    // Validate
    const validation = validateSettings(schema, data);
    
    if (!validation.success) {
      return validation;
    }
    
    // Sanitize
    const sanitized = sanitizeSettings(schema, validation.data);
    
    // Store
    await storage.set(key, sanitized);
    
    return {
      success: true,
      errors: []
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Failed to validate and store settings']
    };
  }
}

export default {
  DifferentialPrivacySchema,
  PrivacyBudgetSchema,
  DataRetentionSchema,
  PrivacyLevelSchema,
  ZKProofSettingsSchema,
  SMPCSettingsSchema,
  GeneralSettingsSchema,
  validateSettings,
  sanitizeSettings,
  getDefaultSettings,
  validateAndStoreSettings
};
