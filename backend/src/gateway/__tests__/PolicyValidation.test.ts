import {
  validateAndSanitizePolicy,
  sanitizeHtml,
  isRegexSafe,
} from "../policyValidation";

// ── Valid baseline policy used across tests ──
const validPolicy = {
  id: "policy-001",
  name: "GDPR-Compliant Access",
  rules: [
    {
      attribute: "privacy.level",
      operator: "equals" as const,
      value: "high",
      action: "allow" as const,
    },
  ],
  priority: 10,
  enabled: true,
};

describe("validateAndSanitizePolicy", () => {
  // ── Happy path ──
  it("accepts a valid policy payload", () => {
    const result = validateAndSanitizePolicy(validPolicy);
    expect(result.valid).toBe(true);
    expect(result.sanitizedName).toBe("GDPR-Compliant Access");
  });

  it("accepts a policy with optional description", () => {
    const policy = { ...validPolicy, description: "Enforces GDPR access rules" };
    const result = validateAndSanitizePolicy(policy);
    expect(result.valid).toBe(true);
    expect(result.sanitizedDescription).toBe("Enforces GDPR access rules");
  });

  // ── Prototype pollution ──
  it("rejects __proto__ key (prototype pollution)", () => {
    const payload = {
      ...validPolicy,
      __proto__: { isAdmin: true },
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Prototype pollution");
  });

  it("rejects constructor key (prototype pollution)", () => {
    const payload = {
      ...validPolicy,
      constructor: { prototype: { isAdmin: true } },
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Prototype pollution");
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const payload = {
      ...validPolicy,
      injectedAdmin: true,
      extraNasty: "evil",
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown field");
  });

  it("rejects unknown fields inside rules (strict mode)", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "equals",
          value: "high",
          action: "allow",
          injectedField: "malicious",
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  // ── Missing required fields ──
  it("rejects payload missing id", () => {
    const { id: _, ...noId } = validPolicy;
    const result = validateAndSanitizePolicy(noId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("id");
  });

  it("rejects payload missing name", () => {
    const { name: _, ...noName } = validPolicy;
    const result = validateAndSanitizePolicy(noName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("name");
  });

  it("rejects payload missing rules", () => {
    const { rules: _, ...noRules } = validPolicy;
    const result = validateAndSanitizePolicy(noRules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("rules");
  });

  it("rejects payload with empty rules array", () => {
    const payload = { ...validPolicy, rules: [] };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("rules");
  });

  it("rejects payload missing priority", () => {
    const { priority: _, ...noPriority } = validPolicy;
    const result = validateAndSanitizePolicy(noPriority);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("priority");
  });

  it("rejects payload missing enabled", () => {
    const { enabled: _, ...noEnabled } = validPolicy;
    const result = validateAndSanitizePolicy(noEnabled);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("enabled");
  });

  // ── Invalid rule fields ──
  it("rejects rule with unknown attribute", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "admin.bypass",
          operator: "equals",
          value: "true",
          action: "allow",
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("attribute");
  });

  it("rejects rule with unknown operator", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "eval",
          value: "true",
          action: "allow",
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("operator");
  });

  it("rejects rule with unknown action", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "equals",
          value: "high",
          action: "escalate",
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("action");
  });

  it("rejects rule with value exceeding max length", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "equals",
          value: "x".repeat(1001),
          action: "allow",
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("value");
  });

  it("rejects name exceeding max length", () => {
    const payload = { ...validPolicy, name: "x".repeat(201) };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("name");
  });

  it("rejects negative priority", () => {
    const payload = { ...validPolicy, priority: -1 };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("priority");
  });

  it("rejects non-boolean enabled", () => {
    const payload = { ...validPolicy, enabled: "yes" as any };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("enabled");
  });

  it("rejects non-integer priority", () => {
    const payload = { ...validPolicy, priority: 3.5 };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("priority");
  });

  // ── XSS in name/description ──
  it("strips HTML tags from policy name", () => {
    const payload = {
      ...validPolicy,
      name: '<script>alert("XSS")</script>Normal Name',
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
    expect(result.sanitizedName).toBe('alert("XSS")Normal Name');
    expect(result.sanitizedName).not.toContain("<script>");
    expect(result.sanitizedName).not.toContain("</script>");
  });

  it("strips HTML tags from policy description", () => {
    const payload = {
      ...validPolicy,
      description: '<img src=x onerror="alert(1)">Description',
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
    // The entire img tag is stripped by <[^>]*> regex
    expect(result.sanitizedDescription).toBe("Description");
    expect(result.sanitizedDescription).not.toContain("<img");
    expect(result.sanitizedDescription).not.toContain("onerror");
  });

  it("strips javascript: protocol from name", () => {
    const payload = {
      ...validPolicy,
      name: "javascript:void(0) Policy Name",
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
    expect(result.sanitizedName).toBe("void(0) Policy Name");
    expect(result.sanitizedName).not.toContain("javascript:");
  });

  it("strips onclick handlers from name", () => {
    const payload = {
      ...validPolicy,
      name: 'Policy Name" onclick="alert(1)',
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
    // The pattern matches on\w+\s*= so 'onclick="...' gets stripped
    expect(result.sanitizedName).not.toContain("onclick");
  });

  // ── ReDoS safety for regex rules ──
  it("rejects regex rule with dangerous nested quantifiers (ReDoS)", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "request.path",
          operator: "regex" as const,
          value: "(a+)+b",
          action: "deny" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsafe regex");
  });

  it("rejects regex rule with .*.* (classic redos)", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "request.path",
          operator: "regex" as const,
          value: ".*.*.*",
          action: "deny" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsafe regex");
  });

  it("accepts safe regex patterns", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "request.path",
          operator: "regex" as const,
          value: "^/api/v[0-9]+/users/[a-f0-9-]+$",
          action: "allow" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
  });

  it("rejects regex pattern longer than 500 chars", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "request.path",
          operator: "regex" as const,
          value: "a".repeat(501),
          action: "deny" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsafe regex");
  });

  it("rejects regex with excessive alternation", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "request.path",
          operator: "regex" as const,
          value: "a|b|c|d|e|f|g|h|i|j|k|l",
          action: "deny" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsafe regex");
  });

  // ── Transform rule validation ──
  it("requires transformation when action is transform", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "equals" as const,
          value: "high",
          action: "transform" as const,
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("transformation");
  });

  it("accepts valid transform rule", () => {
    const payload = {
      ...validPolicy,
      rules: [
        {
          attribute: "privacy.level",
          operator: "equals" as const,
          value: "high",
          action: "transform" as const,
          transformation: {
            type: "mask" as const,
            field: "ssn",
          },
        },
      ],
    };
    const result = validateAndSanitizePolicy(payload);
    expect(result.valid).toBe(true);
  });

  // ── null / undefined / non-object payloads ──
  it("rejects null payload", () => {
    const result = validateAndSanitizePolicy(null);
    expect(result.valid).toBe(false);
  });

  it("rejects undefined payload", () => {
    const result = validateAndSanitizePolicy(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects string payload", () => {
    const result = validateAndSanitizePolicy("malicious string");
    expect(result.valid).toBe(false);
  });

  it("rejects array payload", () => {
    const result = validateAndSanitizePolicy([]);
    expect(result.valid).toBe(false);
  });

  // ── Rules min/max bounds ──
  it("accepts policy with maximum allowed rules (200)", () => {
    const rules = Array.from({ length: 200 }, (_, i) => ({
      attribute: "privacy.level" as const,
      operator: "equals" as const,
      value: `level-${i}`,
      action: "allow" as const,
    }));
    const result = validateAndSanitizePolicy({
      ...validPolicy,
      rules,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects policy exceeding max rules (201)", () => {
    const rules = Array.from({ length: 201 }, (_, i) => ({
      attribute: "privacy.level" as const,
      operator: "equals" as const,
      value: `level-${i}`,
      action: "allow" as const,
    }));
    const result = validateAndSanitizePolicy({
      ...validPolicy,
      rules,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("rules");
  });
});

describe("sanitizeHtml", () => {
  it("returns empty string unchanged", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips script tags", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>Hello')).toBe(
      'alert("xss")Hello',
    );
  });

  it("strips img tags with event handlers", () => {
    // The regex <[^>]*> strips the entire HTML tag greedily
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("strips javascript: protocol", () => {
    expect(sanitizeHtml("javascript:alert(1)")).toBe("alert(1)");
  });
});

describe("isRegexSafe", () => {
  it("returns false for empty string", () => {
    expect(isRegexSafe("")).toBe(false);
  });

  it("returns true for simple safe pattern", () => {
    expect(isRegexSafe("^test$")).toBe(true);
  });

  it("returns false for (a+)+ pattern", () => {
    expect(isRegexSafe("(a+)+")).toBe(false);
  });

  it("returns false for (a|b)* pattern", () => {
    expect(isRegexSafe("(a|b)*.$")).toBe(false);
  });

  it("returns false for invalid regex syntax", () => {
    expect(isRegexSafe("[unclosed")).toBe(false);
  });

  it("handles regex with flags suffix", () => {
    expect(isRegexSafe("/^test$/gi")).toBe(true);
  });

  it("rejects .*.*.* pattern", () => {
    expect(isRegexSafe(".*.*.*")).toBe(false);
  });
});
