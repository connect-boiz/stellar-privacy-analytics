import request from 'supertest';
import express from 'express';
import { analyticsRoutes } from '../routes/analytics';

// Mock dependencies
jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../services/cacheService', () => ({
  getCacheService: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../utils/audit', () => ({
  auditMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/errorHandler', () => ({
  asyncHandler: (fn: any) => fn,
}));

import { getDb } from '../config/database';

const mockDb = {
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  update: jest.fn(),
};

const mockKnex = jest.fn((table: string) => mockDb) as any;

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockReturnValue(mockKnex);
});

const app = express();
app.use(express.json());
app.use('/analytics', analyticsRoutes);

describe('GET /analytics', () => {
  it('returns paginated analyses from DB', async () => {
    const fakeAnalyses = [{ id: 'abc', name: 'Test', status: 'completed', type: 'privacy' }];
    mockDb.offset.mockResolvedValueOnce(fakeAnalyses);
    mockDb.count.mockResolvedValueOnce([{ count: '1' }]);

    // Override Promise.all behavior via mock
    const originalAll = Promise.all.bind(Promise);
    jest.spyOn(Promise, 'all').mockResolvedValueOnce([fakeAnalyses, [{ count: '1' }]]);

    const res = await request(app).get('/analytics?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analyses');
    expect(res.body).toHaveProperty('pagination');
  });
});

describe('POST /analytics', () => {
  it('creates a new analysis and returns 201', async () => {
    const newAnalysis = { id: 'new-id', name: 'My Analysis', status: 'pending', type: 'privacy' };
    mockDb.returning.mockResolvedValueOnce([newAnalysis]);

    const res = await request(app).post('/analytics').send({ name: 'My Analysis', type: 'privacy' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('analysisId');
    expect(res.body.status).toBe('pending');
  });
});

describe('GET /analytics/:id', () => {
  it('returns 404 when analysis not found', async () => {
    mockDb.first.mockResolvedValueOnce(null);

    const res = await request(app).get('/analytics/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns analysis when found', async () => {
    const analysis = { id: 'test-id', name: 'Test', status: 'completed', type: 'privacy' };
    mockDb.first.mockResolvedValueOnce(analysis);

    const res = await request(app).get('/analytics/test-id');
    expect(res.status).toBe(200);
    expect(res.body.analysis).toMatchObject({ id: 'test-id' });
  });
});

describe('POST /analytics/:id/run', () => {
  it('updates analysis status to running', async () => {
    mockDb.update = jest.fn().mockResolvedValueOnce(1);

    const res = await request(app).post('/analytics/test-id/run');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});
