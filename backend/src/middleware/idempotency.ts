import { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "crypto";
import { getRedisClient } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * WS4 (issue #413) — idempotency middleware.
 *
 * A client sends `Idempotency-Key: <uuid>` on a mutating request. The key is
 * stored in Redis with a 24h TTL (SET NX). A duplicate key replays the stored
 * response instead of executing the handler a second time, so retried or
 * duplicated requests cannot double-spend, double-award, or create duplicate
 * rows.
 *
 * When Redis is unavailable the middleware degrades to a per-process map so
 * the API still works; the at-least-once guarantee is restored with Redis.
 */

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24h

interface StoredResponse {
  fingerprint: string;
  status: number;
  body: any;
  expiresAt: number;
}

const inMemoryStore = new Map<string, StoredResponse>();

interface IdempotencyOptions {
  /** Methods that require an Idempotency-Key. Defaults to POST/PUT/PATCH/DELETE. */
  methods?: string[];
  /** TTL for stored responses, in seconds. Defaults to 24h. */
  ttlSeconds?: number;
  /** When true (default), requests without a key are rejected with 400. */
  requireKey?: boolean;
}

function requestFingerprint(req: Request): string {
  const body = JSON.stringify(req.body || {});
  return createHash("sha256").update(body).digest("hex");
}

function validateKeyFormat(key: string): boolean {
  // uuid v1-v5, or a reasonably strict custom token
  return (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      key,
    ) || /^[A-Za-z0-9_-]{8,128}$/.test(key)
  );
}

export function idempotency(options: IdempotencyOptions = {}) {
  const {
    methods = ["POST", "PUT", "PATCH", "DELETE"],
    ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
    requireKey = true,
  } = options;

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!methods.includes(req.method.toUpperCase())) {
      return next();
    }

    const key = (req.headers["idempotency-key"] as string) || "";

    if (!key) {
      if (requireKey) {
        res.status(400).json({
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "Idempotency-Key header is required for this request",
          },
        });
        return;
      }
      return next();
    }

    if (!validateKeyFormat(key)) {
      res.status(400).json({
        error: {
          code: "INVALID_IDEMPOTENCY_KEY",
          message:
            "Idempotency-Key must be a UUID or an 8-128 char [A-Za-z0-9_-] token",
        },
      });
      return;
    }

    // Fingerprint scopes the key to the request payload, so a key reused
    // with different content is rejected rather than silently replayed.
    const fingerprint = requestFingerprint(req);
    const redisKey = `idem:${key}`;
    const storedValue = JSON.stringify({ fingerprint, status: 0, body: null });
    const userId = (req as any).user?.id || "anon";

    // Capture the response so it can be replayed on a duplicate key.
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    let finished = false;

    const storeResponse = (status: number, body: any): void => {
      const entry = {
        fingerprint,
        status,
        body,
        expiresAt: Date.now() + ttlSeconds * 1000,
      };
      try {
        const redis = getRedisClient();
        redis
          .setEx(redisKey, ttlSeconds, JSON.stringify(entry))
          .catch((err) =>
            logger.warn("Idempotency response persist failed", {
              error: err.message,
              key,
            }),
          );
      } catch {
        inMemoryStore.set(redisKey, entry);
      }
    };

    res.send = function (body: any): Response {
      if (!finished) {
        finished = true;
        storeResponse(res.statusCode, body);
      }
      return originalSend(body);
    };
    res.json = function (body: any): Response {
      if (!finished) {
        finished = true;
        storeResponse(res.statusCode, body);
      }
      return originalJson(body);
    };

    try {
      // Try Redis SET NX — only one request wins the key.
      const redis = getRedisClient();
      const claimed = await redis.set(redisKey, storedValue, {
        NX: true,
        EX: ttlSeconds,
      });

      if (!claimed) {
        // Duplicate key — replay the stored response.
        const raw = await redis.get(redisKey);
        if (raw) {
          const entry = JSON.parse(raw);
          if (entry.fingerprint !== fingerprint) {
            res.status(409).json({
              error: {
                code: "IDEMPOTENCY_KEY_CONFLICT",
                message:
                  "Idempotency-Key was already used with a different request",
              },
            });
            return;
          }
          if (entry.status && entry.body !== null && entry.body !== undefined) {
            res.setHeader("X-Idempotent-Replay", "true");
            res.status(entry.status).send(entry.body);
            return;
          }
        }
        // Stored entry exists but no completed response yet — concurrent
        // in-flight request; reject to avoid duplicate execution.
        res.status(409).json({
          error: {
            code: "IDEMPOTENCY_IN_PROGRESS",
            message: "A request with this Idempotency-Key is already in progress",
          },
        });
        return;
      }

      // Fresh key claimed — proceed, but guard the in-progress window.
      inMemoryStore.set(redisKey, {
        fingerprint,
        status: 0,
        body: null,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });

      // Cleanup our response hooks when done.
      const cleanup = () => {
        res.send = originalSend;
        res.json = originalJson;
      };
      res.on("finish", cleanup);
      res.on("close", cleanup);

      logger.debug("Idempotency key claimed", { key, userId });
      next();
    } catch (error) {
      // Redis unavailable — fall back to the in-process store for the
      // duration of this request (best-effort, single-instance semantics).
      const existing = inMemoryStore.get(redisKey);
      if (existing && existing.expiresAt > Date.now()) {
        if (existing.fingerprint !== fingerprint) {
          res.status(409).json({
            error: {
              code: "IDEMPOTENCY_KEY_CONFLICT",
              message:
                "Idempotency-Key was already used with a different request",
            },
          });
          return;
        }
        if (existing.status && existing.body !== null) {
          res.setHeader("X-Idempotent-Replay", "true");
          res.status(existing.status).send(existing.body);
          return;
        }
        res.status(409).json({
          error: {
            code: "IDEMPOTENCY_IN_PROGRESS",
            message: "A request with this Idempotency-Key is already in progress",
          },
        });
        return;
      }
      inMemoryStore.set(redisKey, {
        fingerprint,
        status: 0,
        body: null,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      logger.warn("Idempotency falling back to in-memory store (Redis down)");
      next();
    }
  };
}

/** Generate a fresh idempotency key (helper for clients/tests). */
export function generateIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}
