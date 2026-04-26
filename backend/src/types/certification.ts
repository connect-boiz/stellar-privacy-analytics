export type CertificationStatus = 'pending' | 'validated' | 'expired' | 'revoked';
export type CertificationType = 'GDPR' | 'CCPA' | 'HIPAA' | 'ISO27001' | 'SOC2' | 'CUSTOM';
export type CheckType = 'automated' | 'manual' | 'third-party';
export type ValidationStatus = 'pending' | 'approved' | 'rejected';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'pending_review';

export interface ValidationRecord {
  id: string;
  validator: string;
  status: ValidationStatus;
  evidence: string[];
  validatedAt: Date;
  comments?: string;
  score?: number;
  maxScore?: number;
}

export interface ComplianceCheck {
  id: string;
  checkType: CheckType;
  standards: string[];
  status: ComplianceStatus;
  results: {
    standard: string;
    passed: boolean;
    score: number;
    maxScore: number;
    details: string;
  }[];
  checkedAt: Date;
  checkedBy: string;
  recommendations?: string[];
}

export interface AuditTrailEntry {
  action: string;
  timestamp: Date;
  actor: string;
  details: string;
}

export interface CertificationMetadata {
  blockchainHash: string;
  version: string;
  auditTrail: AuditTrailEntry[];
}

export interface Certification {
  id: string;
  analysisId: string;
  certificationType: CertificationType;
  organizationName: string;
  contactEmail: string;
  privacyLevel: 'low' | 'medium' | 'high';
  complianceChecks: string[];
  status: CertificationStatus;
  verificationCode: string;
  issuedDate: Date;
  expiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
  validationHistory: ValidationRecord[];
  complianceHistory: ComplianceCheck[];
  metadata: CertificationMetadata;
}

export interface CertificationGenerationRequest {
  analysisId: string;
  certificationType: CertificationType;
  organizationName: string;
  contactEmail: string;
  privacyLevel: 'low' | 'medium' | 'high';
  complianceChecks: string[];
}

export interface CertificationValidationRequest {
  certificationId: string;
  thirdPartyValidator: string;
  validationEvidence: string[];
}

export interface ComplianceCheckRequest {
  certificationId: string;
  checkType: CheckType;
  standards: string[];
}

export interface BadgeGenerationRequest {
  certificationId: string;
  format: 'svg' | 'png' | 'json';
  size: 'small' | 'medium' | 'large';
}

export interface CertificationRevocationRequest {
  certificationId: string;
  reason: string;
  revokedBy: string;
}

export interface CertificationRenewalRequest {
  certificationId: string;
  renewedBy: string;
  renewalData?: Partial<CertificationGenerationRequest>;
}

export interface PublicVerificationResponse {
  isValid: boolean;
  certificationType: CertificationType;
  organizationName: string;
  issuedDate: Date;
  expiryDate: Date;
  status: CertificationStatus;
}

export interface CertificationFilter {
  organizationId?: string;
  status?: CertificationStatus;
  certificationType?: CertificationType;
  dateFrom?: Date;
  dateTo?: Date;
  privacyLevel?: 'low' | 'medium' | 'high';
}

export interface CertificationStats {
  total: number;
  byStatus: Record<CertificationStatus, number>;
  byType: Record<CertificationType, number>;
  byPrivacyLevel: Record<'low' | 'medium' | 'high', number>;
  expiringIn30Days: number;
  averageValidationScore: number;
}

export interface IndustryStandard {
  id: string;
  name: string;
  description: string;
  requirements: {
    id: string;
    description: string;
    category: string;
    mandatory: boolean;
  }[];
  version: string;
  lastUpdated: Date;
}

export interface ThirdPartyValidator {
  id: string;
  name: string;
  type: 'automated' | 'human' | 'hybrid';
  accreditation?: string;
  apiUrl?: string;
  isActive: boolean;
}
