import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { logger } from "../utils/logger";
import { PrivacyMetric } from "./PrivacyMetrics";

/**
 * Durable, append-only persistence layer for privacy metrics.
 *
 * Records are written as JSON Lines (one JSON object per line) so that a flush
 * is a cheap append rather than a full-file rewrite, and a crash mid-write only
 * ever corrupts the trailing line — every prior record survives. On load, an
 * unparseable trailing line is skipped instead of failing the whole recovery.
 *
 * Records sharing a `requestId` are de-duplicated on load with last-write-wins,
 * so an updated metric (e.g. via recordResponse) can simply be re-appended and
 * the latest version is what surfaces after a restart.
 */
export interface MetricsStoreOptions {
  filePath?: string;
  /** Drop persisted records older than this many milliseconds on load/compact. */
  retentionPeriod?: number;
}

interface SerializedPrivacyMetric extends Omit<PrivacyMetric, "timestamp"> {
  timestamp: string;
}

export class MetricsStore {
  private readonly filePath: string;
  private readonly retentionPeriod: number;

  constructor(options: MetricsStoreOptions = {}) {
    this.filePath =
      options.filePath ??
      process.env.PRIVACY_METRICS_STORE_PATH ??
      path.join(process.cwd(), "data", "gateway", "privacy-metrics.jsonl");

    this.retentionPeriod = options.retentionPeriod ?? 7 * 24 * 60 * 60 * 1000;
  }

  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Append a batch of metrics to the durable store. Creates the parent
   * directory on first write. A trailing newline keeps each record on its own
   * line so a subsequent append never merges with the previous record.
   */
  append(metrics: PrivacyMetric[]): void {
    if (metrics.length === 0) {
      return;
    }

    const lines =
      metrics
        .map((metric) => JSON.stringify(this.serialize(metric)))
        .join("\n") + "\n";

    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    fs.appendFileSync(this.filePath, lines, { encoding: "utf8", mode: 0o600 });
  }

  /**
   * Load persisted metrics, newest write winning per requestId, filtered to the
   * retention window and (optionally) a caller-supplied time range. Returns an
   * empty array when no store file exists yet.
   */
  load(timeRange?: { start: Date; end: Date }): PrivacyMetric[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const cutoff = new Date(Date.now() - this.retentionPeriod);
    const byRequestId = new Map<string, PrivacyMetric>();

    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      logger.error("Failed to read privacy metrics store", {
        filePath: this.filePath,
        error: (error as Error).message,
      });
      return [];
    }

    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as SerializedPrivacyMetric;
        const metric = this.deserialize(parsed);

        if (metric.timestamp <= cutoff) {
          continue;
        }

        // Last write wins so re-appended (updated) records supersede earlier ones.
        byRequestId.set(metric.requestId, metric);
      } catch {
        // Skip a corrupt/partial line (e.g. trailing line from a crash mid-append).
        logger.debug("Skipping unparseable privacy metrics line during load");
      }
    }

    let records = Array.from(byRequestId.values());

    if (timeRange) {
      records = records.filter(
        (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end,
      );
    }

    return records;
  }

  /**
   * Rewrite the store dropping records older than the retention window. Uses an
   * atomic temp-file + rename so a crash during compaction never truncates the
   * live store. Returns the number of records dropped.
   */
  compact(): number {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }

    const surviving = this.load();
    const serialized =
      surviving.length > 0
        ? surviving
            .map((metric) => JSON.stringify(this.serialize(metric)))
            .join("\n") + "\n"
        : "";

    const tempPath = `${this.filePath}.${process.pid}.${randomBytes(4).toString(
      "hex",
    )}.tmp`;

    try {
      fs.writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      logger.error("Failed to compact privacy metrics store", {
        filePath: this.filePath,
        error: (error as Error).message,
      });
      return 0;
    }

    return surviving.length;
  }

  private serialize(metric: PrivacyMetric): SerializedPrivacyMetric {
    return { ...metric, timestamp: metric.timestamp.toISOString() };
  }

  private deserialize(record: SerializedPrivacyMetric): PrivacyMetric {
    return { ...record, timestamp: new Date(record.timestamp) };
  }
}
