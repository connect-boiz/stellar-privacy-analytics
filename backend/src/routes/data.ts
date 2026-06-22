import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { auditMiddleware } from '../utils/audit';
import { getDb } from '../config/database';

const router = Router();

const datasetIdParam = () =>
  param('id').trim().matches(/^[a-zA-Z0-9_-]{1,128}$/).withMessage('Invalid dataset id');

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function buildDatasetCsv(datasets: Record<string, any>[]): string {
  const columns = ['id', 'name', 'encrypted', 'mime_type', 'size', 'created_at', 'updated_at'];
  const rows = datasets.map(dataset => columns.map(column => escapeCsvValue(dataset[column])).join(','));
  return [columns.join(','), ...rows].join('\n');
}

router.post('/upload', [
  body('name').optional({ values: 'null' }).isString().trim().isLength({ max: 255 }),
  body('mimeType').optional({ values: 'null' }).trim().isLength({ max: 255 }),
  body('size').optional().isInt({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  validateRequest,
], auditMiddleware('upload_dataset', 'data_modification'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const { name, mimeType, size } = req.body;
  const [dataset] = await db('datasets')
    .insert({ name: name || 'Uploaded Dataset', encrypted: true, mime_type: mimeType, size: size || 0 })
    .returning('*');
  return res.status(201).json({ datasetId: dataset.id, status: 'uploaded', message: 'Data uploaded and encrypted successfully' });
}));

router.get('/', auditMiddleware('list_datasets', 'data_access'), asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb();
  const datasets = await db('datasets').select('*').orderBy('created_at', 'desc');
  return res.json({ datasets, message: 'Datasets retrieved successfully' });
}));

router.get('/export', [
  query('format').optional().isIn(['json', 'csv']),
  validateRequest,
], auditMiddleware('export_datasets', 'data_access'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const datasets = await db('datasets').select('*').orderBy('created_at', 'desc');
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  res.setHeader('Content-Disposition', `attachment; filename="datasets-${timestamp}.${format}"`);

  if (format === 'csv') {
    res.type('text/csv');
    return res.send(buildDatasetCsv(datasets));
  }

  return res.json({ count: datasets.length, datasets });
}));

router.get('/:id', [datasetIdParam(), validateRequest], asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const dataset = await db('datasets').where({ id: req.params.id }).first();
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
  return res.json({ dataset });
}));

router.delete('/:id', [datasetIdParam(), validateRequest], asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const deleted = await db('datasets').where({ id: req.params.id }).delete();
  if (!deleted) return res.status(404).json({ error: 'Dataset not found' });
  return res.json({ message: 'Dataset deleted successfully' });
}));

export { router as dataRoutes };

export function initializeUploadSocket(server: any): any {
  const io = require('socket.io')(server, {
    cors: {
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
    },
  });
  io.on('connection', (socket: any) => {
    socket.on('join-upload', (uploadId: string) => socket.join(`upload-${uploadId}`));
  });
  return io;
}
