/**
 * Data Catalog Demo Page
 * Interactive demo showcasing the searchable data catalog with privacy-preserving features
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Database, 
  Shield, 
  TrendingUp, 
  Users, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  Filter,
  Download,
  Share2,
  Eye,
  Lock,
  Unlock,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  FileText,
  Settings,
  RefreshCw,
  ChevronRight,
  Info,
  Zap
} from 'lucide-react';

// Import services
import PrivacyPreservingDiscovery from '../services/privacyPreservingDiscovery';
import MetadataManagementSearch from '../services/metadataManagementSearch';
import DataLineageVisualization from '../services/dataLineageVisualization';
import UsageAnalyticsStatistics from '../services/usageAnalyticsStatistics';
import AccessControlIntegration from '../services/accessControlIntegration';
import DataQualityAssessment from '../services/dataQualityAssessment';
import DatasetManagementIntegration from '../services/datasetManagementIntegration';

// Import types
import {
  DatasetMetadata,
  SearchRequest,
  SearchResult,
  UsageMetrics,
  QualityAssessment,
  AccessEvaluation,
  LineageGraph
} from '../types/dataCatalog';

// Sample data
const generateSampleDatasets = (): DatasetMetadata[] => {
  return [
    {
      id: 'customer_data_001',
      name: 'Customer Profiles',
      description: 'Comprehensive customer demographic and behavioral data',
      owner: 'data_team@company.com',
      department: 'Marketing',
      createdAt: Date.now() - (90 * 24 * 60 * 60 * 1000),
      updatedAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
      version: '2.1.0',
      status: 'active',
      tags: ['customer', 'demographics', 'behavioral', 'pii'],
      categories: ['customer_data', 'marketing'],
      privacy: {
        level: 'confidential',
        classification: 'personal_data',
        sensitivity: 'high',
        anonymizationLevel: 0.7,
        dataTypes: [
          {
            type: 'personal',
            category: 'demographic',
            description: 'Customer personal information',
            sensitivity: 'high',
            retentionPeriod: 2555,
            processingPurpose: 'marketing_analysis',
            legalBasis: 'consent'
          },
          {
            type: 'behavioral',
            category: 'usage_patterns',
            description: 'Customer behavior patterns',
            sensitivity: 'medium',
            retentionPeriod: 730,
            processingPurpose: 'personalization',
            legalBasis: 'legitimate_interest'
          }
        ],
        retentionPolicy: {
          minimumRetention: 730,
          maximumRetention: 2555,
          autoDelete: true,
          archivalRequired: true,
          complianceRequirements: ['GDPR', 'CCPA']
        },
        consentRequirements: [
          {
            id: 'marketing_consent',
            type: 'explicit',
            description: 'Consent for marketing communications',
            purpose: 'marketing',
            legalBasis: 'consent',
            duration: 365,
            withdrawalAllowed: true,
            granular: true
          }
        ],
        privacyImpactAssessment: {
          id: 'pia_001',
          assessedAt: Date.now() - (30 * 24 * 60 * 60 * 1000),
          assessedBy: 'privacy_officer@company.com',
          riskLevel: 'medium',
          findings: ['Data contains PII', 'Cross-border transfers required'],
          recommendations: ['Implement additional encryption', 'Update consent mechanisms'],
          mitigationMeasures: ['Field-level encryption', 'Access logging'],
          approvalStatus: 'approved'
        },
        gdprCompliance: {
          lawfulBasis: 'consent',
          dataSubjectRights: [
            { right: 'access', enabled: true, process: 'automated_portal', timeframe: 30, contact: 'dpo@company.com' },
            { right: 'rectification', enabled: true, process: 'manual_review', timeframe: 30, contact: 'dpo@company.com' },
            { right: 'erasure', enabled: true, process: 'automated_deletion', timeframe: 30, contact: 'dpo@company.com' }
          ],
          crossBorderTransfer: true,
          dpiaRequired: true,
          dpiaCompleted: true,
          recordOfProcessing: true,
          breachNotificationRequired: true
        }
      },
      schema: {
        version: '2.1',
        format: 'parquet',
        fields: [
          {
            name: 'customer_id',
            type: 'string',
            nullable: false,
            description: 'Unique customer identifier',
            tags: ['primary_key', 'identifier'],
            privacy: {
              isPersonal: true,
              isSensitive: false,
              anonymizationMethod: 'hashing',
              anonymizationLevel: 0.9,
              accessRestricted: true,
              consentRequired: true
            },
            constraints: [
              { type: 'not_null', value: null, description: 'Customer ID cannot be null', enforced: true },
              { type: 'unique', value: null, description: 'Customer ID must be unique', enforced: true }
            ],
            statistics: {
              distinctCount: 1000000,
              nullCount: 0,
              distribution: {
                type: 'uniform',
                parameters: {},
                histogram: [],
                outliers: []
              },
              lastUpdated: Date.now() - (2 * 24 * 60 * 60 * 1000)
            },
            lineage: {
              sourceFields: ['legacy_customer_id'],
              transformation: 'hashing',
              derivedAt: Date.now() - (90 * 24 * 60 * 60 * 1000),
              confidence: 0.95
            }
          },
          {
            name: 'email',
            type: 'string',
            nullable: true,
            description: 'Customer email address',
            tags: ['contact', 'pii'],
            privacy: {
              isPersonal: true,
              isSensitive: true,
              anonymizationMethod: 'tokenization',
              anonymizationLevel: 0.8,
              accessRestricted: true,
              consentRequired: true
            },
            constraints: [
              { type: 'regex', value: '^[^@]+@[^@]+\\.[^@]+$', description: 'Valid email format', enforced: true }
            ],
            statistics: {
              distinctCount: 950000,
              nullCount: 50000,
              distribution: {
                type: 'categorical',
                parameters: {},
                histogram: [],
                outliers: []
              },
              lastUpdated: Date.now() - (2 * 24 * 60 * 60 * 1000)
            },
            lineage: {
              sourceFields: ['customer_email'],
              transformation: 'tokenization',
              derivedAt: Date.now() - (90 * 24 * 60 * 60 * 1000),
              confidence: 0.9
            }
          }
        ],
        relationships: [],
        constraints: [],
        indexes: [],
        partitions: [],
        evolution: []
      },
      lineage: {
        upstream: [
          {
            datasetId: 'legacy_customer_db',
            datasetName: 'Legacy Customer Database',
            type: 'source',
            connectionType: 'direct',
            strength: 0.9,
            lastUpdated: Date.now() - (90 * 24 * 60 * 60 * 1000),
            metadata: { source: 'oracle_db', table: 'customers' }
          }
        ],
        downstream: [
          {
            datasetId: 'marketing_segments',
            datasetName: 'Marketing Segments',
            type: 'intermediate',
            connectionType: 'direct',
            strength: 0.8,
            lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
            metadata: { purpose: 'segmentation' }
          },
          {
            datasetId: 'customer_analytics',
            datasetName: 'Customer Analytics Dashboard',
            type: 'target',
            connectionType: 'indirect',
            strength: 0.6,
            lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
            metadata: { purpose: 'analytics' }
          }
        ],
        transformations: [
          {
            id: 'data_cleansing_001',
            name: 'Data Cleansing Pipeline',
            type: 'cleanse',
            description: 'Clean and standardize customer data',
            sourceDatasets: ['legacy_customer_db'],
            targetDatasets: ['customer_data_001'],
            logic: 'Remove duplicates, standardize formats, validate emails',
            parameters: { removeDuplicates: true, validateEmails: true },
            timestamp: Date.now() - (90 * 24 * 60 * 60 * 1000),
            owner: 'data_engineering'
          }
        ],
        graph: {
          nodes: [],
          edges: [],
          layout: {
            algorithm: 'force',
            parameters: {},
            optimized: false
          },
          metadata: {
            generatedAt: Date.now(),
            version: '1.0',
            nodeCount: 0,
            edgeCount: 0,
            depth: 0,
            cycles: 0
          }
        },
        impact: {
          criticality: 'high',
          downstreamCount: 5,
          consumerCount: 12,
          businessImpact: 'Critical for marketing operations',
          riskFactors: ['Contains PII', 'High usage volume']
        }
      },
      quality: {
        overall: {
          value: 87.5,
          grade: 'B',
          lastAssessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
          trend: 'improving',
          confidence: 0.92
        },
        dimensions: [
          {
            name: 'completeness',
            score: 92.0,
            weight: 0.2,
            description: 'Data completeness across all fields',
            metrics: [
              {
                name: 'overall_completeness',
                value: 92.0,
                target: 95.0,
                threshold: 85.0,
                status: 'warning',
                description: 'Overall dataset completeness',
                formula: 'average(field_completeness)',
                lastCalculated: Date.now() - (1 * 24 * 60 * 60 * 1000)
              }
            ],
            lastAssessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
            trend: 'stable'
          },
          {
            name: 'accuracy',
            score: 88.0,
            weight: 0.25,
            description: 'Data accuracy and validity',
            metrics: [
              {
                name: 'overall_accuracy',
                value: 88.0,
                target: 90.0,
                threshold: 80.0,
                status: 'warning',
                description: 'Overall dataset accuracy',
                formula: 'average(field_accuracy)',
                lastCalculated: Date.now() - (1 * 24 * 60 * 60 * 1000)
              }
            ],
            lastAssessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
            trend: 'improving'
          }
        ],
        issues: [
          {
            id: 'issue_001',
            severity: 'medium',
            type: 'completeness',
            title: 'Missing Email Addresses',
            description: '5% of records have missing email addresses',
            affectedFields: ['email'],
            affectedRecords: 50000,
            detectedAt: Date.now() - (1 * 24 * 60 * 60 * 1000),
            status: 'open'
          }
        ],
        assessments: [],
        trends: [],
        benchmarks: []
      },
      usage: {
        statistics: {
          totalQueries: 15420,
          uniqueUsers: 245,
          avgQueriesPerDay: 342,
          peakQueriesPerHour: 89,
          dataVolumeAccessed: 2500000000, // 2.5GB
          avgResponseTime: 1250, // ms
          errorRate: 0.02,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
          period: 'day'
        },
        patterns: [
          {
            type: 'temporal',
            pattern: 'peak_usage_business_hours',
            frequency: 0.85,
            confidence: 0.9,
            description: 'High usage during business hours (9AM-5PM)',
            metadata: { peakHours: [9, 10, 11, 14, 15, 16] }
          }
        ],
        consumers: [
          {
            id: 'marketing_team',
            name: 'Marketing Team',
            type: 'team',
            department: 'Marketing',
            accessLevel: 'read',
            firstAccess: Date.now() - (90 * 24 * 60 * 60 * 1000),
            lastAccess: Date.now() - (2 * 24 * 60 * 60 * 1000),
            queryCount: 8900,
            dataVolume: 1500000000,
            favorite: true,
            tags: ['power_users']
          },
          {
            id: 'analytics_team',
            name: 'Analytics Team',
            type: 'team',
            department: 'Analytics',
            accessLevel: 'read',
            firstAccess: Date.now() - (60 * 24 * 60 * 60 * 1000),
            lastAccess: Date.now() - (1 * 24 * 60 * 60 * 1000),
            queryCount: 6520,
            dataVolume: 1000000000,
            favorite: false,
            tags: []
          }
        ],
        queries: [],
        access: [],
        performance: {
          avgResponseTime: 1250,
          p50ResponseTime: 1100,
          p95ResponseTime: 2100,
          p99ResponseTime: 3500,
          throughput: 342,
          concurrency: 12,
          errorRate: 0.02,
          availability: 99.8,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        },
        trends: []
      },
      access: {
        permissions: [
          {
            id: 'perm_001',
            principal: 'marketing_team',
            principalType: 'group',
            resource: 'customer_data_001',
            resourceType: 'dataset',
            actions: [
              { action: 'read', granted: true },
              { action: 'write', granted: false }
            ],
            conditions: [
              {
                type: 'time',
                operator: 'between',
                value: ['09:00', '17:00'],
                description: 'Business hours only'
              }
            ],
            grantedAt: Date.now() - (90 * 24 * 60 * 60 * 1000),
            grantedBy: 'data_admin',
            status: 'active',
            justification: 'Marketing operations'
          }
        ],
        roles: [],
        policies: [],
        requests: [],
        audits: [],
        restrictions: [
          {
            type: 'time_based',
            description: 'Access restricted to business hours',
            conditions: [
              {
                type: 'time',
                operator: 'between',
                value: ['09:00', '17:00'],
                description: 'Business hours only'
              }
            ],
            enforced: true,
            bypassAllowed: false
          }
        ]
      },
      location: {
        source: {
          type: 'data_lake',
          name: 'Enterprise Data Lake',
          connection: {
            host: 'datalake.company.com',
            port: 443,
            protocol: 'https',
            ssl: true,
            timeout: 30,
            poolSize: 10
          },
          credentials: {
            type: 'service_account',
            encrypted: true,
            rotationRequired: true,
            lastRotated: Date.now() - (30 * 24 * 60 * 60 * 1000)
          },
          properties: { region: 'us-west-2', bucket: 'customer-data' }
        },
        storage: {
          provider: 'AWS',
          region: 'us-west-2',
          bucket: 'customer-data',
          path: '/raw/customer_profiles/',
          encryption: {
            enabled: true,
            algorithm: 'AES-256',
            keyId: 'arn:aws:kms:us-west-2:123456789012:key/12345678-1234-1234-1234-123456789012',
            keyRotation: true,
            atRest: true,
            inTransit: true
          },
          compression: {
            enabled: true,
            algorithm: 'snappy',
            ratio: 0.3,
            level: 6
          },
          indexing: {
            enabled: true,
            type: 'btree',
            fields: ['customer_id', 'email'],
            refreshInterval: 3600
          }
        },
        format: {
          type: 'parquet',
          version: '1.0',
          compression: 'snappy',
          encoding: 'utf-8'
        },
        size: {
          total: 5000000000, // 5GB
          used: 2500000000, // 2.5GB
          available: 2500000000, // 2.5GB
          unit: 'bytes',
          estimated: false,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        },
        partitions: [],
        replication: {
          enabled: true,
          strategy: 'asynchronous',
          factor: 2,
          regions: ['us-east-1', 'eu-west-1'],
          lag: 300,
          status: 'active'
        },
        backup: {
          enabled: true,
          frequency: 'daily',
          retention: 30,
          lastBackup: Date.now() - (1 * 24 * 60 * 60 * 1000),
          nextBackup: Date.now() + (23 * 60 * 60 * 1000),
          size: 2500000000,
          location: 's3://backups/customer-data/',
          encrypted: true
        },
        retention: {
          policy: 'compliance_driven',
          minimumAge: 730,
          maximumAge: 2555,
          autoDelete: true,
          archivalRequired: true,
          archivalLocation: 's3://archive/customer-data/'
        },
        cost: {
          storage: 125.50,
          compute: 89.25,
          transfer: 15.75,
          operations: 8.50,
          total: 239.00,
          currency: 'USD',
          period: 'month',
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        }
      },
      processing: {
        pipelines: [
          {
            id: 'customer_ingestion',
            name: 'Customer Data Ingestion',
            description: 'Daily ingestion of customer data from various sources',
            type: 'batch',
            stages: [
              {
                id: 'extract',
                name: 'Extract',
                type: 'extract',
                order: 1,
                description: 'Extract data from source systems',
                configuration: { sources: ['crm', 'web', 'mobile'] },
                dependencies: [],
                status: 'completed',
                metrics: {
                  executionTime: 1800,
                  recordsProcessed: 50000,
                  errorCount: 0,
                  throughput: 27.8,
                  memoryUsage: 2048,
                  cpuUsage: 45,
                  lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
                }
              }
            ],
            sources: ['crm_system', 'web_analytics'],
            targets: ['customer_data_001'],
            parameters: { batchSize: 1000, compression: 'snappy' },
            status: 'active',
            createdAt: Date.now() - (90 * 24 * 60 * 60 * 1000),
            createdBy: 'data_engineering',
            lastRun: Date.now() - (1 * 24 * 60 * 60 * 1000),
            nextRun: Date.now() + (23 * 60 * 60 * 1000)
          }
        ],
        jobs: [],
        schedules: [],
        dependencies: [],
        monitoring: {
          enabled: true,
          alerts: [],
          dashboards: [],
          metrics: [],
          healthChecks: []
        }
      },
      compliance: {
        frameworks: [
          {
            name: 'GDPR',
            version: '2018',
            description: 'General Data Protection Regulation',
            requirements: [],
            controls: [],
            maturity: {
              level: 4,
              description: 'Advanced compliance implementation',
              characteristics: ['Automated monitoring', 'Regular assessments', 'Documentation maintained'],
              gaps: ['Cross-border transfer documentation'],
              recommendations: ['Update transfer documentation']
            },
            lastAssessed: Date.now() - (30 * 24 * 60 * 60 * 1000)
          }
        ],
        assessments: [],
        controls: [],
        evidences: [],
        reports: [],
        certifications: []
      }
    },
    {
      id: 'transaction_data_002',
      name: 'Transaction Records',
      description: 'Financial transaction data and payment records',
      owner: 'finance_team@company.com',
      department: 'Finance',
      createdAt: Date.now() - (180 * 24 * 60 * 60 * 1000),
      updatedAt: Date.now() - (1 * 24 * 60 * 60 * 1000),
      version: '3.2.1',
      status: 'active',
      tags: ['transaction', 'financial', 'payment', 'sensitive'],
      categories: ['financial_data', 'operations'],
      privacy: {
        level: 'restricted',
        classification: 'financial_data',
        sensitivity: 'critical',
        anonymizationLevel: 0.9,
        dataTypes: [
          {
            type: 'financial',
            category: 'payment_records',
            description: 'Financial payment information',
            sensitivity: 'critical',
            retentionPeriod: 3650,
            processingPurpose: 'financial_reporting',
            legalBasis: 'legal_obligation'
          }
        ],
        retentionPolicy: {
          minimumRetention: 2555,
          maximumRetention: 3650,
          autoDelete: false,
          archivalRequired: true,
          complianceRequirements: ['SOX', 'PCI-DSS', 'GDPR']
        },
        consentRequirements: [],
        privacyImpactAssessment: {
          id: 'pia_002',
          assessedAt: Date.now() - (60 * 24 * 60 * 60 * 1000),
          assessedBy: 'privacy_officer@company.com',
          riskLevel: 'critical',
          findings: ['Contains sensitive financial data', 'Subject to multiple regulations'],
          recommendations: ['Implement additional security controls', 'Enhanced monitoring'],
          mitigationMeasures: ['Field-level encryption', 'Access logging', 'Regular audits'],
          approvalStatus: 'approved'
        },
        gdprCompliance: {
          lawfulBasis: 'legal_obligation',
          dataSubjectRights: [
            { right: 'access', enabled: true, process: 'manual_review', timeframe: 45, contact: 'dpo@company.com' }
          ],
          crossBorderTransfer: false,
          dpiaRequired: true,
          dpiaCompleted: true,
          recordOfProcessing: true,
          breachNotificationRequired: true
        }
      },
      schema: {
        version: '3.2',
        format: 'parquet',
        fields: [
          {
            name: 'transaction_id',
            type: 'string',
            nullable: false,
            description: 'Unique transaction identifier',
            tags: ['primary_key', 'identifier'],
            privacy: {
              isPersonal: false,
              isSensitive: false,
              anonymizationMethod: 'none',
              anonymizationLevel: 0,
              accessRestricted: false,
              consentRequired: false
            },
            constraints: [
              { type: 'not_null', value: null, description: 'Transaction ID cannot be null', enforced: true },
              { type: 'unique', value: null, description: 'Transaction ID must be unique', enforced: true }
            ],
            statistics: {
              distinctCount: 5000000,
              nullCount: 0,
              distribution: {
                type: 'uniform',
                parameters: {},
                histogram: [],
                outliers: []
              },
              lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
            },
            lineage: {
              sourceFields: [],
              transformation: 'generated',
              derivedAt: Date.now() - (180 * 24 * 60 * 60 * 1000),
              confidence: 1.0
            }
          },
          {
            name: 'amount',
            type: 'decimal',
            nullable: false,
            description: 'Transaction amount',
            tags: ['financial', 'sensitive'],
            privacy: {
              isPersonal: false,
              isSensitive: true,
              anonymizationMethod: 'aggregation',
              anonymizationLevel: 0.8,
              accessRestricted: true,
              consentRequired: false
            },
            constraints: [
              { type: 'range', value: { min: 0, max: 1000000 }, description: 'Amount must be positive', enforced: true }
            ],
            statistics: {
              distinctCount: 100000,
              nullCount: 0,
              min: 0.01,
              max: 999999.99,
              avg: 125.50,
              distribution: {
                type: 'exponential',
                parameters: { lambda: 0.008 },
                histogram: [],
                outliers: []
              },
              lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
            },
            lineage: {
              sourceFields: ['raw_amount'],
              transformation: 'currency_conversion',
              derivedAt: Date.now() - (180 * 24 * 60 * 60 * 1000),
              confidence: 0.95
            }
          }
        ],
        relationships: [],
        constraints: [],
        indexes: [],
        partitions: [],
        evolution: []
      },
      lineage: {
        upstream: [
          {
            datasetId: 'payment_gateway',
            datasetName: 'Payment Gateway Data',
            type: 'source',
            connectionType: 'direct',
            strength: 0.95,
            lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
            metadata: { source: 'payment_processor', table: 'transactions' }
          }
        ],
        downstream: [
          {
            datasetId: 'financial_reports',
            datasetName: 'Financial Reports',
            type: 'target',
            connectionType: 'direct',
            strength: 0.9,
            lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
            metadata: { purpose: 'reporting' }
          }
        ],
        transformations: [
          {
            id: 'financial_validation_001',
            name: 'Financial Validation Pipeline',
            type: 'validate',
            description: 'Validate and enrich financial transaction data',
            sourceDatasets: ['payment_gateway'],
            targetDatasets: ['transaction_data_002'],
            logic: 'Validate amounts, detect fraud, enrich with metadata',
            parameters: { fraudDetection: true, enrichment: true },
            timestamp: Date.now() - (180 * 24 * 60 * 60 * 1000),
            owner: 'finance_team'
          }
        ],
        graph: {
          nodes: [],
          edges: [],
          layout: {
            algorithm: 'hierarchical',
            parameters: {},
            optimized: false
          },
          metadata: {
            generatedAt: Date.now(),
            version: '1.0',
            nodeCount: 0,
            edgeCount: 0,
            depth: 0,
            cycles: 0
          }
        },
        impact: {
          criticality: 'critical',
          downstreamCount: 3,
          consumerCount: 8,
          businessImpact: 'Critical for financial operations and compliance',
          riskFactors: ['Contains sensitive financial data', 'Regulatory requirements']
        }
      },
      quality: {
        overall: {
          value: 94.2,
          grade: 'A',
          lastAssessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
          trend: 'stable',
          confidence: 0.96
        },
        dimensions: [
          {
            name: 'accuracy',
            score: 96.5,
            weight: 0.3,
            description: 'Financial data accuracy and validation',
            metrics: [
              {
                name: 'overall_accuracy',
                value: 96.5,
                target: 95.0,
                threshold: 90.0,
                status: 'pass',
                description: 'Overall dataset accuracy',
                formula: 'average(field_accuracy)',
                lastCalculated: Date.now() - (1 * 24 * 60 * 60 * 1000)
              }
            ],
            lastAssessed: Date.now() - (1 * 24 * 60 * 60 * 1000),
            trend: 'stable'
          }
        ],
        issues: [],
        assessments: [],
        trends: [],
        benchmarks: []
      },
      usage: {
        statistics: {
          totalQueries: 8920,
          uniqueUsers: 67,
          avgQueriesPerDay: 198,
          peakQueriesPerHour: 45,
          dataVolumeAccessed: 1800000000, // 1.8GB
          avgResponseTime: 980, // ms
          errorRate: 0.01,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000),
          period: 'day'
        },
        patterns: [
          {
            type: 'temporal',
            pattern: 'end_of_month_peak',
            frequency: 0.75,
            confidence: 0.85,
            description: 'Higher usage at end of month for reporting',
            metadata: { peakDays: [28, 29, 30, 31] }
          }
        ],
        consumers: [
          {
            id: 'finance_team',
            name: 'Finance Team',
            type: 'team',
            department: 'Finance',
            accessLevel: 'read',
            firstAccess: Date.now() - (180 * 24 * 60 * 60 * 1000),
            lastAccess: Date.now() - (1 * 24 * 60 * 60 * 1000),
            queryCount: 5400,
            dataVolume: 1200000000,
            favorite: true,
            tags: ['power_users']
          }
        ],
        queries: [],
        access: [],
        performance: {
          avgResponseTime: 980,
          p50ResponseTime: 850,
          p95ResponseTime: 1800,
          p99ResponseTime: 2800,
          throughput: 198,
          concurrency: 8,
          errorRate: 0.01,
          availability: 99.9,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        },
        trends: []
      },
      access: {
        permissions: [
          {
            id: 'perm_002',
            principal: 'finance_team',
            principalType: 'group',
            resource: 'transaction_data_002',
            resourceType: 'dataset',
            actions: [
              { action: 'read', granted: true },
              { action: 'write', granted: false }
            ],
            conditions: [
              {
                type: 'purpose',
                operator: 'in',
                value: ['financial_reporting', 'audit', 'compliance'],
                description: 'Access limited to financial purposes'
              }
            ],
            grantedAt: Date.now() - (180 * 24 * 60 * 60 * 1000),
            grantedBy: 'data_admin',
            status: 'active',
            justification: 'Financial operations'
          }
        ],
        roles: [],
        policies: [],
        requests: [],
        audits: [],
        restrictions: [
          {
            type: 'purpose_based',
            description: 'Access limited to financial purposes',
            conditions: [
              {
                type: 'purpose',
                operator: 'in',
                value: ['financial_reporting', 'audit', 'compliance'],
                description: 'Financial purposes only'
              }
            ],
            enforced: true,
            bypassAllowed: false
          }
        ]
      },
      location: {
        source: {
          type: 'data_warehouse',
          name: 'Enterprise Data Warehouse',
          connection: {
            host: 'dw.company.com',
            port: 5432,
            protocol: 'postgresql',
            ssl: true,
            timeout: 30,
            poolSize: 20
          },
          credentials: {
            type: 'service_account',
            encrypted: true,
            rotationRequired: true,
            lastRotated: Date.now() - (15 * 24 * 60 * 60 * 1000)
          },
          properties: { database: 'finance', schema: 'transactions' }
        },
        storage: {
          provider: 'AWS',
          region: 'us-east-1',
          bucket: 'finance-data',
          path: '/secure/transactions/',
          encryption: {
            enabled: true,
            algorithm: 'AES-256',
            keyId: 'arn:aws:kms:us-east-1:123456789012:key/23456789-2345-2345-2345-234567890123',
            keyRotation: true,
            atRest: true,
            inTransit: true
          },
          compression: {
            enabled: true,
            algorithm: 'gzip',
            ratio: 0.4,
            level: 9
          },
          indexing: {
            enabled: true,
            type: 'btree',
            fields: ['transaction_id', 'amount', 'date'],
            refreshInterval: 1800
          }
        },
        format: {
          type: 'parquet',
          version: '1.0',
          compression: 'gzip',
          encoding: 'utf-8'
        },
        size: {
          total: 8000000000, // 8GB
          used: 1800000000, // 1.8GB
          available: 6200000000, // 6.2GB
          unit: 'bytes',
          estimated: false,
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        },
        partitions: [
          {
            field: 'transaction_date',
            type: 'range',
            columns: ['transaction_date'],
            partitions: 365,
            sizeDistribution: []
          }
        ],
        replication: {
          enabled: true,
          strategy: 'synchronous',
          factor: 3,
          regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          lag: 60,
          status: 'active'
        },
        backup: {
          enabled: true,
          frequency: 'hourly',
          retention: 90,
          lastBackup: Date.now() - (1 * 60 * 60 * 1000),
          nextBackup: Date.now() + (59 * 60 * 1000),
          size: 1800000000,
          location: 's3://backups/finance-data/',
          encrypted: true
        },
        retention: {
          policy: 'regulatory_compliance',
          minimumAge: 2555,
          maximumAge: 3650,
          autoDelete: false,
          archivalRequired: true,
          archivalLocation: 's3://archive/finance-data/'
        },
        cost: {
          storage: 285.75,
          compute: 156.25,
          transfer: 22.50,
          operations: 12.75,
          total: 477.25,
          currency: 'USD',
          period: 'month',
          lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000)
        }
      },
      processing: {
        pipelines: [
          {
            id: 'transaction_ingestion',
            name: 'Transaction Ingestion Pipeline',
            description: 'Real-time ingestion of financial transactions',
            type: 'streaming',
            stages: [
              {
                id: 'validate',
                name: 'Validate',
                type: 'validate',
                order: 1,
                description: 'Validate transaction data',
                configuration: { rules: ['amount_validation', 'fraud_detection'] },
                dependencies: [],
                status: 'completed',
                metrics: {
                  executionTime: 50,
                  recordsProcessed: 10000,
                  errorCount: 5,
                  throughput: 200,
                  memoryUsage: 1024,
                  cpuUsage: 25,
                  lastUpdated: Date.now() - (1 * 60 * 60 * 1000)
                }
              }
            ],
            sources: ['payment_gateway', 'pos_system'],
            targets: ['transaction_data_002'],
            parameters: { batchSize: 100, validation: 'strict' },
            status: 'active',
            createdAt: Date.now() - (180 * 24 * 60 * 60 * 1000),
            createdBy: 'finance_engineering',
            lastRun: Date.now() - (1 * 60 * 60 * 1000),
            nextRun: Date.now() + (5 * 60 * 1000)
          }
        ],
        jobs: [],
        schedules: [],
        dependencies: [],
        monitoring: {
          enabled: true,
          alerts: [],
          dashboards: [],
          metrics: [],
          healthChecks: []
        }
      },
      compliance: {
        frameworks: [
          {
            name: 'SOX',
            version: '2002',
            description: 'Sarbanes-Oxley Act',
            requirements: [],
            controls: [],
            maturity: {
              level: 5,
              description: 'Optimized compliance implementation',
              characteristics: ['Automated controls', 'Real-time monitoring', 'Continuous compliance'],
              gaps: [],
              recommendations: []
            },
            lastAssessed: Date.now() - (30 * 24 * 60 * 60 * 1000)
          },
          {
            name: 'PCI-DSS',
            version: '4.0',
            description: 'Payment Card Industry Data Security Standard',
            requirements: [],
            controls: [],
            maturity: {
              level: 5,
              description: 'Optimized compliance implementation',
              characteristics: ['Strong encryption', 'Access controls', 'Regular testing'],
              gaps: [],
              recommendations: []
            },
            lastAssessed: Date.now() - (30 * 24 * 60 * 60 * 1000)
          }
        ],
        assessments: [],
        controls: [],
        evidences: [],
        reports: [],
        certifications: []
      }
    }
  ];
};

const DataCatalogDemo: React.FC = () => {
  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DatasetMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics | null>(null);
  const [qualityAssessment, setQualityAssessment] = useState<QualityAssessment | null>(null);
  const [accessEvaluation, setAccessEvaluation] = useState<AccessEvaluation | null>(null);
  const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);

  // Initialize services
  const [privacyDiscovery] = useState(() => PrivacyPreservingDiscovery.getInstance());
  const [metadataSearch] = useState(() => MetadataManagementSearch.getInstance());
  const [lineageVisualization] = useState(() => DataLineageVisualization.getInstance());
  const [usageAnalytics] = useState(() => UsageAnalyticsStatistics.getInstance());
  const [accessControl] = useState(() => AccessControlIntegration.getInstance());
  const [qualityAssessment] = useState(() => DataQualityAssessment.getInstance());
  const [datasetManagement] = useState(() => DatasetManagementIntegration.getInstance());

  // Initialize sample data
  useEffect(() => {
    const sampleDatasets = generateSampleDatasets();
    setDatasets(sampleDatasets);
    
    // Add sample datasets to metadata search
    sampleDatasets.forEach(dataset => {
      metadataSearch.addDataset(dataset);
    });
  }, [metadataSearch]);

  // Search functionality
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const searchRequest: SearchRequest = {
        query: searchQuery,
        filters: [],
        sort: [{ field: 'relevance', order: 'desc', mode: 'min' }],
        pagination: { from: 0, size: 20 },
        facets: ['privacy.level', 'department', 'tags'],
        highlight: true,
        privacy: {
          level: 'internal',
          anonymizeResults: true,
          maskSensitiveFields: true,
          requireConsent: false
        }
      };

      const results = await metadataSearch.search(searchRequest);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, metadataSearch]);

  // Dataset selection
  const handleDatasetSelect = useCallback((dataset: DatasetMetadata) => {
    setSelectedDataset(dataset);
    setActiveTab('details');
  }, []);

  // Load dataset details
  useEffect(() => {
    if (!selectedDataset) return;

    const loadDatasetDetails = async () => {
      try {
        // Load usage metrics
        const metrics = await usageAnalytics.getUsageMetrics();
        setUsageMetrics(metrics);

        // Load quality assessment
        const assessment = await qualityAssessment.assessDatasetQuality(selectedDataset.id, selectedDataset);
        setQualityAssessment(assessment);

        // Load access evaluation
        const accessContext = {
          user: {
            id: 'demo_user',
            username: 'demo_user',
            email: 'demo@company.com',
            roles: ['analyst'],
            groups: ['data_team'],
            department: 'Analytics',
            location: 'US',
            clearance: 'confidential',
            attributes: {},
            sessionInfo: {
              id: 'session_123',
              startTime: Date.now() - (2 * 60 * 60 * 1000),
              lastActivity: Date.now(),
              ipAddress: '192.168.1.100',
              userAgent: 'Mozilla/5.0...',
              mfaVerified: true,
              riskScore: 0.1
            }
          },
          resource: {
            id: selectedDataset.id,
            type: 'dataset',
            name: selectedDataset.name,
            owner: selectedDataset.owner,
            department: selectedDataset.department,
            classification: selectedDataset.privacy.classification,
            sensitivity: selectedDataset.privacy.sensitivity,
            tags: selectedDataset.tags,
            attributes: {},
            lineage: []
          },
          action: 'read',
          environment: 'production',
          timestamp: Date.now(),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0...',
          sessionId: 'session_123'
        };

        const evaluation = await accessControl.evaluateAccess(accessContext);
        setAccessEvaluation(evaluation);

        // Load lineage graph
        const lineage = await lineageVisualization.generateLineageGraph(selectedDataset.id, selectedDataset);
        setLineageGraph(lineage);

      } catch (error) {
        console.error('Failed to load dataset details:', error);
      }
    };

    loadDatasetDetails();
  }, [selectedDataset, usageAnalytics, qualityAssessment, accessControl, lineageVisualization]);

  // Render helpers
  const renderPrivacyBadge = (level: string) => {
    const colors = {
      public: 'bg-green-100 text-green-800',
      internal: 'bg-blue-100 text-blue-800',
      confidential: 'bg-orange-100 text-orange-800',
      restricted: 'bg-red-100 text-red-800'
    };
    return (
      <Badge className={colors[level as keyof typeof colors]}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </Badge>
    );
  };

  const renderQualityGrade = (grade: string) => {
    const colors = {
      A: 'bg-green-100 text-green-800',
      B: 'bg-blue-100 text-blue-800',
      C: 'bg-yellow-100 text-yellow-800',
      D: 'bg-orange-100 text-orange-800',
      F: 'bg-red-100 text-red-800'
    };
    return (
      <Badge className={colors[grade as keyof typeof colors]}>
        Grade {grade}
      </Badge>
    );
  };

  const renderDatasetCard = (dataset: DatasetMetadata) => (
    <Card key={dataset.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleDatasetSelect(dataset)}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{dataset.name}</CardTitle>
            <CardDescription className="text-sm text-gray-600">{dataset.description}</CardDescription>
          </div>
          <div className="flex flex-col gap-2">
            {renderPrivacyBadge(dataset.privacy.level)}
            {renderQualityGrade(dataset.quality.overall.grade)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 mb-3">
          {dataset.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{dataset.usage.statistics.uniqueUsers} users</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>{dataset.usage.statistics.totalQueries} queries</span>
          </div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <span>{(dataset.location.size.used / 1024 / 1024 / 1024).toFixed(1)} GB</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{new Date(dataset.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Catalog</h1>
          <p className="text-gray-600 mt-1">Searchable data catalog with privacy-preserving discovery</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search datasets, metadata, or descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Search
            </Button>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="search">Search Results</TabsTrigger>
          <TabsTrigger value="details">Dataset Details</TabsTrigger>
          <TabsTrigger value="lineage">Data Lineage</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Datasets</p>
                    <p className="text-2xl font-bold">{datasets.length}</p>
                  </div>
                  <Database className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Users</p>
                    <p className="text-2xl font-bold">312</p>
                  </div>
                  <Users className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg Quality Score</p>
                    <p className="text-2xl font-bold">90.8</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Data Volume</p>
                    <p className="text-2xl font-bold">4.3 TB</p>
                  </div>
                  <PieChart className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Datasets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {datasets.slice(0, 6).map(renderDatasetCard)}
            </div>
          </div>
        </TabsContent>

        {/* Search Results Tab */}
        <TabsContent value="search" className="space-y-6">
          {searchResults ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  Found {searchResults.total} datasets
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.datasets.map(result => (
                  <Card key={result.dataset.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleDatasetSelect(result.dataset)}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{result.dataset.name}</CardTitle>
                          <CardDescription className="text-sm text-gray-600">{result.dataset.description}</CardDescription>
                        </div>
                        <div className="text-sm text-blue-600">
                          Score: {result.score.toFixed(2)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {result.dataset.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                      <div className="text-sm text-gray-600">
                        Relevance: {(result.score * 100).toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Search Results</h3>
                <p className="text-gray-600">Enter a search query to find datasets</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Dataset Details Tab */}
        <TabsContent value="details" className="space-y-6">
          {selectedDataset ? (
            <div className="space-y-6">
              {/* Dataset Header */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl">{selectedDataset.name}</CardTitle>
                      <CardDescription className="text-lg mt-2">{selectedDataset.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {renderPrivacyBadge(selectedDataset.privacy.level)}
                      {renderQualityGrade(selectedDataset.quality.overall.grade)}
                      <Badge variant={selectedDataset.status === 'active' ? 'default' : 'secondary'}>
                        {selectedDataset.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Owner:</span>
                      <p className="text-gray-600">{selectedDataset.owner}</p>
                    </div>
                    <div>
                      <span className="font-medium">Department:</span>
                      <p className="text-gray-600">{selectedDataset.department}</p>
                    </div>
                    <div>
                      <span className="font-medium">Version:</span>
                      <p className="text-gray-600">{selectedDataset.version}</p>
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>
                      <p className="text-gray-600">{new Date(selectedDataset.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="font-medium">Tags:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedDataset.tags.map(tag => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Access Evaluation */}
              {accessEvaluation && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Access Evaluation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {accessEvaluation.decision.allowed ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-medium">
                          {accessEvaluation.decision.allowed ? 'Access Granted' : 'Access Denied'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{accessEvaluation.decision.reason}</p>
                      
                      {accessEvaluation.decision.approvalRequired && (
                        <Alert>
                          <AlertTriangle className="w-4 h-4" />
                          <AlertTitle>Approval Required</AlertTitle>
                          <AlertDescription>
                            This dataset requires approval for access. Submit an access request to proceed.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Usage Statistics */}
              {usageMetrics && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Usage Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Queries</p>
                        <p className="text-xl font-bold">{usageMetrics.totalQueries.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Unique Users</p>
                        <p className="text-xl font-bold">{usageMetrics.uniqueUsers}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Avg Response Time</p>
                        <p className="text-xl font-bold">{usageMetrics.avgResponseTime}ms</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Data Volume</p>
                        <p className="text-xl font-bold">{(usageMetrics.dataVolumeAccessed / 1024 / 1024 / 1024).toFixed(1)}GB</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Schema Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Schema Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-4">
                      {selectedDataset.schema.fields.slice(0, 5).map(field => (
                        <div key={field.name} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{field.name}</h4>
                              <p className="text-sm text-gray-600">{field.type}</p>
                              <p className="text-sm text-gray-500 mt-1">{field.description}</p>
                            </div>
                            <div className="flex gap-1">
                              {field.privacy.isPersonal && <Badge variant="outline" className="text-xs">Personal</Badge>}
                              {field.privacy.isSensitive && <Badge variant="outline" className="text-xs">Sensitive</Badge>}
                              {field.privacy.accessRestricted && <Badge variant="outline" className="text-xs">Restricted</Badge>}
                            </div>
                          </div>
                          {field.statistics && (
                            <div className="mt-2 text-xs text-gray-500">
                              Distinct: {field.statistics.distinctCount.toLocaleString()} | 
                              Null: {field.statistics.nullCount.toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Dataset Selected</h3>
                <p className="text-gray-600">Select a dataset from the search results to view details</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Data Lineage Tab */}
        <TabsContent value="lineage" className="space-y-6">
          {lineageGraph ? (
            <Card>
              <CardHeader>
                <CardTitle>Data Lineage</CardTitle>
                <CardDescription>
                  Visual representation of data flow and dependencies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96 border rounded-lg flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-100 p-4 rounded">
                        <Database className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                        <p className="text-sm">Sources</p>
                        <p className="font-bold">{lineageGraph.metadata.nodeCount}</p>
                      </div>
                      <div className="bg-green-100 p-4 rounded">
                        <Zap className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <p className="text-sm">Transformations</p>
                        <p className="font-bold">{lineageGraph.metadata.nodeCount}</p>
                      </div>
                      <div className="bg-purple-100 p-4 rounded">
                        <Database className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                        <p className="text-sm">Targets</p>
                        <p className="font-bold">{lineageGraph.metadata.nodeCount}</p>
                      </div>
                    </div>
                    <p className="text-gray-600">Interactive lineage visualization would be rendered here</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Graph depth: {lineageGraph.metadata.depth} | 
                      Cycles detected: {lineageGraph.metadata.cycles}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <LineChart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Lineage Data</h3>
                <p className="text-gray-600">Select a dataset to view its lineage information</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Usage Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                  <p className="text-gray-600">Usage trend chart would be rendered here</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>User Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                  <p className="text-gray-600">User activity chart would be rendered here</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Consumers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedDataset?.usage.consumers.slice(0, 5).map(consumer => (
                  <div key={consumer.id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <p className="font-medium">{consumer.name}</p>
                      <p className="text-sm text-gray-600">{consumer.type} • {consumer.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{consumer.queryCount.toLocaleString()} queries</p>
                      <p className="text-sm text-gray-600">{(consumer.dataVolume / 1024 / 1024 / 1024).toFixed(1)} GB</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-6">
          {qualityAssessment ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quality Assessment</CardTitle>
                  <CardDescription>
                    Last assessed: {new Date(qualityAssessment.timestamp).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Overall Score</span>
                        <span className="font-bold text-lg">{qualityAssessment.scores.overall_score?.toFixed(1)}%</span>
                      </div>
                      <Progress value={qualityAssessment.scores.overall_score || 0} className="h-2" />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {Object.entries(qualityAssessment.scores).map(([key, value]) => (
                        key !== 'overall_score' && (
                          <div key={key} className="text-center">
                            <p className="text-sm text-gray-600 capitalize">{key.replace('_', ' ')}</p>
                            <p className="text-lg font-bold">{(value as number).toFixed(1)}%</p>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quality Issues</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDataset?.quality.issues.length ? (
                    <div className="space-y-3">
                      {selectedDataset.quality.issues.map(issue => (
                        <Alert key={issue.id}>
                          <AlertTriangle className="w-4 h-4" />
                          <AlertTitle className="capitalize">{issue.type} Issue</AlertTitle>
                          <AlertDescription>
                            {issue.description} - {issue.affectedRecords.toLocaleString()} records affected
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-600">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p>No quality issues detected</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {qualityAssessment.recommendations.map((recommendation, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 border rounded">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                        <p className="text-sm">{recommendation}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Quality Data</h3>
                <p className="text-gray-600">Select a dataset to view quality assessment</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataCatalogDemo;
