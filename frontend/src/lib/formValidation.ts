/**
 * Form Validation Utilities
 * Provides step-level and overall form validation with accessibility support
 */

export type ValidationRule<T> = {
  required?: boolean | string;
  minLength?: number | { value: number; message: string };
  maxLength?: number | { value: number; message: string };
  min?: number | { value: number; message: string };
  max?: number | { value: number; message: string };
  pattern?: RegExp | { value: RegExp; message: string };
  validate?: (value: T, formData: Record<string, unknown>) => string | boolean | null | undefined;
  custom?: (value: T) => string | boolean | null | undefined;
};

export type FieldSchema<T = unknown> = ValidationRule<T> & {
  type?: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox' | 'radio' | 'textarea';
  label?: string;
  placeholder?: string;
  description?: string;
};

export type FormSchema = Record<string, FieldSchema>;

export type ValidationError = Record<string, string>;

/**
 * Validate a single field value
 */
export function validateField<T>(
  value: T,
  rules: ValidationRule<T>,
  formData?: Record<string, unknown>
): string | null {
  // Required check
  if (rules.required) {
    const isEmpty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);
    
    if (isEmpty) {
      return typeof rules.required === 'string' 
        ? rules.required 
        : 'This field is required';
    }
  }

  // Skip other validations if value is empty and not required
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // String validations
  if (typeof value === 'string') {
    // Min length
    if (rules.minLength !== undefined) {
      const minLen = typeof rules.minLength === 'number' 
        ? { value: rules.minLength, message: `Minimum ${rules.minLength} characters required` }
        : { value: rules.minLength.value, message: rules.minLength.message };
      
      if (value.length < minLen.value) {
        return minLen.message;
      }
    }

    // Max length
    if (rules.maxLength !== undefined) {
      const maxLen = typeof rules.maxLength === 'number'
        ? { value: rules.maxLength, message: `Maximum ${rules.maxLength} characters allowed` }
        : { value: rules.maxLength.value, message: rules.maxLength.message };
      
      if (value.length > maxLen.value) {
        return maxLen.message;
      }
    }

    // Pattern
    if (rules.pattern !== undefined) {
      const pattern = rules.pattern instanceof RegExp
        ? { value: rules.pattern, message: 'Invalid format' }
        : rules.pattern;
      
      if (!pattern.value.test(value)) {
        return pattern.message;
      }
    }
  }

  // Number validations
  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))) {
    const numValue = typeof value === 'number' ? value : Number(value);

    // Min
    if (rules.min !== undefined) {
      const minRule = typeof rules.min === 'number'
        ? { value: rules.min, message: `Minimum value is ${rules.min}` }
        : rules.min;
      
      if (numValue < minRule.value) {
        return minRule.message;
      }
    }

    // Max
    if (rules.max !== undefined) {
      const maxRule = typeof rules.max === 'number'
        ? { value: rules.max, message: `Maximum value is ${rules.max}` }
        : rules.max;
      
      if (numValue > maxRule.value) {
        return maxRule.message;
      }
    }
  }

  // Custom validation function
  if (rules.validate) {
    const result = rules.validate(value, formData || {});
    if (typeof result === 'string') return result;
    if (result === false) return 'Invalid value';
  }

  // Custom validation (alias)
  if (rules.custom) {
    const result = rules.custom(value);
    if (typeof result === 'string') return result;
    if (result === false) return 'Invalid value';
  }

  return null;
}

/**
 * Validate multiple fields against a schema
 */
export function validateFormData<T extends Record<string, unknown>>(
  data: T,
  schema: FormSchema,
  options?: {
    onlyFields?: string[];
    excludeFields?: string[];
  }
): ValidationError {
  const errors: ValidationError = {};
  
  for (const [field, rules] of Object.entries(schema)) {
    // Skip if only validating specific fields and this isn't one
    if (options?.onlyFields && !options.onlyFields.includes(field)) {
      continue;
    }
    
    // Skip if excluding this field
    if (options?.excludeFields?.includes(field)) {
      continue;
    }
    
    const error = validateField(data[field], rules, data);
    if (error) {
      errors[field] = error;
    }
  }
  
  return errors;
}

/**
 * Check if form has any errors
 */
export function hasErrors(errors: ValidationError): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Get first error message
 */
export function getFirstError(errors: ValidationError): string | null {
  const keys = Object.keys(errors);
  return keys.length > 0 ? errors[keys[0]] : null;
}

/**
 * Create step-level validator
 */
export function createStepValidator<T extends Record<string, unknown>>(
  fields: string[],
  schema: FormSchema
) {
  return (data: T): ValidationError => {
    return validateFormData(data, schema, { onlyFields: fields });
  };
}

/**
 * Create form-wide validator
 */
export function createFormValidator<T extends Record<string, unknown>>(
  schema: FormSchema
) {
  return (data: T): ValidationError => {
    return validateFormData(data, schema);
  };
}

/**
 * Common validation patterns
 */
export const patterns = {
  email: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
  phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
  url: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
  stellarPublicKey: /^G[A-Z0-9]{55}$/,
  stellarSecretKey: /^S[A-Z0-9]{55}$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
};

/**
 * Common validation rules
 */
export const rules = {
  required: (message = 'This field is required'): ValidationRule<unknown> => ({
    required: message
  }),

  email: (message = 'Invalid email address'): ValidationRule<string> => ({
    required: 'Email is required',
    pattern: { value: patterns.email, message }
  }),

  phone: (message = 'Invalid phone number'): ValidationRule<string> => ({
    pattern: { value: patterns.phone, message }
  }),

  password: (message = 'Password must be at least 8 characters with uppercase, lowercase, and number'): ValidationRule<string> => ({
    required: 'Password is required',
    minLength: { value: 8, message },
    pattern: { value: patterns.password, message }
  }),

  stellarPublicKey: (message = 'Invalid Stellar public key'): ValidationRule<string> => ({
    required: 'Public key is required',
    pattern: { value: patterns.stellarPublicKey, message }
  }),

  confirmPassword: (passwordField: string, message = 'Passwords do not match'): ValidationRule<string> => ({
    required: 'Please confirm your password',
    validate: (value, formData) => value === formData[passwordField] ? true : message
  }),

  minLength: (length: number, message?: string): ValidationRule<string> => ({
    minLength: { value: length, message: message || `Minimum ${length} characters required` }
  }),

  maxLength: (length: number, message?: string): ValidationRule<string> => ({
    maxLength: { value: length, message: message || `Maximum ${length} characters allowed` }
  }),

  min: (value: number, message?: string): ValidationRule<number> => ({
    min: { value, message: message || `Minimum value is ${value}` }
  }),

  max: (value: number, message?: string): ValidationRule<number> => ({
    max: { value, message: message || `Maximum value is ${value}` }
  }),

  range: (min: number, max: number, message?: string): ValidationRule<number> => ({
    min: { value: min, message: message || `Minimum value is ${min}` },
    max: { value: max, message: message || `Maximum value is ${max}` }
  }),

  optional: <T>(baseRules: ValidationRule<T>): ValidationRule<T> => ({
    ...baseRules,
    required: false
  })
};

/**
 * Async validation helper
 */
export async function validateAsync<T>(
  value: T,
  validator: (value: T) => Promise<string | boolean | null | undefined>
): Promise<string | null> {
  try {
    const result = await validator(value);
    if (typeof result === 'string') return result;
    if (result === false) return 'Validation failed';
    return null;
  } catch (error) {
    return 'Validation error occurred';
  }
}

/**
 * Debounced validation helper
 */
export function createDebouncedValidator<T extends Record<string, unknown>>(
  schema: FormSchema,
  delay: number = 300
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (
    data: T,
    callback: (errors: ValidationError) => void,
    options?: { onlyFields?: string[]; excludeFields?: string[] }
  ): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      const errors = validateFormData(data, schema, options);
      callback(errors);
    }, delay);
  };
}

export default {
  validateField,
  validateFormData,
  hasErrors,
  getFirstError,
  createStepValidator,
  createFormValidator,
  patterns,
  rules,
  validateAsync,
  createDebouncedValidator
};
