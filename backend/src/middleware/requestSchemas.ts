import { body, param, query } from "express-validator";
import { validateRequest } from "./validation";

/**
 * WS3 (issue #413) — shared request-schema registry.
 *
 * Every mutating route must mount one of these schema arrays together with
 * `validateRequest`, so malformed payloads are rejected with 400 before they
 * reach any handler. Keeping the schemas here makes validation consistent
 * and auditable via the route-table test.
 */

export const schemas = {
  // ── Data / datasets ────────────────────────────────────────────────
  datasetUpload: [
    body("name")
      .optional({ values: "null" })
      .isString()
      .trim()
      .isLength({ max: 255 }),
    body("mimeType").optional({ values: "null" }).trim().isLength({ max: 255 }),
    body("size").optional().isInt({ min: 0, max: 10 * 1024 * 1024 * 1024 }),
  ],
  datasetId: [param("id").trim().matches(/^[a-zA-Z0-9_-]{1,128}$/)],
  datasetExport: [query("format").optional().isIn(["json", "csv"])],

  // ── HSM / key management ──────────────────────────────────────────
  hsmGenerateKey: [
    body("purpose").isString().isLength({ min: 1, max: 100 }),
    body("context").optional().isObject(),
    body("ttl").optional().isInt({ min: 60, max: 86400 }),
  ],
  hsmDecryptKey: [
    body("wrappedKey").isObject(),
    body("purpose").isString().isLength({ min: 1, max: 100 }),
    body("context").optional().isObject(),
  ],
  hsmReason: [body("reason").isString().isLength({ min: 1, max: 500 })],

  // ── IPFS ──────────────────────────────────────────────────────────
  ipfsCid: [param("cid").trim().matches(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z0-9]{58,59})$/)],
  ipfsUpload: [
    body("fileName").isString().trim().isLength({ min: 1, max: 255 }),
    body("encrypted").optional().isBoolean(),
    body("version").optional().isInt({ min: 0 }),
    body("uploader").optional().isString().isLength({ max: 128 }),
    body("decryptionKeyHash").optional().isString().isLength({ max: 128 }),
  ],
  ipfsCidsBatch: [
    body("cids").isArray({ min: 1, max: 100 }),
    body("cids.*")
      .isString()
      .matches(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z0-9]{58,59})$/),
  ],
  ipfsEncryptedUpload: [
    body("datasetId").isString().isLength({ min: 1, max: 128 }),
    body("data").isString().isLength({ min: 1, max: 50 * 1024 * 1024 }),
    body("encryptionKeyId").optional().isString().isLength({ max: 128 }),
    body("storeOnLedger").optional().isBoolean(),
    body("metadata").optional().isObject(),
  ],
  ipfsVerifyKey: [
    body("decryptionKey").isString().isLength({ min: 1, max: 4096 }),
    body("keyHash").isString().isLength({ min: 1, max: 128 }),
  ],

  // ── Training ──────────────────────────────────────────────────────
  trainingModuleId: [
    param("moduleId").trim().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  ],
  trainingCreateModule: [
    body("title").isString().trim().isLength({ min: 1, max: 500 }),
    body("description").optional().isString().isLength({ max: 10000 }),
    body("category").optional().isString().isLength({ max: 200 }),
    body("difficulty")
      .optional()
      .isIn(["beginner", "intermediate", "advanced"]),
    body("estimatedDuration").optional().isInt({ min: 1, max: 10080 }),
    body("passingScore").optional().isInt({ min: 0, max: 100 }),
  ],
  trainingStartModule: [
    body("moduleId").trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  ],
  trainingSubmitExercise: [
    body("moduleId").trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
    body("exerciseId").trim().notEmpty().isLength({ max: 128 }),
    body("answers").isObject(),
  ],
  trainingSubmitAssessment: [
    body("moduleId").trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
    body("attemptId").trim().notEmpty().isLength({ max: 128 }),
    body("answers").isObject(),
    body("timeSpent").optional().isInt({ min: 0, max: 1_000_000_000 }),
  ],

  // ── Privacy budget ────────────────────────────────────────────────
  budgetAllocate: [
    body("datasetId").isString().isLength({ min: 1, max: 128 }),
    body("name").isString().isLength({ min: 1, max: 255 }),
    body("maxEpsilon").isFloat({ min: 0.001, max: 100 }),
    body("organizationId").isString().isLength({ min: 1, max: 128 }),
  ],
  budgetConsume: [
    body("budgetId").isString().isLength({ min: 1, max: 128 }),
    body("amount").isFloat({ min: 0.000001, max: 100 }),
    body("operation").isString().isLength({ min: 1, max: 128 }),
    body("description").optional().isString().isLength({ max: 500 }),
  ],
};

export { validateRequest };
