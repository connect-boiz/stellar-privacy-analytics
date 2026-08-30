/**
 * Tests for PrivacyMetrics durable persistence (QI-036).
 *
 * Verifies that:
 *  1. Recorded metrics are flushed to a durable JSONL store.
 *  2. After a simulated process restart (new instance, same store file),
 *     historical metrics are recovered and queryable via getMetrics().
 *  3. The in-memory buffer is bounded by maxBufferSize while persisted data
 *     remains intact.
 *  4. recordResponse updates are persisted with last-write-wins semantics.
 *  5. With persistence disabled the legacy in-memory-only behaviour is kept.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { PrivacyMetrics } from "../PrivacyMetrics";
import { MetricsStore } from "../MetricsStore";
import { MetricsConfig } from "../PrivacyApiGateway";

jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const RETENTION = 7 * 24 * 60 * 60 * 1000;

function makeConfig(overrides: Partial<MetricsConfig> = {}): MetricsConfig {
  return {
    enabled: true,
    collectionInterval: 60000,
    retentionPeriod: RETENTION,
    exportFormat: "json",
    ...overrides,
  };
}

function makeReqRes(
  requestId: string,
  statusCode: number,
  overrides: Record<string, any> = {},
) {
  const req: any = {
    requestId,
    path: "/api/data",
    method: "GET",
    ip: "10.0.0.1",
    headers: { "user-agent": "jest" },
    privacyLevel: "high",
    appliedPolicies: [],
    appliedTransformations: [],
    ...overrides,
  };
  const res: any = { statusCode };
  return { req, res };
}

describe("PrivacyMetrics persistence (QI-036)", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-metrics-"));
    storePath = path.join(tmpDir, "metrics.jsonl");
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function persistentConfig(overrides: Record<string, any> = {}): MetricsConfig {
    return makeConfig({
      persistence: {
        enabled: true,
        filePath: storePath,
        flushInterval: 1000,
        maxBufferSize: 5,
        ...overrides,
      },
    });
  }

  it("flushes recorded metrics to the durable store", async () => {
    const metrics = new PrivacyMetrics(persistentConfig());
    await metrics.start();

    for (let i = 0; i < 3; i++) {
      const { req, res } = makeReqRes(`req-${i}`, 200);
      metrics.recordRequest(req, res, 10);
    }

    // Trigger the flush interval.
    jest.advanceTimersByTime(1000);

    expect(fs.existsSync(storePath)).toBe(true);
    const persisted = new MetricsStore({
      filePath: storePath,
      retentionPeriod: RETENTION,
    }).load();
    expect(persisted).toHaveLength(3);

    await metrics.stop();
  });

  it("recovers historical metrics after a restart", async () => {
    // First "process" records metrics and shuts down.
    const first = new PrivacyMetrics(persistentConfig());
    await first.start();
    for (let i = 0; i < 4; i++) {
      const { req, res } = makeReqRes(`req-${i}`, i === 0 ? 403 : 200);
      first.recordRequest(req, res, 5);
    }
    await first.stop(); // final flush

    // Second "process" starts fresh against the same store file.
    const second = new PrivacyMetrics(persistentConfig());
    await second.start();

    const aggregated = await second.getMetrics();
    expect(aggregated.totalRequests).toBe(4);
    expect(aggregated.blockedRequests).toBe(1);
    expect(aggregated.successfulRequests).toBe(3);

    const violations = await second.getPrivacyViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0].requestId).toBe("req-0");

    await second.stop();
  });

  it("bounds the in-memory buffer while keeping persisted data intact", async () => {
    const metrics = new PrivacyMetrics(persistentConfig({ maxBufferSize: 5 }));
    await metrics.start();

    for (let i = 0; i < 20; i++) {
      const { req, res } = makeReqRes(`req-${i}`, 200);
      metrics.recordRequest(req, res, 1);
    }

    // In-memory map is capped...
    expect(metrics.getStats().totalMetrics).toBeLessThanOrEqual(5);

    // ...but every record is still queryable (from the store + flush buffer).
    jest.advanceTimersByTime(1000);
    const aggregated = await metrics.getMetrics();
    expect(aggregated.totalRequests).toBe(20);

    await metrics.stop();
  });

  it("persists recordResponse updates with last-write-wins", async () => {
    const metrics = new PrivacyMetrics(persistentConfig());
    await metrics.start();

    const { req, res } = makeReqRes("req-update", 200);
    metrics.recordRequest(req, res, 8);
    // Proxy response later flips the decision to denied.
    metrics.recordResponse(req, { statusCode: 403 });

    await metrics.stop();

    const restarted = new PrivacyMetrics(persistentConfig());
    await restarted.start();
    const aggregated = await restarted.getMetrics();
    expect(aggregated.totalRequests).toBe(1);
    expect(aggregated.blockedRequests).toBe(1);
    await restarted.stop();
  });

  it("keeps legacy in-memory behaviour when persistence is disabled", async () => {
    const metrics = new PrivacyMetrics(makeConfig());
    await metrics.start();

    const { req, res } = makeReqRes("req-mem", 200);
    metrics.recordRequest(req, res, 3);

    expect(metrics.getStats().persistenceEnabled).toBe(false);
    expect(fs.existsSync(storePath)).toBe(false);

    const aggregated = await metrics.getMetrics();
    expect(aggregated.totalRequests).toBe(1);

    await metrics.stop();
  });
});

describe("MetricsStore", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-store-"));
    storePath = path.join(tmpDir, "store.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function record(requestId: string, timestamp: Date): any {
    return {
      timestamp,
      requestId,
      endpoint: "/x",
      method: "GET",
      statusCode: 200,
      responseTime: 1,
      privacyLevel: "high",
      policiesApplied: [],
      transformationsApplied: [],
      accessDecision: "allow",
      dataClassification: "unknown",
      jurisdiction: "unknown",
      ipAddress: "1.1.1.1",
      userAgent: "test",
    };
  }

  it("appends and reloads records, reviving Date timestamps", () => {
    const store = new MetricsStore({ filePath: storePath });
    const now = new Date();
    store.append([record("a", now), record("b", now)]);

    const loaded = store.load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].timestamp).toBeInstanceOf(Date);
  });

  it("de-duplicates by requestId with last-write-wins", () => {
    const store = new MetricsStore({ filePath: storePath });
    const now = new Date();
    const first = record("dup", now);
    const second = { ...record("dup", now), accessDecision: "deny" };
    store.append([first]);
    store.append([second]);

    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].accessDecision).toBe("deny");
  });

  it("drops records older than the retention window on load", () => {
    const store = new MetricsStore({
      filePath: storePath,
      retentionPeriod: 1000,
    });
    const old = new Date(Date.now() - 5000);
    const fresh = new Date();
    store.append([record("old", old), record("fresh", fresh)]);

    const loaded = store.load();
    expect(loaded.map((m) => m.requestId)).toEqual(["fresh"]);
  });

  it("skips a corrupt trailing line instead of failing recovery", () => {
    const store = new MetricsStore({ filePath: storePath });
    store.append([record("ok", new Date())]);
    // Simulate a partial write from a crash.
    fs.appendFileSync(storePath, '{"requestId":"broken","timestamp":');

    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].requestId).toBe("ok");
  });

  it("compacts away expired records using an atomic rewrite", () => {
    const store = new MetricsStore({
      filePath: storePath,
      retentionPeriod: 1000,
    });
    store.append([
      record("old", new Date(Date.now() - 5000)),
      record("fresh", new Date()),
    ]);

    const survivors = store.compact();
    expect(survivors).toBe(1);

    const raw = fs.readFileSync(storePath, "utf8").trim().split("\n");
    expect(raw).toHaveLength(1);
    expect(raw[0]).toContain("fresh");
  });
});
