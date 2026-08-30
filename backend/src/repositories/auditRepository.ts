import { DatabaseService } from "../services/databaseService";
import { AuditRecord } from "../services/auditService";

/**
 * WS5 (issue #413) — durable Postgres backing store for audit records.
 *
 * The JSONL file is kept as a derived export; this table is the canonical,
 * append-only record. Rows carry the hash-chain linkage written by
 * AuditService so integrity verification survives restarts.
 */
export class AuditRepository {
  constructor(private db: DatabaseService) {}

  async append(record: AuditRecord & { recordHash?: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_events (
         id, timestamp, category, action, outcome, actor, resource,
         details, prev_hash, record_hash, signature,
         privacy_budget_consumed, risk_level
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.timestamp.toISOString(),
        record.category,
        record.action,
        record.outcome,
        record.actor ? JSON.stringify(record.actor) : null,
        record.resource ? JSON.stringify(record.resource) : null,
        record.details ? JSON.stringify(record.details) : null,
        record.prevHash || null,
        (record as any).recordHash || (record as any).hash || null,
        record.signature || null,
        record.privacyBudgetConsumed ?? null,
        record.riskLevel || null,
      ],
    );
  }

  async getLatest(): Promise<(AuditRecord & { recordHash?: string }) | null> {
    const rows = await this.db.query<any>(
      "SELECT * FROM audit_events ORDER BY timestamp DESC, id DESC LIMIT 1",
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async getAll(): Promise<(AuditRecord & { recordHash?: string })[]> {
    const rows = await this.db.query<any>(
      "SELECT * FROM audit_events ORDER BY timestamp ASC, id ASC",
    );
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: any): AuditRecord & { recordHash?: string } {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      category: row.category,
      action: row.action,
      outcome: row.outcome,
      actor: row.actor ? JSON.parse(row.actor) : undefined,
      resource: row.resource ? JSON.parse(row.resource) : undefined,
      details: row.details ? JSON.parse(row.details) : undefined,
      prevHash: row.prev_hash || undefined,
      signature: row.signature || undefined,
      privacyBudgetConsumed: row.privacy_budget_consumed ?? undefined,
      riskLevel: row.risk_level || undefined,
      recordHash: row.record_hash || undefined,
    } as AuditRecord & { recordHash?: string };
  }
}
