import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler';

// Mock dependencies before importing routes
jest.mock('../services/auditService', () => {
  return jest.fn().mockImplementation(() => ({
    logSystemEvent: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue('audit-id'),
  }));
});

jest.mock('../repositories/metadataRepository', () => ({
  MetadataRepository: jest.fn().mockImplementation(() => ({})),
}));

import { privacyRoutes } from '../routes/privacy';

const app = express();
app.use(express.json());
app.use('/api/privacy', privacyRoutes);
app.use(errorHandler);

describe('Privacy API Endpoints', () => {
  describe('GET /api/privacy/settings', () => {
    it('should return privacy settings', async () => {
      const res = await request(app).get('/api/privacy/settings');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('settings');
      expect(res.body.settings).toHaveProperty('level');
      expect(res.body.settings).toHaveProperty('dataRetentionDays');
    });
  });

  describe('PUT /api/privacy/settings', () => {
    it('should update privacy settings', async () => {
      const res = await request(app)
        .put('/api/privacy/settings')
        .send({ dataRetentionDays: 180, autoDeleteEnabled: true });

      expect(res.status).toBe(200);
    });

    it('should reject out-of-range dataRetentionDays', async () => {
      const res = await request(app)
        .put('/api/privacy/settings')
        .send({ dataRetentionDays: 9999 });

      expect(res.status).toBe(500);
    });
  });
});
