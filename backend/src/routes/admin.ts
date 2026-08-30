import express from "express";
import jwt from "jsonwebtoken";
import { stellarAuth } from "../middleware/stellarAuth";
import { rateLimitMonitor } from "../monitoring/rateLimitMonitor";
import { getJwtSecret } from "../utils/secrets";

/**
 * Admin authorization middleware. This is the authoritative gate for admin
 * endpoints: it authenticates a bearer JWT (HS256 shared secret) when the
 * global auth hasn't already populated `req.user`, then enforces the
 * `admin:access` permission. Keeping JWT verification here too provides
 * defense-in-depth and lets admin routes work regardless of mount context.
 *
 * In non-production, DEV_ADMIN_TOKEN can be used as a bearer token for local
 * development convenience.
 */
export const adminAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  // Dev admin token bypass (non-production only) — exact match only.
  if (process.env.NODE_ENV !== "production") {
    const devToken = process.env.DEV_ADMIN_TOKEN;
    if (devToken && bearer === devToken) {
      (req as any).user = {
        id: "dev-admin",
        email: "dev-admin@stellar-privacy.local",
        permissions: ["admin:access"],
        rateLimitTier: "enterprise" as const,
        sessionId: "dev-admin-session",
      };
      return next();
    }
  }

  // Authenticate: verify the bearer JWT (unless global auth already set it).
  if (!(req as any).user && bearer) {
    try {
      const decoded = jwt.verify(bearer, getJwtSecret(), {
        algorithms: ["HS256"],
      }) as any;
      (req as any).user = {
        id: decoded.sub,
        email: decoded.email,
        permissions: decoded.permissions || [],
        rateLimitTier: decoded.rateLimitTier || "basic",
        sessionId: decoded.sessionId,
      };
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
  } else if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Authorization: only users with admin:access permission pass.
  if (!(req as any).user?.permissions?.includes("admin:access")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};

const router = express.Router();

// GET /api/v1/admin/rate-limit/metrics — admin only
router.get("/rate-limit/metrics", adminAuth, (_req, res) => {
  const metrics = rateLimitMonitor.getMetricsSummary();
  res.json({
    metrics,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// GET /api/v1/admin/rate-limit/config — admin only
router.get("/rate-limit/config", adminAuth, (_req, res) => {
  res.json({
    config: {
      standard: {
        windowMs: 15 * 60 * 1000,
        basic: { maxRequests: 100 },
        premium: { maxRequests: 500 },
        enterprise: { maxRequests: 2000 },
      },
      enhanced: {
        collisionDetection: true,
        burstProtection: true,
        adaptiveLimiting: true,
        alerting: true,
      },
      monitoring: {
        enabled: true,
        interval: 30000,
        retention: 24 * 60 * 60 * 1000,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as adminRoutes };
