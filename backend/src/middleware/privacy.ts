import { Request, Response, NextFunction } from 'express';

export enum PrivacyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  MAXIMUM = 'maximum'
}

export interface PrivacyRequest extends Request {
  privacyLevel?: PrivacyLevel;
  userId?: string;
  consent?: boolean;
}

export const privacyMiddleware = (
  req: PrivacyRequest,
  res: Response,
  next: NextFunction
): void => {
  // Extract privacy level from headers or use default
  const privacyHeader = req.headers['x-privacy-level'] as string;
  req.privacyLevel = privacyHeader ? 
    (privacyHeader.toLowerCase() as PrivacyLevel) : 
    PrivacyLevel.HIGH;

  // Extract user ID from JWT (simplified for now)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // In a real implementation, verify JWT token
    req.userId = 'temp-user-id'; // Placeholder
  }

  // Check consent status
  req.consent = req.headers['x-consent'] === 'true';

  // Log privacy-related requests
  if (req.path.includes('/analytics') || req.path.includes('/data')) {
    console.log(`Privacy request: ${req.method} ${req.path} - Level: ${req.privacyLevel}`);
  }

  next();
};
