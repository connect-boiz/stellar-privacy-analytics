import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { getCacheService } from '../services/cacheService';import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { getCacheService } from '../services/cacheService';
import { getDb } from '../config/database';
import { validateRequest } from '../middleware/validation';

const router = Router();
const cache = getCacheService();

const resourceIdParam = () =>
  param('id').trim().matches(/^[a-zA-Z0-9_-]{1,128}$/).withMessage('Invalid id');

// Get all analyses
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500'),
  validateRequest,
], auditMiddleware('list_analyses', 'privacy_query'), asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const cacheKey = `analyses:list:${page}:${limit}`;

  let result = await cache.get(cacheKey);
  if (!result) {
    const db = getDb();
    const offset = (page - 1) * limit;
    const [analyses, countResult] = await Promise.all([
      db('analyses').select('*').orderBy('created_at', 'desc').limit(limit).offset(offset),
      db('analyses').count('id as count'),
    ]);
    const total = parseInt((countResult[0] as any).count as string);
    result = { analyses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    await cache.set(cacheKey, result, { ttl: 900 });
  }

  return res.json(result);
}));

// Create new analysis
router.post('/', [
  body('name').optional({ values: 'null' }).trim().isLength({ max: 255 }).withMessage('name too long'),
  body('type').optional({ values: 'null' }).trim().isLength({ max: 64 }).withMessage('type too long'),
  validateRequest,
], auditMiddleware('create_analysis', 'privacy_query'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const { name, type } = req.body;
  const [analysis] = await db('analyses')
    .insert({ name: name || 'New Analysis', type: type || 'privacy', status: 'pending' })
    .returning('*');
  return res.status(201).json({ analysisId: analysis.id, status: analysis.status, message: 'X-Ray analysis created successfully' });
}));

// Get analysis by ID
router.get('/:id', [resourceIdParam(), validateRequest], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cacheKey = `analysis:${id}`;

  let analysis = await cache.get(cacheKey);
  if (!analysis) {
    const db = getDb();
    analysis = await db('analyses').where({ id }).first();
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
    await cache.set(cacheKey, analysis, { ttl: 1800 });
  }

  return res.json({ analysis });
}));

// Run analysis
router.post('/:id/run', [resourceIdParam(), validateRequest], asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  await db('analyses').where({ id }).update({ status: 'running', updated_at: new Date() });
  return res.json({ message: 'X-Ray analysis started', jobId: id });
}));

export { router as analyticsRoutes };

import { getDb } from '../config/database';

const router = Router();
const cache = getCacheService();

// Get all analyses
router.get('/', auditMiddleware('list_analyses', 'privacy_query'), asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const cacheKey = `analyses:list:${page}:${limit}`;

  let result = await cache.get(cacheKey);
  if (!result) {
    const db = getDb();
    const offset = (page - 1) * limit;
    const [analyses, countResult] = await Promise.all([
      db('analyses').select('*').orderBy('created_at', 'desc').limit(limit).offset(offset),
      db('analyses').count('id as count'),
    ]);
    const total = parseInt((countResult[0] as any).count as string);
    result = { analyses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    await cache.set(cacheKey, result, { ttl: 900 });
  }

  return res.json(result);
}));

// Create new analysis
router.post('/', auditMiddleware('create_analysis', 'privacy_query'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const { name, type } = req.body;
  const [analysis] = await db('analyses')
    .insert({ name: name || 'New Analysis', type: type || 'privacy', status: 'pending' })
    .returning('*');
  return res.status(201).json({ analysisId: analysis.id, status: analysis.status, message: 'X-Ray analysis created successfully' });
}));

// Get analysis by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cacheKey = `analysis:${id}`;

  let analysis = await cache.get(cacheKey);
  if (!analysis) {
    const db = getDb();
    analysis = await db('analyses').where({ id }).first();
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
    await cache.set(cacheKey, analysis, { ttl: 1800 });
  }

  return res.json({ analysis });
}));

// Run analysis
router.post('/:id/run', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  await db('analyses').where({ id }).update({ status: 'running', updated_at: new Date() });
  return res.json({ message: 'X-Ray analysis started', jobId: id });
}));

export { router as analyticsRoutes };
