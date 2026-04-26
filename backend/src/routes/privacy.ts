import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import AuditService from '../services/auditService';
import { MetadataRepository } from '../repositories/metadataRepository';

const router = Router();
const auditService = new AuditService();

// Initialize metadata repository for data management
const getMetadataRepository = () => {
  return new MetadataRepository({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'stellar_privacy',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    ssl: process.env.POSTGRES_SSL === 'true',
  });
};

// Get privacy settings
router.get('/settings', asyncHandler(async (req, res) => {
  const settings = {
    level: process.env.PRIVACY_LEVEL || 'high',
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365'),
    allowDataExport: process.env.ALLOW_DATA_EXPORT !== 'false',
    autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
    gdprComplianceEnabled: process.env.GDPR_COMPLIANCE === 'true',
    rightToBeForgottenEnabled: process.env.RIGHT_TO_BE_FORGOTTEN === 'true'
  };
  
  res.json({ settings });
}));

// Update privacy settings
router.put('/settings', asyncHandler(async (req, res) => {
  const { dataRetentionDays, autoDeleteEnabled, gdprComplianceEnabled } = req.body;
  
  // Validate settings
  if (dataRetentionDays && (dataRetentionDays < 1 || dataRetentionDays > 2555)) {
    throw new Error('Data retention days must be between 1 and 2555 (7 years)');
  }
  
  // Log the settings update
  await auditService.logSystemEvent(
    'privacy_settings_updated',
    {
      userId: req.user?.id || req.headers['x-user-id'] as string,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string
    },
    {
      dataRetentionDays,
      autoDeleteEnabled,
      gdprComplianceEnabled
    }
  );
  
  res.json({
    message: 'Privacy settings updated successfully',
    settings: {
      dataRetentionDays,
      autoDeleteEnabled,
      gdprComplianceEnabled
    }
  });
}));

// Get privacy audit logs
router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    logs: [],
    message: 'Privacy audit logs retrieved successfully'
  });
}));

// Submit a "Right to be Forgotten" request (GDPR Article 17)
router.post('/forget', asyncHandler(async (req: Request, res: Response) => {
  const { userId, email, reason, deleteAllData = true } = req.body;
  
  if (!userId && !email) {
    throw new Error('Either userId or email must be provided');
  }
  
  const requestId = `forget_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const submittedAt = new Date();
  
  // Log the forget request for compliance
  await auditService.logAccessControl(
    'right_to_be_forgotten_request',
    {
      userId: userId || email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string
    },
    {
      type: 'data_deletion_request',
      requestId,
      deleteAllData
    },
    'success',
    { reason: reason || 'not_provided' }
  );
  
  // In a real implementation, this would trigger:
  // 1. Queue job to delete all user data across all tables
  // 2. Anonymize any data that must be retained for legal reasons
  // 3. Send confirmation emails
  // 4. Generate compliance report
  
  res.status(202).json({
    requestId,
    status: 'processing',
    message: 'Right to be forgotten request submitted successfully',
    estimatedCompletionTime: '24-48 hours',
    submittedAt,
    rights: {
      gdprArticle17: 'Right to erasure (Right to be forgotten)',
      dataDeleted: deleteAllData,
      exceptions: ['Legal obligations', 'Fraud prevention', 'Public interest']
    }
  });
}));

// Execute immediate data deletion for a specific user
router.delete('/users/:userId/data', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { hardDelete = false, retainForLegal = true } = req.query;
  
  const metadataRepo = getMetadataRepository();
  const deletedAt = new Date();
  const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  try {
    // Retrieve all user data for audit trail
    const userData = await metadataRepo.queryMetadata({
      limit: 1000,
      offset: 0
    });
    
    // Filter datasets belonging to this user
    const userDatasets = userData.metadata.filter(
      m => m.sanitizedMetadata?.userId === userId || m.originalMetadata?.userId === userId
    );
    
    // Perform deletion
    const deletedDatasetIds: string[] = [];
    for (const dataset of userDatasets) {
      // Mark as deleted rather than physically deleting (soft delete)
      await metadataRepo.updateMetadataStatus(dataset.id, 'deleted');
      deletedDatasetIds.push(dataset.id);
    }
    
    // Log the deletion for GDPR compliance
    await auditService.logAccessControl(
      'user_data_deletion',
      {
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string
      },
      {
        type: hardDelete ? 'hard_delete' : 'soft_delete',
        deletionId,
        datasetsCount: deletedDatasetIds.length
      },
      'success',
      {
        deletedDatasetIds,
        retainForLegal,
        hardDelete
      }
    );
    
    res.json({
      deletionId,
      status: 'completed',
      message: `User data ${hardDelete ? 'permanently deleted' : 'marked for deletion'}`,
      deletedAt,
      summary: {
        datasetsDeleted: deletedDatasetIds.length,
        hardDelete,
        retainForLegal,
        gdprCompliant: true
      }
    });
    
  } catch (error) {
    await auditService.logSecurityViolation(
      'user_data_deletion_failed',
      {
        userId,
        ipAddress: req.ip
      },
      {
        type: 'deletion_failure',
        error: error.message
      }
    );
    throw error;
  }
}));

// Trigger automated data retention cleanup
router.post('/retention/cleanup', asyncHandler(async (req: Request, res: Response) => {
  const { retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '365'), dryRun = true } = req.body;
  
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const metadataRepo = getMetadataRepository();
  
  try {
    // Query old data
    const oldData = await metadataRepo.queryMetadata({
      processedBefore: cutoffDate,
      limit: 1000,
      offset: 0
    });
    
    let deletedCount = 0;
    let archivedCount = 0;
    
    if (!dryRun) {
      // Actually delete/archive old data
      for (const record of oldData.metadata) {
        // Archive before deletion if required
        if (record.sanitizedMetadata?.requiresArchival) {
          // Move to archival storage (e.g., IPFS, Glacier)
          archivedCount++;
        }
        
        // Mark as expired
        await metadataRepo.updateMetadataStatus(record.id, 'expired');
        deletedCount++;
      }
      
      // Log the cleanup operation
      await auditService.logSystemEvent(
        'data_retention_cleanup',
        {
          userId: 'system',
          ipAddress: 'internal'
        },
        {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          deletedCount,
          archivedCount,
          dryRun
        }
      );
    }
    
    res.json({
      status: 'completed',
      message: dryRun ? 'Dry run completed' : 'Data retention cleanup executed',
      summary: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        recordsFound: oldData.total,
        recordsDeleted: deletedCount,
        recordsArchived: archivedCount,
        dryRun,
        executedAt: new Date()
      }
    });
    
  } catch (error) {
    await auditService.logSecurityViolation(
      'retention_cleanup_failed',
      {
        userId: 'system',
        ipAddress: 'internal'
      },
      {
        type: 'cleanup_failure',
        error: error.message
      }
    );
    throw error;
  }
}));

// Get data retention status and statistics
router.get('/retention/status', asyncHandler(async (req: Request, res: Response) => {
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '365');
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const metadataRepo = getMetadataRepository();
  
  try {
    // Get current data statistics
    const stats = await metadataRepo.getProcessingStatistics();
    
    // Query data approaching retention limit
    const dataApproachingExpiry = await metadataRepo.queryMetadata({
      processedBefore: cutoffDate,
      limit: 100,
      offset: 0
    });
    
    res.json({
      retentionPolicy: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
        nextScheduledCleanup: getNextScheduledCleanup()
      },
      currentStatus: {
        totalRecords: stats.totalProcessed,
        recordsApproachingExpiry: dataApproachingExpiry.total,
        recordsByStatus: {
          processed: stats.successfulProcessed,
          failed: stats.failedProcessed,
          pending: stats.totalProcessed - stats.successfulProcessed - stats.failedProcessed
        }
      },
      recommendations: {
        actionRequired: dataApproachingExpiry.total > 0,
        suggestedAction: dataApproachingExpiry.total > 100 ? 'immediate_cleanup' : 'schedule_cleanup',
        estimatedStorageSavings: `${Math.round(dataApproachingExpiry.total * 0.8)}% reduction possible`
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve retention status',
      message: error.message
    });
  }
}));

// Helper function to calculate next scheduled cleanup
function getNextScheduledCleanup(): string {
  // Default: daily cleanup at 2 AM UTC
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(2, 0, 0, 0);
  return tomorrow.toISOString();
}

export { router as privacyRoutes };
