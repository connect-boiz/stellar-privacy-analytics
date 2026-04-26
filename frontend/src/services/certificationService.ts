import axios from 'axios';

// Types
export interface Certification {
  id: string;
  analysisId: string;
  certificationType: 'GDPR' | 'CCPA' | 'HIPAA' | 'ISO27001' | 'SOC2' | 'CUSTOM';
  organizationName: string;
  contactEmail: string;
  privacyLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'validated' | 'expired' | 'revoked';
  verificationCode: string;
  issuedDate: string;
  expiryDate: string;
  createdAt: string;
  updatedAt: string;
  validationHistory: ValidationRecord[];
  complianceHistory: ComplianceCheck[];
  badgeUrl?: string;
  publicVerificationUrl?: string;
}

export interface ValidationRecord {
  id: string;
  validatorType: 'automated' | 'manual' | 'third_party';
  validatorName: string;
  validationDate: string;
  status: 'passed' | 'failed' | 'pending';
  score: number;
  maxScore: number;
  details: string;
  evidence?: string[];
}

export interface ComplianceCheck {
  id: string;
  checkType: 'automated' | 'manual' | 'third-party';
  standards: string[];
  status: 'compliant' | 'non_compliant' | 'pending_review';
  results: {
    standard: string;
    passed: boolean;
    score: number;
    maxScore: number;
    details: string;
  }[];
  checkedAt: string;
  checkedBy: string;
  recommendations?: string[];
}

export interface CertificationRequest {
  analysisId: string;
  certificationType: 'GDPR' | 'CCPA' | 'HIPAA' | 'ISO27001' | 'SOC2' | 'CUSTOM';
  organizationName: string;
  contactEmail: string;
  privacyLevel: 'low' | 'medium' | 'high';
  customRequirements?: string;
}

export interface IndustryStandard {
  id: string;
  name: string;
  description: string;
  version: string;
  requirements: string[];
  validationCriteria: string[];
}

export interface BadgeConfig {
  id: string;
  certificationId: string;
  style: 'shield' | 'round' | 'square';
  size: 'small' | 'medium' | 'large';
  colors: {
    primary: string;
    secondary: string;
    text: string;
  };
  includeVerificationLink: boolean;
}

class CertificationService {
  private baseUrl = '/api/certifications';

  async getCertifications(): Promise<Certification[]> {
    try {
      const response = await axios.get(`${this.baseUrl}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching certifications:', error);
      // Return mock data for development
      return this.getMockCertifications();
    }
  }

  async getCertification(id: string): Promise<Certification> {
    try {
      const response = await axios.get(`${this.baseUrl}/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching certification:', error);
      throw error;
    }
  }

  async createCertification(request: CertificationRequest): Promise<Certification> {
    try {
      const response = await axios.post(`${this.baseUrl}`, request);
      return response.data;
    } catch (error) {
      console.error('Error creating certification:', error);
      throw error;
    }
  }

  async updateCertification(id: string, updates: Partial<Certification>): Promise<Certification> {
    try {
      const response = await axios.put(`${this.baseUrl}/${id}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating certification:', error);
      throw error;
    }
  }

  async deleteCertification(id: string): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/${id}`);
    } catch (error) {
      console.error('Error deleting certification:', error);
      throw error;
    }
  }

  async validateCertification(id: string, validatorType: 'automated' | 'manual' | 'third_party'): Promise<ValidationRecord> {
    try {
      const response = await axios.post(`${this.baseUrl}/${id}/validate`, { validatorType });
      return response.data;
    } catch (error) {
      console.error('Error validating certification:', error);
      throw error;
    }
  }

  async runComplianceCheck(id: string, standards: string[]): Promise<ComplianceCheck> {
    try {
      const response = await axios.post(`${this.baseUrl}/${id}/compliance-check`, { standards });
      return response.data;
    } catch (error) {
      console.error('Error running compliance check:', error);
      throw error;
    }
  }

  async generateBadge(certificationId: string, config: BadgeConfig): Promise<string> {
    try {
      const response = await axios.post(`${this.baseUrl}/${certificationId}/badge`, config);
      return response.data.badgeUrl;
    } catch (error) {
      console.error('Error generating badge:', error);
      throw error;
    }
  }

  async downloadBadge(certificationId: string, format: 'svg' | 'png' | 'pdf'): Promise<Blob> {
    try {
      const response = await axios.get(`${this.baseUrl}/${certificationId}/badge/download`, {
        params: { format },
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading badge:', error);
      throw error;
    }
  }

  async getPublicVerification(verificationCode: string): Promise<Certification | null> {
    try {
      const response = await axios.get(`/api/public/verify/${verificationCode}`);
      return response.data;
    } catch (error) {
      console.error('Error verifying certification:', error);
      return null;
    }
  }

  async getIndustryStandards(): Promise<IndustryStandard[]> {
    try {
      const response = await axios.get('/api/industry-standards');
      return response.data;
    } catch (error) {
      console.error('Error fetching industry standards:', error);
      return this.getMockIndustryStandards();
    }
  }

  async renewCertification(id: string): Promise<Certification> {
    try {
      const response = await axios.post(`${this.baseUrl}/${id}/renew`);
      return response.data;
    } catch (error) {
      console.error('Error renewing certification:', error);
      throw error;
    }
  }

  async revokeCertification(id: string, reason: string): Promise<Certification> {
    try {
      const response = await axios.post(`${this.baseUrl}/${id}/revoke`, { reason });
      return response.data;
    } catch (error) {
      console.error('Error revoking certification:', error);
      throw error;
    }
  }

  // Mock data for development
  private getMockCertifications(): Certification[] {
    return [
      {
        id: 'cert-1',
        analysisId: 'analysis-1',
        certificationType: 'GDPR',
        organizationName: 'Tech Corp',
        contactEmail: 'privacy@techcorp.com',
        privacyLevel: 'high',
        status: 'validated',
        verificationCode: 'abc123def456',
        issuedDate: '2024-01-15',
        expiryDate: '2025-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        validationHistory: [
          {
            id: 'val-1',
            validatorType: 'third_party',
            validatorName: 'EuroPrivacy Validator',
            validationDate: '2024-01-15T10:00:00Z',
            status: 'passed',
            score: 95,
            maxScore: 100,
            details: 'Full compliance with GDPR requirements',
            evidence: ['audit_report.pdf', 'compliance_checklist.xlsx']
          }
        ],
        complianceHistory: [
          {
            id: 'comp-1',
            checkType: 'automated',
            standards: ['GDPR'],
            status: 'compliant',
            results: [
              {
                standard: 'GDPR Art. 32',
                passed: true,
                score: 90,
                maxScore: 100,
                details: 'Security of processing'
              }
            ],
            checkedAt: '2024-01-15T10:00:00Z',
            checkedBy: 'system'
          }
        ],
        badgeUrl: '/api/badges/cert-1.svg',
        publicVerificationUrl: 'https://stellar-privacy-analytics.com/verify/abc123def456'
      },
      {
        id: 'cert-2',
        analysisId: 'analysis-2',
        certificationType: 'CCPA',
        organizationName: 'Data Inc',
        contactEmail: 'compliance@datainc.com',
        privacyLevel: 'medium',
        status: 'pending',
        verificationCode: 'xyz789uvw456',
        issuedDate: '2024-02-01',
        expiryDate: '2025-02-01',
        createdAt: '2024-02-01T14:30:00Z',
        updatedAt: '2024-02-01T14:30:00Z',
        validationHistory: [],
        complianceHistory: []
      }
    ];
  }

  private getMockIndustryStandards(): IndustryStandard[] {
    return [
      {
        id: 'gdpr',
        name: 'General Data Protection Regulation',
        description: 'EU regulation on data protection and privacy',
        version: '2018',
        requirements: [
          'Lawful basis for processing',
          'Data subject rights',
          'Privacy by design',
          'Data protection impact assessment',
          'Data breach notification'
        ],
        validationCriteria: [
          'Consent management',
          'Data minimization',
          'Purpose limitation',
          'Storage limitation',
          'Security measures'
        ]
      },
      {
        id: 'ccpa',
        name: 'California Consumer Privacy Act',
        description: 'California state law intended to enhance privacy rights',
        version: '2020',
        requirements: [
          'Right to know',
          'Right to delete',
          'Right to opt-out',
          'Non-discrimination',
          'Data portability'
        ],
        validationCriteria: [
          'Consumer disclosure',
          'Opt-out mechanisms',
          'Data deletion processes',
          'Privacy policy compliance',
          'Vendor contracts'
        ]
      },
      {
        id: 'hipaa',
        name: 'Health Insurance Portability and Accountability Act',
        description: 'US federal law for health information privacy',
        version: '2013',
        requirements: [
          'Administrative safeguards',
          'Physical safeguards',
          'Technical safeguards',
          'Breach notification',
          'Business associate agreements'
        ],
        validationCriteria: [
          'Access controls',
          'Audit controls',
          'Integrity controls',
          'Transmission security',
          'Workforce training'
        ]
      }
    ];
  }
}

export const certificationService = new CertificationService();
