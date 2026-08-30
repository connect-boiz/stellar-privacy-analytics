/**
 * WS2 (issue #413) — single source of truth for development-only secret
 * fallbacks.
 *
 * Production never reaches these defaults: config/env.ts runs a fail-closed
 * boot audit that refuses to start when a required secret is missing or still
 * set to a known development value. Keeping every fallback in one module makes
 * the dev-only boundary auditable and greppable.
 */

/** Dev-only JWT signing secret — NEVER use in production. */
export const DEV_JWT_SECRET = "dev-only-jwt-secret-not-for-production";

/** Dev-only audit HMAC key — NEVER use in production. */
export const DEV_AUDIT_SIGNATURE_KEY = "dev-only-audit-signature-key";

/** Dev-only backup-encryption password — NEVER use in production. */
export const DEV_BACKUP_ENCRYPTION_PASSWORD =
  "dev-only-backup-encryption-password";

/** Dev-only storage master key (32 bytes) — NEVER use in production. */
export const DEV_STORAGE_MASTER_KEY = "dev-only-32-byte-master-key!!!!";

/** Dev-only Postgres password — NEVER use in production. */
export const DEV_DB_PASSWORD = "dev-only-db-password";

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || DEV_JWT_SECRET;
}

export function getAuditSignatureKey(): string {
  return process.env.AUDIT_SIGNATURE_KEY || DEV_AUDIT_SIGNATURE_KEY;
}

export function getBackupEncryptionPassword(): string {
  return (
    process.env.BACKUP_ENCRYPTION_PASSWORD || DEV_BACKUP_ENCRYPTION_PASSWORD
  );
}

export function getStorageMasterKey(): string {
  return process.env.STORAGE_MASTER_KEY || DEV_STORAGE_MASTER_KEY;
}

export function getDbPassword(): string {
  return process.env.DB_PASSWORD || DEV_DB_PASSWORD;
}
