/**
 * Error Handling Utilities
 * Provides safe error message extraction and standardized error handling
 */

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'Unknown error occurred';
}

/**
 * Safely extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Create a standardized error with context
 */
export function createError(message: string, originalError?: unknown, context?: Record<string, any>): Error {
  const error = new Error(message);
  
  if (originalError) {
    (error as any).originalError = originalError;
    (error as any).originalMessage = getErrorMessage(originalError);
  }
  
  if (context) {
    (error as any).context = context;
  }
  
  return error;
}

/**
 * Validate input parameters
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate threshold cryptography parameters
 */
export function validateThresholdParams(threshold: number, totalShares: number): void {
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new ValidationError('Threshold must be an integer >= 2', 'threshold', threshold);
  }
  
  if (!Number.isInteger(totalShares) || totalShares < threshold) {
    throw new ValidationError(
      `Total shares (${totalShares}) must be >= threshold (${threshold})`,
      'totalShares',
      totalShares
    );
  }
  
  if (totalShares > 100) {
    throw new ValidationError('Total shares cannot exceed 100', 'totalShares', totalShares);
  }
}

/**
 * Validate key size
 */
export function validateKeySize(keySize: number): void {
  if (!Number.isInteger(keySize) || keySize < 16 || keySize > 64) {
    throw new ValidationError('Key size must be between 16 and 64 bytes', 'keySize', keySize);
  }
}

/**
 * Validate TTL
 */
export function validateTTL(ttl: number): void {
  if (!Number.isInteger(ttl) || ttl < 60) {
    throw new ValidationError('TTL must be at least 60 seconds', 'ttl', ttl);
  }
  
  if (ttl > 365 * 24 * 60 * 60) {
    throw new ValidationError('TTL cannot exceed 1 year', 'ttl', ttl);
  }
}

/**
 * Validate array is not empty
 */
export function validateNonEmptyArray<T>(arr: T[], fieldName: string): void {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty array`, fieldName, arr);
  }
}

/**
 * Validate string is not empty
 */
export function validateNonEmptyString(str: string, fieldName: string): void {
  if (typeof str !== 'string' || str.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`, fieldName, str);
  }
}

/**
 * Async mutex lock for preventing race conditions
 */
export class AsyncLock {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    // Wait for existing lock
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, lockPromise);

    // Return release function
    return () => {
      this.locks.delete(key);
      releaseLock!();
    };
  }

  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}

export default {
  getErrorMessage,
  getErrorStack,
  createError,
  ValidationError,
  validateThresholdParams,
  validateKeySize,
  validateTTL,
  validateNonEmptyArray,
  validateNonEmptyString,
  AsyncLock
};
