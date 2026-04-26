import { logger } from '../utils/logger';
import { Certification, CertificationStatus, CertificationType } from '../types/certification';
import { certificationDatabaseService } from './certificationDatabaseService';
import { cryptoService } from './cryptoService';
import { badgeService } from './badgeService';

export interface CertificationData {
  id: string;
  analysisId: string;
  certificationType: CertificationType;
  organizationName: string;
  contactEmail: string;
  privacyLevel: 'low' | 'medium' | 'high';
  complianceChecks: string[];
  status: CertificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BadgeOptions {
  format: 'svg' | 'png' | 'json';
  size: 'small' | 'medium' | 'large';
}

export interface RevocationData {
  certificationId: string;
  reason: string;
  revokedBy: string;
  revokedAt: Date;
}

export interface PublicVerification {
  isValid: boolean;
  certificationType: CertificationType;
  organizationName: string;
  issuedDate: Date;
  expiryDate: Date;
  status: CertificationStatus;
}

class CertificationService {
  private certifications: Map<string, Certification> = new Map();
  private readonly CERTIFICATION_VALIDITY_DAYS = 365;

  async generateCertification(data: CertificationData): Promise<Certification> {
    try {
      // Generate verification code for public verification
      const verificationCode = await this.generateVerificationCode(data.id);
      
      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + this.CERTIFICATION_VALIDITY_DAYS);

      const certification: Certification = {
        ...data,
        verificationCode,
        issuedDate: new Date(),
        expiryDate,
        validationHistory: [],
        complianceHistory: [],
        metadata: {
          blockchainHash: await this.generateBlockchainHash(data),
          version: '1.0',
          auditTrail: [{
            action: 'created',
            timestamp: new Date(),
            actor: 'system',
            details: 'Certification generated',
          }],
        },
      };

      // Store in database
      await certificationDatabaseService.storeCertification(certification);
      
      // Store in memory cache
      this.certifications.set(data.id, certification);

      logger.info(`Generated certification ${data.id} for ${data.organizationName}`);
      return certification;
    } catch (error) {
      logger.error('Error generating certification:', error);
      throw error;
    }
  }

  async getCertification(id: string): Promise<Certification | null> {
    try {
      // Check memory cache first
      if (this.certifications.has(id)) {
        return this.certifications.get(id)!;
      }

      // Fetch from database
      const certification = await certificationDatabaseService.getCertification(id);
      if (certification) {
        this.certifications.set(id, certification);
      }

      return certification;
    } catch (error) {
      logger.error('Error fetching certification:', error);
      throw error;
    }
  }

  async getOrganizationCertifications(filters: {
    organizationId: string;
    status?: CertificationStatus;
    certificationType?: CertificationType;
  }): Promise<Certification[]> {
    try {
      const certifications = await certificationDatabaseService.getOrganizationCertifications(filters);
      
      // Apply additional filters if needed
      let filteredCertifications = certifications;
      
      if (filters.status) {
        filteredCertifications = filteredCertifications.filter(
          cert => cert.status === filters.status
        );
      }
      
      if (filters.certificationType) {
        filteredCertifications = filteredCertifications.filter(
          cert => cert.certificationType === filters.certificationType
        );
      }

      return filteredCertifications;
    } catch (error) {
      logger.error('Error fetching organization certifications:', error);
      throw error;
    }
  }

  async generateBadge(certificationId: string, options: BadgeOptions): Promise<string | object> {
    try {
      const certification = await this.getCertification(certificationId);
      if (!certification) {
        throw new Error('Certification not found');
      }

      // Check if certification is valid
      if (certification.status !== 'validated' || certification.expiryDate < new Date()) {
        throw new Error('Certification is not valid for badge generation');
      }

      return await badgeService.generateBadge(certification, options);
    } catch (error) {
      logger.error('Error generating badge:', error);
      throw error;
    }
  }

  async revokeCertification(data: RevocationData): Promise<{ success: boolean; revokedAt: Date }> {
    try {
      const certification = await this.getCertification(data.certificationId);
      if (!certification) {
        throw new Error('Certification not found');
      }

      // Update certification status
      certification.status = 'revoked';
      certification.updatedAt = data.revokedAt;
      
      // Add to audit trail
      certification.metadata.auditTrail.push({
        action: 'revoked',
        timestamp: data.revokedAt,
        actor: data.revokedBy,
        details: data.reason,
      });

      // Update in database
      await certificationDatabaseService.updateCertification(certification);
      
      // Update memory cache
      this.certifications.set(data.certificationId, certification);

      logger.info(`Revoked certification ${data.certificationId}: ${data.reason}`);
      
      return {
        success: true,
        revokedAt: data.revokedAt,
      };
    } catch (error) {
      logger.error('Error revoking certification:', error);
      throw error;
    }
  }

  async verifyPublicCertification(verificationCode: string): Promise<PublicVerification | null> {
    try {
      const certification = await certificationDatabaseService.getCertificationByVerificationCode(verificationCode);
      
      if (!certification) {
        return null;
      }

      const isValid = certification.status === 'validated' && certification.expiryDate > new Date();

      return {
        isValid,
        certificationType: certification.certificationType,
        organizationName: certification.organizationName,
        issuedDate: certification.issuedDate,
        expiryDate: certification.expiryDate,
        status: certification.status,
      };
    } catch (error) {
      logger.error('Error verifying public certification:', error);
      throw error;
    }
  }

  async updateCertificationStatus(
    certificationId: string, 
    status: CertificationStatus, 
    updatedBy: string,
    details?: string
  ): Promise<Certification> {
    try {
      const certification = await this.getCertification(certificationId);
      if (!certification) {
        throw new Error('Certification not found');
      }

      certification.status = status;
      certification.updatedAt = new Date();
      
      // Add to audit trail
      certification.metadata.auditTrail.push({
        action: `status_changed_to_${status}`,
        timestamp: new Date(),
        actor: updatedBy,
        details: details || `Status changed to ${status}`,
      });

      // Update in database
      await certificationDatabaseService.updateCertification(certification);
      
      // Update memory cache
      this.certifications.set(certificationId, certification);

      logger.info(`Updated certification ${certificationId} status to ${status}`);
      return certification;
    } catch (error) {
      logger.error('Error updating certification status:', error);
      throw error;
    }
  }

  async getCertificationHistory(certificationId: string): Promise<{
    validationHistory: Certification['validationHistory'];
    complianceHistory: Certification['complianceHistory'];
    auditTrail: Certification['metadata']['auditTrail'];
  }> {
    try {
      const certification = await this.getCertification(certificationId);
      if (!certification) {
        throw new Error('Certification not found');
      }

      return {
        validationHistory: certification.validationHistory,
        complianceHistory: certification.complianceHistory,
        auditTrail: certification.metadata.auditTrail,
      };
    } catch (error) {
      logger.error('Error fetching certification history:', error);
      throw error;
    }
  }

  private async generateVerificationCode(certificationId: string): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    const combined = `${certificationId}-${timestamp}-${random}`;
    
    return cryptoService.hash(combined);
  }

  private async generateBlockchainHash(data: CertificationData): Promise<string> {
    const dataString = JSON.stringify({
      id: data.id,
      analysisId: data.analysisId,
      certificationType: data.certificationType,
      organizationName: data.organizationName,
      privacyLevel: data.privacyLevel,
      createdAt: data.createdAt,
    });
    
    return cryptoService.hash(dataString);
  }

  async getExpiringCertifications(daysAhead: number = 30): Promise<Certification[]> {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysAhead);

      const certifications = await certificationDatabaseService.getCertificationsExpiringBefore(expiryDate);
      
      return certifications.filter(cert => 
        cert.status === 'validated' && 
        cert.expiryDate <= expiryDate && 
        cert.expiryDate > new Date()
      );
    } catch (error) {
      logger.error('Error fetching expiring certifications:', error);
      throw error;
    }
  }

  async renewCertification(
    certificationId: string, 
    renewedBy: string,
    renewalData?: Partial<CertificationData>
  ): Promise<Certification> {
    try {
      const certification = await this.getCertification(certificationId);
      if (!certification) {
        throw new Error('Certification not found');
      }

      // Create new certification with updated expiry
      const newCertificationData: CertificationData = {
        ...certification,
        ...renewalData,
        id: await cryptoService.generateUUID(),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newCertification = await this.generateCertification(newCertificationData);
      
      // Add renewal reference to original certification
      certification.metadata.auditTrail.push({
        action: 'renewed',
        timestamp: new Date(),
        actor: renewedBy,
        details: `Renewed as certification ${newCertification.id}`,
      });

      await certificationDatabaseService.updateCertification(certification);

      logger.info(`Renewed certification ${certificationId} as ${newCertification.id}`);
      return newCertification;
    } catch (error) {
      logger.error('Error renewing certification:', error);
      throw error;
    }
  }
}

export const certificationService = new CertificationService();
