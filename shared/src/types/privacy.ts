export enum PrivacyLevel {
  MINIMAL = 'minimal',
  STANDARD = 'standard',
  HIGH = 'high',
  MAXIMUM = 'maximum'
}

export enum DataType {
  NUMERICAL = 'numerical',
  CATEGORICAL = 'categorical',
  TEXT = 'text',
  TEMPORAL = 'temporal',
  GEOGRAPHICAL = 'geographical'
}

export interface PrivacySettings {
  level: PrivacyLevel;
  dataRetentionDays: number;
  allowDataExport: boolean;
  allowSharing: boolean;
  differentialPrivacyEpsilon: number;
  minimumParticipants: number;
  anonymizationTechnique: AnonymizationTechnique;
}

export enum AnonymizationTechnique {
  NONE = 'none',
  K_ANONYMITY = 'k_anonymity',
  L_DIVERSITY = 'l_diversity',
  T_CLOSENESS = 't_closeness',
  DIFFERENTIAL_PRIVACY = 'differential_privacy'
}

export interface DataSchema {
  id: string;
  name: string;
  fields: DataField[];
  privacySettings: PrivacySettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataField {
  id: string;
  name: string;
  type: DataType;
  required: boolean;
  sensitive: boolean;
  encryptionRequired: boolean;
  validationRules?: ValidationRule[];
}

export interface ValidationRule {
  type: 'range' | 'pattern' | 'enum' | 'length';
  value: any;
  message: string;
}

export interface EncryptedData {
  data: string; // Base64 encoded encrypted data
  metadata: {
    algorithm: string;
    keyId: string;
    iv: string;
    timestamp: Date;
  };
  checksum: string;
}

export interface PrivacyAuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  privacyLevel: PrivacyLevel;
  dataAccessed: string[];
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  dataSchemaId: string;
  purposes: string[];
  granted: boolean;
  timestamp: Date;
  expiresAt?: Date;
  ipAddress: string;
  version: number;
}
