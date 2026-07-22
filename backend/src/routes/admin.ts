import express from "express";
import { stellarAuth } from "../middleware/stellarAuth";
import { rateLimitMonitor } from "../monitoring/rateLimitMonitor";

/**
 * Admin authentication middleware.
 *
 * Requires JWT/API-key authentication in **all** environments.
 * In non-production, the DEV_ADMIN_TOKEN env var can be used as a bearer
 * token to skip full JWT verification for local development convenience.
 */
export const adminAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> => {
  // Dev admin token bypass (non-production only)
  if (process.env.NODE_ENV !== "production") {
    const devToken = process.env.DEV_ADMIN_TOKEN;
    if (devToken) {
      const authHeader = req.headers.authorization;
      if (authHeader === `Bearer ${devToken}`) {
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
  }

  // Standard authentication — sends 401 on failure and never calls next()
  stellarAuth.authenticate(req as any, res, () => {
    // Role-based access: only users with admin:access permission
    if (!(req as any).user?.permissions?.includes("admin:access")) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
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
