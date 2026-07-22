import { logger } from "./logger";

/**
 * Represents the parsed components of a Redis connection URL.
 */
export interface ParsedRedisUrl {
  protocol: string;
  username?: string;
  password?: string;
  host: string;
  port: number;
  hasTls: boolean;
  hasAuthentication: boolean;
  originalUrl: string;
}

/**
 * Validates a Redis URL for authentication, protocol, and format correctness.
 *
 * Acceptance Criteria:
 * - If no password/authentication is present, emit a warning (in development)
 *   or refuse to start / throw an error (in production) when requirePassword is true.
 * - Support Redis ACL username/password in the URL format (redis://user:pass@host:port).
 * - Add TLS support for Redis connections (rediss:// protocol prefix).
 */
export function validateRedisUrl(
  redisUrl: string,
  options: { requirePassword?: boolean } = {},
): ParsedRedisUrl {
  const { requirePassword = true } = options;
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment =
    !process.env.NODE_ENV || process.env.NODE_ENV === "development";

  if (!redisUrl || typeof redisUrl !== "string" || redisUrl.trim() === "") {
    throw new Error(
      "REDIS_URL is not provided. A valid Redis connection URL is required.",
    );
  }

  // Parse the URL using the URL constructor
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error(
      `Invalid Redis URL format: "${redisUrl}". Expected format: redis[s]://[user:password@]host:port[/db]`,
    );
  }

  // Validate protocol: accept redis:// and rediss://
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(
      `Invalid Redis URL protocol: "${parsed.protocol}". Expected "redis:" or "rediss:" (for TLS).`,
    );
  }

  const hasTls = parsed.protocol === "rediss:";
  const host = parsed.hostname || "localhost";
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : hasTls
      ? 6380
      : 6379;
  const username = parsed.username || undefined;
  const password = parsed.password || undefined;

  // Authentication is present if either password or username+password exists
  // ACL requires username, but legacy Redis only needs password
  const hasAuthentication = !!(password || (username && password));

  // Production always throws for passwordless Redis regardless of requirePassword flag.
  // requirePassword controls enforcement in development/test environments only.
  if (!hasAuthentication) {
    const message =
      `Redis URL has no authentication credentials. ` +
      `Redis must be configured with a password. Use format: redis://[user:password@]host:port ` +
      `or rediss://[user:password@]host:port for TLS connections.`;

    if (isProduction) {
      throw new Error(
        `${message} Refusing to start in production with unauthenticated Redis.`,
      );
    }

    if (requirePassword && isDevelopment) {
      logger.warn(`[DEV WARNING] ${message}`);
    }
  }

  const result: ParsedRedisUrl = {
    protocol: parsed.protocol.replace(":", ""),
    username,
    password,
    host,
    port,
    hasTls,
    hasAuthentication,
    originalUrl: redisUrl,
  };

  logger.info("Redis URL validated successfully", {
    host: result.host,
    port: result.port,
    hasTls: result.hasTls,
    hasAuthentication: result.hasAuthentication,
    hasUsername: !!result.username,
  });

  return result;
}

export default validateRedisUrl;
