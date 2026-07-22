import { validateRedisUrl, ParsedRedisUrl } from "../redisUrlValidator";

// Save original NODE_ENV to restore after tests
const originalNodeEnv = process.env.NODE_ENV;

describe("validateRedisUrl", () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("URL format validation", () => {
    it("should accept a valid redis:// URL with password", () => {
      const result = validateRedisUrl("redis://:mypassword@localhost:6379", {
        requirePassword: true,
      });
      expect(result.host).toBe("localhost");
      expect(result.port).toBe(6379);
      expect(result.password).toBe("mypassword");
      expect(result.hasTls).toBe(false);
      expect(result.hasAuthentication).toBe(true);
    });

    it("should accept a valid rediss:// URL with password (TLS)", () => {
      const result = validateRedisUrl("rediss://:securepass@redis.example.com:6380", {
        requirePassword: true,
      });
      expect(result.host).toBe("redis.example.com");
      expect(result.port).toBe(6380);
      expect(result.password).toBe("securepass");
      expect(result.hasTls).toBe(true);
      expect(result.hasAuthentication).toBe(true);
    });

    it("should support Redis ACL username/password format", () => {
      const result = validateRedisUrl("redis://myuser:mypass@redis:6379", {
        requirePassword: true,
      });
      expect(result.host).toBe("redis");
      expect(result.port).toBe(6379);
      expect(result.username).toBe("myuser");
      expect(result.password).toBe("mypass");
      expect(result.hasAuthentication).toBe(true);
    });

    it("should default to port 6379 for redis:// when no port specified", () => {
      const result = validateRedisUrl("redis://:pass@localhost");
      expect(result.port).toBe(6379);
    });

    it("should default to port 6380 for rediss:// when no port specified", () => {
      const result = validateRedisUrl("rediss://:pass@localhost");
      expect(result.port).toBe(6380);
    });

    it("should throw for an empty URL", () => {
      expect(() => validateRedisUrl("")).toThrow("REDIS_URL is not provided");
    });

    it("should throw for invalid protocol", () => {
      expect(() =>
        validateRedisUrl("http://localhost:6379"),
      ).toThrow(/Invalid Redis URL protocol/);
    });

    it("should throw for malformed URL", () => {
      expect(() =>
        validateRedisUrl("not-a-valid-url"),
      ).toThrow(/Invalid Redis URL format/);
    });
  });

  describe("password enforcement", () => {
    it("should throw in production when no password in URL", () => {
      process.env.NODE_ENV = "production";
      expect(() =>
        validateRedisUrl("redis://localhost:6379", { requirePassword: true }),
      ).toThrow(/no authentication credentials.*Refusing to start in production/);
    });

    it("should warn but NOT throw in development when no password in URL", () => {
      process.env.NODE_ENV = "development";
      // Should not throw — only warn
      expect(() =>
        validateRedisUrl("redis://localhost:6379", { requirePassword: true }),
      ).not.toThrow();
    });

    it("should NOT warn when requirePassword is false in development", () => {
      process.env.NODE_ENV = "development";
      // Should not throw AND should not warn about password (no console warning)
      const result = validateRedisUrl("redis://localhost:6379", {
        requirePassword: false,
      });
      expect(result.hasAuthentication).toBe(false);
      expect(result.host).toBe("localhost");
    });

    it("should throw in production when requirePassword is false (production always rejects passwordless)", () => {
      process.env.NODE_ENV = "production";
      expect(() =>
        validateRedisUrl("redis://localhost:6379", { requirePassword: false }),
      ).toThrow(/Refusing to start in production/);
    });

    it("should detect password-only authentication (no username)", () => {
      const result = validateRedisUrl("redis://:mypass@redis:6379", {
        requirePassword: true,
      });
      expect(result.hasAuthentication).toBe(true);
    });

    it("should consider passwordless URL as unauthenticated", () => {
      const result = validateRedisUrl("redis://redis:6379", {
        requirePassword: false,
      });
      expect(result.hasAuthentication).toBe(false);
    });
  });

  describe("TLS support", () => {
    it("should set hasTls to true for rediss://", () => {
      const result = validateRedisUrl("rediss://:pass@redis:6380", {
        requirePassword: true,
      });
      expect(result.hasTls).toBe(true);
    });

    it("should set hasTls to false for redis://", () => {
      const result = validateRedisUrl("redis://:pass@redis:6379", {
        requirePassword: true,
      });
      expect(result.hasTls).toBe(false);
    });

    it("should support rediss:// with ACL username", () => {
      const result = validateRedisUrl("rediss://admin:secret@redis.example.com:6380", {
        requirePassword: true,
      });
      expect(result.hasTls).toBe(true);
      expect(result.username).toBe("admin");
      expect(result.password).toBe("secret");
      expect(result.hasAuthentication).toBe(true);
    });
  });
});
