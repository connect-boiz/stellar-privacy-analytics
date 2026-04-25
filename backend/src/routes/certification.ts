import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { certificationService } from '../services/certificationService';
import { validationService } from '../services/validationService';
import { complianceService } from '../services/complianceService';

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

// Generate new certification
router.post('/generate', [
  body('analysisId').isUUID().withMessage('Valid analysis ID is required'),
  body('certificationType').isIn(['GDPR', 'CCPA', 'HIPAA', 'ISO27001', 'SOC2', 'CUSTOM']).withMessage('Valid certification type is required'),
  body('organizationName').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Organization name is required'),
  body('contactEmail').isEmail().withMessage('Valid contact email is required'),
  body('privacyLevel').isIn(['low', 'medium', 'high']).withMessage('Valid privacy level is required'),
  body('complianceChecks').isArray().withMessage('Compliance checks must be an array'),
], handleValidationErrors, async (req, res) => {
  try {
    const certificationData = {
      id: uuidv4(),
      ...req.body,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const certification = await certificationService.generateCertification(certificationData);
    
    logger.info(`Certification generated: ${certification.id} for analysis ${req.body.analysisId}`);
    
    res.status(201).json({
      success: true,
      certification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error generating certification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate certification',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get certification by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Valid certification ID is required'),
], handleValidationErrors, async (req, res) => {
  try {
    const certification = await certificationService.getCertification(req.params.id);
    
    if (!certification) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Certification not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      certification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching certification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch certification',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get all certifications for an organization
router.get('/organization/:organizationId', [
  param('organizationId').isUUID().withMessage('Valid organization ID is required'),
  query('status').optional().isIn(['pending', 'validated', 'expired', 'revoked']),
  query('certificationType').optional().isIn(['GDPR', 'CCPA', 'HIPAA', 'ISO27001', 'SOC2', 'CUSTOM']),
], handleValidationErrors, async (req, res) => {
  try {
    const filters = {
      organizationId: req.params.organizationId,
      status: req.query.status as string,
      certificationType: req.query.certificationType as string,
    };

    const certifications = await certificationService.getOrganizationCertifications(filters);
    
    res.json({
      success: true,
      certifications,
      count: certifications.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching organization certifications:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch certifications',
      timestamp: new Date().toISOString(),
    });
  }
});

// Validate certification
router.post('/:id/validate', [
  param('id').isUUID().withMessage('Valid certification ID is required'),
  body('thirdPartyValidator').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Third party validator is required'),
  body('validationEvidence').isArray().withMessage('Validation evidence must be an array'),
], handleValidationErrors, async (req, res) => {
  try {
    const validationData = {
      certificationId: req.params.id,
      validator: req.body.thirdPartyValidator,
      evidence: req.body.validationEvidence,
      validatedAt: new Date(),
    };

    const validation = await validationService.validateCertification(validationData);
    
    logger.info(`Certification validated: ${req.params.id} by ${req.body.thirdPartyValidator}`);
    
    res.json({
      success: true,
      validation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error validating certification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate certification',
      timestamp: new Date().toISOString(),
    });
  }
});

// Run compliance check
router.post('/:id/compliance-check', [
  param('id').isUUID().withMessage('Valid certification ID is required'),
  body('checkType').isIn(['automated', 'manual', 'third-party']).withMessage('Valid check type is required'),
  body('standards').isArray().withMessage('Standards must be an array'),
], handleValidationErrors, async (req, res) => {
  try {
    const complianceCheck = await complianceService.runComplianceCheck({
      certificationId: req.params.id,
      checkType: req.body.checkType,
      standards: req.body.standards,
    });

    res.json({
      success: true,
      complianceCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error running compliance check:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to run compliance check',
      timestamp: new Date().toISOString(),
    });
  }
});

// Generate certification badge
router.get('/:id/badge', [
  param('id').isUUID().withMessage('Valid certification ID is required'),
  query('format').optional().isIn(['svg', 'png', 'json']),
  query('size').optional().isIn(['small', 'medium', 'large']),
], handleValidationErrors, async (req, res) => {
  try {
    const badgeOptions = {
      format: (req.query.format as 'svg' | 'png' | 'json') || 'svg',
      size: (req.query.size as 'small' | 'medium' | 'large') || 'medium',
    };

    const badge = await certificationService.generateBadge(req.params.id, badgeOptions);
    
    if (badgeOptions.format === 'json') {
      res.json({
        success: true,
        badge,
        timestamp: new Date().toISOString(),
      });
    } else {
      // For SVG/PNG, return the actual badge data
      res.setHeader('Content-Type', badgeOptions.format === 'svg' ? 'image/svg+xml' : 'image/png');
      res.send(badge);
    }
  } catch (error) {
    logger.error('Error generating badge:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate badge',
      timestamp: new Date().toISOString(),
    });
  }
});

// Revoke certification
router.post('/:id/revoke', [
  param('id').isUUID().withMessage('Valid certification ID is required'),
  body('reason').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Revocation reason is required'),
  body('revokedBy').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Revoked by is required'),
], handleValidationErrors, async (req, res) => {
  try {
    const revocationData = {
      certificationId: req.params.id,
      reason: req.body.reason,
      revokedBy: req.body.revokedBy,
      revokedAt: new Date(),
    };

    const result = await certificationService.revokeCertification(revocationData);
    
    logger.info(`Certification revoked: ${req.params.id} by ${req.body.revokedBy}`);
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error revoking certification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to revoke certification',
      timestamp: new Date().toISOString(),
    });
  }
});

// Public verification endpoint
router.get('/public/verify/:verificationCode', [
  param('verificationCode').isString().isLength({ min: 32, max: 64 }).withMessage('Valid verification code is required'),
], handleValidationErrors, async (req, res) => {
  try {
    const verification = await certificationService.verifyPublicCertification(req.params.verificationCode);
    
    if (!verification) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid verification code',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      verification: {
        isValid: verification.isValid,
        certificationType: verification.certificationType,
        organizationName: verification.organizationName,
        issuedDate: verification.issuedDate,
        expiryDate: verification.expiryDate,
        status: verification.status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error verifying certification:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify certification',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as certificationRoutes };
