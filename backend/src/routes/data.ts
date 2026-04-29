import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { auditMiddleware } from "../utils/audit";
import { getDb } from "../config/database";

const router = Router();

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildDatasetCsv(datasets: Record<string, any>[]): string {
  const columns = [
    "id",
    "name",
    "encrypted",
    "mime_type",
    "size",
    "created_at",
    "updated_at",
  ];
  const rows = datasets.map((dataset) =>
    columns.map((column) => escapeCsvValue(dataset[column])).join(","),
  );

  return [columns.join(","), ...rows].join("\n");
}

// Upload data
router.post(
  "/upload",
  auditMiddleware("upload_dataset", "data_modification"),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const { name, mimeType, size } = req.body;
    const [dataset] = await db("datasets")
      .insert({
        name: name || "Uploaded Dataset",
        encrypted: true,
        mime_type: mimeType,
        size: size || 0,
      })
      .returning("*");
    return res
      .status(201)
      .json({
        datasetId: dataset.id,
        status: "uploaded",
        message: "Data uploaded and encrypted successfully",
      });
  }),
);

// Get datasets
router.get(
  "/",
  auditMiddleware("list_datasets", "data_access"),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const datasets = await db("datasets")
      .select("*")
      .orderBy("created_at", "desc");
    return res.json({ datasets, message: "Datasets retrieved successfully" });
  }),
);

// Export datasets
router.get(
  "/export",
  auditMiddleware("export_datasets", "data_access"),
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const format = (req.query.format as string) || "json";
    const idsParam = req.query.ids;
    const ids = Array.isArray(idsParam)
      ? idsParam
          .flatMap((value) => String(value).split(","))
          .map((value) => value.trim())
          .filter(Boolean)
      : typeof idsParam === "string"
        ? idsParam
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    let query = db("datasets").select("*").orderBy("created_at", "desc");
    if (ids.length > 0) {
      query = query.whereIn("id", ids);
    }

    const datasets = await query;
    const exportedAt = new Date().toISOString();
    const filenameBase = `datasets-export-${exportedAt.slice(0, 10)}`;

    if (format === "csv") {
      const csv = buildDatasetCsv(datasets);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filenameBase}.csv"`,
      );
      return res.status(200).send(csv);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameBase}.json"`,
    );
    return res.status(200).json({
      success: true,
      format: "json",
      exportedAt,
      count: datasets.length,
      datasets,
    });
  }),
);

// Get dataset by ID
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const dataset = await db("datasets").where({ id: req.params.id }).first();
    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    return res.json({ dataset });
  }),
);

// Delete dataset
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const deleted = await db("datasets").where({ id: req.params.id }).delete();
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
