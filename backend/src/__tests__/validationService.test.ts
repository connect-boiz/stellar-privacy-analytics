import {
  validationService,
  evaluateEvidence,
  NotImplementedError,
  VALIDATION_RULES,
} from "../services/validationService";
import { ValidationRecord } from "../types/certification";

// Mock the certification service so validation tests don't hit the
// real certification store.
jest.mock("../services/certificationService", () => ({
  certificationService: {
    updateCertificationStatus: jest.fn().mockResolvedValue({}),
  },
}));

// Import after mocking
import { certificationService } from "../services/certificationService";

const mockedUpdateCertificationStatus =
  certificationService.updateCertificationStatus as jest.Mock;

const COMPREHENSIVE_EVIDENCE = [
  "https://acme.example/privacy-policy — Privacy policy covering GDPR and CCPA",
  "data inventory and data classification schema for all personal data",
  "consent management with opt-in flow and user authorization records",
  "TLS 1.3 encryption and SHA-256 hashing of personal data at rest",
  "role-based access controls, IAM policies and audit logs",
  "incident response and breach notification procedure (72h SLA)",
];

describe("ValidationService — evidence-based validation", () => {
  beforeEach(() => {
    mockedUpdateCertificationStatus.mockClear();
  });

  describe("evaluateEvidence", () => {
    it("rejects with score 0 when no evidence is provided", () => {
      const result = evaluateEvidence([]);

      expect(result.status).toBe("rejected");
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(100);
      expect(result.metRules).toHaveLength(0);
      expect(result.comments).toContain("No evidence was provided");
    });

    it("approves comprehensive evidence with a score at or above the threshold", () => {
      const result = evaluateEvidence(COMPREHENSIVE_EVIDENCE);

      expect(result.status).toBe("approved");
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metRules).toContain("privacy_policy_present");
    });

    it("is deterministic — identical evidence always produces identical outcome", () => {
      const first = evaluateEvidence(COMPREHENSIVE_EVIDENCE);
      const second = evaluateEvidence(COMPREHENSIVE_EVIDENCE);

      expect(first.status).toBe(second.status);
      expect(first.score).toBe(second.score);
      expect(first.comments).toBe(second.comments);
    });

    it("rejects when the mandatory privacy-policy evidence is missing", () => {
      // All non-veto rules satisfied except the veto rule
      const evidenceWithoutPolicy = [
        "data inventory and classification schema",
        "consent management with opt-in flow",
        "TLS 1.3 encryption of personal data at rest",
        "role-based access controls and audit logs",
        "incident response and breach notification procedure",
      ];

      const result = evaluateEvidence(evidenceWithoutPolicy);

      expect(result.status).toBe("rejected");
      expect(result.violatedRules).toContain("privacy_policy_present");
      expect(result.comments).toContain("Missing critical evidence");
    });

    it("rejects when the accumulated score is below the passing threshold", () => {
      // Only weak, non-critical evidence
      const weakEvidence = ["We have a privacy policy"];

      const result = evaluateEvidence(weakEvidence);

      expect(result.status).toBe("rejected");
      expect(result.score).toBeLessThan(60);
      expect(result.comments).toContain("threshold");
    });
  });

  describe("validateCertification", () => {
    const baseData = {
      certificationId: "cert-approve-1",
      validator: "Privacy Compliance Institute",
      validatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    it("approves and persists a validation record when evidence is comprehensive", async () => {
      const record = await validationService.validateCertification({
        ...baseData,
        certificationId: "cert-approve-1",
        evidence: COMPREHENSIVE_EVIDENCE,
      });

      expect(record.status).toBe("approved");
      expect(record.score).toBeGreaterThanOrEqual(60);
      expect(record.maxScore).toBe(100);
      expect(record.validator).toBe(baseData.validator);
      expect(record.evidence).toEqual(COMPREHENSIVE_EVIDENCE);
      expect(record.id).toMatch(/^val_/);

      // Certification status must be updated to validated
      expect(mockedUpdateCertificationStatus).toHaveBeenCalledWith(
        baseData.certificationId,
        "validated",
        baseData.validator,
        expect.any(String),
      );

      // Record must be persisted and retrievable via history
      const history = await validationService.getValidationHistory(
        baseData.certificationId,
      );
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(record.id);
      expect(history[0].status).toBe("approved");
    });

    it("rejects and keeps certification pending when evidence is insufficient", async () => {
      const record = await validationService.validateCertification({
        ...baseData,
        certificationId: "cert-reject-1",
        evidence: ["only minimal evidence"],
      });

      expect(record.status).toBe("rejected");
      expect(record.score).toBeLessThan(60);

      expect(mockedUpdateCertificationStatus).toHaveBeenCalledWith(
        "cert-reject-1",
        "pending",
        baseData.validator,
        expect.any(String),
      );

      const history = await validationService.getValidationHistory(
        "cert-reject-1",
      );
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("rejected");
    });

    it("stores multiple validation attempts as an audit trail", async () => {
      const certId = "cert-audit-1";
      const first = await validationService.validateCertification({
        ...baseData,
        certificationId: certId,
        validatedAt: new Date("2026-01-01T10:00:00Z"),
        evidence: ["only minimal evidence"],
      });
      const second = await validationService.validateCertification({
        ...baseData,
        certificationId: certId,
        validatedAt: new Date("2026-01-01T11:00:00Z"),
        evidence: COMPREHENSIVE_EVIDENCE,
      });

      const history = await validationService.getValidationHistory(certId);

      expect(history).toHaveLength(2);
      expect(history.map((r) => r.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      // Most recent first
      expect(history[0].id).toBe(second.id);
    });
  });

  describe("getValidationHistory", () => {
    it("returns an empty array for a certification with no records", async () => {
      const history = await validationService.getValidationHistory(
        "cert-never-validated",
      );

      expect(history).toEqual([]);
    });
  });

  describe("submitThirdPartyValidation", () => {
    it("throws NotImplementedError (HTTP 501) instead of a random decision", async () => {
      await expect(
        validationService.submitThirdPartyValidation(
          "cert-thirdparty-1",
          "GDPR Validator AI",
          COMPREHENSIVE_EVIDENCE,
        ),
      ).rejects.toThrow(NotImplementedError);

      // The thrown error must carry the 501 status code
      try {
        await validationService.submitThirdPartyValidation(
          "cert-thirdparty-2",
          "GDPR Validator AI",
          COMPREHENSIVE_EVIDENCE,
        );
      } catch (error) {
        expect((error as NotImplementedError).statusCode).toBe(501);
        expect((error as NotImplementedError).message).toContain(
          "not yet implemented",
        );
      }
    });

    it("does not mutate certification status when third-party validation is unavailable", async () => {
      await validationService
        .submitThirdPartyValidation(
          "cert-thirdparty-3",
          "GDPR Validator AI",
          COMPREHENSIVE_EVIDENCE,
        )
        .catch(() => {
          // expected rejection
        });

      expect(mockedUpdateCertificationStatus).not.toHaveBeenCalled();
    });
  });

  describe("validateWithThirdParty", () => {
    it("rejects unknown validator IDs before reaching the third-party call", async () => {
      await expect(
        validationService.validateWithThirdParty(
          "cert-thirdparty-4",
          "does-not-exist",
          COMPREHENSIVE_EVIDENCE,
        ),
      ).rejects.toThrow("Validator not found");
    });

    it("throws NotImplementedError for a known validator until integration exists", async () => {
      await expect(
        validationService.validateWithThirdParty(
          "cert-thirdparty-5",
          "validator-1",
          COMPREHENSIVE_EVIDENCE,
        ),
      ).rejects.toThrow(NotImplementedError);
    });
  });

  describe("rule suite integrity", () => {
    it("has a passing threshold reachable only by satisfying multiple rules", () => {
      // The veto rule alone must not be enough to pass
      const vetoOnlyScore = VALIDATION_RULES.find(
        (r) => r.veto,
      )!.score;
      expect(vetoOnlyScore).toBeLessThan(60);
    });

    it("exports the validation rule suite", () => {
      expect(VALIDATION_RULES.length).toBeGreaterThan(0);
      expect(VALIDATION_RULES.some((r) => r.veto)).toBe(true);
    });
  });
});
