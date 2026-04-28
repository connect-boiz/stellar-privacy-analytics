import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler';

// Mock dependencies
jest.mock('../services/auditService', () => {
  return jest.fn().mockImplementation(() => ({
    logSystemEvent: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue('audit-id'),
  }));
});

jest.mock('../repositories/metadataRepository', () => ({
  MetadataRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/cacheService', () => ({
  getCacheService: () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { analyticsRoutes } from '../routes/analytics';

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);
app.use(errorHandler);

describe('Analytics API Endpoints', () => {
  describe('GET /api/analytics', () => {
    it('should return a list of analyses', async () => {
      const res = await request(app).get('/api/analytics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analyses');
      expect(Array.isArray(res.body.analyses)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should support pagination parameters', async () => {
      const res = await request(app).get('/api/analytics?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.analyses).toHaveLength(5);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  describe('POST /api/analytics', () => {
    it('should create a new analysis and return 201', async () => {
      const res = await request(app)
        .post('/api/analytics')
        .send({ name: 'Test Analysis', type: 'privacy' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('analysisId');
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('GET /api/analytics/:id', () => {
    it('should return a single analysis by ID', async () => {
      const res = await request(app).get('/api/analytics/test-id-123');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analysis');
      expect(res.body.analysis).toHaveProperty('id', 'test-id-123');
      expect(res.body.analysis).toHaveProperty('status');
      expect(res.body.analysis).toHaveProperty('results');
    });
  });

  describe('POST /api/analytics/:id/run', () => {
    it('should start an analysis run', async () => {
      const res = await request(app).post('/api/analytics/test-id-123/run');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('jobId');
    });
  });
});
