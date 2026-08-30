import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { getJwtSecret } from "../utils/secrets";

export enum PrivacyLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  MAXIMUM = "maximum",
}

export interface PrivacyRequest extends Request {
  privacyLevel?: PrivacyLevel;
  userId?: string;
  consent?: boolean;
}

const JWT_SECRET = getJwtSecret();

/**
 * Extract the user ID from a JWT Bearer token without throwing.
 * Returns undefined when the token is missing, expired, or malformed.
 */
function extractUserIdFromJwt(authHeader: string): string | undefined {
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { sub?: string };
    return decoded.sub;
  } catch {
    return undefined;
  }
}

export const privacyMiddleware = (
  req: PrivacyRequest,
  res: Response,
  next: NextFunction,
): void => {
  // Extract privacy level from headers or use default
  const privacyHeader = req.headers["x-privacy-level"] as string;
  req.privacyLevel = privacyHeader
    ? (privacyHeader.toLowerCase() as PrivacyLevel)
    : PrivacyLevel.HIGH;

  // Extract user ID from JWT
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const userId = extractUserIdFromJwt(authHeader);
    if (userId) {
      req.userId = userId;
    }
  }

  // Check consent status
  req.consent = req.headers["x-consent"] === "true";

  // Log privacy-related requests
  if (req.path.includes("/analytics") || req.path.includes("/data")) {
    logger.info(
      `Privacy request: ${req.method} ${req.path} - Level: ${req.privacyLevel}`,
    );
  }

  next();
};
