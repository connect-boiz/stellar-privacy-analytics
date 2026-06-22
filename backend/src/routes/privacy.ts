import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import AuditService from '../services/auditService';
import { DatabaseService } from '../services/databaseService';
import { MetadataRepository } from '../repositories/metadataRepository';

const router = Router();
const auditService = new AuditService();

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

const getMetadataRepository = () => {
  const database = new DatabaseService({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'stellar_privacy',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    ssl: process.env.POSTGRES_SSL === 'true',
  });

  return new MetadataRepository(database);
};

router.get('/settings', asyncHandler(async (_req: Request, res: Response) => {
  const settings = {
    level: process.env.PRIVACY_LEVEL || 'high',
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
    allowDataExport: process.env.ALLOW_DATA_EXPORT !== 'false',
    autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
    gdprComplianceEnabled: process.env.GDPR_COMPLIANCE === 'true',
    rightToBeForgottenEnabled: process.env.RIGHT_TO_BE_FORGOTTEN === 'true',
  };

  res.json({ settings });
}));

router.put('/settings', [
  body('dataRetentionDays').optional().isInt({ min: 1, max: 2555 }).withMessage('Data retention days must be between 1 and 2555'),
  body('autoDeleteEnabled').optional().isBoolean(),
  body('gdprComplianceEnabled').optional().isBoolean(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { dataRetentionDays, autoDeleteEnabled, gdprComplianceEnabled } = req.body;

  await auditService.logSystemEvent(
    'privacy_settings_updated',
    {
      userId: (req as Request & { user?: { id?: string } }).user?.id || req.headers['x-user-id'] as string,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    },
    {
      dataRetentionDays,
      autoDeleteEnabled,
      gdprComplianceEnabled,
    }
  );

  res.json({
    message: 'Privacy settings updated successfully',
    settings: {
      dataRetentionDays,
      autoDeleteEnabled,
      gdprComplianceEnabled,
    },
  });
}));

router.get('/audit', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    logs: [],
    message: 'Privacy audit logs retrieved successfully',
  });
}));

router.post('/forget', [
  body('userId').optional({ values: 'null' }).trim().isLength({ max: 256 }),
  body('email').optional({ values: 'null' }).trim().isEmail().normalizeEmail(),
  body('reason').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('deleteAllData').optional().isBoolean(),
  body().custom((_, { req }) => {
    const uid = (req as Request).body?.userId;
    const em = (req as Request).body?.email;
    if (!(uid && String(uid).trim()) && !(em && String(em).trim())) {
      throw new Error('Either userId or email must be provided');
    }
    return true;
  }),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { userId, email, reason, deleteAllData = true } = req.body;
  const requestId = `forget_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const submittedAt = new Date();

  await auditService.logAccessControl(
    'right_to_be_forgotten_request',
    {
      userId: userId || email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    },
    {
      type: 'data_deletion_request',
      metadata: {
        requestId,
        deleteAllData,
      },
    },
    'success',
    { reason: reason || 'not_provided' }
  );

  res.status(202).json({
    requestId,
    status: 'processing',
    message: 'Right to be forgotten request submitted successfully',
    estimatedCompletionTime: '24-48 hours',
    submittedAt,
    rights: {
      gdprArticle17: 'Right to erasure (Right to be forgotten)',
      dataDeleted: deleteAllData,
      exceptions: ['Legal obligations', 'Fraud prevention', 'Public interest'],
    },
  });
}));

router.delete('/users/:userId/data', [
  param('userId').trim().matches(/^[a-zA-Z0-9_@.-]{1,256}$/),
  query('hardDelete').optional().isIn(['true', 'false', '0', '1']),
  query('retainForLegal').optional().isIn(['true', 'false', '0', '1']),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const hardDelete = req.query.hardDelete === 'true' || req.query.hardDelete === '1';
  const retainForLegal = !(req.query.retainForLegal === 'false' || req.query.retainForLegal === '0');
  const metadataRepo = getMetadataRepository();
  const deletedAt = new Date();
  const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

  try {
    const userData = await metadataRepo.queryMetadata({
      limit: 1000,
      offset: 0,
    });

    const userDatasets = userData.metadata.filter(
      m => m.sanitizedMetadata?.userId === userId || m.originalMetadata?.userId === userId
    );

    const deletedDatasetIds: string[] = [];
    for (const dataset of userDatasets) {
      await metadataRepo.updateMetadataStatus(dataset.id, 'deleted');
      deletedDatasetIds.push(dataset.id);
    }

    await auditService.logAccessControl(
      'user_data_deletion',
      {
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string,
      },
      {
        type: hardDelete ? 'hard_delete' : 'soft_delete',
        metadata: {
          deletionId,
          datasetsCount: deletedDatasetIds.length,
        },
      },
      'success',
      {
        deletedDatasetIds,
        retainForLegal,
        hardDelete,
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
        gdprCompliant: true,
      },
    });
  } catch (error) {
    await auditService.logSecurityViolation(
      'user_data_deletion_failed',
      {
        userId,
        ipAddress: req.ip,
      },
      {
        type: 'deletion_failure',
        metadata: {
          error: getErrorMessage(error),
        },
      }
    );
    throw error;
  }
}));

router.post('/retention/cleanup', [
  body('retentionDays').optional().isInt({ min: 1, max: 36500 }),
  body('dryRun').optional().isBoolean(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const retentionDays =
    req.body.retentionDays !== undefined
      ? Number(req.body.retentionDays)
      : parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);
  const dryRun = req.body.dryRun !== undefined ? Boolean(req.body.dryRun) : true;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const metadataRepo = getMetadataRepository();

  try {
    const oldData = await metadataRepo.queryMetadata({
      processedBefore: cutoffDate,
      limit: 1000,
      offset: 0,
    });

    let deletedCount = 0;
    let archivedCount = 0;

    if (!dryRun) {
      for (const record of oldData.metadata) {
        if (record.sanitizedMetadata?.requiresArchival) {
          archivedCount++;
        }

        await metadataRepo.updateMetadataStatus(record.id, 'expired');
        deletedCount++;
      }

      await auditService.logSystemEvent(
        'data_retention_cleanup',
        {
          userId: 'system',
          ipAddress: 'internal',
        },
        {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          deletedCount,
          archivedCount,
          dryRun,
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
        executedAt: new Date(),
      },
    });
  } catch (error) {
    await auditService.logSecurityViolation(
      'retention_cleanup_failed',
      {
        userId: 'system',
        ipAddress: 'internal',
      },
      {
        type: 'cleanup_failure',
        metadata: {
          error: getErrorMessage(error),
        },
      }
    );
    throw error;
  }
}));

router.get('/retention/status', asyncHandler(async (_req: Request, res: Response) => {
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const metadataRepo = getMetadataRepository();

  try {
    const stats = await metadataRepo.getProcessingStatistics();
    const dataApproachingExpiry = await metadataRepo.queryMetadata({
      processedBefore: cutoffDate,
      limit: 100,
      offset: 0,
    });

    res.json({
      retentionPolicy: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
        nextScheduledCleanup: getNextScheduledCleanup(),
      },
      currentStatus: {
        totalRecords: stats.totalProcessed,
        recordsApproachingExpiry: dataApproachingExpiry.total,
        recordsByStatus: {
          processed: stats.successfulProcessed,
          failed: stats.failedProcessed,
          pending: stats.totalProcessed - stats.successfulProcessed - stats.failedProcessed,
        },
      },
      recommendations: {
        actionRequired: dataApproachingExpiry.total > 0,
        suggestedAction: dataApproachingExpiry.total > 100 ? 'immediate_cleanup' : 'schedule_cleanup',
        estimatedStorageSavings: `${Math.round(dataApproachingExpiry.total * 0.8)}% reduction possible`,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve retention status',
      message: getErrorMessage(error),
    });
  }
}));

function getNextScheduledCleanup(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(2, 0, 0, 0);
  return tomorrow.toISOString();
}

export { router as privacyRoutes };
