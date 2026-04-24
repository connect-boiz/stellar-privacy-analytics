import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { DataAnonymizationService } from '../services/dataAnonymization';

const router = Router();

// Initialize anonymization service
const anonymizationService = new DataAnonymizationService();

// Anonymize dataset
router.post('/anonymize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { data, config } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }
    
    if (!config || !config.algorithm || !config.quasiIdentifiers) {
      return res.status(400).json({ 
        error: 'Configuration with algorithm and quasiIdentifiers is required' 
      });
    }

    const result = await anonymizationService.anonymizeDataset(data, config);
    
    return res.json({
      message: 'Dataset anonymized successfully',
      result
    });
  } catch (error) {
    logger.error('Failed to anonymize dataset:', error);
    return res.status(500).json({ error: 'Failed to anonymize dataset' });
  }
}));

// Batch anonymization for large datasets
router.post('/batch-anonymize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { data, config, batchSize } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }
    
    if (!config || !config.algorithm || !config.quasiIdentifiers) {
      return res.status(400).json({ 
        error: 'Configuration with algorithm and quasiIdentifiers is required' 
      });
    }

    const result = await anonymizationService.processBatchAnonymization(
      data, 
      config, 
      batchSize || 1000
    );
    
    return res.json({
      message: 'Batch anonymization completed successfully',
      result
    });
  } catch (error) {
    logger.error('Failed to perform batch anonymization:', error);
    return res.status(500).json({ error: 'Failed to perform batch anonymization' });
  }
}));

// Optimize privacy-utility trade-off
router.post('/optimize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { data, quasiIdentifiers, sensitiveAttribute, targetUtility } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array is required' });
    }
    
    if (!quasiIdentifiers || !Array.isArray(quasiIdentifiers)) {
      return res.status(400).json({ error: 'Quasi-identifiers array is required' });
    }

    const optimalConfig = await anonymizationService.optimizePrivacyUtility(
      data,
      quasiIdentifiers,
      sensitiveAttribute,
      targetUtility
    );
    
    return res.json({
      message: 'Privacy-utility optimization completed',
      optimalConfig
    });
  } catch (error) {
    logger.error('Failed to optimize privacy-utility trade-off:', error);
    return res.status(500).json({ error: 'Failed to optimize privacy-utility trade-off' });
  }
}));

// Assess privacy risk
router.post('/assess-risk', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { originalData, anonymizedData, quasiIdentifiers } = req.body;
    
    if (!originalData || !Array.isArray(originalData) || !anonymizedData || !Array.isArray(anonymizedData)) {
      return res.status(400).json({ error: 'Both original and anonymized data arrays are required' });
    }
    
    if (!quasiIdentifiers || !Array.isArray(quasiIdentifiers)) {
      return res.status(400).json({ error: 'Quasi-identifiers array is required' });
    }

    const audit = await anonymizationService.assessPrivacyRisk(
      originalData,
      anonymizedData,
      quasiIdentifiers
    );
    
    return res.json({
      message: 'Privacy risk assessment completed',
      audit
    });
  } catch (error) {
    logger.error('Failed to assess privacy risk:', error);
    return res.status(500).json({ error: 'Failed to assess privacy risk' });
  }
}));

// Generate anonymization report
router.post('/generate-report', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { datasetId, originalData, anonymizedData, config } = req.body;
    
    if (!datasetId || !originalData || !anonymizedData || !config) {
      return res.status(400).json({ 
        error: 'DatasetId, originalData, anonymizedData, and config are required' 
      });
    }

    const report = await anonymizationService.generateAnonymizationReport(
      datasetId,
      originalData,
      anonymizedData,
      config
    );
    
    return res.json({
      message: 'Anonymization report generated successfully',
      report
    });
  } catch (error) {
    logger.error('Failed to generate anonymization report:', error);
    return res.status(500).json({ error: 'Failed to generate anonymization report' });
  }
}));

// Get anonymization history
router.get('/history/:datasetId?', asyncHandler(async (req: Request, res: Response) => {
  const datasetId = req.params.datasetId;
  const history = anonymizationService.getAnonymizationHistory(datasetId);
  
  return res.json({
    datasetId,
    history,
    totalRecords: history.length
  });
}));

// Get supported algorithms and parameters
router.get('/algorithms', asyncHandler(async (req: Request, res: Response) => {
  const algorithms = {
    'k-anonymity': {
      description: 'Ensures each record is indistinguishable from at least k-1 other records',
      parameters: {
        k: {
          type: 'integer',
          min: 2,
          max: 1000,
          default: 5,
          description: 'Anonymity parameter - minimum group size'
        },
        quasiIdentifiers: {
          type: 'array',
          required: true,
          description: 'List of quasi-identifier column names'
        },
        maxSuppressionRate: {
          type: 'float',
          min: 0,
          max: 1,
          default: 0.1,
          description: 'Maximum rate of records that can be suppressed'
        }
      },
      useCases: [
        'Medical data anonymization',
        'Census data protection',
        'Customer data privacy'
      ]
    },
    'l-diversity': {
      description: 'Ensures each equivalence class has at least l distinct sensitive values',
      parameters: {
        k: {
          type: 'integer',
          min: 2,
          max: 1000,
          default: 5,
          description: 'Anonymity parameter - minimum group size'
        },
        l: {
          type: 'integer',
          min: 2,
          max: 100,
          default: 3,
          description: 'Diversity parameter - minimum distinct sensitive values'
        },
        quasiIdentifiers: {
          type: 'array',
          required: true,
          description: 'List of quasi-identifier column names'
        },
        sensitiveAttribute: {
          type: 'string',
          required: true,
          description: 'Name of the sensitive attribute column'
        }
      },
      useCases: [
        'Employment data protection',
        'Financial data anonymization',
        'Educational records privacy'
      ]
    },
    't-closeness': {
      description: 'Ensures distribution of sensitive values in equivalence classes is close to original distribution',
      parameters: {
        k: {
          type: 'integer',
          min: 2,
          max: 1000,
          default: 5,
          description: 'Anonymity parameter - minimum group size'
        },
        t: {
          type: 'float',
          min: 0,
          max: 1,
          default: 0.2,
          description: 'Closeness threshold - maximum distribution distance'
        },
        quasiIdentifiers: {
          type: 'array',
          required: true,
          description: 'List of quasi-identifier column names'
        },
        sensitiveAttribute: {
          type: 'string',
          required: true,
          description: 'Name of the sensitive attribute column'
        }
      },
      useCases: [
        'Statistical data protection',
        'Research data anonymization',
        'Public use datasets'
      ]
    }
  };
  
  return res.json({
    algorithms,
    metadata: {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalAlgorithms: Object.keys(algorithms).length
    }
  });
}));

// Validate anonymization configuration
router.post('/validate-config', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { config, sampleSize } = req.body;
    
    if (!config) {
      return res.status(400).json({ error: 'Configuration is required' });
    }

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Validate algorithm
    if (!['k-anonymity', 'l-diversity', 't-closeness'].includes(config.algorithm)) {
      validation.isValid = false;
      validation.errors.push('Invalid algorithm specified');
    }

    // Validate required parameters
    if (!config.quasiIdentifiers || config.quasiIdentifiers.length === 0) {
      validation.isValid = false;
      validation.errors.push('Quasi-identifiers are required');
    }

    // Algorithm-specific validation
    switch (config.algorithm) {
      case 'k-anonymity':
        if (!config.k || config.k < 2) {
          validation.isValid = false;
          validation.errors.push('k must be at least 2 for k-anonymity');
        }
        if (config.k > 100) {
          validation.warnings.push('Large k values may result in excessive generalization');
        }
        break;
        
      case 'l-diversity':
        if (!config.l || config.l < 2) {
          validation.isValid = false;
          validation.errors.push('l must be at least 2 for l-diversity');
        }
        if (!config.sensitiveAttribute) {
          validation.isValid = false;
          validation.errors.push('sensitiveAttribute is required for l-diversity');
        }
        break;
        
      case 't-closeness':
        if (!config.t || config.t < 0 || config.t > 1) {
          validation.isValid = false;
          validation.errors.push('t must be between 0 and 1 for t-closeness');
        }
        if (!config.sensitiveAttribute) {
          validation.isValid = false;
          validation.errors.push('sensitiveAttribute is required for t-closeness');
        }
        break;
    }

    // Performance recommendations
    if (sampleSize && sampleSize > 100000) {
      validation.recommendations.push('Consider using batch processing for large datasets');
    }

    if (config.maxSuppressionRate && config.maxSuppressionRate > 0.2) {
      validation.warnings.push('High suppression rate may significantly reduce data utility');
    }

    return res.json({
      validation,
      config
    });
  } catch (error) {
    logger.error('Failed to validate configuration:', error);
    return res.status(500).json({ error: 'Failed to validate configuration' });
  }
}));

// Get anonymization metrics and statistics
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  try {
    const history = anonymizationService.getAnonymizationHistory();
    
    const stats = {
      totalAnonymizations: history.length,
      algorithmUsage: {} as Record<string, number>,
      averageProcessingTime: 0,
      averageInformationLoss: 0,
      averagePrivacyScore: 0,
      complianceDistribution: {
        excellent: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };

    let totalProcessingTime = 0;
    let totalInformationLoss = 0;
    let totalPrivacyScore = 0;

    for (const audit of history) {
      // Count algorithm usage
      stats.algorithmUsage[audit.complianceLevel] = (stats.algorithmUsage[audit.complianceLevel] || 0) + 1;
      
      // Update compliance distribution
      stats.complianceDistribution[audit.complianceLevel]++;
      
      // Accumulate metrics (simplified - would use actual anonymization results)
      totalProcessingTime += 1000; // Mock value
      totalInformationLoss += 0.1; // Mock value
      totalPrivacyScore += 0.8; // Mock value
    }

    if (history.length > 0) {
      stats.averageProcessingTime = totalProcessingTime / history.length;
      stats.averageInformationLoss = totalInformationLoss / history.length;
      stats.averagePrivacyScore = totalPrivacyScore / history.length;
    }

    return res.json({
      stats,
      metadata: {
        generatedAt: new Date(),
        totalAudits: history.length
      }
    });
  } catch (error) {
    logger.error('Failed to get anonymization metrics:', error);
    return res.status(500).json({ error: 'Failed to get anonymization metrics' });
  }
}));

// Health check for anonymization service
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date(),
    service: 'data-anonymization',
    version: '1.0.0',
    capabilities: [
      'k-anonymity',
      'l-diversity', 
      't-closeness',
      'batch-processing',
      'privacy-risk-assessment',
      'utility-optimization'
    ]
  };

  return res.json(health);
}));

export { router as anonymizationRoutes };
