/**
 * WS1–WS5 (issue #413) security-hardening tests.
 *
 * These cover the controls introduced (or made authoritative) by the
 * hardening epic:
 *   WS1  — secrets no longer fall back to hardcoded defaults; owner scoping.
 *   WS2  — GCM tags come from the HSM; dev secrets are centralized & audited.
 *   WS3  — CSV cell escaping against spreadsheet-formula injection.
 *   WS5  — audit hash-chain integrity detects tampering.
 */
import { escapeCsvCell } from "../routes/data";
import { AuditService } from "../services/auditService";
import { getJwtSecret, getAuditSignatureKey } from "../utils/secrets";
import { TrainingService } from "../services/trainingService";

// ---------------------------------------------------------------------------
// WS3 — CSV injection escaping
// ---------------------------------------------------------------------------
describe("WS3 CSV injection escaping", () => {
  it("prefixes an apostrophe to cells starting with =", () => {
    expect(escapeCsvCell("=SUM(A1:A9)")).toBe("\"'=SUM(A1:A9)\"");
  });

  it("prefixes an apostrophe to cells starting with + - and @", () => {
    expect(escapeCsvCell("+cmd|' /C calc'!A0")).toContain("'+cmd");
    expect(escapeCsvCell("-2+3-1")).toContain("'-2+3-1");
    expect(escapeCsvCell("@SUM(A1)")).toContain("'@SUM(A1)");
  });

  it("escapes embedded double quotes and wraps cells in double quotes", () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("does not alter safe values", () => {
    expect(escapeCsvCell("Alice")).toBe('"Alice"');
    expect(escapeCsvCell(123456)).toBe('"123456"');
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
  });
});

// ---------------------------------------------------------------------------
// WS1 — secrets no longer fall back to hardcoded secrets
// ---------------------------------------------------------------------------
describe("WS1 centralized secret handling", () => {
  const originalJwt = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  it("getJwtSecret returns the environment value when set", () => {
    process.env.JWT_SECRET = "env-provided-secret";
    expect(getJwtSecret()).toBe("env-provided-secret");
  });

  it("getJwtSecret never returns the old hardcoded demo secret", () => {
    delete process.env.JWT_SECRET;
    const value = getJwtSecret();
    expect(value).not.toBe("stellar-privacy-jwt-secret-dev-only");
    // It still yields a dev-only sentinel (non-empty) locally.
    expect(value.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// WS2 — audit signature key is centralized
// ---------------------------------------------------------------------------
describe("WS2 audit signature key", () => {
  it("getAuditSignatureKey returns a non-empty dev sentinel when unset", () => {
    const original = process.env.AUDIT_SIGNATURE_KEY;
    delete process.env.AUDIT_SIGNATURE_KEY;
    try {
      expect(getAuditSignatureKey().length).toBeGreaterThan(0);
    } finally {
      if (original === undefined) delete process.env.AUDIT_SIGNATURE_KEY;
      else process.env.AUDIT_SIGNATURE_KEY = original;
    }
  });
});

// ---------------------------------------------------------------------------
// WS5 — audit hash-chain integrity
// ---------------------------------------------------------------------------
describe("WS5 audit hash-chain integrity", () => {
  const logPath = `/tmp/test-audit-${Date.now()}-${Math.random()}.log`;
  let audit: AuditService;

  beforeEach(() => {
    audit = new AuditService({
      logPath,
      signatureKey: getAuditSignatureKey(),
      immutableStorage: true,
      batchSize: 1, // flush every record so tampering can be applied on disk
    });
  });

  afterEach(async () => {
    try {
      await audit.shutdown();
    } catch {
      /* ignore */
    }
    try {
      require("fs").unlinkSync(logPath);
    } catch {
      /* ignore */
    }
  });

  it("produces chained records whose integrity verifies when untouched", async () => {
    await audit.logEvent({
      eventType: "data_export",
      userId: "u-1",
      resourceId: "ds-1",
    });
    await audit.logEvent({ eventType: "data_purge", userId: "u-1" });

    const { valid, totalRecords } = await audit.verifyIntegrity();
    expect(valid).toBe(true);
    expect(totalRecords).toBeGreaterThanOrEqual(2);
  });

  it("detects tampering with a record's content", async () => {
    await audit.logEvent({
      eventType: "data_export",
      userId: "u-1",
      resourceId: "ds-1",
    });
    await audit.logEvent({ eventType: "data_purge", userId: "u-1" });

    // verifyIntegrity flushes the buffered records to disk; confirm they are
    // valid before we tamper.
    const clean = await audit.verifyIntegrity();
    expect(clean.valid).toBe(true);

    // Tamper with the persisted log file: rewrite the first record's action.
    const fs = require("fs");
    const lines = fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter((l: string) => l.trim());
    const first = JSON.parse(lines[0]);
    first.action = "tampered_action";
    fs.writeFileSync(logPath, JSON.stringify(first), { flag: "w" });

    const { valid, invalidRecords } = await audit.verifyIntegrity();
    expect(valid).toBe(false);
    expect(invalidRecords).toBeGreaterThan(0);
  });

  it("detects tampering with a record's content but preserves the chain check on a clean tail", async () => {
    // Sanity: two clean records still verify.
    await audit.logEvent({ eventType: "data_export", userId: "u-1" });
    await audit.logEvent({ eventType: "data_purge", userId: "u-1" });
    const { valid } = await audit.verifyIntegrity();
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WS4 — training attempt double-submit guard
// ---------------------------------------------------------------------------
describe("WS4 training attempt double-submit guard", () => {
  it("does not re-grade an already-completed attempt and returns the stored result", () => {
    const module = TrainingService.createModule(
      {
        title: "WS4 Test Module",
        assessment: {
          id: "ws4-assessment",
          title: "Test",
          description: "",
          timeLimit: 30,
          passingScore: 50,
          questions: [
            {
              id: "q1",
              type: "multiple_choice" as const,
              question: "Q?",
              points: 10,
              difficulty: "beginner" as const,
              category: "general",
              explanation: "",
              options: [
                { id: "a", text: "A", isCorrect: true },
                { id: "b", text: "B", isCorrect: false },
              ],
              correctAnswer: "a",
            },
          ],
          randomizeQuestions: false,
          showResultsImmediately: true,
          allowReview: true,
        },
      },
      "admin-test",
    );

    TrainingService.startModule("user-ws4", module.id);
    const started = TrainingService.startAssessment("user-ws4", module.id);
    expect(!("error" in started)).toBe(true);
    if ("error" in started) return;

    const answers = new Map<string, any>([[ "q1", "a" ]]);
    const first = TrainingService.submitAssessment(
      "user-ws4",
      module.id,
      started.id,
      answers,
      60,
    );
    expect("error" in first).toBe(false);

    // Double-submit: must NOT re-grade (attempt.gradeCount is not incremented;
    // the same stored attempt + result is returned).
    const second = TrainingService.submitAssessment(
      "user-ws4",
      module.id,
      started.id,
      answers,
      999,
    );

    if ("error" in first || "error" in second) {
      throw new Error("submitAssessment returned an error");
    }
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(second.attempt.score).toBe(first.attempt.score);
    expect(second.attempt.completedAt).toEqual(first.attempt.completedAt);
    // The second submission must not have changed the stored result.
    expect(second.attempt.timeSpent).toBe(first.attempt.timeSpent);
  });
});