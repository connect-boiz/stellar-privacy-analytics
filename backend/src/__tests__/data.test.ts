import request from 'supertest';
import express from 'express';
import { dataRoutes } from '../routes/data';

jest.mock('../config/database', () => ({ getDb: jest.fn() }));
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
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  delete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockReturnValue(jest.fn(() => mockDb));
});

const app = express();
app.use(express.json());
app.use('/data', dataRoutes);

describe('POST /data/upload', () => {
  it('creates a dataset and returns 201', async () => {
    const dataset = { id: 'ds-1', name: 'Test Dataset', encrypted: true };
    mockDb.returning.mockResolvedValueOnce([dataset]);

    const res = await request(app).post('/data/upload').send({ name: 'Test Dataset' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('datasetId');
    expect(res.body.status).toBe('uploaded');
  });
});

describe('GET /data', () => {
  it('returns list of datasets', async () => {
    const datasets = [{ id: 'ds-1', name: 'Dataset 1', encrypted: true }];
    mockDb.orderBy.mockResolvedValueOnce(datasets);

    const res = await request(app).get('/data');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('datasets');
  });
});

describe('GET /data/:id', () => {
  it('returns 404 when dataset not found', async () => {
    mockDb.first.mockResolvedValueOnce(null);

    const res = await request(app).get('/data/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns dataset when found', async () => {
    const dataset = { id: 'ds-1', name: 'Dataset 1', encrypted: true };
    mockDb.first.mockResolvedValueOnce(dataset);

    const res = await request(app).get('/data/ds-1');
    expect(res.status).toBe(200);
    expect(res.body.dataset).toMatchObject({ id: 'ds-1' });
  });
});

describe('DELETE /data/:id', () => {
  it('returns 404 when dataset not found', async () => {
    mockDb.delete.mockResolvedValueOnce(0);

    const res = await request(app).delete('/data/nonexistent');
    expect(res.status).toBe(404);
  });

  it('deletes dataset successfully', async () => {
    mockDb.delete.mockResolvedValueOnce(1);

    const res = await request(app).delete('/data/ds-1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});
