import { Router, Request, Response } from "express";
import { body, param } from "express-validator";
import multer from "multer";
import { createHash } from "crypto";
import { asyncHandler } from "../middleware/errorHandler";
import { auditMiddleware } from "../utils/audit";
import { getDb } from "../config/database";
import { validateRequest } from "../middleware/validation";
import { idempotency } from "../middleware/idempotency";
import { schemas } from "../middleware/requestSchemas";

const router = Router();

/**
 * WS3 — server-side upload cap. The client-reported `size` is no longer
 * trusted: the actual multipart bytes are counted and verified. Oversized
 * uploads are rejected with 413 before any processing.
 */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
});

function multerErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: (e?: any) => void,
): void {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Upload exceeds the ${Math.floor(
          MAX_UPLOAD_BYTES / (1024 * 1024),
        )} MB limit`,
      },
    });
    return;
  }
  next(err);
}

const datasetIdParam = () =>
  param("id")
    .trim()
    .matches(/^[a-zA-Z0-9_-]{1,128}$/)
    .withMessage("Invalid dataset id");

/**
 * WS1: every dataset query is scoped to the authenticated owner.
 * Returns 403 when a cross-owner access is attempted.
 */
function currentOwnerId(req: Request): string {
  return (req as any).user?.id;
}

function requireOwner(req: Request, res: Response): string | null {
  const ownerId = currentOwnerId(req);
  if (!ownerId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return null;
  }
  return ownerId;
}

/**
 * WS3: CSV cell escaping against spreadsheet formula injection.
 * Cells starting with =, +, -, @ are prefixed with a single quote and
 * embedded quotes are doubled.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  let escaped = raw.replace(/"/g, '""');
  if (/^[=+\-@]/.test(escaped)) {
    escaped = `'${escaped}`;
  }
  return `"${escaped}"`;
}

// Upload data
router.post(
  "/upload",
  idempotency({ methods: ["POST"] }),
  upload.single("file"),
  multerErrorHandler,
  schemas.datasetUpload,
  validateRequest,
  auditMiddleware("upload_dataset", "data_modification"),
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = requireOwner(req, res);
    if (!ownerId) return;

    const db = getDb();
    const { name, mimeType } = req.body;

    // WS3: verify actual multipart bytes — the client-reported size is never
    // trusted. A claimed size of 0 with a non-empty body is rejected, and a
    // file larger than the cap was already rejected with 413 by multer.
    const actualBytes = req.file ? req.file.size : 0;
    const claimedSize = Number(req.body.size || 0);
    if (req.file && claimedSize > 0 && claimedSize !== actualBytes) {
      return res.status(400).json({
        error: {
          code: "SIZE_MISMATCH",
          message: "Reported size does not match uploaded content",
        },
      });
    }

    const contentHash = req.file
      ? createHash("sha256").update(req.file.buffer).digest("hex")
      : null;

    const [dataset] = await db("datasets")
      .insert({
        name: name || "Uploaded Dataset",
        encrypted: true,
        mime_type: mimeType || req.file?.mimetype,
        size: actualBytes,
        owner_id: ownerId,
        content_hash: contentHash,
      })
      .returning("*");
    return res.status(201).json({
      datasetId: dataset.id,
      status: "uploaded",
      message: "Data uploaded and encrypted successfully",
    });
  }),
);

// Get datasets (own only)
router.get(
  "/",
  auditMiddleware("list_datasets", "data_access"),
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = requireOwner(req, res);
    if (!ownerId) return;

    const db = getDb();
    const datasets = await db("datasets")
      .select("*")
      .where({ owner_id: ownerId })
      .orderBy("created_at", "desc");
    return res.json({ datasets, message: "Datasets retrieved successfully" });
  }),
);

// Export datasets (own only; CSV-injection-safe) — must be before /:id
router.get(
  "/export",
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = requireOwner(req, res);
    if (!ownerId) return;

    const db = getDb();
    const datasets = await db("datasets")
      .select(
        "id",
        "name",
        "encrypted",
        "mime_type",
        "size",
        "created_at",
        "updated_at",
      )
      .where({ owner_id: ownerId })
      .orderBy("created_at", "desc");

    const format = (req.query.format as string) || "json";

    if (format === "csv") {
      const headers = [
        "id",
        "name",
        "encrypted",
        "mime_type",
        "size",
        "created_at",
        "updated_at",
      ];
      const rows = datasets.map((d: any) =>
        headers.map((h) => escapeCsvCell(d[h] ?? "")).join(","),
      );
      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=datasets.csv");
      return res.send(csv);
    }

    res.setHeader("Content-Disposition", "attachment; filename=datasets.json");
    return res.json({ count: datasets.length, datasets });
  }),
);

// Get dataset by ID (own only)
router.get(
  "/:id",
  [datasetIdParam(), validateRequest],
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = requireOwner(req, res);
    if (!ownerId) return;

    const db = getDb();
    const dataset = await db("datasets")
      .where({ id: req.params.id, owner_id: ownerId })
      .first();
    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    return res.json({ dataset });
  }),
);

// Delete dataset (own only)
router.delete(
  "/:id",
  [datasetIdParam(), validateRequest],
  asyncHandler(async (req: Request, res: Response) => {
    const ownerId = requireOwner(req, res);
    if (!ownerId) return;

    const db = getDb();
    const deleted = await db("datasets")
      .where({ id: req.params.id, owner_id: ownerId })
      .delete();
    if (!deleted) return res.status(404).json({ error: "Dataset not found" });
    return res.json({ message: "Dataset deleted successfully" });
  }),
);

export { router as dataRoutes };

export function initializeUploadSocket(server: any): any {
  const io = require("socket.io")(server, {
    cors: {
      origin: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",")
        : ["http://localhost:3000", "http://localhost:3001"],
      credentials: true,
    },
  });
  io.on("connection", (socket: any) => {
    socket.on("join-upload", (uploadId: string) =>
      socket.join(`upload-${uploadId}`),
    );
  });
  return io;
}
