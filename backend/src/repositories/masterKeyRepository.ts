import { DatabaseService } from "../services/databaseService";
import { WrappedKey } from "../services/hsmService";
import { MasterKeyRecord } from "../services/masterKeyManager";

/**
 * WS2 (issue #413) — durable persistence for master-key metadata and
 * wrapped data keys so restarts and rotations are recoverable.
 *
 * Only metadata and wrapped (ciphertext) blobs are stored — never plaintext.
 */
export class MasterKeyRepository {
  constructor(private db: DatabaseService) {}

  async saveMasterKey(record: MasterKeyRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO master_keys (
         key_id, version, algorithm, status, usage_count, max_usage,
         wrapped_blob, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (key_id) DO UPDATE SET
         status = EXCLUDED.status,
         usage_count = EXCLUDED.usage_count,
         wrapped_blob = EXCLUDED.wrapped_blob`,
      [
        record.keyId,
        record.version,
        record.algorithm,
        record.status,
        record.usageCount,
        record.maxUsage,
        record.wrappedDataKey ? JSON.stringify(record.wrappedDataKey) : null,
        record.createdAt,
      ],
    );
  }

  async getMasterKeys(): Promise<MasterKeyRecord[]> {
    const rows = await this.db.query<any>(
      "SELECT * FROM master_keys ORDER BY created_at ASC",
    );
    return rows.map((row) => ({
      keyId: row.key_id,
      version: row.version,
      algorithm: row.algorithm,
      createdAt: row.created_at,
      status: row.status,
      usageCount: row.usage_count,
      maxUsage: row.max_usage,
      wrappedDataKey: row.wrapped_blob ? JSON.parse(row.wrapped_blob) : undefined,
    }));
  }

  async saveWrappedDataKey(wrappedKey: WrappedKey): Promise<void> {
    await this.db.query(
      `INSERT INTO wrapped_keys (
         key_id, version, algorithm, ciphertext, iv, tag
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key_id, version) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         iv = EXCLUDED.iv,
         tag = EXCLUDED.tag`,
      [
        wrappedKey.keyId,
        wrappedKey.version,
        wrappedKey.algorithm,
        wrappedKey.ciphertext,
        wrappedKey.iv,
        wrappedKey.tag,
      ],
    );
  }

  async getWrappedDataKeys(): Promise<WrappedKey[]> {
    const rows = await this.db.query<any>(
      "SELECT * FROM wrapped_keys ORDER BY created_at ASC",
    );
    return rows.map((row) => ({
      keyId: row.key_id,
      version: row.version,
      algorithm: row.algorithm,
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
    }));
  }
}
