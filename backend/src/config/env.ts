import dotenv from "dotenv";
import Joi from "joi";
import { logger } from "../utils/logger";

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  API_HOST: Joi.string().default("localhost"),
  API_PORT: Joi.number().integer().positive().default(3001),
  REDIS_URL: Joi.string()
    .uri()
    .required()
    .messages({
      "any.required":
        "REDIS_URL is required. Format: redis[s]://[user:password@]host:port[/db]",
      "string.uri":
        "REDIS_URL must be a valid URI. Format: redis[s]://[user:password@]host:port[/db]",
    }),
  DB_HOST: Joi.string().default("localhost"),
  DB_PORT: Joi.number().integer().positive().default(5432),
  DB_NAME: Joi.string().default("stellar_privacy"),
  DB_USER: Joi.string().default("postgres"),
  DB_PASSWORD: Joi.string().allow("").default("postgres"),
  CORS_ORIGINS: Joi.string().default(
    "http://localhost:3000,http://localhost:3001",
  ),
  DEV_ADMIN_TOKEN: Joi.string().allow("").optional(),
  JWT_SECRET: Joi.string().allow("").optional(),
  API_KEY_SECRET: Joi.string().allow("").optional(),
  STORAGE_MASTER_KEY: Joi.string().allow("").optional(),
  AUDIT_SIGNATURE_KEY: Joi.string().allow("").optional(),
  RATE_LIMIT_EMERGENCY_BYPASS_KEY: Joi.string().allow("").optional(),
  HSM_ENDPOINT: Joi.string().uri().allow("").optional(),
  HSM_API_KEY: Joi.string().allow("").optional(),
  HSM_API_SECRET: Joi.string().allow("").optional(),
}).unknown(true);

const { value, error } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
  stripUnknown: false,
});

if (error) {
  const details = error.details.map((detail) => detail.message).join(", ");
  throw new Error(`Environment validation failed: ${details}`);
}

Object.entries(value).forEach(([key, rawValue]) => {
  if (rawValue === undefined || rawValue === null) {
    return;
  }

  if (process.env[key] === undefined) {
    process.env[key] = String(rawValue);
  }
});

/**
 * Known development-only secret literals. In production, any of these values
 * (or a missing required secret) must cause the process to refuse to boot.
 */
export const KNOWN_DEV_SECRETS: Record<string, string[]> = {
  JWT_SECRET: [
    "stellar-privacy-jwt-secret-dev-only",
    "stellar-privacy-jwt-secret-dev",
    "dev-only-jwt-secret-not-for-production",
  ],
  API_KEY_SECRET: [""],
  STORAGE_MASTER_KEY: [
    "default-master-key-32-chars-long!!!",
    "default-master-key",
    "dev-only-32-byte-master-key!!!!",
  ],
  AUDIT_SIGNATURE_KEY: [
    "default-key",
    "default-signature-key",
    "dev-only-audit-signature-key",
  ],
  RATE_LIMIT_EMERGENCY_BYPASS_KEY: ["emergency-bypass-2024"],
  DB_PASSWORD: ["password", "postgres", "dev-only-db-password"],
};

/** Secrets that must be set (non-empty, non-default) in production. */
const REQUIRED_PRODUCTION_SECRETS = [
  "JWT_SECRET",
  "API_KEY_SECRET",
  "STORAGE_MASTER_KEY",
  "AUDIT_SIGNATURE_KEY",
  "RATE_LIMIT_EMERGENCY_BYPASS_KEY",
  "HSM_ENDPOINT",
  "HSM_API_KEY",
  "HSM_API_SECRET",
];

/**
 * Fail-closed boot-time secret audit.
 *
 * - In production, any missing or dev-default secret aborts the process.
 * - In development/test it logs a warning so local iterations stay possible.
 */
export function assertSafeSecrets(): void {
  const isProduction = process.env.NODE_ENV === "production";

  for (const key of REQUIRED_PRODUCTION_SECRETS) {
    const raw = process.env[key];
    const devDefaults = KNOWN_DEV_SECRETS[key] || [];

    if (!raw || raw.length === 0 || devDefaults.includes(raw)) {
      const message = `Production boot blocked: ${key} is missing or set to a known development default. Set a strong, unique value.`;
      if (isProduction) {
        // eslint-disable-next-line no-console
        console.error(`[FATAL] ${message}`);
        process.exit(1);
      }
      logger.warn(message);
    }
  }
}

// Run the boot-time secret audit at import time (index.ts imports ./config/env first).
if (process.env.NODE_ENV === "production") {
  assertSafeSecrets();
}

export const env = value;
