import { logger } from "../utils/logger";
import { ValidationRecord, ValidationStatus } from "../types/certification";
import { certificationService } from "./certificationService";

export interface ValidationData {
  certificationId: string;
  validator: string;
  evidence: string[];
  validatedAt: Date;
}

/**
 * In-memory validation record store.
 * In production, this would be backed by PostgreSQL via DatabaseService.
 */
class ValidationDatabaseService {
  private records: Map<string, Map<string, ValidationRecord>> = new Map();

  async store(
    certificationId: string,
    record: ValidationRecord,
  ): Promise<void> {
    if (!this.records.has(certificationId)) {
      this.records.set(certificationId, new Map());
    }
    this.records.get(certificationId)!.set(record.id, record);
    logger.info(
      `Stored validation record ${record.id} for certification ${certificationId}`,
    );
  }

  async fetch(certificationId: string): Promise<ValidationRecord[]> {
    const certRecords = this.records.get(certificationId);
    if (!certRecords) return [];
    return Array.from(certRecords.values()).sort(
      (a, b) => b.validatedAt.getTime() - a.validatedAt.getTime(),
    );
  }
}

const validationStore = new ValidationDatabaseService();

/**
 * Evidence-based validation rule.
 *
 * Each rule maps a set of heuristics against the provided evidence to
 * produce a score. The score is on a 0–100 scale. A minimum of 60 is
 * required for approval. Individual rules can veto (force rejection)
 * when critical evidence is missing.
 */
export interface ValidationRule {
  name: string;
  description: string;
  score: number;
  veto: boolean;
  check(evidence: string[]): boolean;
}

/**
 * Predefined suite of validation rules that inspect the provided
 * evidence for common privacy-certification indicators.
 */
export const VALIDATION_RULES: ValidationRule[] = [
  {
    name: "privacy_policy_present",
    description: "Evidence includes a link or reference to a privacy policy",
    score: 20,
    veto: true,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("privacy") ||
          e.includes("policy") ||
          /https?:\/\//i.test(e),
      ),
  },
  {
    name: "data_inventory_provided",
    description: "Evidence references a data inventory or schema",
    score: 20,
    veto: false,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("data") ||
          e.includes("schema") ||
          e.includes("inventory") ||
          e.includes("catalog") ||
          e.includes("classification"),
      ),
  },
  {
    name: "consent_mechanism",
    description: "Evidence mentions consent management or user opt-in flow",
    score: 15,
    veto: false,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("consent") ||
          e.includes("opt-in") ||
          e.includes("optin") ||
          e.includes("approval") ||
          e.includes("authorization"),
      ),
  },
  {
    name: "encryption_controls",
    description: "Evidence demonstrates encryption or cryptographic controls",
    score: 15,
    veto: false,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("encrypt") ||
          e.includes("TLS") ||
          e.includes("SSL") ||
          e.includes("crypt") ||
          e.includes("hash"),
      ),
  },
  {
    name: "access_controls",
    description: "Evidence describes access controls or IAM practices",
    score: 15,
    veto: false,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("access") ||
          e.includes("role") ||
          e.includes("permission") ||
          e.includes("IAM") ||
          e.includes("ACL") ||
          e.includes("audit"),
      ),
  },
  {
    name: "breach_response",
    description: "Evidence mentions incident response or breach notification processes",
    score: 15,
    veto: false,
    check: (evidence) =>
      evidence.some(
        (e) =>
          e.includes("breach") ||
          e.includes("incident") ||
          e.includes("response") ||
          e.includes("notification") ||
          e.includes("remediation"),
      ),
  },
];

/**
 * Evaluates evidence against the validation rule suite and returns
 * a structured result.
 */
export function evaluateEvidence(evidence: string[]): {
  status: ValidationStatus;
  score: number;
  maxScore: number;
  violatedRules: string[];
  metRules: string[];
  comments: string;
} {
  if (!evidence || evidence.length === 0) {
    return {
      status: "rejected",
      score: 0,
      maxScore: 100,
      violatedRules: VALIDATION_RULES.map((r) => r.name),
      metRules: [],
      comments:
        "Validation rejected: No evidence was provided. At minimum, evidence referencing a privacy policy is required.",
    };
  }

  let totalScore = 0;
  const maxScore = 100;
  const metRules: string[] = [];
  const violatedRules: string[] = [];

  for (const rule of VALIDATION_RULES) {
    if (rule.check(evidence)) {
      totalScore += rule.score;
      metRules.push(rule.name);
    } else {
      violatedRules.push(rule.name);
      if (rule.veto) {
        return {
          status: "rejected",
          score: totalScore,
          maxScore,
          violatedRules: [rule.name],
          metRules,
          comments: `Validation rejected: Missing critical evidence for "${rule.name}" (${rule.description}). Provide the required evidence and resubmit.`,
        };
      }
    }
  }

  const passingThreshold = 60;
  const status: ValidationStatus =
    totalScore >= passingThreshold ? "approved" : "rejected";

  const comments =
    status === "approved"
      ? `Validation passed with score ${totalScore}/${maxScore}. Rules met: ${metRules.join(", ")}.`
      : `Validation failed with score ${totalScore}/${maxScore} (threshold: ${passingThreshold}). Rules not met: ${violatedRules.join(", ")}.`;

  return { status, score: totalScore, maxScore, violatedRules, metRules, comments };
}

class ValidationService {
  /**
   * Validate a certification using evidence-based rules.
   *
   * Evidence is evaluated against predefined validation heuristics.
   * Certifications are approved only when they pass a minimum score
   * threshold AND satisfy all veto rules.
   */
  async validateCertification(data: ValidationData): Promise<ValidationRecord> {
    try {
      const evaluation = evaluateEvidence(data.evidence);

      const validationRecord: ValidationRecord = {
        id: await this.generateValidationId(),
        validator: data.validator,
        status: evaluation.status,
        evidence: data.evidence,
        validatedAt: data.validatedAt,
        comments: evaluation.comments,
        score: evaluation.score,
        maxScore: evaluation.maxScore,
      };

      // Persist the validation record
      await validationStore.store(data.certificationId, validationRecord);

      // Update certification with validation record
      const newStatus =
        evaluation.status === "approved" ? "validated" : "pending";
      await certificationService.updateCertificationStatus(
        data.certificationId,
        newStatus,
        data.validator,
        evaluation.comments,
      );

      logger.info(
        `Validated certification ${data.certificationId} by ${data.validator}: ${evaluation.status} (score: ${evaluation.score}/${evaluation.maxScore})`,
      );
      return validationRecord;
    } catch (error) {
      logger.error("Error validating certification:", error);
      throw error;
    }
  }

  /**
   * Retrieve all validation records for a certification.
   */
  async getValidationHistory(
    certificationId: string,
  ): Promise<ValidationRecord[]> {
    try {
      return await validationStore.fetch(certificationId);
    } catch (error) {
      logger.error("Error fetching validation history:", error);
      throw error;
    }
  }

  /**
   * Submit a certification for third-party validation.
   *
   * NOTE: Third-party validation integration is not yet implemented.
   * This endpoint returns HTTP 501 (Not Implemented) to explicitly
   * signal that real third-party validation is unavailable, rather
   * than fabricating a random approval decision.
   *
   * To implement: integrate with a real third-party validation API
   * (e.g., TrustGuard, GDPR Validator AI) and remove this guard.
   */
  async submitThirdPartyValidation(
    certificationId: string,
    validatorName: string,
    evidence: string[],
  ): Promise<ValidationRecord> {
    try {
      // Instead of a busy-loop and Math.random() coin flip,
      // we explicitly signal that third-party validation is
      // not yet integrated.
      throw new NotImplementedError(
        "Third-party validation is not yet implemented. " +
          "Please use the internal validation flow " +
          "(`POST /api/v1/certifications/:id/validate`) " +
          "which performs evidence-based evaluation, or " +
          "contact the platform team to configure a real " +
          "third-party validator integration.",
      );
    } catch (error) {
      if (error instanceof NotImplementedError) {
        throw error;
      }
      logger.error("Error in third-party validation:", error);
      throw error;
    }
  }

  private async generateValidationId(): Promise<string> {
    return `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate with a specific third-party validator by ID.
   *
   * Same constraint as submitThirdPartyValidation — returns 501
   * until a real validator integration is configured.
   */
  async validateWithThirdParty(
    certificationId: string,
    validatorId: string,
    evidence: string[],
  ): Promise<ValidationRecord> {
    try {
      const validators = await this.getAvailableValidators();
      const validator = validators.find((v) => v.id === validatorId);

      if (!validator) {
        throw new Error("Validator not found");
      }

      if (!validator.isActive) {
        throw new Error("Validator is not active");
      }

      return await this.submitThirdPartyValidation(
        certificationId,
        validator.name,
        evidence,
      );
    } catch (error) {
      logger.error("Error validating with third party:", error);
      throw error;
    }
  }

  async getAvailableValidators(): Promise<
    Array<{
      id: string;
      name: string;
      type: "automated" | "human" | "hybrid";
      accreditation?: string;
      apiUrl?: string;
      isActive: boolean;
    }>
  > {
    // Registered validators - in production, this would fetch from database
    return [
      {
        id: "validator-1",
        name: "Privacy Compliance Institute",
        type: "human",
        accreditation: "ISO/IEC 27001 certified",
        isActive: true,
      },
      {
        id: "validator-2",
        name: "GDPR Validator AI",
        type: "automated",
        apiUrl: "https://api.gdpr-validator.com/validate",
        isActive: true,
      },
      {
        id: "validator-3",
        name: "TrustGuard Compliance",
        type: "hybrid",
        accreditation: "SOC2 Type II certified",
        isActive: true,
      },
    ];
  }
}

/**
 * Custom error type for not-yet-implemented functionality.
 * Carries a statusCode so the global error handler returns HTTP 501.
 */
export class NotImplementedError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
    this.statusCode = 501;
    this.isOperational = true;
  }
}

export const validationService = new ValidationService();