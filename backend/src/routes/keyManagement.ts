import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { KeyManagementService } from '../services/keyManagement/KeyManagementService';
import { SMPCKeyIntegration } from '../services/keyManagement/SMPCKeyIntegration';
import { ZKPKeyIntegration } from '../services/keyManagement/ZKPKeyIntegration';
import { getHSMIntegration } from '../services/hsmIntegration';
import { logger } from '../utils/logger';

const router = Router();

// Initialize services
let keyManagementService: KeyManagementService | null = null;
let smpcIntegration: SMPCKeyIntegration | null = null;
let zkpIntegration: ZKPKeyIntegration | null = null;

// Middleware to initialize services
router.use(async (req, res, next) => {
  if (!keyManagementService) {
    try {
      const hsmIntegration = getHSMIntegration();
      const hsmService = hsmIntegration.getHSMService();
      const masterKeyManager = hsmIntegration.getMasterKeyManager();

      keyManagementService = new KeyManagementService(hsmService, masterKeyManager);
      await keyManagementService.initialize();

      smpcIntegration = new SMPCKeyIntegration(keyManagementService);
      zkpIntegration = new ZKPKeyIntegration(keyManagementService);

      logger.info('Key Management Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Key Management Service:', error);
      return res.status(500).json({
        error: 'Service initialization failed',
        message: error.message
      });
    }
  }
  next();
});

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// ============================================================================
// Key Generation and Management
// ============================================================================

/**
 * POST /api/v1/key-management/keys/generate
 * Generate a new cryptographic key
 */
router.post('/keys/generate', [
  body('keyType').isIn(['master', 'data', 'session', 'smpc', 'zkp']),
  body('purpose').isString().isLength({ min: 1, max: 200 }),
  body('algorithm').optional().isString(),
  body('keySize').optional().isInt({ min: 16, max: 64 }),
  body('owner').optional().isString(),
  body('ttl').optional().isInt({ min: 60 }),
  body('tags').optional().isArray(),
  body('enableThreshold').optional().isBoolean(),
  body('thresholdConfig').optional().isObject(),
  body('enableBackup').optional().isBoolean()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const result = await keyManagementService!.generateKey(req.body);

    res.status(201).json({
      success: true,
      data: {
        keyId: result.keyId,
        metadata: result.metadata,
        hasShares: !!result.shares,
        shareCount: result.shares?.length || 0
      }
    });
  } catch (error: any) {
    logger.error('Failed to generate key:', error);
    res.status(500).json({
      error: 'Key generation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/key-management/keys/:keyId/rotate
 * Rotate an existing key
 */
router.post('/keys/:keyId/rotate', [
  param('keyId').isString(),
  body('reason').optional().isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    const result = await keyManagementService!.rotateKey(keyId, reason);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Failed to rotate key:', error);
    res.status(500).json({
      error: 'Key rotation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/key-management/keys/:keyId/revoke
 * Revoke a key
 */
router.post('/keys/:keyId/revoke', [
  param('keyId').isString(),
  body('reason').isString().isLength({ min: 1, max: 500 }),
  body('actor').optional().isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const { reason, actor } = req.body;

    await keyManagementService!.revokeKey(keyId, reason, actor);

    res.json({
      success: true,
      message: `Key ${keyId} revoked`
    });
  } catch (error: any) {
    logger.error('Failed to revoke key:', error);
    res.status(500).json({
      error: 'Key revocation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/key-management/keys/:keyId
 * Get key metadata
 */
router.get('/keys/:keyId', [
  param('keyId').isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const metadata = keyManagementService!.getKeyMetadata(keyId);

    if (!metadata) {
      return res.status(404).json({
        error: 'Key not found',
        keyId
      });
    }

    res.json({
      success: true,
      data: metadata
    });
  } catch (error: any) {
    logger.error('Failed to get key metadata:', error);
    res.status(500).json({
      error: 'Failed to get key metadata',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/key-management/keys
 * List keys with filters
 */
router.get('/keys', [
  query('keyType').optional().isIn(['master', 'data', 'session', 'smpc', 'zkp']),
  query('status').optional().isIn(['active', 'rotating', 'deprecated', 'revoked', 'compromised']),
  query('owner').optional().isString(),
  query('purpose').optional().isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const filters = {
      keyType: req.query.keyType as any,
      status: req.query.status as any,
      owner: req.query.owner as string,
      purpose: req.query.purpose as string
    };

    const keys = keyManagementService!.listKeys(filters);

    res.json({
      success: true,
      data: keys,
      total: keys.length
    });
  } catch (error: any) {
    logger.error('Failed to list keys:', error);
    res.status(500).json({
      error: 'Failed to list keys',
      message: error.message
    });
  }
});

// ============================================================================
// Key Sharing (Threshold Cryptography)
// ============================================================================

/**
 * POST /api/v1/key-management/keys/:keyId/share
 * Share a key using threshold cryptography
 */
router.post('/keys/:keyId/share', [
  param('keyId').isString(),
  body('threshold').isInt({ min: 2 }),
  body('shareHolders').isArray({ min: 2 })
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const { threshold, shareHolders } = req.body;

    const shares = await keyManagementService!.shareKey(keyId, threshold, shareHolders);

    res.json({
      success: true,
      data: {
        keyId,
        threshold,
        totalShares: shares.length,
        shares: shares.map(s => ({
          shareId: s.shareId,
          holder: s.holder
          // Don't return encrypted share in response for security
        }))
      }
    });
  } catch (error: any) {
    logger.error('Failed to share key:', error);
    res.status(500).json({
      error: 'Key sharing failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/key-management/keys/:keyId/reconstruct
 * Reconstruct a key from shares
 */
router.post('/keys/:keyId/reconstruct', [
  param('keyId').isString(),
  body('shares').isArray({ min: 2 })
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const { shares } = req.body;

    const keyMaterial = await keyManagementService!.reconstructKey(keyId, shares);

    res.json({
      success: true,
      data: {
        keyId,
        reconstructed: true,
        keyMaterial: keyMaterial.toString('base64')
      }
    });
  } catch (error: any) {
    logger.error('Failed to reconstruct key:', error);
    res.status(500).json({
      error: 'Key reconstruction failed',
      message: error.message
    });
  }
});

// ============================================================================
// Backup and Recovery
// ============================================================================

/**
 * POST /api/v1/key-management/keys/:keyId/backup
 * Backup a key
 */
router.post('/keys/:keyId/backup', [
  param('keyId').isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const result = await keyManagementService!.backupKey(keyId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Failed to backup key:', error);
    res.status(500).json({
      error: 'Key backup failed',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/key-management/backups/:backupId/restore
 * Restore a key from backup
 */
router.post('/backups/:backupId/restore', [
  param('backupId').isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { backupId } = req.params;
    const result = await keyManagementService!.restoreKey(backupId);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Failed to restore key:', error);
    res.status(500).json({
      error: 'Key restoration failed',
      message: error.message
    });
  }
});

// ============================================================================
// SMPC Integration
// ============================================================================

/**
 * POST /api/v1/key-management/smpc/sessions/:sessionId/keys
 * Generate keys for SMPC session
 */
router.post('/smpc/sessions/:sessionId/keys', [
  param('sessionId').isString(),
  body('participants').isArray({ min: 2 }),
  body('threshold').isInt({ min: 2 })
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { participants, threshold } = req.body;

    const result = await smpcIntegration!.generateSessionKeys(
      sessionId,
      participants,
      threshold
    );

    res.status(201).json({
      success: true,
      data: {
        sessionKeyId: result.sessionKeyId,
        participantCount: result.participantKeys.size,
        shareCount: result.shares.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to generate SMPC session keys:', error);
    res.status(500).json({
      error: 'SMPC key generation failed',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/key-management/smpc/sessions/:sessionId/keys
 * Cleanup SMPC session keys
 */
router.delete('/smpc/sessions/:sessionId/keys', [
  param('sessionId').isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await smpcIntegration!.cleanupSessionKeys(sessionId);

    res.json({
      success: true,
      message: `SMPC session keys cleaned up for ${sessionId}`
    });
  } catch (error: any) {
    logger.error('Failed to cleanup SMPC session keys:', error);
    res.status(500).json({
      error: 'SMPC key cleanup failed',
      message: error.message
    });
  }
});

// ============================================================================
// ZKP Integration
// ============================================================================

/**
 * POST /api/v1/key-management/zkp/circuits/:circuitId/keys
 * Generate keys for ZKP circuit
 */
router.post('/zkp/circuits/:circuitId/keys', [
  param('circuitId').isString(),
  body('proofSystem').isIn(['groth16', 'plonk', 'bulletproofs'])
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { circuitId } = req.params;
    const { proofSystem } = req.body;

    const keyPair = await zkpIntegration!.generateCircuitKeys(circuitId, proofSystem);

    res.status(201).json({
      success: true,
      data: keyPair
    });
  } catch (error: any) {
    logger.error('Failed to generate ZKP circuit keys:', error);
    res.status(500).json({
      error: 'ZKP key generation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/key-management/zkp/circuits/:circuitId/keys
 * Get ZKP circuit keys
 */
router.get('/zkp/circuits/:circuitId/keys', [
  param('circuitId').isString()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { circuitId } = req.params;
    const keyPair = zkpIntegration!.getCircuitKeys(circuitId);

    if (!keyPair) {
      return res.status(404).json({
        error: 'Circuit keys not found',
        circuitId
      });
    }

    res.json({
      success: true,
      data: keyPair
    });
  } catch (error: any) {
    logger.error('Failed to get ZKP circuit keys:', error);
    res.status(500).json({
      error: 'Failed to get ZKP circuit keys',
      message: error.message
    });
  }
});

// ============================================================================
// System Status and Health
// ============================================================================

/**
 * GET /api/v1/key-management/status
 * Get system status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const statistics = keyManagementService!.getStatistics();
    const healthCheck = await keyManagementService!.healthCheck();

    res.json({
      success: true,
      data: {
        statistics,
        health: healthCheck
      }
    });
  } catch (error: any) {
    logger.error('Failed to get system status:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/key-management/health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthCheck = await keyManagementService!.healthCheck();

    const statusCode = healthCheck.healthy ? 200 : 503;

    res.status(statusCode).json({
      success: healthCheck.healthy,
      data: healthCheck
    });
  } catch (error: any) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

export default router;
