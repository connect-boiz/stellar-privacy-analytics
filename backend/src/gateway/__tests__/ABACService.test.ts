/**
 * Unit tests for ABACService – focusing on the jurisdiction resolution fix.
 *
 * The SummaryAttributeResolver (AttributeResolver) previously contained a stub
 * that silently returned "US" for every IP address, making geo-based ABAC
 * policies non-functional.  These tests verify that:
 *
 *  1. resolveJurisdiction delegates to geoip-lite and returns the real country code.
 *  2. resolveJurisdiction returns "unknown" (never "US") when the lookup yields no result.
 *  3. resolveJurisdiction returns "unknown" on an empty / falsy IP address.
 *  4. resolveJurisdiction returns "unknown" if geoip-lite throws.
 *  5. The full AttributeResolver.resolve() pipeline propagates the resolved
 *     jurisdiction into the returned UserAttributes object.
 *  6. ABACService.evaluateAccess() uses the real jurisdiction when building
 *     geo-based ABAC decisions (EU consent-required policy scenario).
 */

import * as geoip from "geoip-lite";
import {
  ABACPolicy,
  ABACService,
  AttributeResolver,
  Resource,
  UserAttributes,
} from "../ABACService";

// ---------------------------------------------------------------------------
// Mock geoip-lite so we do not need the actual MaxMind database in CI.
// ---------------------------------------------------------------------------
jest.mock("geoip-lite");

// ---------------------------------------------------------------------------
// Mock logger to suppress expected warn/error output during intentional
// error-handling tests (empty IPs, null lookups, database read errors).
// ---------------------------------------------------------------------------
jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLookup = geoip.lookup as jest.MockedFunction<typeof geoip.lookup>;

// ---------------------------------------------------------------------------
// Helper – minimal valid geoip.Lookup result
// ---------------------------------------------------------------------------
function makeGeoResult(country: string): geoip.Lookup {
  return {
    range: [0, 0],
    country,
    region: "",
    eu: "0",
    timezone: "",
    city: "",
    ll: [0, 0],
    metro: 0,
    area: 0,
  };
}

// ---------------------------------------------------------------------------
// AttributeResolver – resolveJurisdiction
// ---------------------------------------------------------------------------
describe("AttributeResolver.resolveJurisdiction", () => {
  let resolver: AttributeResolver;

  beforeEach(() => {
    resolver = new AttributeResolver();
    mockLookup.mockReset();
  });

  it("returns the ISO country code from geoip-lite for a known EU IP", async () => {
    mockLookup.mockReturnValue(makeGeoResult("DE"));

    const result = await resolver.resolveJurisdiction("81.0.0.1");

    expect(mockLookup).toHaveBeenCalledWith("81.0.0.1");
    expect(result).toBe("DE");
  });

  it('returns "unknown" — not "US" — when geoip-lite has no record for the IP', async () => {
    mockLookup.mockReturnValue(null);

    const result = await resolver.resolveJurisdiction("192.0.2.1");

    expect(result).toBe("unknown");
    expect(result).not.toBe("US");
  });

  it('returns "unknown" when the lookup result has no country field', async () => {
    // Simulate a partial / incomplete record
    mockLookup.mockReturnValue({ ...makeGeoResult(""), country: "" });

    const result = await resolver.resolveJurisdiction("192.0.2.2");

    expect(result).toBe("unknown");
  });

  it('returns "unknown" for an empty IP address without calling geoip-lite', async () => {
    const result = await resolver.resolveJurisdiction("");

    expect(mockLookup).not.toHaveBeenCalled();
    expect(result).toBe("unknown");
  });

  it('returns "unknown" for a whitespace-only IP address', async () => {
    const result = await resolver.resolveJurisdiction("   ");

    expect(mockLookup).not.toHaveBeenCalled();
    expect(result).toBe("unknown");
  });

  it('returns "unknown" when geoip-lite throws an unexpected error', async () => {
    mockLookup.mockImplementation(() => {
      throw new Error("database read error");
    });

    const result = await resolver.resolveJurisdiction("8.8.8.8");

    expect(result).toBe("unknown");
  });

  it('correctly resolves a US IP to "US"', async () => {
    mockLookup.mockReturnValue(makeGeoResult("US"));

    const result = await resolver.resolveJurisdiction("8.8.8.8");

    expect(result).toBe("US");
  });

  it('correctly resolves a French IP to "FR"', async () => {
    mockLookup.mockReturnValue(makeGeoResult("FR"));

    const result = await resolver.resolveJurisdiction("90.0.0.1");

    expect(result).toBe("FR");
  });
});

// ---------------------------------------------------------------------------
// AttributeResolver.resolve() – jurisdiction propagation into UserAttributes
// ---------------------------------------------------------------------------
describe("AttributeResolver.resolve – jurisdiction propagation", () => {
  let resolver: AttributeResolver;

  const baseResource = {
    path: "/analytics",
    method: "GET",
    service: "analytics",
  };

  beforeEach(() => {
    resolver = new AttributeResolver();
    mockLookup.mockReset();
  });

  it("sets jurisdiction from GeoIP when not already present on the attributes", async () => {
    mockLookup.mockReturnValue(makeGeoResult("NL"));

    const attrs: UserAttributes = {
      roles: ["analyst"],
      consent: true,
      ipAddress: "62.0.0.1",
    };

    const resolved = await resolver.resolve(attrs, baseResource);

    expect(resolved.jurisdiction).toBe("NL");
  });

  it("does NOT override an explicitly provided jurisdiction", async () => {
    mockLookup.mockReturnValue(makeGeoResult("NL"));

    const attrs: UserAttributes = {
      roles: ["analyst"],
      consent: true,
      ipAddress: "62.0.0.1",
      jurisdiction: "GB", // already set
    };

    const resolved = await resolver.resolve(attrs, baseResource);

    // Should keep the caller-provided value and not call geoip
    expect(resolved.jurisdiction).toBe("GB");
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('sets jurisdiction to "unknown" when geoip returns null', async () => {
    mockLookup.mockReturnValue(null);

    const attrs: UserAttributes = {
      roles: ["viewer"],
      consent: false,
      ipAddress: "192.0.2.100",
    };

    const resolved = await resolver.resolve(attrs, baseResource);

    expect(resolved.jurisdiction).toBe("unknown");
    expect(resolved.jurisdiction).not.toBe("US");
  });

  it("leaves jurisdiction undefined when no ipAddress is present", async () => {
    const attrs: UserAttributes = {
      roles: ["viewer"],
      consent: false,
    };

    const resolved = await resolver.resolve(attrs, baseResource);

    expect(resolved.jurisdiction).toBeUndefined();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ABACService.evaluateAccess() – geo-based ABAC policy decisions
// ---------------------------------------------------------------------------
describe("ABACService.evaluateAccess – geo-based policy decisions", () => {
  let service: ABACService;

  const resource = {
    path: "/analytics",
    method: "GET",
    service: "analytics",
    dataClassification: "internal",
  };

  beforeEach(() => {
    service = new ABACService();
    mockLookup.mockReset();
  });

  it('resolves a German IP to "DE" and uses it in the access decision context', async () => {
    mockLookup.mockReturnValue(makeGeoResult("DE"));

    const userAttrs: UserAttributes = {
      roles: ["analyst"],
      consent: true,
      ipAddress: "81.0.0.1",
      department: "data-analytics",
    };

    const decision = await service.evaluateAccess(userAttrs, resource);

    // The resolved jurisdiction should be stored in the decision context
    expect(decision.context.userAttributes.jurisdiction).toBe("DE");
  });

  it('resolves an unknown IP to "unknown" — never "US" by default', async () => {
    mockLookup.mockReturnValue(null);

    const userAttrs: UserAttributes = {
      roles: ["analyst"],
      consent: true,
      ipAddress: "192.0.2.50",
      department: "data-analytics",
    };

    const decision = await service.evaluateAccess(userAttrs, resource);

    expect(decision.context.userAttributes.jurisdiction).toBe("unknown");
    expect(decision.context.userAttributes.jurisdiction).not.toBe("US");
  });

  it("does not call geoip when jurisdiction is already set on userAttributes", async () => {
    const userAttrs: UserAttributes = {
      roles: ["analyst"],
      consent: true,
      ipAddress: "81.0.0.1",
      jurisdiction: "IT",
    };

    await service.evaluateAccess(userAttrs, resource);

    expect(mockLookup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ABACService.evaluateAccess() – nested logical expression evaluation (QI-031)
// ---------------------------------------------------------------------------
describe("ABACService.evaluateAccess – nested logical expressions", () => {
  let service: ABACService;

  const analyticsResource: Resource = {
    path: "/analytics/report",
    method: "GET",
    service: "analytics",
    dataClassification: "internal",
  };

  const baseUser: UserAttributes = {
    roles: ["analyst"],
    consent: true,
    department: "engineering",
    clearanceLevel: "high",
  };

  beforeEach(() => {
    service = new ABACService();
    mockLookup.mockReset();
  });

  function addNestedPolicy(
    id: string,
    condition: ABACPolicy["condition"],
  ): void {
    service.addPolicy({
      id,
      name: `Nested policy ${id}`,
      description: "Test nested logical expression evaluation",
      effect: "allow",
      priority: 300,
      enabled: true,
      target: {
        resources: [
          { attribute: "service", operator: "equals", value: "analytics" },
        ],
      },
      condition,
    });
  }

  it("evaluates 3-level nested AND (and → and → or) when all branches match", async () => {
    addNestedPolicy("nested-and-3", {
      operator: "and",
      operands: [
        { attribute: "consent", operator: "equals", value: true },
        {
          operator: "and",
          operands: [
            { attribute: "roles", operator: "contains", value: "analyst" },
            {
              operator: "or",
              operands: [
                {
                  attribute: "department",
                  operator: "equals",
                  value: "engineering",
                },
                {
                  attribute: "clearanceLevel",
                  operator: "equals",
                  value: "top-secret",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(baseUser, analyticsResource);

    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("nested-and-3");
  });

  it("evaluates 3-level nested AND as false when inner OR branch fails", async () => {
    addNestedPolicy("nested-and-3-fail", {
      operator: "and",
      operands: [
        { attribute: "consent", operator: "equals", value: true },
        {
          operator: "and",
          operands: [
            { attribute: "roles", operator: "contains", value: "analyst" },
            {
              operator: "or",
              operands: [
                {
                  attribute: "department",
                  operator: "equals",
                  value: "marketing",
                },
                {
                  attribute: "clearanceLevel",
                  operator: "equals",
                  value: "low",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(
      {
        roles: ["viewer"],
        consent: true,
        department: "engineering",
        clearanceLevel: "medium",
      },
      analyticsResource,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).not.toBe("nested-and-3-fail");
  });

  it("evaluates 3-level nested OR (or → or → and) when deep branch matches", async () => {
    addNestedPolicy("nested-or-3", {
      operator: "or",
      operands: [
        { attribute: "roles", operator: "contains", value: "admin" },
        {
          operator: "or",
          operands: [
            { attribute: "roles", operator: "contains", value: "viewer" },
            {
              operator: "and",
              operands: [
                { attribute: "consent", operator: "equals", value: true },
                {
                  attribute: "department",
                  operator: "equals",
                  value: "data-analytics",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(
      {
        ...baseUser,
        roles: ["analyst"],
        department: "data-analytics",
      },
      analyticsResource,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("nested-or-3");
  });

  it("evaluates 3-level nested OR as false when no branch matches", async () => {
    addNestedPolicy("nested-or-3-fail", {
      operator: "or",
      operands: [
        { attribute: "roles", operator: "contains", value: "admin" },
        {
          operator: "or",
          operands: [
            { attribute: "roles", operator: "contains", value: "viewer" },
            {
              operator: "and",
              operands: [
                { attribute: "consent", operator: "equals", value: false },
                {
                  attribute: "department",
                  operator: "equals",
                  value: "sales",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(
      {
        roles: ["contractor"],
        consent: false,
        department: "engineering",
      },
      analyticsResource,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).not.toBe("nested-or-3-fail");
  });

  it("evaluates 3-level nested NOT (not → and → or) when inner expression is false", async () => {
    addNestedPolicy("nested-not-3", {
      operator: "not",
      operands: [
        {
          operator: "and",
          operands: [
            { attribute: "consent", operator: "equals", value: false },
            {
              operator: "or",
              operands: [
                {
                  attribute: "roles",
                  operator: "contains",
                  value: "viewer",
                },
                {
                  attribute: "clearanceLevel",
                  operator: "equals",
                  value: "low",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(baseUser, analyticsResource);

    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("nested-not-3");
  });

  it("evaluates 3-level nested NOT as false when inner expression is true", async () => {
    addNestedPolicy("nested-not-3-deny", {
      operator: "not",
      operands: [
        {
          operator: "and",
          operands: [
            { attribute: "consent", operator: "equals", value: true },
            {
              operator: "or",
              operands: [
                {
                  attribute: "roles",
                  operator: "contains",
                  value: "analyst",
                },
                {
                  attribute: "clearanceLevel",
                  operator: "equals",
                  value: "low",
                },
              ],
            },
          ],
        },
      ],
    });

    const decision = await service.evaluateAccess(
      {
        roles: ["viewer"],
        consent: true,
        department: "engineering",
        clearanceLevel: "low",
      },
      analyticsResource,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).not.toBe("nested-not-3-deny");
  });
});

// ---------------------------------------------------------------------------
// ABACService.evaluateAccess() – default policy decisions
// ---------------------------------------------------------------------------
describe("ABACService.evaluateAccess – default policies", () => {
  let service: ABACService;

  beforeEach(() => {
    service = new ABACService();
    mockLookup.mockReset();
  });

  it("allows analyst access to analytics when consent and classification match", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        dataClassification: "internal",
      },
      {
        path: "/analytics",
        method: "GET",
        service: "analytics",
        dataClassification: "internal",
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("analyst-access");
  });

  it("denies sensitive data access without high clearance", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        clearanceLevel: "low",
      },
      {
        path: "/data/sensitive",
        method: "GET",
        service: "analytics",
        dataClassification: "sensitive",
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("sensitive-data-protection");
  });

  it("allows sensitive data access with high clearance", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        clearanceLevel: "high",
      },
      {
        path: "/data/sensitive",
        method: "GET",
        service: "analytics",
        dataClassification: "sensitive",
      },
    );

    expect(decision.allowed).toBe(true);
  });

  it("denies personal data access without consent", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: false,
      },
      {
        path: "/data/personal",
        method: "GET",
        service: "analytics",
        dataClassification: "personal",
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("consent-requirement");
  });
});
