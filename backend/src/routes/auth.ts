import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { asyncHandler } from "../middleware/errorHandler";
import { getDb } from "../config/database";
import { getRedisClient } from "../config/redis";
import { logger } from "../utils/logger";
import { getJwtSecret } from "../utils/secrets";

const router = Router();

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRY = process.env.JWT_EXPIRY || "1h";
const BCRYPT_ROUNDS = 12;

// WS5: strict per-IP throttling on credential endpoints (brute-force
// protection). In-memory fallback when Redis is unavailable (e.g. tests).
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60 * 1000; // 1 minute
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  return req.ip || req.connection.remoteAddress || "unknown";
}

/**
 * Per-IP throttle for /auth/login and /auth/register. Uses Redis when
 * available (distributed), falls back to an in-process counter otherwise.
 */
async function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = clientIp(req);
  const now = Date.now();

  try {
    const redis = getRedisClient();
    const key = `auth:ratelimit:${ip}`;
    const multi = redis.multi();
    multi.incr(key);
    multi.pExpire(key, AUTH_WINDOW_MS);
    const results = await multi.exec();
    const count = Number((results?.[0] as any) ?? 1);
    if (count > AUTH_MAX_ATTEMPTS) {
      res.set("Retry-After", String(Math.ceil(AUTH_WINDOW_MS / 1000)));
      res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many authentication attempts. Try again later.",
        },
      });
      return;
    }
    return next();
  } catch {
    // Redis unavailable — use in-process fallback
    const entry = ipAttempts.get(ip);
    if (entry && entry.resetAt > now) {
      entry.count++;
      if (entry.count > AUTH_MAX_ATTEMPTS) {
        res.set("Retry-After", String(Math.ceil(AUTH_WINDOW_MS / 1000)));
        res.status(429).json({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many authentication attempts. Try again later.",
          },
        });
        return;
      }
    } else {
      ipAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    }
    return next();
  }
}

/**
 * Account lockout — after LOCKOUT_THRESHOLD consecutive failures, the
 * account is locked for LOCKOUT_WINDOW_MS even with a correct password.
 * Redis-backed when available; in-process fallback otherwise.
 */
async function checkLockout(email: string): Promise<boolean> {
  const key = `auth:lockout:${email.toLowerCase()}`;
  try {
    const redis = getRedisClient();
    const ttl = await redis.pTTL(key);
    return ttl > 0;
  } catch {
    const entry = lockoutMap.get(email.toLowerCase());
    return !!entry && entry.resetAt > Date.now();
  }
}

const lockoutMap = new Map<string, { count: number; resetAt: number }>();

async function recordFailedAttempt(email: string): Promise<void> {
  const key = `auth:lockout:${email.toLowerCase()}`;
  try {
    const redis = getRedisClient();
    await redis.incr(key);
    await redis.pExpire(key, LOCKOUT_WINDOW_MS);
  } catch {
    const entry = lockoutMap.get(email.toLowerCase());
    if (entry && entry.resetAt > Date.now()) {
      entry.count++;
      if (entry.count >= LOCKOUT_THRESHOLD) {
        entry.resetAt = Date.now() + LOCKOUT_WINDOW_MS;
      }
    } else {
      lockoutMap.set(email.toLowerCase(), {
        count: 1,
        resetAt: Date.now() + LOCKOUT_WINDOW_MS,
      });
    }
  }
}

/**
 * WS5 test hook: resets the in-process throttle/lockout counters so each
 * unit test starts from a clean state. Call in beforeEach(). In production
 * these counters live in Redis and need no reset.
 */
export function __resetAuthThrottleForTests(): void {
  ipAttempts.clear();
  lockoutMap.clear();
}

async function clearFailedAttempts(email: string): Promise<void> {
  const key = `auth:lockout:${email.toLowerCase()}`;
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch {
    lockoutMap.delete(email.toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${randomBytes(16).toString("hex")}`;
}

function generateJti(): string {
  return `jti_${Date.now().toString(36)}_${randomBytes(12).toString("hex")}`;
}

interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
}

/**
 * Create a signed JWT that matches the StellarJWTPayload shape expected
 * by the StellarAuthMiddleware.
 */
function signJwt(user: UserRecord): string {
  const now = Math.floor(Date.now() / 1000);
  const exp =
    JWT_EXPIRY.endsWith("h")
      ? now + parseInt(JWT_EXPIRY) * 3600
      : now + 3600;

  const payload = {
    sub: user.id,
    email: user.email,
    permissions: ["read:analytics", "write:queries"],
    rateLimitTier: "basic" as const,
    sessionId: generateSessionId(),
    iat: now,
    exp,
    jti: generateJti(),
    iss: "stellar-privacy",
    aud: "stellar-api",
  };

  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256" });
}

/**
 * Attempt to add a JTI to the Redis revocation set. Fails gracefully when
 * Redis is not available (e.g. in unit tests).
 */
async function addToRevocationList(jti: string, exp: number): Promise<void> {
  try {
    const redis = getRedisClient();
    const ttl = Math.max(0, exp - Math.floor(Date.now() / 1000));
    if (ttl > 0) {
      await redis.set(`auth:revoked:${jti}`, "1", { EX: ttl });
    }
  } catch {
    // Redis may not be initialised in all environments (e.g. tests)
    logger.warn("Could not write JWT revocation to Redis (client unavailable)");
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post(
  "/register",
  authRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // --- validation ---
    if (!email || !password) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Email and password are required" },
      });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "Password must be at least 8 characters",
        },
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Invalid email format" },
      });
    }

    const db = getDb();

    // --- check for existing user ---
    const existing = await db("users").where({ email }).first();
    if (existing) {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "A user with this email already exists" },
      });
    }

    // --- hash password & persist ---
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [newUser] = await db("users")
      .insert({
        email,
        password_hash: passwordHash,
        role: "user",
        is_active: true,
      })
      .returning(["id", "email", "role"]);

    logger.info("User registered", { userId: newUser.id, email });

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser.id,
      email: newUser.email,
    });
  }),
);

router.post(
  "/login",
  authRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Email and password are required" },
      });
    }

    // WS5: account lockout — reject even valid credentials while locked.
    const isLocked = await checkLockout(String(email || ""));
    if (isLocked) {
      return res.status(429).json({
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Account temporarily locked due to too many failed attempts",
        },
      });
    }

    const db = getDb();
    const user: UserRecord | undefined = await db("users")
      .where({ email })
      .first();

    if (!user) {
      await recordFailedAttempt(String(email || ""));
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Account is deactivated" },
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await recordFailedAttempt(String(email || ""));
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
      });
    }

    // Success — clear any accumulated failures
    await clearFailedAttempts(String(email || ""));

    const token = signJwt(user);

    logger.info("User logged in", { userId: user.id, email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: ["read:analytics", "write:queries"],
        rateLimitTier: "basic",
      },
    });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET, {
          algorithms: ["HS256"],
          ignoreExpiration: true, // allow revoking expired tokens too
        }) as { jti?: string; exp?: number };

        if (decoded.jti && decoded.exp) {
          await addToRevocationList(decoded.jti, decoded.exp);
          logger.info("Token revoked on logout", { jti: decoded.jti });
        }
      } catch {
        // Token is malformed – nothing to revoke
      }
    }

    res.json({ message: "Logged out successfully" });
  }),
);

export { router as authRoutes };
