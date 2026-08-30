import request from "supertest";
import express from "express";
import { errorHandler } from "../middleware/errorHandler";
import jwt from "jsonwebtoken";
import { DEV_JWT_SECRET } from "../utils/secrets";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock database so we can test without a real Postgres connection.
const mockQueryBuilder = {
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
};

// getDb() must return a callable function (like a real Knex instance).
const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock("../config/database", () => ({
  getDb: jest.fn(() => mockDb),
}));

// Mock Redis client – we never want real Redis in unit tests.
jest.mock("../config/redis", () => ({
  getRedisClient: jest.fn(() => {
    throw new Error("Redis not initialised");
  }),
}));

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

// Require AFTER mocks are set up
const { authRoutes } = require("../routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Shared dev secret — must match the one authRoutes uses to sign/verify.
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

function decodeToken(token: string): any {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

describe("Auth API Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset WS5 in-process throttle/lockout state between tests
    require("../routes/auth").__resetAuthThrottleForTests();
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/register
  // -----------------------------------------------------------------------
  describe("POST /api/auth/register", () => {
    it("should register a new user and return 201", async () => {
      // No existing user
      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce(undefined); // check existing
      mockQueryBuilder.insert.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.returning.mockResolvedValueOnce([
        { id: "real-user-id", email: "test@example.com", role: "user" },
      ]);

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "password123" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("message", "User registered successfully");
      expect(res.body).toHaveProperty("userId", "real-user-id");
      expect(res.body).toHaveProperty("email", "test@example.com");
    });

    it("should return 400 when email is missing", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ password: "password123" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("should return 400 when password is too short", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "short" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("should return 409 when user already exists", async () => {
      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: "existing-id",
        email: "test@example.com",
      });

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "password123" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/login
  // -----------------------------------------------------------------------
  describe("POST /api/auth/login", () => {
    it("should login and return a valid JWT token", async () => {
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash("password123", 12);

      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: "real-user-id",
        email: "test@example.com",
        password_hash: passwordHash,
        role: "user",
        is_active: true,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user).toHaveProperty("id", "real-user-id");
      expect(res.body.user).toHaveProperty("email", "test@example.com");

      // Token must be a valid HS256 JWT
      const decoded = decodeToken(res.body.token);
      expect(decoded.sub).toBe("real-user-id");
      expect(decoded.email).toBe("test@example.com");
      expect(decoded.iss).toBe("stellar-privacy");
      expect(decoded.aud).toBe("stellar-api");
      expect(decoded).toHaveProperty("jti");
      expect(decoded).toHaveProperty("sessionId");
      expect(decoded).toHaveProperty("iat");
      expect(decoded).toHaveProperty("exp");
    });

    it("should return 401 for invalid password", async () => {
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash("correct-password", 12);

      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: "real-user-id",
        email: "test@example.com",
        password_hash: passwordHash,
        role: "user",
        is_active: true,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "wrong-password" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 for non-existent user", async () => {
      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "unknown@example.com", password: "password123" });

      expect(res.status).toBe(401);
    });

    it("should return 403 for deactivated account", async () => {
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash("password123", 12);

      mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: "deactivated-id",
        email: "test@example.com",
        password_hash: passwordHash,
        role: "user",
        is_active: false,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "password123" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/logout
  // -----------------------------------------------------------------------
  describe("POST /api/auth/logout", () => {
    it("should logout successfully", async () => {
      const res = await request(app).post("/api/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Logged out successfully");
    });
  });
});
