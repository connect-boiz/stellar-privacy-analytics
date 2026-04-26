import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { DifferentialPrivacyService, DPQuery } from '../services/differentialPrivacy';
import { auditMiddleware } from '../utils/audit';
import { logger } from '../utils/logger';

const router = Router();
const dpService = new DifferentialPrivacyService();

/**
 * POST /api/v1/privacy/noise/inject
 * Inject differential privacy noise into a single value or result set
 */
router.post('/inject', [
  body('value').optional().isNumeric().withMessage('Value must be a number'),
  body('values').optional().isArray().withMessage('Values must be an array of numbers'),
  body('epsilon').isNumeric().withMessage('Epsilon is required'),
  body('sensitivity').isNumeric().withMessage('Sensitivity is required'),
  body('distribution').isIn(['laplace', 'gaussian']).withMessage('Invalid distribution'),
  body('delta').optional().isNumeric().withMessage('Delta must be a number')
], auditMiddleware('dp_noise_injection', 'privacy_enhancement'), async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { value, values, epsilon, sensitivity, distribution, delta } = req.body;
    const userId = (req as any).user?.id || 'anonymous';

    if (value !== undefined) {
      const noisyValue = injectNoise(value, epsilon, sensitivity, distribution, delta);
      return res.json({ success: true, original: value, noisy: noisyValue, distribution });
    }

    if (values !== undefined) {
      // Batch processing
      const noisyValues = values.map((v: number) => injectNoise(v, epsilon, sensitivity, distribution, delta));
      return res.json({ success: true, count: values.length, noisy: noisyValues, distribution });
    }

    return res.status(400).json({ error: 'Either value or values must be provided' });

  } catch (error) {
    logger.error(`DP noise injection error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/v1/privacy/noise/batch
 * High-performance batch noise injection for large datasets
 */
router.post('/batch', [
  body('datasetId').notEmpty().withMessage('Dataset ID is required'),
  body('epsilon').isNumeric().withMessage('Epsilon is required'),
  body('column').notEmpty().withMessage('Column name is required')
], async (req: Request, res: Response) => {
  // In a real implementation, this would trigger a background worker
  const { datasetId, epsilon, column } = req.body;
  
  logger.info(`Started batch DP noise injection for dataset ${datasetId}, column ${column}`);
  
  res.json({
    success: true,
    jobId: `dp_batch_${Date.now()}`,
    status: 'processing',
    message: 'Batch privacy processing started in background'
  });
});

/**
 * Helper to inject noise based on distribution
 */
function injectNoise(value: number, epsilon: number, sensitivity: number, distribution: string, delta?: number): number {
  if (distribution === 'laplace') {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return value + noise;
  } else {
    // Gaussian noise
    const sigma = Math.sqrt(2 * Math.log(1.25 / (delta || 1e-5))) * (sensitivity / epsilon);
    const u1 = Math.random();
    const u2 = Math.random();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
    return value + noise;
  }
}

export { router as privacyNoiseRoutes };
