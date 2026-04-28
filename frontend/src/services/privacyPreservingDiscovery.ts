/**
 * Privacy-Preserving Data Discovery Service
 */

import {
  DatasetMetadata,
  SearchRequest,
  SearchResult,
  SearchFilter,
  SearchPrivacy,
  ResultPrivacy,
  PrivacyMetadata,
  FieldPrivacy,
  DataType,
  AccessPermission,
  AccessPolicy,
  ComplianceFramework
} from '../types/dataCatalog';

export interface PrivacyPreservingConfig {
  anonymizationEnabled: boolean;
  maskingEnabled: boolean;
  consentRequired: boolean;
  accessControlEnabled: boolean;
  auditEnabled: boolean;
  encryptionEnabled: boolean;
  dataMinimization: boolean;
  purposeLimitation: boolean;
}

export interface DiscoveryContext {
  userId: string;
  userRole: string;
  department: string;
  location: string;
  purpose: string;
  consentLevel: string;
  accessLevel: string;
  sessionToken: string;
}

export interface PrivacyFilter {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  dataTypes: string[];
  fields: string[];
  conditions: PrivacyCondition[];
  actions: string[];
}

export interface PrivacyCondition {
  type: 'user_role' | 'department' | 'location' | 'purpose' | 'consent' | 'time' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'greater_than' | 'less_than';
  value: any;
  description: string;
}

export interface AnonymizationRule {
  id: string;
  name: string;
  description: string;
  fieldType: string;
  method: 'hashing' | 'masking' | 'tokenization' | 'encryption' | 'aggregation' | 'suppression' | 'generalization';
  parameters: Record<string, any>;
  privacyLevel: string;
  reversible: boolean;
  strength: number; // 0-1
}

export interface ConsentRecord {
  id: string;
  userId: string;
  datasetId: string;
  purpose: string;
  grantedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
  scope: string[];
  conditions: ConsentCondition[];
}

export interface ConsentCondition {
  type: 'time_limit' | 'purpose_limit' | 'data_type_limit' | 'usage_limit' | 'location_limit';
  value: any;
  description: string;
}

export interface PrivacyImpact {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: PrivacyFactor[];
  score: number; // 0-100
  recommendations: string[];
  mitigations: string[];
}

export interface PrivacyFactor {
  type: 'data_sensitivity' | 'access_pattern' | 'user_role' | 'purpose' | 'location' | 'time';
  weight: number;
  value: number;
  description: string;
}

export class PrivacyPreservingDiscovery {
  private static instance: PrivacyPreservingDiscovery;
  private config: PrivacyPreservingConfig;
  private anonymizationRules: Map<string, AnonymizationRule> = new Map();
  private consentRecords: Map<string, ConsentRecord[]> = new Map();
  private privacyFilters: Map<string, PrivacyFilter> = new Map();
  private auditLog: DiscoveryAuditEntry[] = [];

  private constructor(config: PrivacyPreservingConfig) {
    this.config = config;
    this.initializeAnonymizationRules();
    this.initializePrivacyFilters();
  }

  static getInstance(config?: PrivacyPreservingConfig): PrivacyPreservingDiscovery {
    if (!PrivacyPreservingDiscovery.instance) {
      if (!config) {
        config = {
          anonymizationEnabled: true,
          maskingEnabled: true,
          consentRequired: true,
          accessControlEnabled: true,
          auditEnabled: true,
          encryptionEnabled: true,
          dataMinimization: true,
          purposeLimitation: true
        };
      }
      PrivacyPreservingDiscovery.instance = new PrivacyPreservingDiscovery(config);
    }
    return PrivacyPreservingDiscovery.instance;
  }

  private initializeAnonymizationRules(): void {
    const rules: AnonymizationRule[] = [
      {
        id: 'email_hash',
        name: 'Email Hashing',
        description: 'Hash email addresses for privacy',
        fieldType: 'email',
        method: 'hashing',
        parameters: { algorithm: 'sha256', salt: 'privacy_salt' },
        privacyLevel: 'confidential',
        reversible: false,
        strength: 0.9
      },
      {
        id: 'phone_mask',
        name: 'Phone Number Masking',
        description: 'Mask phone numbers revealing only last 4 digits',
        fieldType: 'phone',
        method: 'masking',
        parameters: { maskPattern: '***-***-####', preserveLength: true },
        privacyLevel: 'internal',
        reversible: false,
        strength: 0.7
      },
      {
        id: 'name_tokenization',
        name: 'Name Tokenization',
        description: 'Tokenize personal names',
        fieldType: 'name',
        method: 'tokenization',
        parameters: { tokenLength: 16, preserveFormat: false },
        privacyLevel: 'confidential',
        reversible: true,
        strength: 0.8
      },
      {
        id: 'address_generalization',
        name: 'Address Generalization',
        description: 'Generalize addresses to city level',
        fieldType: 'address',
        method: 'generalization',
        parameters: { level: 'city', preserveCountry: true },
        privacyLevel: 'internal',
        reversible: false,
        strength: 0.6
      },
      {
        id: 'financial_aggregation',
        name: 'Financial Data Aggregation',
        description: 'Aggregate financial data to ranges',
        fieldType: 'financial',
        method: 'aggregation',
        parameters: { binSize: 1000, method: 'range' },
        privacyLevel: 'restricted',
        reversible: false,
        strength: 0.8
      },
      {
        id: 'health_suppression',
        name: 'Health Data Suppression',
        description: 'Suppress sensitive health information',
        fieldType: 'health',
        method: 'suppression',
        parameters: { suppressAll: true },
        privacyLevel: 'restricted',
        reversible: false,
        strength: 1.0
      }
    ];

    rules.forEach(rule => {
      this.anonymizationRules.set(rule.id, rule);
    });
  }

  private initializePrivacyFilters(): void {
    const filters: PrivacyFilter[] = [
      {
        level: 'public',
        dataTypes: ['technical', 'demographic'],
        fields: ['id', 'created_at', 'updated_at', 'status'],
        conditions: [
          {
            type: 'user_role',
            operator: 'in',
            value: ['guest', 'public'],
            description: 'Public access for guest users'
          }
        ],
        actions: ['read']
      },
      {
        level: 'internal',
        dataTypes: ['technical', 'demographic', 'behavioral'],
        fields: ['id', 'name', 'department', 'created_at', 'updated_at', 'status'],
        conditions: [
          {
            type: 'user_role',
            operator: 'in',
            value: ['employee', 'contractor'],
            description: 'Internal access for employees'
          },
          {
            type: 'department',
            operator: 'equals',
            value: 'same',
            description: 'Same department access'
          }
        ],
        actions: ['read', 'write']
      },
      {
        level: 'confidential',
        dataTypes: ['personal', 'sensitive_personal'],
        fields: ['id', 'name', 'email', 'phone', 'department'],
        conditions: [
          {
            type: 'user_role',
            operator: 'in',
            value: ['manager', 'analyst', 'admin'],
            description: 'Confidential access for privileged roles'
          },
          {
            type: 'purpose',
            operator: 'in',
            value: ['business_analysis', 'compliance', 'audit'],
            description: 'Business purpose requirement'
          }
        ],
        actions: ['read', 'write', 'share']
      },
      {
        level: 'restricted',
        dataTypes: ['financial', 'health'],
        fields: ['id'],
        conditions: [
          {
            type: 'user_role',
            operator: 'equals',
            value: 'admin',
            description: 'Admin only access'
          },
          {
            type: 'consent',
            operator: 'equals',
            value: 'explicit',
            description: 'Explicit consent required'
          }
        ],
        actions: ['read', 'write', 'share', 'admin']
      }
    ];

    filters.forEach(filter => {
      this.privacyFilters.set(filter.level, filter);
    });
  }

  // Main discovery method
  public async discoverDatasets(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<SearchResult> {
    // Log discovery attempt
    await this.logDiscoveryAttempt(request, context);

    // Apply privacy-preserving transformations
    const privacyEnhancedRequest = await this.enhanceRequestWithPrivacy(request, context);

    // Validate access permissions
    const accessValidation = await this.validateAccess(privacyEnhancedRequest, context);
    if (!accessValidation.allowed) {
      return this.createAccessDeniedResult(accessValidation.reason);
    }

    // Apply privacy filters
    const filteredRequest = await this.applyPrivacyFilters(privacyEnhancedRequest, context);

    // Execute search with privacy constraints
    const searchResult = await this.executePrivacyAwareSearch(filteredRequest, context);

    // Apply result anonymization
    const anonymizedResult = await this.anonymizeResults(searchResult, context);

    // Apply consent-based filtering
    const consentFilteredResult = await this.filterByConsent(anonymizedResult, context);

    // Apply data minimization
    const minimizedResult = await this.applyDataMinimization(consentFilteredResult, context);

    // Log successful discovery
    await this.logDiscoverySuccess(minimizedResult, context);

    return minimizedResult;
  }

  private async enhanceRequestWithPrivacy(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<SearchRequest> {
    const enhancedRequest = { ...request };

    // Add privacy-aware filters
    if (this.config.accessControlEnabled) {
      enhancedRequest.filters = [
        ...enhancedRequest.filters,
        ...this.generateAccessFilters(context)
      ];
    }

    // Add purpose limitation filters
    if (this.config.purposeLimitation) {
      enhancedRequest.filters = [
        ...enhancedRequest.filters,
        ...this.generatePurposeFilters(context)
      ];
    }

    // Set privacy level
    enhancedRequest.privacy = {
      level: this.determinePrivacyLevel(context),
      anonymizeResults: this.config.anonymizationEnabled,
      maskSensitiveFields: this.config.maskingEnabled,
      requireConsent: this.config.consentRequired
    };

    return enhancedRequest;
  }

  private generateAccessFilters(context: DiscoveryContext): SearchFilter[] {
    const filters: SearchFilter[] = [];

    // Role-based access filter
    filters.push({
      field: 'access.roles',
      operator: 'contains',
      value: context.userRole
    });

    // Department-based access filter
    filters.push({
      field: 'access.departments',
      operator: 'contains',
      value: context.department
    });

    // Location-based access filter
    if (context.location) {
      filters.push({
        field: 'access.allowedLocations',
        operator: 'contains',
        value: context.location
      });
    }

    return filters;
  }

  private generatePurposeFilters(context: DiscoveryContext): SearchFilter[] {
    const filters: SearchFilter[] = [];

    // Purpose-based filter
    if (context.purpose) {
      filters.push({
        field: 'access.allowedPurposes',
        operator: 'contains',
        value: context.purpose
      });
    }

    // Consent level filter
    if (context.consentLevel) {
      filters.push({
        field: 'privacy.consentRequirements.level',
        operator: 'less_than_or_equal',
        value: context.consentLevel
      });
    }

    return filters;
  }

  private determinePrivacyLevel(context: DiscoveryContext): 'public' | 'internal' | 'confidential' | 'restricted' {
    // Determine privacy level based on user context
    if (context.userRole === 'guest') {
      return 'public';
    } else if (context.userRole === 'employee' || context.userRole === 'contractor') {
      return 'internal';
    } else if (['manager', 'analyst'].includes(context.userRole)) {
      return 'confidential';
    } else {
      return 'restricted';
    }
  }

  private async validateAccess(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check if user has basic access
    if (!context.userId || !context.sessionToken) {
      return { allowed: false, reason: 'Invalid user credentials' };
    }

    // Check role-based access
    const privacyLevel = this.determinePrivacyLevel(context);
    const privacyFilter = this.privacyFilters.get(privacyLevel);
    
    if (!privacyFilter) {
      return { allowed: false, reason: 'Privacy level not supported' };
    }

    // Validate user role
    const roleCondition = privacyFilter.conditions.find(c => c.type === 'user_role');
    if (roleCondition && !this.evaluateCondition(roleCondition, context)) {
      return { allowed: false, reason: 'Insufficient role permissions' };
    }

    // Validate department access
    const deptCondition = privacyFilter.conditions.find(c => c.type === 'department');
    if (deptCondition && !this.evaluateCondition(deptCondition, context)) {
      return { allowed: false, reason: 'Department access not permitted' };
    }

    // Validate purpose
    const purposeCondition = privacyFilter.conditions.find(c => c.type === 'purpose');
    if (purposeCondition && !this.evaluateCondition(purposeCondition, context)) {
      return { allowed: false, reason: 'Purpose not authorized' };
    }

    return { allowed: true };
  }

  private evaluateCondition(condition: PrivacyCondition, context: DiscoveryContext): boolean {
    switch (condition.type) {
      case 'user_role':
        return Array.isArray(condition.value) 
          ? condition.value.includes(context.userRole)
          : condition.value === context.userRole;
      
      case 'department':
        if (condition.value === 'same') {
          // Would check if user's department matches dataset's department
          return true; // Simplified for now
        }
        return condition.value === context.department;
      
      case 'purpose':
        return Array.isArray(condition.value)
          ? condition.value.includes(context.purpose)
          : condition.value === context.purpose;
      
      case 'location':
        return condition.value === context.location;
      
      default:
        return true;
    }
  }

  private async applyPrivacyFilters(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<SearchRequest> {
    const filteredRequest = { ...request };
    const privacyLevel = this.determinePrivacyLevel(context);
    const privacyFilter = this.privacyFilters.get(privacyLevel);

    if (privacyFilter) {
      // Add data type filters
      if (privacyFilter.dataTypes.length > 0) {
        filteredRequest.filters.push({
          field: 'privacy.dataTypes.type',
          operator: 'in',
          value: privacyFilter.dataTypes
        });
      }

      // Add field access filters
      if (privacyFilter.fields.length > 0) {
        filteredRequest.filters.push({
          field: 'schema.fields.name',
          operator: 'in',
          value: privacyFilter.fields
        });
      }
    }

    return filteredRequest;
  }

  private async executePrivacyAwareSearch(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<SearchResult> {
    // This would integrate with the actual search engine
    // For now, return a mock result
    return {
      datasets: [],
      total: 0,
      took: 0,
      facets: [],
      suggestions: [],
      aggregations: [],
      privacy: {
        filteredResults: 0,
        maskedFields: [],
        anonymizedResults: 0,
        consentRequired: 0,
        accessDenied: 0
      }
    };
  }

  private async anonymizeResults(
    result: SearchResult,
    context: DiscoveryContext
  ): Promise<SearchResult> {
    if (!this.config.anonymizationEnabled) {
      return result;
    }

    const anonymizedResult = { ...result };
    const privacyLevel = this.determinePrivacyLevel(context);
    
    anonymizedResult.datasets = result.datasets.map(datasetResult => {
      const anonymizedDataset = { ...datasetResult.dataset };
      
      // Apply field-level anonymization
      anonymizedDataset.schema.fields = anonymizedDataset.schema.fields.map(field => {
        if (this.shouldAnonymizeField(field, privacyLevel)) {
          return this.anonymizeField(field, privacyLevel);
        }
        return field;
      });

      // Apply metadata anonymization
      anonymizedDataset.privacy = this.anonymizePrivacyMetadata(anonymizedDataset.privacy, privacyLevel);

      return {
        ...datasetResult,
        dataset: anonymizedDataset,
        privacy: {
          level: privacyLevel,
          maskedFields: this.getMaskedFields(anonymizedDataset, privacyLevel),
          anonymizedFields: this.getAnonymizedFields(anonymizedDataset, privacyLevel),
          accessRequired: this.requiresAccess(anonymizedDataset, privacyLevel),
          consentRequired: this.requiresConsent(anonymizedDataset, privacyLevel)
        }
      };
    });

    // Update privacy statistics
    anonymizedResult.privacy = {
      filteredResults: 0,
      maskedFields: this.countMaskedFields(anonymizedResult.datasets),
      anonymizedResults: anonymizedResult.datasets.length,
      consentRequired: this.countConsentRequired(anonymizedResult.datasets),
      accessDenied: 0
    };

    return anonymizedResult;
  }

  private shouldAnonymizeField(field: any, privacyLevel: string): boolean {
    if (!field.privacy) return false;

    // Check if field is personal data
    if (field.privacy.isPersonal || field.privacy.isSensitive) {
      return true;
    }

    // Check if field access is restricted
    if (field.privacy.accessRestricted) {
      return true;
    }

    // Check if consent is required
    if (field.privacy.consentRequired) {
      return true;
    }

    return false;
  }

  private anonymizeField(field: any, privacyLevel: string): any {
    const anonymizedField = { ...field };

    // Find appropriate anonymization rule
    const rule = this.findAnonymizationRule(field.type, privacyLevel);
    
    if (rule) {
      switch (rule.method) {
        case 'hashing':
          anonymizedField.defaultValue = this.hashValue(field.defaultValue, rule.parameters);
          break;
        case 'masking':
          anonymizedField.defaultValue = this.maskValue(field.defaultValue, rule.parameters);
          break;
        case 'tokenization':
          anonymizedField.defaultValue = this.tokenizeValue(field.defaultValue, rule.parameters);
          break;
        case 'encryption':
          anonymizedField.defaultValue = this.encryptValue(field.defaultValue, rule.parameters);
          break;
        case 'aggregation':
          anonymizedField.defaultValue = this.aggregateValue(field.defaultValue, rule.parameters);
          break;
        case 'suppression':
          anonymizedField.defaultValue = null;
          break;
        case 'generalization':
          anonymizedField.defaultValue = this.generalizeValue(field.defaultValue, rule.parameters);
          break;
      }

      // Update field privacy metadata
      anonymizedField.privacy = {
        ...field.privacy,
        anonymizationMethod: rule.method,
        anonymizationLevel: rule.strength
      };
    }

    return anonymizedField;
  }

  private findAnonymizationRule(fieldType: string, privacyLevel: string): AnonymizationRule | undefined {
    for (const rule of this.anonymizationRules.values()) {
      if (rule.fieldType === fieldType && rule.privacyLevel === privacyLevel) {
        return rule;
      }
    }
    return undefined;
  }

  private hashValue(value: any, parameters: Record<string, any>): string {
    // Simplified hashing - in production, use proper crypto
    const crypto = require('crypto');
    const algorithm = parameters.algorithm || 'sha256';
    const salt = parameters.salt || '';
    return crypto.createHash(algorithm).update(value + salt).digest('hex');
  }

  private maskValue(value: any, parameters: Record<string, any>): string {
    const maskPattern = parameters.maskPattern || '***';
    const preserveLength = parameters.preserveLength || false;
    
    if (preserveLength && typeof value === 'string') {
      return maskPattern.slice(0, value.length - 4) + value.slice(-4);
    }
    
    return maskPattern;
  }

  private tokenizeValue(value: any, parameters: Record<string, any>): string {
    const tokenLength = parameters.tokenLength || 16;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < tokenLength; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  private encryptValue(value: any, parameters: Record<string, any>): string {
    // Simplified encryption - in production, use proper encryption
    return `encrypted_${Buffer.from(value.toString()).toString('base64')}`;
  }

  private aggregateValue(value: any, parameters: Record<string, any>): string {
    const binSize = parameters.binSize || 1000;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 'aggregated';
    
    const bin = Math.floor(numValue / binSize) * binSize;
    return `${bin}-${bin + binSize}`;
  }

  private generalizeValue(value: any, parameters: Record<string, any>): string {
    const level = parameters.level || 'city';
    // Simplified generalization - in production, use proper address parsing
    return `generalized_${level}_${value}`;
  }

  private anonymizePrivacyMetadata(privacy: PrivacyMetadata, privacyLevel: string): PrivacyMetadata {
    const anonymized = { ...privacy };
    
    // Reduce sensitivity based on privacy level
    if (privacyLevel === 'public') {
      anonymized.sensitivity = 'low';
      anonymized.anonymizationLevel = 1.0;
    } else if (privacyLevel === 'internal') {
      anonymized.sensitivity = 'medium';
      anonymized.anonymizationLevel = 0.8;
    } else if (privacyLevel === 'confidential') {
      anonymized.sensitivity = 'high';
      anonymized.anonymizationLevel = 0.6;
    }
    
    return anonymized;
  }

  private getMaskedFields(dataset: DatasetMetadata, privacyLevel: string): string[] {
    return dataset.schema.fields
      .filter(field => field.privacy?.accessRestricted)
      .map(field => field.name);
  }

  private getAnonymizedFields(dataset: DatasetMetadata, privacyLevel: string): string[] {
    return dataset.schema.fields
      .filter(field => field.privacy?.anonymizationMethod)
      .map(field => field.name);
  }

  private requiresAccess(dataset: DatasetMetadata, privacyLevel: string): boolean {
    return dataset.privacy.level !== 'public';
  }

  private requiresConsent(dataset: DatasetMetadata, privacyLevel: string): boolean {
    return dataset.privacy.consentRequirements.length > 0;
  }

  private countMaskedFields(datasets: any[]): string[] {
    const allMaskedFields: string[] = [];
    datasets.forEach(dataset => {
      allMaskedFields.push(...dataset.privacy.maskedFields);
    });
    return [...new Set(allMaskedFields)];
  }

  private countConsentRequired(datasets: any[]): number {
    return datasets.filter(dataset => dataset.privacy.consentRequired).length;
  }

  private async filterByConsent(
    result: SearchResult,
    context: DiscoveryContext
  ): Promise<SearchResult> {
    if (!this.config.consentRequired) {
      return result;
    }

    const consentFilteredResult = { ...result };
    
    consentFilteredResult.datasets = result.datasets.filter(datasetResult => {
      return this.hasValidConsent(datasetResult.dataset.id, context.userId, context.purpose);
    });

    // Update consent statistics
    const consentDenied = result.datasets.length - consentFilteredResult.datasets.length;
    consentFilteredResult.privacy.consentRequired += consentDenied;

    return consentFilteredResult;
  }

  private hasValidConsent(datasetId: string, userId: string, purpose: string): boolean {
    const userConsents = this.consentRecords.get(userId) || [];
    
    return userConsents.some(consent => 
      consent.datasetId === datasetId &&
      consent.purpose === purpose &&
      consent.status === 'active' &&
      consent.expiresAt > Date.now()
    );
  }

  private async applyDataMinimization(
    result: SearchResult,
    context: DiscoveryContext
  ): Promise<SearchResult> {
    if (!this.config.dataMinimization) {
      return result;
    }

    const minimizedResult = { ...result };
    
    minimizedResult.datasets = result.datasets.map(datasetResult => {
      const minimizedDataset = { ...datasetResult.dataset };
      
      // Apply data minimization - only return necessary fields
      const necessaryFields = this.determineNecessaryFields(minimizedDataset, context);
      minimizedDataset.schema.fields = minimizedDataset.schema.fields.filter(field =>
        necessaryFields.includes(field.name)
      );

      return {
        ...datasetResult,
        dataset: minimizedDataset
      };
    });

    return minimizedResult;
  }

  private determineNecessaryFields(dataset: DatasetMetadata, context: DiscoveryContext): string[] {
    const necessaryFields = ['id', 'name', 'description', 'created_at', 'updated_at'];
    
    // Add fields based on purpose
    if (context.purpose === 'business_analysis') {
      necessaryFields.push('department', 'category', 'tags');
    } else if (context.purpose === 'compliance') {
      necessaryFields.push('privacy', 'compliance', 'access');
    } else if (context.purpose === 'technical') {
      necessaryFields.push('schema', 'location', 'processing');
    }

    return necessaryFields;
  }

  private createAccessDeniedResult(reason: string): SearchResult {
    return {
      datasets: [],
      total: 0,
      took: 0,
      facets: [],
      suggestions: [],
      aggregations: [],
      privacy: {
        filteredResults: 0,
        maskedFields: [],
        anonymizedResults: 0,
        consentRequired: 0,
        accessDenied: 1
      }
    };
  }

  // Consent management
  public async grantConsent(
    userId: string,
    datasetId: string,
    purpose: string,
    duration: number,
    conditions: ConsentCondition[] = []
  ): Promise<ConsentRecord> {
    const consent: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      datasetId,
      purpose,
      grantedAt: Date.now(),
      expiresAt: Date.now() + (duration * 24 * 60 * 60 * 1000),
      status: 'active',
      scope: ['read'],
      conditions
    };

    const userConsents = this.consentRecords.get(userId) || [];
    userConsents.push(consent);
    this.consentRecords.set(userId, userConsents);

    await this.logConsentGranted(consent);

    return consent;
  }

  public async revokeConsent(consentId: string, userId: string): Promise<boolean> {
    const userConsents = this.consentRecords.get(userId) || [];
    const consent = userConsents.find(c => c.id === consentId);
    
    if (consent) {
      consent.status = 'revoked';
      await this.logConsentRevoked(consent);
      return true;
    }
    
    return false;
  }

  public async getUserConsents(userId: string): Promise<ConsentRecord[]> {
    return this.consentRecords.get(userId) || [];
  }

  // Privacy impact assessment
  public async assessPrivacyImpact(
    request: SearchRequest,
    context: DiscoveryContext
  ): Promise<PrivacyImpact> {
    const factors: PrivacyFactor[] = [];
    let totalScore = 0;

    // Data sensitivity factor
    const dataTypes = this.extractDataTypes(request);
    const sensitivityScore = this.calculateDataSensitivity(dataTypes);
    factors.push({
      type: 'data_sensitivity',
      weight: 0.3,
      value: sensitivityScore,
      description: 'Based on data types in request'
    });
    totalScore += sensitivityScore * 0.3;

    // User role factor
    const roleScore = this.calculateRoleRisk(context.userRole);
    factors.push({
      type: 'user_role',
      weight: 0.2,
      value: roleScore,
      description: 'Based on user role and permissions'
    });
    totalScore += roleScore * 0.2;

    // Purpose factor
    const purposeScore = this.calculatePurposeRisk(context.purpose);
    factors.push({
      type: 'purpose',
      weight: 0.2,
      value: purposeScore,
      description: 'Based on stated purpose'
    });
    totalScore += purposeScore * 0.2;

    // Location factor
    const locationScore = this.calculateLocationRisk(context.location);
    factors.push({
      type: 'location',
      weight: 0.15,
      value: locationScore,
      description: 'Based on access location'
    });
    totalScore += locationScore * 0.15;

    // Time factor
    const timeScore = this.calculateTimeRisk();
    factors.push({
      type: 'time',
      weight: 0.15,
      value: timeScore,
      description: 'Based on access time patterns'
    });
    totalScore += timeScore * 0.15;

    const level = this.determineImpactLevel(totalScore);
    const recommendations = this.generateRecommendations(factors, level);
    const mitigations = this.generateMitigations(factors, level);

    return {
      level,
      factors,
      score: totalScore,
      recommendations,
      mitigations
    };
  }

  private extractDataTypes(request: SearchRequest): string[] {
    // Extract data types from search request
    // Simplified implementation
    return ['technical', 'demographic'];
  }

  private calculateDataSensitivity(dataTypes: string[]): number {
    const sensitivityMap: Record<string, number> = {
      'technical': 0.2,
      'demographic': 0.4,
      'behavioral': 0.6,
      'personal': 0.8,
      'sensitive_personal': 0.9,
      'financial': 0.85,
      'health': 0.95,
      'location': 0.7
    };

    const scores = dataTypes.map(type => sensitivityMap[type] || 0.5);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculateRoleRisk(userRole: string): number {
    const riskMap: Record<string, number> = {
      'guest': 0.2,
      'employee': 0.4,
      'contractor': 0.5,
      'analyst': 0.6,
      'manager': 0.7,
      'admin': 0.9
    };

    return riskMap[userRole] || 0.5;
  }

  private calculatePurposeRisk(purpose: string): number {
    const riskMap: Record<string, number> = {
      'research': 0.3,
      'business_analysis': 0.4,
      'compliance': 0.5,
      'audit': 0.6,
      'marketing': 0.7,
      'law_enforcement': 0.8,
      'data_broker': 0.9
    };

    return riskMap[purpose] || 0.5;
  }

  private calculateLocationRisk(location: string): number {
    // Simplified location risk calculation
    // In production, would use geolocation and cross-border transfer rules
    return 0.3;
  }

  private calculateTimeRisk(): number {
    const hour = new Date().getHours();
    // Business hours (9-5) are lower risk
    if (hour >= 9 && hour <= 17) {
      return 0.2;
    }
    // Evening hours (6-10) are medium risk
    if (hour >= 18 && hour <= 22) {
      return 0.5;
    }
    // Night hours (11pm-8am) are high risk
    return 0.8;
  }

  private determineImpactLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 0.3) return 'low';
    if (score < 0.6) return 'medium';
    if (score < 0.8) return 'high';
    return 'critical';
  }

  private generateRecommendations(factors: PrivacyFactor[], level: string): string[] {
    const recommendations: string[] = [];

    factors.forEach(factor => {
      if (factor.value > 0.7) {
        switch (factor.type) {
          case 'data_sensitivity':
            recommendations.push('Consider reducing data sensitivity in request');
            break;
          case 'user_role':
            recommendations.push('Review user role permissions');
            break;
          case 'purpose':
            recommendations.push('Validate purpose justification');
            break;
          case 'location':
            recommendations.push('Consider location-based restrictions');
            break;
          case 'time':
            recommendations.push('Implement time-based access controls');
            break;
        }
      }
    });

    if (level === 'high' || level === 'critical') {
      recommendations.push('Require additional approval for this request');
      recommendations.push('Implement enhanced monitoring');
    }

    return recommendations;
  }

  private generateMitigations(factors: PrivacyFactor[], level: string): string[] {
    const mitigations: string[] = [];

    if (level === 'critical') {
      mitigations.push('Require explicit consent for all data access');
      mitigations.push('Implement real-time monitoring and alerting');
      mitigations.push('Apply maximum data anonymization');
    } else if (level === 'high') {
      mitigations.push('Require manager approval for sensitive data');
      mitigations.push('Apply field-level encryption');
      mitigations.push('Limit data retention period');
    } else if (level === 'medium') {
      mitigations.push('Apply data masking for sensitive fields');
      mitigations.push('Implement purpose-based access controls');
    } else {
      mitigations.push('Apply standard privacy controls');
    }

    return mitigations;
  }

  // Audit logging
  private async logDiscoveryAttempt(request: SearchRequest, context: DiscoveryContext): Promise<void> {
    if (!this.config.auditEnabled) return;

    const auditEntry: DiscoveryAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userId: context.userId,
      action: 'discovery_attempt',
      resource: 'data_catalog',
      details: {
        query: request.query,
        filters: request.filters,
        privacy: request.privacy,
        context: {
          userRole: context.userRole,
          department: context.department,
          location: context.location,
          purpose: context.purpose
        }
      },
      result: 'pending',
      ipAddress: 'unknown', // Would get from request
      userAgent: 'unknown' // Would get from request
    };

    this.auditLog.push(auditEntry);
  }

  private async logDiscoverySuccess(result: SearchResult, context: DiscoveryContext): Promise<void> {
    if (!this.config.auditEnabled) return;

    const auditEntry: DiscoveryAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userId: context.userId,
      action: 'discovery_success',
      resource: 'data_catalog',
      details: {
        resultCount: result.total,
        privacyStats: result.privacy,
        context: {
          userRole: context.userRole,
          department: context.department,
          location: context.location,
          purpose: context.purpose
        }
      },
      result: 'success',
      ipAddress: 'unknown',
      userAgent: 'unknown'
    };

    this.auditLog.push(auditEntry);
  }

  private async logConsentGranted(consent: ConsentRecord): Promise<void> {
    if (!this.config.auditEnabled) return;

    const auditEntry: DiscoveryAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userId: consent.userId,
      action: 'consent_granted',
      resource: consent.datasetId,
      details: {
        consentId: consent.id,
        purpose: consent.purpose,
        expiresAt: consent.expiresAt,
        conditions: consent.conditions
      },
      result: 'success',
      ipAddress: 'unknown',
      userAgent: 'unknown'
    };

    this.auditLog.push(auditEntry);
  }

  private async logConsentRevoked(consent: ConsentRecord): Promise<void> {
    if (!this.config.auditEnabled) return;

    const auditEntry: DiscoveryAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userId: consent.userId,
      action: 'consent_revoked',
      resource: consent.datasetId,
      details: {
        consentId: consent.id,
        purpose: consent.purpose,
        grantedAt: consent.grantedAt
      },
      result: 'success',
      ipAddress: 'unknown',
      userAgent: 'unknown'
    };

    this.auditLog.push(auditEntry);
  }

  // Configuration management
  public updateConfig(newConfig: Partial<PrivacyPreservingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): PrivacyPreservingConfig {
    return { ...this.config };
  }

  // Rule management
  public addAnonymizationRule(rule: AnonymizationRule): void {
    this.anonymizationRules.set(rule.id, rule);
  }

  public removeAnonymizationRule(id: string): boolean {
    return this.anonymizationRules.delete(id);
  }

  public getAnonymizationRules(): AnonymizationRule[] {
    return Array.from(this.anonymizationRules.values());
  }

  // Audit access
  public getAuditLog(limit?: number): DiscoveryAuditEntry[] {
    if (limit) {
      return this.auditLog.slice(-limit);
    }
    return [...this.auditLog];
  }

  public clearAuditLog(): void {
    this.auditLog = [];
  }
}

interface DiscoveryAuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'pending';
  ipAddress: string;
  userAgent: string;
}

export default PrivacyPreservingDiscovery;
