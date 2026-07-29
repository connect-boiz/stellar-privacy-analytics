import Joi from "joi";

// ── Known attribute enum (must stay in sync with PrivacyPolicyEngine.evaluateRule) ──
const KNOWN_ATTRIBUTES = [
  "privacy.level",
  "privacy.jurisdiction",
  "privacy.dataClassification",
  "privacy.consent",
  "privacy.purpose",
  "request.path",
  "request.method",
  "user.role",
  "user.department",
  "user.ipAddress",
] as const;

const KNOWN_OPERATORS = [
  "equals",
  "contains",
  "startsWith",
  "endsWith",
  "regex",
  "not_equals",
] as const;

const KNOWN_ACTIONS = ["allow", "deny", "transform", "log"] as const;

const VALID_TRANSFORMATION_TYPES = [
  "mask",
  "encrypt",
  "hash",
  "remove",
  "pseudonymize",
] as const;

// ── Maximum lengths ──
const MAX_NAME_LENGTH = 200;
const MAX_VALUE_LENGTH = 1000;
const MAX_RULES_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

// ── ReDoS-safe regex check ──
// Detects patterns with exponential backtracking (e.g. nested quantifiers, alternation inside groups)
const REDOS_DANGEROUS_PATTERNS = [
  /\([^)]*\+[^)]*\)[\*\+\?]/, // Group with + inside followed by quantifier → (a+)*
  /\([^)]*\|[^)]*\)[\*\+\?]/, // Alternation group with quantifier → (a|b)*
  /\(\?:[^)]*\+[^)]*\)[\*\+\?]/, // Non-capturing group with + inside followed by quantifier
  /\(\?:[^)]*\|[^)]*\)[\*\+\?]/, // Non-capturing alternation with quantifier
  /\([^)]+\)\s*\{[^}]*,[^}]*\}[*+?]/, // Bounded repetition group then quantifier
  /\+\+/, // Double quantifier
  /\+\*/, // +* pattern
  /\*\+/, // *+ pattern
  /\{\d+,\d+\}\+/, // {n,m}+ pattern
  /\.\*\.\*/, // .*.* → classic catastrophic backtracking sign
];

/**
 * Returns true if the pattern is considered safe (not vulnerable to ReDoS).
 */
export function isRegexSafe(pattern: string): boolean {
  if (!pattern || pattern.length > 500) {
    return false;
  }

  // Strip flags if present (e.g. /pattern/gi)
  let body = pattern;
  if (body.startsWith("/")) {
    const lastSlash = body.lastIndexOf("/");
    if (lastSlash > 0) {
      body = body.slice(1, lastSlash);
    }
  }

  // Check for nested quantifiers or dangerous patterns
  for (const dangerousPattern of REDOS_DANGEROUS_PATTERNS) {
    if (dangerousPattern.test(body)) {
      return false;
    }
  }

  // Try compiling the regex to verify it's syntactically valid
  try {
    new RegExp(body);
  } catch {
    return false;
  }

  // Check for excessive alternation depth (can still cause ReDoS in some engines)
  const alternationCount = (body.match(/\|/g) || []).length;
  if (alternationCount > 10) {
    return false;
  }

  return true;
}

// ── HTML / XSS sanitization ──
const HTML_TAG_PATTERN = /<[^>]*>/g;
const SCRIPT_PATTERN =
  /(?:<script[\s\S]*?>[\s\S]*?<\/script>|javascript\s*:|on\w+\s*=)/gi;

/**
 * Strips HTML tags and script-related content from a string.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return input;
  return input.replace(HTML_TAG_PATTERN, "").replace(SCRIPT_PATTERN, "");
}

// ── Transformation rule sub-schema ──
const transformationRuleSchema = Joi.object({
  type: Joi.string()
    .valid(...VALID_TRANSFORMATION_TYPES)
    .required(),
  field: Joi.string().max(200).required(),
  algorithm: Joi.string().max(100).optional(),
  parameters: Joi.object().optional(),
}).unknown(false);

// ── Policy rule sub-schema ──
const policyRuleSchema = Joi.object({
  attribute: Joi.string()
    .valid(...KNOWN_ATTRIBUTES)
    .required()
    .messages({
      "any.only":
        "rule.attribute must be one of the known privacy attributes: " +
        KNOWN_ATTRIBUTES.join(", "),
    }),
  operator: Joi.string()
    .valid(...KNOWN_OPERATORS)
    .required()
    .messages({
      "any.only":
        "rule.operator must be one of: " + KNOWN_OPERATORS.join(", "),
    }),
  value: Joi.string().max(MAX_VALUE_LENGTH).required(),
  action: Joi.string()
    .valid(...KNOWN_ACTIONS)
    .required()
    .messages({
      "any.only":
        "rule.action must be one of: " + KNOWN_ACTIONS.join(", "),
    }),
  transformation: Joi.when("action", {
    is: "transform",
    then: transformationRuleSchema.required(),
    otherwise: transformationRuleSchema.optional(),
  }),
}).unknown(false);

// ── Policy schema (CRUD payload) ──
export const policySchema = Joi.object({
  id: Joi.string().max(100).required(),
  name: Joi.string().max(MAX_NAME_LENGTH).required(),
  description: Joi.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  rules: Joi.array()
    .items(policyRuleSchema)
    .min(1)
    .max(MAX_RULES_LENGTH)
    .required(),
  priority: Joi.number().integer().min(0).required(),
  enabled: Joi.boolean().required(),
})
  .unknown(false) // Strict mode: reject unknown/extra fields
  .messages({
    "object.unknown": "Unknown field {{#label}} is not allowed in policy payload",
  });

// ── Known regex-operator rules that need ReDoS check ──
export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
  sanitizedDescription?: string;
}

/**
 * Validate and sanitize a policy payload before storage.
 * Returns either a validated result with sanitized strings, or an error.
 */
export function validateAndSanitizePolicy(
  rawPayload: unknown,
): ValidationResult {
  // 1. Check for prototype pollution (__proto__ / constructor keys)
  //    `__proto__` in a JSON payload is treated as a prototype-setter by
  //    JSON.parse, so we cannot detect it via hasOwnProperty or JSON.stringify.
  //    Instead, check that the prototype is the expected Object.prototype.
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const proto = Object.getPrototypeOf(rawPayload as object);
    // A normal parsed JSON object always has Object.prototype (or null for
    // Object.create(null)). Any other prototype means __proto__ was injected.
    if (proto !== Object.prototype && proto !== null) {
      return { valid: false, error: "Prototype pollution detected: __proto__ key" };
    }
    // `constructor` spread into an object literal becomes an own property.
    if (Object.prototype.hasOwnProperty.call(rawPayload, "constructor")) {
      return { valid: false, error: "Prototype pollution detected: constructor key" };
    }
  }

  // 2. Joi validation
  const { error, value } = policySchema.validate(rawPayload, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    return { valid: false, error: `Policy validation failed: ${details}` };
  }

  // 3. Guard against null/undefined value from Joi validation
  if (!value || typeof value !== "object") {
    return { valid: false, error: "Policy validation failed: payload must be a valid object" };
  }

  // 4. ReDoS safety check for regex rules
  for (let i = 0; i < value.rules.length; i++) {
    const rule = value.rules[i];
    if (rule.operator === "regex") {
      if (!isRegexSafe(rule.value)) {
        return {
          valid: false,
          error: `Rule[${i}] contains an unsafe regex pattern that may cause ReDoS`,
        };
      }
    }
  }

  // 5. Sanitize name/description
  const sanitizedName = sanitizeHtml(value.name);
  const sanitizedDescription = value.description
    ? sanitizeHtml(value.description)
    : undefined;

  return {
    valid: true,
    sanitizedName,
    sanitizedDescription,
  };
}

export { KNOWN_ATTRIBUTES, KNOWN_OPERATORS, KNOWN_ACTIONS };
