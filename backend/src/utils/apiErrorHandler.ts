import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { AuthenticatedRequest } from '../middleware/stellarAuth';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  traceId: string;
}

export interface ErrorResponse {
  error: ApiError;
  traceId: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
}

export class APIError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly traceId?: string;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, any>,
    traceId?: string
  ) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.traceId = traceId;
  }
}

export class ValidationError extends APIError {
  public readonly validations: ValidationError[];

  constructor(
    message: string,
    validations: ValidationError[],
    traceId?: string
  ) {
    super('VALIDATION_ERROR', message, 400, { validations }, traceId);
    this.validations = validations;
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed', traceId?: string) {
    super('UNAUTHORIZED', message, 401, undefined, traceId);
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions', traceId?: string) {
    super('FORBIDDEN', message, 403, undefined, traceId);
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string, id?: string, traceId?: string) {
    const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
    super('NOT_FOUND', message, 404, { resource, id }, traceId);
  }
}

export class ConflictError extends APIError {
  constructor(message: string, details?: Record<string, any>, traceId?: string) {
    super('CONFLICT', message, 409, details, traceId);
  }
}

export class RateLimitError extends APIError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    limit?: number,
    traceId?: string
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, { retryAfter, limit }, traceId);
  }
}

export class InternalServerError extends APIError {
  constructor(message: string = 'Internal server error', traceId?: string) {
    super('INTERNAL_ERROR', message, 500, undefined, traceId);
  }
}

export class ServiceUnavailableError extends APIError {
  constructor(message: string = 'Service temporarily unavailable', traceId?: string) {
    super('SERVICE_UNAVAILABLE', message, 503, undefined, traceId);
  }
}

export class QueryError extends APIError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, any>,
    traceId?: string
  ) {
    super(code, message, 400, details, traceId);
  }
}

export class PrivacyError extends APIError {
  constructor(message: string, details?: Record<string, any>, traceId?: string) {
    super('PRIVACY_ERROR', message, 400, details, traceId);
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(
  error: Error,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const traceId = req.traceId || generateTraceId();

  // Log the error
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    code: error instanceof APIError ? error.code : 'UNKNOWN_ERROR',
    statusCode: error instanceof APIError ? error.statusCode : 500,
    traceId,
    userId: req.user?.id,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent']
  });

  // Handle different error types
  if (error instanceof APIError) {
    sendErrorResponse(res, error, traceId);
  } else if (error.name === 'ValidationError') {
    const validationError = error as any;
    sendErrorResponse(res, new ValidationError(
      error.message,
      validationError.validations || [],
      traceId
    ), traceId);
  } else if (error.name === 'JsonWebTokenError') {
    sendErrorResponse(res, new AuthenticationError('Invalid authentication token', traceId), traceId);
  } else if (error.name === 'TokenExpiredError') {
    sendErrorResponse(res, new AuthenticationError('Authentication token expired', traceId), traceId);
  } else {
    // Unknown error - don't expose internal details
    sendErrorResponse(res, new InternalServerError('An internal error occurred', traceId), traceId);
  }
}

/**
 * Send standardized error response
 */
export function sendErrorResponse(res: Response, error: APIError, traceId: string): void {
  const errorResponse: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString(),
      traceId
    },
    traceId
  };

  // Add specific headers for certain error types
  if (error instanceof RateLimitError && error.details?.retryAfter) {
    res.setHeader('Retry-After', error.details.retryAfter);
  }

  res.status(error.statusCode).json(errorResponse);
}

/**
 * Create validation error from express-validator results
 */
export function createValidationError(
  validationErrors: any[],
  traceId?: string
): ValidationError {
  const validations: ValidationError[] = validationErrors.map(err => ({
    field: err.param || err.path,
    code: err.msg || 'INVALID_VALUE',
    message: err.msg || 'Invalid value provided',
    value: err.value
  }));

  return new ValidationError('Request validation failed', validations, traceId);
}

/**
 * Handle 404 errors
 */
export function notFoundHandler(req: AuthenticatedRequest, res: Response): void {
  const traceId = req.traceId || generateTraceId();
  
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    traceId,
    userId: req.user?.id
  });

  sendErrorResponse(
    res,
    new NotFoundError('Route', req.originalUrl, traceId),
    traceId
  );
}

/**
 * Handle async errors in route handlers
 */
export function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Generate trace ID
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `trace_${timestamp}${random}`;
}

/**
 * Error codes mapping
 */
export const ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_QUERY: 'INVALID_QUERY',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Query errors
  QUERY_SYNTAX_ERROR: 'QUERY_SYNTAX_ERROR',
  QUERY_TOO_COMPLEX: 'QUERY_TOO_COMPLEX',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  INSUFFICIENT_PRIVACY_BUDGET: 'INSUFFICIENT_PRIVACY_BUDGET',
  UNSAFE_QUERY: 'UNSAFE_QUERY',

  // Privacy errors
  PRIVACY_ERROR: 'PRIVACY_ERROR',
  PRIVACY_VIOLATION: 'PRIVACY_VIOLATION',
  EPSILON_EXHAUSTED: 'EPSILON_EXHAUSTED',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Business logic errors
  INVALID_STATE: 'INVALID_STATE',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED'
} as const;

/**
 * Error message templates
 */
export const ERROR_MESSAGES = {
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
  [ERROR_CODES.FORBIDDEN]: 'Insufficient permissions',
  [ERROR_CODES.INVALID_TOKEN]: 'Invalid authentication token',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Authentication token expired',
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions for this operation',

  [ERROR_CODES.VALIDATION_ERROR]: 'Request validation failed',
  [ERROR_CODES.INVALID_QUERY]: 'Invalid query syntax',
  [ERROR_CODES.INVALID_PARAMETER]: 'Invalid parameter value',
  [ERROR_CODES.MISSING_PARAMETER]: 'Required parameter missing',
  [ERROR_CODES.INVALID_FORMAT]: 'Invalid data format',

  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.CONFLICT]: 'Resource conflict',
  [ERROR_CODES.RESOURCE_LIMIT_EXCEEDED]: 'Resource limit exceeded',

  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many requests',

  [ERROR_CODES.QUERY_SYNTAX_ERROR]: 'Query syntax error',
  [ERROR_CODES.QUERY_TOO_COMPLEX]: 'Query too complex',
  [ERROR_CODES.QUERY_TIMEOUT]: 'Query execution timeout',
  [ERROR_CODES.INSUFFICIENT_PRIVACY_BUDGET]: 'Insufficient privacy budget',
  [ERROR_CODES.UNSAFE_QUERY]: 'Query violates privacy constraints',

  [ERROR_CODES.PRIVACY_ERROR]: 'Privacy protection error',
  [ERROR_CODES.PRIVACY_VIOLATION]: 'Privacy violation detected',
  [ERROR_CODES.EPSILON_EXHAUSTED]: 'Privacy budget exhausted',

  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
  [ERROR_CODES.DATABASE_ERROR]: 'Database operation failed',
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 'External service error',

  [ERROR_CODES.INVALID_STATE]: 'Invalid operation state',
  [ERROR_CODES.OPERATION_NOT_ALLOWED]: 'Operation not allowed',
  [ERROR_CODES.QUOTA_EXCEEDED]: 'Quota exceeded'
} as const;

/**
 * Create error from code
 */
export function createError(
  code: keyof typeof ERROR_CODES,
  message?: string,
  details?: Record<string, any>,
  traceId?: string
): APIError {
  const errorMessage = message || ERROR_MESSAGES[code];
  
  switch (code) {
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return new AuthenticationError(errorMessage, traceId);
    
    case 'FORBIDDEN':
    case 'INSUFFICIENT_PERMISSIONS':
      return new AuthorizationError(errorMessage, traceId);
    
    case 'NOT_FOUND':
      return new NotFoundError(details?.resource || 'Resource', details?.id, traceId);
    
    case 'CONFLICT':
      return new ConflictError(errorMessage, details, traceId);
    
    case 'RATE_LIMIT_EXCEEDED':
    case 'TOO_MANY_REQUESTS':
      return new RateLimitError(errorMessage, details?.retryAfter, details?.limit, traceId);
    
    case 'QUERY_SYNTAX_ERROR':
    case 'QUERY_TOO_COMPLEX':
    case 'QUERY_TIMEOUT':
    case 'INSUFFICIENT_PRIVACY_BUDGET':
    case 'UNSAFE_QUERY':
      return new QueryError(code, errorMessage, details, traceId);
    
    case 'PRIVACY_ERROR':
    case 'PRIVACY_VIOLATION':
    case 'EPSILON_EXHAUSTED':
      return new PrivacyError(errorMessage, details, traceId);
    
    case 'SERVICE_UNAVAILABLE':
      return new ServiceUnavailableError(errorMessage, traceId);
    
    default:
      return new APIError(code, errorMessage, 500, details, traceId);
  }
}

/**
 * Success response helper
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  traceId: string;
  warnings?: string[];
  metadata?: Record<string, any>;
}

export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  traceId: string,
  options?: {
    warnings?: string[];
    metadata?: Record<string, any>;
    statusCode?: number;
  }
): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    traceId,
    ...options
  };

  const statusCode = options?.statusCode || 200;
  res.status(statusCode).json(response);
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  sendErrorResponse,
  sendSuccessResponse,
  createValidationError,
  generateTraceId,
  createError,
  ERROR_CODES,
  ERROR_MESSAGES,
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  QueryError,
  PrivacyError
};
