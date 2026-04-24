import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { FederatedLearningService } from '../services/federatedLearning';
import { DifferentialPrivacyService } from '../services/differentialPrivacy';
import { HomomorphicEncryptionService } from '../services/homomorphicEncryption';

const router = Router();

// Initialize services
const federatedLearning = new FederatedLearningService({
  minClients: 3,
  maxClients: 10,
  rounds: 100,
  targetAccuracy: 0.95,
  privacyBudget: 1.0,
  noiseScale: 0.1,
  clippingBound: 1.0,
  encryptionEnabled: true
});

const differentialPrivacy = new DifferentialPrivacyService();
const homomorphicEncryption = new HomomorphicEncryptionService();

// Federated Learning Routes

// Start federated training
router.post('/federated/start', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { initialModel, config } = req.body;
    
    if (config) {
      // Update federated learning config
      Object.assign(federatedLearning['config'], config);
    }

    await federatedLearning.startFederatedTraining(initialModel);
    
    res.json({
      message: 'Federated learning training started',
      config: federatedLearning['config'],
      status: 'training'
    });
  } catch (error) {
    logger.error('Failed to start federated training:', error);
    res.status(500).json({ error: 'Failed to start federated training' });
  }
}));

// Get federated learning status
router.get('/federated/status', asyncHandler(async (req: Request, res: Response) => {
  const status = federatedLearning.getTrainingStatus();
  res.json(status);
}));

// Stop federated training
router.post('/federated/stop', asyncHandler(async (req: Request, res: Response) => {
  try {
    await federatedLearning.stopTraining();
    res.json({ message: 'Federated learning training stopped' });
  } catch (error) {
    logger.error('Failed to stop federated training:', error);
    res.status(500).json({ error: 'Failed to stop federated training' });
  }
}));

// Get federated learning metrics
router.get('/federated/metrics', asyncHandler(async (req: Request, res: Response) => {
  const metrics = federatedLearning.getClientMetrics();
  return res.json(metrics);
}));

// Differential Privacy Routes

// Initialize privacy budget for user
router.post('/privacy/initialize', asyncHandler(async (req: Request, res: Response) => {
  const { userId, epsilon } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  differentialPrivacy.initializeUserPrivacy(userId, epsilon);
  
  return res.json({
    message: 'Privacy budget initialized',
    userId,
    epsilon: epsilon || 10.0
  });
}));

// Execute differential privacy query
router.post('/privacy/query', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { userId, query } = req.body;
    
    if (!userId || !query) {
      return res.status(400).json({ error: 'User ID and query are required' });
    }

    const result = await differentialPrivacy.executeDPQuery(userId, query);
    
    return res.json({
      result,
      userId,
      queryType: query.type,
      epsilon: query.epsilon
    });
  } catch (error) {
    logger.error('Failed to execute DP query:', error);
    return res.status(500).json({ error: 'Failed to execute differential privacy query' });
  }
}));

// Get privacy metrics
router.get('/privacy/metrics/:userId?', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId;
  const metrics = differentialPrivacy.getPrivacyMetrics(userId);
  return res.json(metrics);
}));

// Calculate privacy composition
router.post('/privacy/composition', asyncHandler(async (req: Request, res: Response) => {
  const { queries, advanced, k } = req.body;
  
  if (!queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Queries array is required' });
  }

  const composition = advanced ? 
    differentialPrivacy.advancedComposition(queries, k || 1) :
    differentialPrivacy.calculateComposition(queries);
  
  return res.json({
    composition,
    totalQueries: queries.length
  });
}));

// Get adaptive budget allocation
router.get('/privacy/budget/:userId/:complexity', asyncHandler(async (req: Request, res: Response) => {
  const { userId, complexity } = req.params;
  
  if (!['simple', 'medium', 'complex'].includes(complexity)) {
    return res.status(400).json({ error: 'Invalid complexity level' });
  }

  const budget = differentialPrivacy.adaptiveBudgetAllocation(
    userId, 
    complexity as 'simple' | 'medium' | 'complex'
  );
  
  return res.json({
    userId,
    complexity,
    allocatedBudget: budget
  });
}));

// Homomorphic Encryption Routes

// Generate key pair
router.post('/encryption/keys', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { keyId, keySize } = req.body;
    const id = keyId || `key-${Date.now()}`;
    const size = keySize || 2048;
    
    await homomorphicEncryption.generateKeyPair(id, size);
    
    res.json({
      message: 'Key pair generated successfully',
      keyId: id,
      keySize: size
    });
  } catch (error) {
    logger.error('Failed to generate key pair:', error);
    res.status(500).json({ error: 'Failed to generate key pair' });
  }
}));

// Get key information
router.get('/encryption/keys/:keyId?', asyncHandler(async (req: Request, res: Response) => {
  const keyId = req.params.keyId;
  const keyInfo = homomorphicEncryption.getKeyInfo(keyId);
  return res.json(keyInfo);
}));

// Encrypt model
router.post('/encryption/model', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { weights, biases, modelId } = req.body;
    
    if (!weights || !biases || !modelId) {
      return res.status(400).json({ error: 'Weights, biases, and modelId are required' });
    }

    const encryptedModel = await homomorphicEncryption.encryptModel(weights, biases, modelId);
    
    return res.json({
      message: 'Model encrypted successfully',
      modelId,
      metadata: encryptedModel.metadata
    });
  } catch (error) {
    logger.error('Failed to encrypt model:', error);
    return res.status(500).json({ error: 'Failed to encrypt model' });
  }
}));

// Encrypt data
router.post('/encryption/data', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { data, metadata } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }

    const encryptedData = await homomorphicEncryption.encryptData(data, metadata || {
      dataType: 'input',
      shape: [data.length],
      encryptionScheme: 'paillier'
    });
    
    return res.json({
      message: 'Data encrypted successfully',
      metadata: encryptedData.metadata
    });
  } catch (error) {
    logger.error('Failed to encrypt data:', error);
    return res.status(500).json({ error: 'Failed to encrypt data' });
  }
}));

// Perform encrypted inference
router.post('/encryption/inference', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { modelId, encryptedInput, inferenceId, userId } = req.body;
    
    if (!modelId || !encryptedInput || !inferenceId || !userId) {
      return res.status(400).json({ error: 'ModelId, encryptedInput, inferenceId, and userId are required' });
    }

    const result = await homomorphicEncryption.performEncryptedInference({
      modelId,
      encryptedInput,
      inferenceId,
      userId
    });
    
    return res.json({
      message: 'Encrypted inference completed successfully',
      inferenceId,
      processingTime: result.processingTime,
      metadata: result.metadata
    });
  } catch (error) {
    logger.error('Failed to perform encrypted inference:', error);
    return res.status(500).json({ error: 'Failed to perform encrypted inference' });
  }
}));

// Get inference results
router.get('/encryption/inference/:inferenceId?', asyncHandler(async (req: Request, res: Response) => {
  const inferenceId = req.params.inferenceId;
  const results = homomorphicEncryption.getInferenceHistory(inferenceId);
  return res.json(results);
}));

// Get available models
router.get('/encryption/models', asyncHandler(async (req: Request, res: Response) => {
  const models = homomorphicEncryption.getAvailableModels();
  return res.json(models);
}));

// Decrypt data (for testing/verification)
router.post('/encryption/decrypt', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { encryptedData } = req.body;
    
    if (!encryptedData || !encryptedData.values) {
      return res.status(400).json({ error: 'Encrypted data with values is required' });
    }

    const decryptedData = await homomorphicEncryption.decryptData(encryptedData);
    
    return res.json({
      message: 'Data decrypted successfully',
      data: decryptedData
    });
  } catch (error) {
    logger.error('Failed to decrypt data:', error);
    return res.status(500).json({ error: 'Failed to decrypt data' });
  }
}));

// Audit and Security Routes

// Get comprehensive ML service audit
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  try {
    const [flMetrics, dpMetrics, heMetrics] = await Promise.all([
      Promise.resolve(federatedLearning.getClientMetrics()),
      Promise.resolve(differentialPrivacy.getPrivacyMetrics()),
      homomorphicEncryption.auditEncryptionUsage()
    ]);

    res.json({
      timestamp: new Date(),
      federatedLearning: flMetrics,
      differentialPrivacy: dpMetrics,
      homomorphicEncryption: heMetrics,
      overall: {
        totalServices: 3,
        activeServices: 3,
        securityLevel: 'high'
      }
    });
  } catch (error) {
    logger.error('Failed to generate audit report:', error);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
}));

// Health check for ML services
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date(),
    services: {
      federatedLearning: 'active',
      differentialPrivacy: 'active',
      homomorphicEncryption: 'active'
    },
    version: '1.0.0'
  };

  res.json(health);
}));

// Export services for WebSocket integration
export { federatedLearning, differentialPrivacy, homomorphicEncryption };
export { router as mlRoutes };
