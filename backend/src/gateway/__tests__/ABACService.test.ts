/// <reference types="jest" />

/**
 * Unit tests for ABACService - focusing on the jurisdiction resolution fix.
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
  AttributeResolver,
  ABACService,
  Resource,
  UserAttributes,
} from "../ABACService";

// ---------------------------------------------------------------------------
// Mock geoip-lite so we do not need the actual MaxMind database in CI.
// ---------------------------------------------------------------------------
jest.mock("geoip-lite");

const mockLookup = geoip.lookup as jest.MockedFunction<typeof geoip.lookup>;

// ---------------------------------------------------------------------------
// Helper - minimal valid geoip.Lookup result
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
// AttributeResolver - resolveJurisdiction
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

  it('returns "unknown" - not "US" - when geoip-lite has no record for the IP', async () => {
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
// ABACService.evaluateAccess - nested logical expressions
// ---------------------------------------------------------------------------
describe("ABACService.evaluateAccess - nested logical expressions", () => {
  let service: ABACService;

  const resource: Resource = {
    path: "/analytics/nested",
    method: "GET",
    service: "analytics",
    dataClassification: "internal",
  };

  const nestedPolicy: ABACPolicy = {
    id: "nested-logical-policy",
    name: "Nested Logical Policy",
    description: "Exercises nested AND/OR/NOT expression evaluation",
    effect: "allow",
    priority: 500,
    enabled: true,
    target: {
      resources: [
        { attribute: "service", operator: "equals", value: "analytics" },
      ],
    },
    condition: {
      operator: "and",
      operands: [
        { attribute: "roles", operator: "contains", value: "analyst" },
        {
          operator: "or",
          operands: [
            { attribute: "department", operator: "equals", value: "research" },
            {
              operator: "and",
              operands: [
                {
                  operator: "not",
                  operands: [
                    {
                      attribute: "jurisdiction",
                      operator: "equals",
                      value: "blocked",
                    },
                  ],
                },
                {
                  attribute: "dataClassification",
                  operator: "equals",
                  value: "internal",
                },
              ],
            },
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    service = new ABACService();
    service.deletePolicy("analyst-access");
    service.deletePolicy("sensitive-data-protection");
    service.deletePolicy("consent-requirement");
    service.addPolicy(nestedPolicy);
    mockLookup.mockReset();
  });

  it("allows access when a three-level AND/OR/NOT expression is satisfied", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        department: "data-analytics",
        jurisdiction: "US",
      },
      resource,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("nested-logical-policy");
  });

  it("denies access when the nested NOT expression fails", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        department: "data-analytics",
        jurisdiction: "blocked",
      },
      resource,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("No applicable policies found");
  });
});

describe("ABACService.evaluateAccess - default policy decisions", () => {
  let service: ABACService;

  beforeEach(() => {
    service = new ABACService();
    mockLookup.mockReset();
  });

  it("allows analysts to access internal analytics data with consent", async () => {
    const decision = await service.evaluateAccess(
      {
        roles: ["analyst"],
        consent: true,
        department: "data-analytics",
        jurisdiction: "US",
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
        jurisdiction: "US",
      },
      {
        path: "/analytics/sensitive",
        method: "GET",
        service: "analytics",
        dataClassification: "sensitive",
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("sensitive-data-protection");
  });
});

// ---------------------------------------------------------------------------
// AttributeResolver.resolve() - jurisdiction propagation into UserAttributes
// ---------------------------------------------------------------------------
describe("AttributeResolver.resolve - jurisdiction propagation", () => {
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
// ABACService.evaluateAccess() - geo-based ABAC policy decisions
// ---------------------------------------------------------------------------
describe("ABACService.evaluateAccess - geo-based policy decisions", () => {
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

  it('resolves an unknown IP to "unknown" - never "US" by default', async () => {
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
