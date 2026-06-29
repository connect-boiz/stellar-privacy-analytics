import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { asyncHandler } from "../middleware/errorHandler";
import { getDb } from "../config/database";
import { getRedisClient } from "../config/redis";
import { logger } from "../utils/logger";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "stellar-privacy-jwt-secret-dev-only";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "1h";
const BCRYPT_ROUNDS = 12;

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
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Email and password are required" },
      });
    }

    const db = getDb();
    const user: UserRecord | undefined = await db("users")
      .where({ email })
      .first();

    if (!user) {
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
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
      });
    }

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
