import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Redis client – we never want real Redis in unit tests.
jest.mock("../config/redis", () => ({
  getRedisClient: jest.fn(() => {
    throw new Error("Redis not initialised");
  }),
  initializeRedis: jest.fn(),
}));

// Mock rateLimitMonitor so we can test without real monitoring
jest.mock("../monitoring/rateLimitMonitor", () => ({
  rateLimitMonitor: {
    getMetricsSummary: jest.fn(() => ({
      current: {
        totalRequests: 100,
        blockedRequests: 5,
        bypassedRequests: 0,
        averageRequestRate: 2.5,
        peakRequestRate: 10,
        collisionCount: 0,
        adaptiveAdjustments: 0,
      },
      alerts: [],
      trends: {
        blockRate: 0.05,
        collisionRate: 0,
        adaptiveRate: 0,
      },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Import the real admin routes (not a duplicated copy)
// ---------------------------------------------------------------------------
import { adminRoutes } from "../routes/admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || "stellar-privacy-jwt-secret-dev-only";

function createAdminToken(): string {
  return jwt.sign(
    {
      sub: "admin-user-1",
      email: "admin@stellar-privacy.local",
      permissions: ["admin:access", "read:analytics"],
      rateLimitTier: "enterprise",
      sessionId: "session-admin-1",
      jti: `jti-admin-${Date.now()}`,
      iss: "stellar-privacy",
      aud: "stellar-api",
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "1h",
    },
  );
}

function createNonAdminToken(): string {
  return jwt.sign(
    {
      sub: "regular-user-1",
      email: "user@stellar-privacy.local",
      permissions: ["read:analytics"],
      rateLimitTier: "basic",
      sessionId: "session-user-1",
      jti: `jti-user-${Date.now()}`,
      iss: "stellar-privacy",
      aud: "stellar-api",
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "1h",
    },
  );
}

// ---------------------------------------------------------------------------
// Test App
// ---------------------------------------------------------------------------

function createTestApp(): express.Application {
  const app = express();
  app.use("/api/v1/admin", adminRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Admin Rate-Limit Endpoints", () => {
  let app: express.Application;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    app = createTestApp();
    delete process.env.DEV_ADMIN_TOKEN;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.DEV_ADMIN_TOKEN;
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/admin/rate-limit/metrics
  // -----------------------------------------------------------------------
  describe("GET /api/v1/admin/rate-limit/metrics", () => {
    it("should return 401 for unauthenticated request", async () => {
      const res = await request(app).get("/api/v1/admin/rate-limit/metrics");

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it("should return 401 for request with no auth headers", async () => {
      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("X-Custom-Header", "value");

      expect(res.status).toBe(401);
    });

    it("should return 403 for authenticated non-admin user", async () => {
      const token = createNonAdminToken();

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Admin access required");
    });

    it("should return 200 with metrics for authenticated admin user", async () => {
      const token = createAdminToken();

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("metrics");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("environment");
      expect(res.body.metrics).toHaveProperty("current");
      expect(res.body.metrics).toHaveProperty("alerts");
      expect(res.body.metrics).toHaveProperty("trends");
    });

    it("should allow dev admin token access when DEV_ADMIN_TOKEN is set", async () => {
      process.env.DEV_ADMIN_TOKEN = "dev-secret-token-12345";

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("Authorization", "Bearer dev-secret-token-12345");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("metrics");
    });

    it("should reject invalid dev admin token", async () => {
      process.env.DEV_ADMIN_TOKEN = "dev-secret-token-12345";

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("Authorization", "Bearer wrong-token");

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/admin/rate-limit/config
  // -----------------------------------------------------------------------
  describe("GET /api/v1/admin/rate-limit/config", () => {
    it("should return 401 for unauthenticated request", async () => {
      const res = await request(app).get("/api/v1/admin/rate-limit/config");

      expect(res.status).toBe(401);
    });

    it("should return 403 for authenticated non-admin user", async () => {
      const token = createNonAdminToken();

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/config")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Admin access required");
    });

    it("should return 200 with config for authenticated admin user", async () => {
      const token = createAdminToken();

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/config")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("config");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body.config).toHaveProperty("standard");
      expect(res.body.config).toHaveProperty("enhanced");
      expect(res.body.config).toHaveProperty("monitoring");
    });

    it("should allow dev admin token access to config when DEV_ADMIN_TOKEN is set", async () => {
      process.env.DEV_ADMIN_TOKEN = "dev-config-token";

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/config")
        .set("Authorization", "Bearer dev-config-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("config");
    });
  });

  // -----------------------------------------------------------------------
  // Cross-environment behavior
  // -----------------------------------------------------------------------
  describe("auth enforcement in all environments", () => {
    it("should require authentication even when NODE_ENV is development", async () => {
      process.env.NODE_ENV = "development";

      const res = await request(app).get("/api/v1/admin/rate-limit/metrics");

      // In development without DEV_ADMIN_TOKEN, still requires auth
      expect(res.status).toBe(401);
    });

    it("should require authentication in test environment", async () => {
      process.env.NODE_ENV = "test";

      const res = await request(app).get("/api/v1/admin/rate-limit/metrics");

      expect(res.status).toBe(401);
    });

    it("should not allow unauthenticated access in production", async () => {
      process.env.NODE_ENV = "production";

      const res = await request(app).get("/api/v1/admin/rate-limit/metrics");

      expect(res.status).toBe(401);
    });

    it("should not accept DEV_ADMIN_TOKEN in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.DEV_ADMIN_TOKEN = "should-not-work-in-prod";

      const res = await request(app)
        .get("/api/v1/admin/rate-limit/metrics")
        .set("Authorization", "Bearer should-not-work-in-prod");

      // In production, dev token should NOT work — should get 401
      expect(res.status).toBe(401);
    });
  });
});
