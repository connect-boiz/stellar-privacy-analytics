import { createHmac, randomBytes } from "crypto";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";
import { getAuditSignatureKey } from "../utils/secrets";
import { AuditRepository } from "../repositories/auditRepository";

export interface AuditRecord {
  id: string;
  timestamp: Date;
  /** WS5: SHA-256 of the previous record's canonical bytes (hash chain). */
  prevHash?: string;
  /** WS5: HMAC-SHA256 over the canonical record including prevHash. */
  signature?: string;
  category:
    | "key_management"
    | "access_control"
    | "system_event"
    | "security_violation"
    | "privacy_query"
    | "data_access"
    | "data_modification"
    | "cryptographic_operation";
  action: string;
  actor: {
    userId?: string;
    publicKey?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id?: string;
    metadata?: Record<string, any>;
  };
  outcome: "success" | "failure" | "attempted";
  details?: Record<string, any>;
  privacyBudgetConsumed?: number; // Epsilon value
  zkProofStatus?: "passed" | "failed" | "not_applicable";
  stellarTransactionId?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  complianceTags: string[];
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  category?: AuditRecord["category"];
  action?: string;
  userId?: string;
  resourceType?: string;
  outcome?: AuditRecord["outcome"];
  riskLevel?: AuditRecord["riskLevel"];
  limit?: number;
  offset?: number;
}

export interface AuditMetrics {
  totalRecords: number;
  recordsByCategory: Record<string, number>;
  recordsByRiskLevel: Record<string, number>;
  recordsByOutcome: Record<string, number>;
  timeRange: { start: Date; end: Date };
  criticalIncidents: number;
  securityViolations: number;
}

export class AuditService extends EventEmitter {
  private auditLogPath: string;
  private signatureKey: string;
  private batchSize: number = 100;
  private batchBuffer: AuditRecord[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private immutableStorage: boolean = true;
  private repository?: AuditRepository;

  constructor(
    config: {
      logPath?: string;
      signatureKey?: string;
      immutableStorage?: boolean;
      batchSize?: number;
      repository?: AuditRepository;
    } = {},
  ) {
    super();

    this.auditLogPath =
      config.logPath || join(process.cwd(), "logs", "audit.log");
    // WS5/WS2: no hardcoded fallback — the dev-only value is centralised in
    // utils/secrets.ts and blocked in production by the boot audit.
    this.signatureKey = config.signatureKey || getAuditSignatureKey();
    this.immutableStorage = config.immutableStorage ?? true;
    this.batchSize = config.batchSize || 100;
    this.repository = config.repository;
    this.lastHash = this.loadLastHash();

    this.ensureLogDirectory();
    this.startBatchProcessor();
  }

  private ensureLogDirectory(): void {
    const dir = join(this.auditLogPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private lastHash: string | null = null;

  private generateRecordId(): string {
    return `${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
  }

  /**
   * Canonical bytes signed by the HMAC — includes prevHash so the chain is
   * tamper-evident end-to-end (WS5.1).
   */
  private canonicalRecordData(record: AuditRecord): Record<string, any> {
    const timestamp =
      typeof record.timestamp === "string"
        ? record.timestamp
        : record.timestamp.toISOString();
    return {
      id: record.id,
      timestamp,
      category: record.category,
      action: record.action,
      actor: record.actor,
      resource: record.resource,
      outcome: record.outcome,
      riskLevel: record.riskLevel,
      prevHash: record.prevHash || null,
    };
  }

  private signRecord(record: AuditRecord): string {
    return createHmac("sha256", this.signatureKey)
      .update(JSON.stringify(this.canonicalRecordData(record)))
      .digest("hex");
  }

  /**
   * Load the hash of the last record on disk so new records chain onto it
   * even across restarts.
   */
  private loadLastHash(): string | null {
    try {
      const fs = require("fs") as typeof import("fs");
      if (!fs.existsSync(this.auditLogPath)) return null;
      const lines = fs
        .readFileSync(this.auditLogPath, "utf8")
        .split("\n")
        .filter((line) => line.trim());
      if (lines.length === 0) return null;
      const last = JSON.parse(lines[lines.length - 1]);
      return (
        last.hash ||
        createHmac("sha256", this.signatureKey)
          .update(JSON.stringify(this.canonicalRecordData(last)))
          .digest("hex")
      );
    } catch {
      return null;
    }
  }

  /**
   * Hash of a record's canonical bytes (used as the next record's prevHash).
   */
  private hashRecord(record: AuditRecord): string {
    return createHmac("sha256", this.signatureKey)
      .update(JSON.stringify(this.canonicalRecordData(record)))
      .digest("hex");
  }

  private async writeRecord(record: AuditRecord): Promise<void> {
    if (this.immutableStorage) {
      // Chain onto the previous record's hash.
      record.prevHash = this.lastHash || undefined;
      record.signature = this.signRecord(record);
      this.lastHash = this.hashRecord(record);
      (record as any).hash = this.lastHash;
    }

    const logLine = JSON.stringify(record) + "\n";

    try {
      // WS5: persist durably to Postgres first (canonical append-only store).
      if (this.repository) {
        await this.repository.append(record as any);
      }
      // JSONL remains as a derived export / local fallback.
      appendFileSync(this.auditLogPath, logLine, { flag: "a" });
      this.emit("recordWritten", record);
    } catch (error) {
      logger.error("Failed to write audit record:", error);
      this.emit("writeError", { record, error });
      throw error;
    }
  }

  private startBatchProcessor(): void {
    this.batchTimeout = setInterval(() => {
      if (this.batchBuffer.length > 0) {
        this.flushBatch();
      }
    }, 5000); // Process batch every 5 seconds
  }

  private async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) return;

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    try {
      for (const record of batch) {
        await this.writeRecord(record);
      }
      logger.debug(`Audit batch processed: ${batch.length} records`);
    } catch (error) {
      // Re-add failed records to buffer for retry
      this.batchBuffer.unshift(...batch);
      logger.error("Failed to process audit batch:", error);
    }
  }

  async log(
    record: Omit<AuditRecord, "id" | "timestamp" | "signature" | "prevHash">,
  ): Promise<string> {
    const auditRecord: AuditRecord = {
      ...record,
      id: this.generateRecordId(),
      timestamp: new Date(),
    };

    // Add to batch buffer
    this.batchBuffer.push(auditRecord);

    // Immediate flush for critical events
    if (
      auditRecord.riskLevel === "critical" ||
      auditRecord.category === "security_violation"
    ) {
      await this.flushBatch();
    }

    // Emit for real-time monitoring
    this.emit("auditEvent", auditRecord);

    return auditRecord.id;
  }

  async logKeyManagement(
    action: string,
    actor: AuditRecord["actor"],
    resource: AuditRecord["resource"],
    outcome: AuditRecord["outcome"],
    details?: Record<string, any>,
  ): Promise<string> {
    return this.log({
      category: "key_management",
      action,
      actor,
      resource,
      outcome,
      details,
      riskLevel: this.assessRiskLevel(action, outcome, details),
      complianceTags: ["SOX", "GDPR", "PCI-DSS", "HIPAA"],
    });
  }

  async logAccessControl(
    action: string,
    actor: AuditRecord["actor"],
    resource: AuditRecord["resource"],
    outcome: AuditRecord["outcome"],
    details?: Record<string, any>,
  ): Promise<string> {
    return this.log({
      category: "access_control",
      action,
      actor,
      resource,
      outcome,
      details,
      riskLevel: this.assessRiskLevel(action, outcome, details),
      complianceTags: ["GDPR", "CCPA"],
    });
  }

  async logSystemEvent(
    action: string,
    actor: AuditRecord["actor"],
    details?: Record<string, any>,
  ): Promise<string> {
    return this.log({
      category: "system_event",
      action,
      actor,
      resource: { type: "system" },
      outcome: "success",
      details,
      riskLevel: "low",
      complianceTags: [],
    });
  }

  /**
   * Generic event logging used by route handlers that pass a flat event
   * object (eventType, userId, resourceId, details).
   */
  /**
   * WS5 — attach durable Postgres persistence after construction (e.g. once
   * the database service is available at boot).
   */
  setRepository(repository: AuditRepository): void {
    this.repository = repository;
  }

  async logEvent(event: {
    eventType: string;
    userId?: string;
    resourceId?: string;
    details?: Record<string, any>;
  }): Promise<string> {
    return this.log({
      category: "system_event",
      action: event.eventType,
      actor: {
        userId: event.userId || "anonymous",
        ipAddress: "internal",
      },
      resource: {
        type: event.resourceId || "system",
        id: event.resourceId,
        metadata: event.details,
      },
      outcome: "success",
      details: event.details,
      riskLevel: "low",
      complianceTags: [],
    });
  }

  async logSecurityViolation(
    action: string,
    actor: AuditRecord["actor"],
    resource: AuditRecord["resource"],
    details?: Record<string, any>,
  ): Promise<string> {
    return this.log({
      category: "security_violation",
      action,
      actor,
      resource,
      outcome: "failure",
      details,
      riskLevel: "critical",
      complianceTags: ["GDPR", "SOX", "PCI-DSS", "HIPAA"],
    });
  }

  private assessRiskLevel(
    action: string,
    outcome: AuditRecord["outcome"],
    _details?: Record<string, any>,
  ): AuditRecord["riskLevel"] {
    // Critical risk indicators
    if (action.includes("revoke") || action.includes("kill_switch")) {
      return "critical";
    }

    if (action.includes("rotate") || action.includes("unwrap")) {
      return "high";
    }

    // High risk for failures
    if (outcome === "failure") {
      if (
        action.includes("key") ||
        action.includes("encrypt") ||
        action.includes("decrypt")
      ) {
        return "high";
      }
      return "medium";
    }

    // Medium risk for sensitive operations
    if (action.includes("wrap") || action.includes("generate")) {
      return "medium";
    }

    return "low";
  }

  async query(query: AuditQuery): Promise<AuditRecord[]> {
    const records: AuditRecord[] = [];

    // Flush any pending buffered records to disk before querying
    if (this.batchBuffer.length > 0) {
      await this.flushBatch();
    }

    try {
      const logContent = require("fs").readFileSync(this.auditLogPath, "utf8");
      const lines = logContent.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const record: AuditRecord = JSON.parse(line);

          if (this.matchesQuery(record, query)) {
            records.push(record);
          }
        } catch (parseError) {
          logger.warn("Failed to parse audit record:", parseError);
        }
      }

      // Sort by timestamp (newest first)
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 100;

      return records.slice(offset, offset + limit);
    } catch (error) {
      logger.error("Failed to query audit log:", error);
      throw error;
    }
  }

  private matchesQuery(record: AuditRecord, query: AuditQuery): boolean {
    const recordTime = new Date(record.timestamp).getTime();
    if (query.startDate && recordTime < query.startDate.getTime()) return false;
    if (query.endDate && recordTime > query.endDate.getTime()) return false;
    if (query.category && record.category !== query.category) return false;
    if (query.action && !record.action.includes(query.action)) return false;
    if (query.userId && record.actor.userId !== query.userId) return false;
    if (query.resourceType && record.resource.type !== query.resourceType)
      return false;
    if (query.outcome && record.outcome !== query.outcome) return false;
    if (query.riskLevel && record.riskLevel !== query.riskLevel) return false;

    return true;
  }

  async getMetrics(query?: AuditQuery): Promise<AuditMetrics> {
    const records = query
      ? await this.query({ ...query, limit: 10000 })
      : await this.query({ limit: 10000 });

    const metrics: AuditMetrics = {
      totalRecords: records.length,
      recordsByCategory: {},
      recordsByRiskLevel: {},
      recordsByOutcome: {},
      timeRange: {
        start:
          records.length > 0
            ? new Date(records[records.length - 1].timestamp)
            : new Date(),
        end: records.length > 0
          ? new Date(records[0].timestamp)
          : new Date(),
      },
      criticalIncidents: 0,
      securityViolations: 0,
    };

    for (const record of records) {
      // Category metrics
      metrics.recordsByCategory[record.category] =
        (metrics.recordsByCategory[record.category] || 0) + 1;

      // Risk level metrics
      metrics.recordsByRiskLevel[record.riskLevel] =
        (metrics.recordsByRiskLevel[record.riskLevel] || 0) + 1;

      // Outcome metrics
      metrics.recordsByOutcome[record.outcome] =
        (metrics.recordsByOutcome[record.outcome] || 0) + 1;

      // Special counters
      if (record.riskLevel === "critical") metrics.criticalIncidents++;
      if (record.category === "security_violation")
        metrics.securityViolations++;
    }

    return metrics;
  }

  async verifyIntegrity(): Promise<{
    valid: boolean;
    totalRecords: number;
    invalidRecords: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let invalidRecords = 0;
    let totalRecords = 0;

    // Flush any pending buffered records to disk before verifying
    if (this.batchBuffer.length > 0) {
      await this.flushBatch();
    }

    try {
      let logContent: string;
      try {
        logContent = require("fs").readFileSync(this.auditLogPath, "utf8");
      } catch {
        return { valid: true, totalRecords: 0, invalidRecords: 0, errors: [] };
      }
      const lines = logContent.split("\n").filter((line) => line.trim());

      let previousHash: string | null = null;

      for (const line of lines) {
        totalRecords++;
        try {
          const record: AuditRecord = JSON.parse(line);

          if (this.immutableStorage && record.signature) {
            // 1. The record's own signature must match its canonical bytes.
            const expectedSignature = this.signRecord(record);
            if (record.signature !== expectedSignature) {
              errors.push(`Invalid signature for record ${record.id}`);
              invalidRecords++;
            }

            // 2. The record's prevHash must equal the previous record's hash
            //    (hash chain integrity).
            const storedHash = (record as any).hash;
            if (previousHash !== null && record.prevHash !== previousHash) {
              errors.push(`Broken hash chain at record ${record.id}`);
              invalidRecords++;
            }
            if (previousHash === null && record.prevHash) {
              // First record we see may legitimately chain onto a pre-restart
              // tail; only flag it if it doesn't match this.lastHash context.
            }

            // 3. Recompute and compare the record's own hash so reorders and
            //    edits to fields covered by the signature are caught.
            if (storedHash) {
              const recomputed = createHmac("sha256", this.signatureKey)
                .update(JSON.stringify(this.canonicalRecordData(record)))
                .digest("hex");
              if (storedHash !== recomputed) {
                errors.push(`Hash mismatch for record ${record.id}`);
                invalidRecords++;
              }
              previousHash = storedHash;
            } else {
              previousHash = this.hashRecord(record);
            }
          } else if (this.immutableStorage) {
            errors.push(`Missing signature on record at line ${totalRecords}`);
            invalidRecords++;
          }
        } catch (parseError) {
          errors.push(`Failed to parse record at line ${totalRecords}`);
          invalidRecords++;
        }
      }

      return {
        valid: invalidRecords === 0,
        totalRecords,
        invalidRecords,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        totalRecords: 0,
        invalidRecords: 0,
        errors: [`Failed to read audit log: ${error.message}`],
      };
    }
  }

  async exportAuditLog(
    query: AuditQuery,
    format: "json" | "csv" = "json",
  ): Promise<string> {
    const records = await this.query(query);

    if (format === "csv") {
      const headers = [
        "id",
        "timestamp",
        "category",
        "action",
        "userId",
        "ipAddress",
        "resourceType",
        "resourceId",
        "outcome",
        "riskLevel",
      ];

      const csvRows = [headers.join(",")];

      for (const record of records) {
        const row = [
          record.id,
          record.timestamp.toISOString(),
          record.category,
          record.action,
          record.actor.userId || "",
          record.actor.ipAddress || "",
          record.resource.type,
          record.resource.id || "",
          record.outcome,
          record.riskLevel,
        ];
        csvRows.push(row.map((field) => `"${field}"`).join(","));
      }

      return csvRows.join("\n");
    }

    return JSON.stringify(records, null, 2);
  }

  async cleanup(retentionDays: number): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    let deletedCount = 0;

    try {
      const records = await this.query({ endDate: cutoffDate, limit: 10000 });

      // For immutable storage, we create a new log file without old records
      if (this.immutableStorage) {
        const remainingRecords = await this.query({
          startDate: cutoffDate,
          limit: 10000,
        });
        const newLogPath = this.auditLogPath + ".new";

        for (const record of remainingRecords) {
          await this.writeRecord(record);
        }

        // Replace old file with new one
        require("fs").renameSync(newLogPath, this.auditLogPath);
        deletedCount = records.length;
      }

      logger.info(`Audit cleanup completed`, { deletedCount, retentionDays });
      return deletedCount;
    } catch (error) {
      logger.error("Audit cleanup failed:", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.batchTimeout) {
      clearInterval(this.batchTimeout);
    }

    await this.flushBatch();
    logger.info("Audit service shutdown completed");
  }
}

export default AuditService;
