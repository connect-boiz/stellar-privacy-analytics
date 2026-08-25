import { APIKeyManager } from "../APIKeyManager";
import { logger } from "../../utils/logger";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const LEGACY_HARDCODED_KEY = "stellar_admin_default_key_1234567890abcdef";

describe("APIKeyManager", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe("listKeys", () => {
    it("returns deep-cloned keys so callers cannot mutate internal state", async () => {
      const manager = new APIKeyManager();
      const { key: apiKey, keyInfo } = await manager.createKey({
        name: "Analytics Reader",
        permissions: ["read"],
        rateLimit: {
          requestsPerMinute: 10,
          requestsPerHour: 100,
          requestsPerDay: 1000,
        },
        restrictions: {
          allowedIPs: ["10.0.0.1"],
          allowedOrigins: ["https://analytics.example.com"],
          allowedServices: ["analytics"],
        },
        metadata: {
          owner: "security-team",
          department: "security",
          purpose: "regression-test",
        },
      });

      const listedKeys = await manager.listKeys({ owner: "security-team" });
      const listedKey = listedKeys[0];

      listedKeys.pop();
      listedKey.permissions.push("admin");
      listedKey.restrictions.allowedIPs.push("0.0.0.0/0");
      listedKey.restrictions.allowedOrigins.push("*");
      listedKey.restrictions.allowedServices.push("admin-console");
      listedKey.metadata.isActive = false;
      listedKey.metadata.owner = "attacker";
      listedKey.rateLimit!.requestsPerMinute = 9999;

      const freshKeys = await manager.listKeys({ owner: "security-team" });
      const freshKey = freshKeys.find((key) => key.id === keyInfo.id);

      expect(freshKey).toBeDefined();
      expect(freshKeys).toHaveLength(1);
      expect(freshKey!.permissions).toEqual(["read"]);
      expect(freshKey!.restrictions.allowedIPs).toEqual(["10.0.0.1"]);
      expect(freshKey!.restrictions.allowedOrigins).toEqual([
        "https://analytics.example.com",
      ]);
      expect(freshKey!.restrictions.allowedServices).toEqual(["analytics"]);
      expect(freshKey!.metadata.isActive).toBe(true);
      expect(freshKey!.metadata.owner).toBe("security-team");
      expect(freshKey!.rateLimit!.requestsPerMinute).toBe(10);

      await expect(
        manager.validateKey(apiKey, {
          ipAddress: "10.0.0.1",
          origin: "https://analytics.example.com",
          service: "analytics",
        }),
      ).resolves.toMatchObject({ valid: true });
    });
  });

  describe("initializeDefaultKeys", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      consoleWarnSpy.mockRestore();
    });

    it("does not create a default key in production", async () => {
      process.env.NODE_ENV = "production";

      const manager = new APIKeyManager();

      expect(manager.getStats().totalKeys).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      const validation = await manager.validateKey(LEGACY_HARDCODED_KEY);
      expect(validation.valid).toBe(false);
    });

    it("does not create a default key when NODE_ENV is test", () => {
      process.env.NODE_ENV = "test";

      const manager = new APIKeyManager();

      expect(manager.getStats().totalKeys).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("does not create a default key when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;

      const manager = new APIKeyManager();

      expect(manager.getStats().totalKeys).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("creates a randomized development key and logs a warning", async () => {
      process.env.NODE_ENV = "development";

      const manager = new APIKeyManager();

      expect(manager.getStats().totalKeys).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "Development-only default admin API key created. Do not use in production.",
        expect.objectContaining({ keyPrefix: expect.any(String) }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({ apiKey: expect.anything() }),
      );

      const { keyPrefix } = (logger.warn as jest.Mock).mock.calls[0][1];
      const consoleMessage = consoleWarnSpy.mock.calls[0][0] as string;
      const apiKey = consoleMessage.replace(
        "[DEV] Default admin API key: ",
        "",
      );

      expect(apiKey).toMatch(/^stellar_[A-Za-z0-9_-]{43}$/);
      expect(apiKey.substring(0, 16)).toBe(keyPrefix);

      const validation = await manager.validateKey(apiKey);
      expect(validation.valid).toBe(true);
      expect(validation.keyInfo?.permissions).toContain("admin");
      expect(validation.keyInfo?.keyHash).toBe("[REDACTED]");
    });

    it("randomizes the development key on each start", () => {
      process.env.NODE_ENV = "development";

      new APIKeyManager();
      const firstKey = (consoleWarnSpy.mock.calls[0][0] as string).replace(
        "[DEV] Default admin API key: ",
        "",
      );

      jest.clearAllMocks();
      consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      new APIKeyManager();
      const secondKey = (consoleWarnSpy.mock.calls[0][0] as string).replace(
        "[DEV] Default admin API key: ",
        "",
      );

      expect(firstKey).not.toBe(secondKey);
    });

    it("validates keys by full hash rather than prefix alone", async () => {
      process.env.NODE_ENV = "test";

      const manager = new APIKeyManager();
      const first = await manager.createKey({
        name: "Key A",
        permissions: ["read"],
        metadata: { owner: "a", department: "eng", purpose: "test" },
      });
      const second = await manager.createKey({
        name: "Key B",
        permissions: ["write"],
        metadata: { owner: "b", department: "eng", purpose: "test" },
      });

      const firstValidation = await manager.validateKey(first.key);
      const secondValidation = await manager.validateKey(second.key);

      expect(firstValidation.valid).toBe(true);
      expect(firstValidation.keyInfo?.name).toBe("Key A");
      expect(secondValidation.valid).toBe(true);
      expect(secondValidation.keyInfo?.name).toBe("Key B");
    });

    it("returns API keys once and redacts stored hashes from callers", async () => {
      process.env.NODE_ENV = "test";

      const manager = new APIKeyManager();
      const { key: apiKey, keyInfo } = await manager.createKey({
        name: "Gateway Client",
        permissions: ["analytics:read"],
        metadata: {
          owner: "gateway-team",
          department: "privacy",
          purpose: "regression-test",
        },
      });

      expect(apiKey).toMatch(/^stellar_[A-Za-z0-9_-]{43}$/);
      expect(keyInfo.keyHash).toBe("[REDACTED]");

      const listedKeys = await manager.listKeys({ owner: "gateway-team" });
      expect(listedKeys).toHaveLength(1);
      expect(listedKeys[0].keyHash).toBe("[REDACTED]");
      expect(JSON.stringify(listedKeys)).not.toContain(apiKey);

      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: true,
      });
    });

    it("immediately rejects a revoked key", async () => {
      process.env.NODE_ENV = "test";

      const manager = new APIKeyManager();
      const { key: apiKey, keyInfo } = await manager.createKey({
        name: "Revocable Gateway Client",
        permissions: ["analytics:read"],
        metadata: {
          owner: "gateway-team",
          department: "privacy",
          purpose: "regression-test",
        },
      });

      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: true,
      });
      await expect(manager.revokeKey(keyInfo.id)).resolves.toBe(true);
      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: false,
        reason: "API key is deactivated",
      });
    });

    it("enforces per-key rate limits", async () => {
      process.env.NODE_ENV = "test";
      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      const manager = new APIKeyManager();
      const { key: apiKey } = await manager.createKey({
        name: "Rate Limited Gateway Client",
        permissions: ["analytics:read"],
        rateLimit: {
          requestsPerMinute: 2,
          requestsPerHour: 10,
          requestsPerDay: 20,
        },
        metadata: {
          owner: "gateway-team",
          department: "privacy",
          purpose: "regression-test",
        },
      });

      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: true,
      });
      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: true,
      });
      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: false,
        reason: "API key rate limit exceeded (per-minute)",
      });

      jest.advanceTimersByTime(60 * 1000);

      await expect(manager.validateKey(apiKey)).resolves.toMatchObject({
        valid: true,
      });
    });
  });
});
