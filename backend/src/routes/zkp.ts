import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { ZKPService, ZKProofSystem } from '../services/zkpService';
import { MemoryMonitorService } from '../services/memoryMonitorService';
import { auditMiddleware } from '../utils/audit';
import { logger } from '../utils/logger';

const router = Router();
const memoryMonitor = new MemoryMonitorService();
const zkpService = new ZKPService(memoryMonitor);

/**
 * POST /api/v1/zkp/generate
 * Request generation of a ZK proof
 */
router.post('/generate', [
  body('system').isIn(Object.values(ZKProofSystem)).withMessage('Invalid proof system'),
  body('inputs').notEmpty().withMessage('Inputs are required'),
  body('circuitId').notEmpty().withMessage('Circuit ID is required'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be 1-10')
], auditMiddleware('zkp_generation_request', 'cryptographic_operation'), async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const { system, inputs, circuitId, priority = 5 } = req.body;
    
    const requestId = await zkpService.submitRequest({
      system: system as ZKProofSystem,
      inputs,
      circuitId,
      priority
    });

    res.status(202).json({
      success: true,
      requestId,
      status: 'queued',
      message: 'Proof generation request queued'
    });
  } catch (error) {
    logger.error(`ZKP generation request error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/zkp/status/:requestId
 * Check status of a proof generation request
 */
router.get('/status/:requestId', (req: Request, res: Response) => {
  const { requestId } = req.params;
  
  // In a real implementation, we would store status in Redis or DB
  // For now, we'll return a simulated status
  res.json({
    success: true,
    requestId,
    status: 'processing', // or 'completed', 'failed'
    estimatedTimeRemaining: '5s'
  });
});

/**
 * POST /api/v1/zkp/verify
 * Verify a ZK proof
 */
router.post('/verify', [
  body('system').isIn(Object.values(ZKProofSystem)).withMessage('Invalid proof system'),
  body('proof').notEmpty().withMessage('Proof is required'),
  body('publicInputs').notEmpty().withMessage('Public inputs are required')
], async (req: Request, res: Response) => {
  try {
    const { system, proof, publicInputs } = req.body;
    const isValid = await zkpService.verifyProof(system as ZKProofSystem, proof, publicInputs);
    
    res.json({
      success: true,
      isValid,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`ZKP verification error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/**
 * GET /api/v1/zkp/metrics
 * Get ZKP service performance metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const stats = zkpService.getStatistics();
  res.json({
    success: true,
    metrics: stats,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/v1/zkp/stellar-verify
 * Verify proof and record result on Stellar
 */
router.post('/stellar-verify', [
  body('proofId').notEmpty().withMessage('Proof ID is required'),
  body('contractId').notEmpty().withMessage('Stellar contract ID is required')
], async (req: Request, res: Response) => {
  const { proofId, contractId } = req.body;
  
  logger.info(`Initiating Stellar verification for proof ${proofId} on contract ${contractId}`);
  
  // Simulate Stellar contract call
  res.json({
    success: true,
    transactionId: `stellar_zkp_${crypto.randomBytes(8).toString('hex')}`,
    status: 'pending_confirmation'
  });
});

export { router as zkpRoutes };
