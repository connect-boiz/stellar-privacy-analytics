import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';
import cron from 'node-cron';

/**
 * Privacy Compliance Automation Service
 * Automated compliance checking against GDPR, CCPA, HIPAA regulations
 */

export interface ComplianceRegulation {
  id: string;
  name: string;
  description: string;
  version: string;
  effectiveDate: Date;
  rules: ComplianceRule[];
}

export interface ComplianceRule {
  id: string;
  regulationId: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  checkFunction: string;
  parameters: Record<string, any>;
  remediation: string;
}

export interface ComplianceScanResult {
  scanId: string;
  timestamp: Date;
  regulation: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'error';
  score: number;
  violations: ComplianceViolation[];
  recommendations: string[];
  auditTrail: AuditEntry[];
}

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: string;
  description: string;
  affectedResources: string[];
  detectedAt: Date;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  resource: string;
  details: Record<string, any>;
}

export interface ComplianceAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  regulation: string;
  message: string;
  violations: ComplianceViolation[];
  timestamp: Date;
  notified: boolean;
}

export class ComplianceAutomationService {
  private regulations: Map<string, ComplianceRegulation> = new Map();
  private scanHistory: ComplianceScanResult[] = [];
  private activeAlerts: ComplianceAlert[] = [];
  private monitoringEnabled: boolean = false;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.initializeRegulations();
  }

  /**
   * Initialize compliance regulations with their rules
   */
  private initializeRegulations(): void {
    // GDPR Regulation
    const gdpr: ComplianceRegulation = {
      id: 'gdpr',
      name: 'General Data Protection Regulation',
      description: 'EU data protection and privacy regulation',
      version: '2016/679',
      effectiveDate: new Date('2018-05-25'),
      rules: [
        {
          id: 'gdpr-001',
          regulationId: 'gdpr',
          name: 'Data Minimization',
          description: 'Only collect and process necessary personal data',
          category: 'data_collection',
          severity: 'high',
          checkFunction: 'checkDataMinimization',
          parameters: { maxFields: 20, requiredJustification: true },
          remediation: 'Review data collection practices and remove unnecessary fields'
        },
        {
          id: 'gdpr-002',
          regulationId: 'gdpr',
          name: 'Consent Management',
          description: 'Valid consent must be obtained for data processing',
          category: 'consent',
          severity: 'critical',
          checkFunction: 'checkConsentManagement',
          parameters: { requireExplicitConsent: true, consentExpiry: 365 },
          remediation: 'Implement proper consent collection and management system'
        },
        {
          id: 'gdpr-003',
          regulationId: 'gdpr',
          name: 'Right to Erasure',
          description: 'Users must be able to request data deletion',
          category: 'data_rights',
          severity: 'high',
          checkFunction: 'checkRightToErasure',
          parameters: { maxResponseTime: 30, automatedProcess: true },
          remediation: 'Implement automated data deletion workflow'
        },
        {
          id: 'gdpr-004',
          regulationId: 'gdpr',
          name: 'Data Breach Notification',
          description: 'Breaches must be reported within 72 hours',
          category: 'security',
          severity: 'critical',
          checkFunction: 'checkBreachNotification',
          parameters: { maxNotificationHours: 72, automatedAlerts: true },
          remediation: 'Set up automated breach detection and notification system'
        },
        {
          id: 'gdpr-005',
          regulationId: 'gdpr',
          name: 'Data Protection Impact Assessment',
          description: 'DPIA required for high-risk processing',
          category: 'risk_assessment',
          severity: 'high',
          checkFunction: 'checkDPIA',
          parameters: { requireDPIA: true, reviewFrequency: 365 },
          remediation: 'Conduct and document Data Protection Impact Assessment'
        }
      ]
    };

    // CCPA Regulation
    const ccpa: ComplianceRegulation = {
      id: 'ccpa',
      name: 'California Consumer Privacy Act',
      description: 'California state privacy law',
      version: '2018',
      effectiveDate: new Date('2020-01-01'),
      rules: [
        {
          id: 'ccpa-001',
          regulationId: 'ccpa',
          name: 'Right to Know',
          description: 'Consumers have right to know what data is collected',
          category: 'transparency',
          severity: 'high',
          checkFunction: 'checkRightToKnow',
          parameters: { requireDisclosure: true, maxResponseDays: 45 },
          remediation: 'Implement data disclosure mechanism for consumer requests'
        },
        {
          id: 'ccpa-002',
          regulationId: 'ccpa',
          name: 'Right to Delete',
          description: 'Consumers can request deletion of personal information',
          category: 'data_rights',
          severity: 'high',
          checkFunction: 'checkRightToDelete',
          parameters: { maxResponseDays: 45, verificationRequired: true },
          remediation: 'Create verified deletion request process'
        },
        {
          id: 'ccpa-003',
          regulationId: 'ccpa',
          name: 'Right to Opt-Out',
          description: 'Consumers can opt-out of data sale',
          category: 'consent',
          severity: 'critical',
          checkFunction: 'checkOptOut',
          parameters: { requireOptOutLink: true, honorOptOut: true },
          remediation: 'Add "Do Not Sell My Personal Information" link and mechanism'
        },
        {
          id: 'ccpa-004',
          regulationId: 'ccpa',
          name: 'Non-Discrimination',
          description: 'Cannot discriminate against consumers exercising rights',
          category: 'fairness',
          severity: 'high',
          checkFunction: 'checkNonDiscrimination',
          parameters: { prohibitPriceDifference: true, prohibitServiceDenial: true },
          remediation: 'Ensure equal treatment regardless of privacy choices'
        }
      ]
    };

    // HIPAA Regulation
    const hipaa: ComplianceRegulation = {
      id: 'hipaa',
      name: 'Health Insurance Portability and Accountability Act',
      description: 'US healthcare data protection law',
      version: '1996',
      effectiveDate: new Date('2003-04-14'),
      rules: [
        {
          id: 'hipaa-001',
          regulationId: 'hipaa',
          name: 'Administrative Safeguards',
          description: 'Policies and procedures to protect ePHI',
          category: 'administrative',
          severity: 'critical',
          checkFunction: 'checkAdministrativeSafeguards',
          parameters: { requireSecurityOfficer: true, requireTraining: true },
          remediation: 'Implement comprehensive administrative safeguards program'
        },
        {
          id: 'hipaa-002',
          regulationId: 'hipaa',
          name: 'Physical Safeguards',
          description: 'Physical access controls for facilities and equipment',
          category: 'physical',
          severity: 'high',
          checkFunction: 'checkPhysicalSafeguards',
          parameters: { requireAccessControl: true, requireDeviceSecurity: true },
          remediation: 'Implement physical security controls for ePHI access'
        },
        {
          id: 'hipaa-003',
          regulationId: 'hipaa',
          name: 'Technical Safeguards',
          description: 'Technology controls to protect ePHI',
          category: 'technical',
          severity: 'critical',
          checkFunction: 'checkTechnicalSafeguards',
          parameters: { requireEncryption: true, requireAuditControls: true },
          remediation: 'Implement encryption and access controls for ePHI'
        },
        {
          id: 'hipaa-004',
          regulationId: 'hipaa',
          name: 'Breach Notification Rule',
          description: 'Notification requirements for PHI breaches',
          category: 'security',
          severity: 'critical',
          checkFunction: 'checkHIPAABreachNotification',
          parameters: { maxNotificationDays: 60, requireHHSNotification: true },
          remediation: 'Establish breach notification procedures'
        },
        {
          id: 'hipaa-005',
          regulationId: 'hipaa',
          name: 'Business Associate Agreements',
          description: 'BAAs required with third-party vendors',
          category: 'contracts',
          severity: 'high',
          checkFunction: 'checkBAA',
          parameters: { requireBAA: true, requireAnnualReview: true },
          remediation: 'Execute Business Associate Agreements with all vendors'
        }
      ]
    };

    this.regulations.set('gdpr', gdpr);
    this.regulations.set('ccpa', ccpa);
    this.regulations.set('hipaa', hipaa);

    logger.info('Compliance regulations initialized', {
      count: this.regulations.size,
      regulations: Array.from(this.regulations.keys())
    });
  }

  /**
   * Run compliance scan for specific regulation
   */
  async runComplianceScan(regulationId: string): Promise<ComplianceScanResult> {
    const regulation = this.regulations.get(regulationId);
    if (!regulation) {
      throw new Error(`Regulation ${regulationId} not found`);
    }

    logger.info(`Starting compliance scan for ${regulation.name}`);

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const violations: ComplianceViolation[] = [];
    const auditTrail: AuditEntry[] = [];

    // Execute each rule check
    for (const rule of regulation.rules) {
      try {
        const ruleViolations = await this.executeRuleCheck(rule);
        violations.push(...ruleViolations);

        auditTrail.push({
          id: `audit_${Date.now()}`,
          timestamp: new Date(),
          action: 'rule_check',
          actor: 'system',
          resource: rule.id,
          details: {
            ruleName: rule.name,
            violationsFound: ruleViolations.length
          }
        });
      } catch (error) {
        logger.error(`Error executing rule ${rule.id}:`, error);
        auditTrail.push({
          id: `audit_${Date.now()}`,
          timestamp: new Date(),
          action: 'rule_check_error',
          actor: 'system',
          resource: rule.id,
          details: { error: error.message }
        });
      }
    }

    // Calculate compliance score
    const score = this.calculateComplianceScore(regulation.rules.length, violations);
    const status = this.determineComplianceStatus(score, violations);
    const recommendations = this.generateRecommendations(violations);

    const result: ComplianceScanResult = {
      scanId,
      timestamp: new Date(),
      regulation: regulation.name,
      status,
      score,
      violations,
      recommendations,
      auditTrail
    };

    this.scanHistory.push(result);
    await this.persistScanResult(result);

    // Generate alerts for critical violations
    if (violations.some(v => v.severity === 'critical')) {
      await this.generateAlert(regulation.id, violations);
    }

    logger.info(`Compliance scan completed for ${regulation.name}`, {
      scanId,
      score,
      status,
      violationsCount: violations.length
    });

    return result;
  }

  /**
   * Execute individual rule check
   */
  private async executeRuleCheck(rule: ComplianceRule): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Simulate rule execution (in production, this would call actual check functions)
    const checkResult = await this.performRuleCheck(rule);

    if (!checkResult.passed) {
      violations.push({
        id: `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        description: checkResult.message,
        affectedResources: checkResult.affectedResources,
        detectedAt: new Date(),
        status: 'open'
      });
    }

    return violations;
  }

  /**
   * Perform actual rule check (placeholder for actual implementation)
   */
  private async performRuleCheck(rule: ComplianceRule): Promise<{
    passed: boolean;
    message: string;
    affectedResources: string[];
  }> {
    // This is a simulation - in production, implement actual checks
    const passed = Math.random() > 0.3; // 70% pass rate for demo

    return {
      passed,
      message: passed 
        ? `${rule.name} check passed` 
        : `${rule.name} check failed: ${rule.description}`,
      affectedResources: passed ? [] : ['resource_1', 'resource_2']
    };
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(totalRules: number, violations: ComplianceViolation[]): number {
    if (totalRules === 0) return 100;

    const criticalWeight = 20;
    const highWeight = 10;
    const mediumWeight = 5;
    const lowWeight = 2;

    let deductions = 0;
    violations.forEach(v => {
      switch (v.severity) {
        case 'critical': deductions += criticalWeight; break;
        case 'high': deductions += highWeight; break;
        case 'medium': deductions += mediumWeight; break;
        case 'low': deductions += lowWeight; break;
      }
    });

    const score = Math.max(0, 100 - deductions);
    return Math.round(score);
  }

  /**
   * Determine overall compliance status
   */
  private determineComplianceStatus(
    score: number, 
    violations: ComplianceViolation[]
  ): 'compliant' | 'non-compliant' | 'partial' | 'error' {
    const hasCritical = violations.some(v => v.severity === 'critical');
    
    if (hasCritical) return 'non-compliant';
    if (score >= 90) return 'compliant';
    if (score >= 70) return 'partial';
    return 'non-compliant';
  }

  /**
   * Generate recommendations based on violations
   */
  private generateRecommendations(violations: ComplianceViolation[]): string[] {
    const recommendations: string[] = [];
    const ruleIds = new Set(violations.map(v => v.ruleId));

    ruleIds.forEach(ruleId => {
      const rule = this.findRuleById(ruleId);
      if (rule) {
        recommendations.push(rule.remediation);
      }
    });

    return recommendations;
  }

  /**
   * Find rule by ID across all regulations
   */
  private findRuleById(ruleId: string): ComplianceRule | undefined {
    for (const regulation of this.regulations.values()) {
      const rule = regulation.rules.find(r => r.id === ruleId);
      if (rule) return rule;
    }
    return undefined;
  }

  /**
   * Persist scan result to storage
   */
  private async persistScanResult(result: ComplianceScanResult): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `compliance:scan:${result.scanId}`;
      await redis.setEx(key, 86400 * 30, JSON.stringify(result)); // 30 days retention
      
      // Also store in scan history list
      await redis.lPush('compliance:scan:history', result.scanId);
      await redis.lTrim('compliance:scan:history', 0, 99); // Keep last 100 scans
    } catch (error) {
      logger.error('Error persisting scan result:', error);
    }
  }

  /**
   * Generate compliance alert
   */
  private async generateAlert(regulationId: string, violations: ComplianceViolation[]): Promise<void> {
    const criticalViolations = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
    
    if (criticalViolations.length === 0) return;

    const alert: ComplianceAlert = {
      id: `alert_${Date.now()}`,
      severity: criticalViolations.some(v => v.severity === 'critical') ? 'critical' : 'high',
      regulation: regulationId,
      message: `${criticalViolations.length} critical compliance violations detected`,
      violations: criticalViolations,
      timestamp: new Date(),
      notified: false
    };

    this.activeAlerts.push(alert);
    await this.sendAlertNotification(alert);
  }

  /**
   * Send alert notification
   */
  private async sendAlertNotification(alert: ComplianceAlert): Promise<void> {
    try {
      logger.warn('Compliance Alert Generated', {
        alertId: alert.id,
        severity: alert.severity,
        regulation: alert.regulation,
        violationsCount: alert.violations.length
      });

      // In production, send to notification channels (email, Slack, PagerDuty, etc.)
      alert.notified = true;
    } catch (error) {
      logger.error('Error sending alert notification:', error);
    }
  }

  /**
   * Start real-time compliance monitoring
   */
  startMonitoring(scheduleExpression: string = '0 */6 * * *'): void {
    if (this.monitoringEnabled) {
      logger.warn('Compliance monitoring already enabled');
      return;
    }

    // Schedule automated scans for each regulation
    this.regulations.forEach((regulation, regulationId) => {
      const job = cron.schedule(scheduleExpression, async () => {
        logger.info(`Running scheduled compliance scan for ${regulation.name}`);
        try {
          await this.runComplianceScan(regulationId);
        } catch (error) {
          logger.error(`Scheduled scan failed for ${regulationId}:`, error);
        }
      });

      this.scheduledJobs.set(regulationId, job);
    });

    this.monitoringEnabled = true;
    logger.info('Compliance monitoring started', {
      schedule: scheduleExpression,
      regulations: Array.from(this.regulations.keys())
    });
  }

  /**
   * Stop real-time compliance monitoring
   */
  stopMonitoring(): void {
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs.clear();
    this.monitoringEnabled = false;
    logger.info('Compliance monitoring stopped');
  }

  /**
   * Get compliance dashboard data
   */
  async getComplianceDashboard(): Promise<{
    regulations: Array<{
      id: string;
      name: string;
      lastScan: Date | null;
      status: string;
      score: number;
      violationsCount: number;
    }>;
    recentScans: ComplianceScanResult[];
    activeAlerts: ComplianceAlert[];
    overallScore: number;
  }> {
    const regulationStats = Array.from(this.regulations.values()).map(reg => {
      const recentScan = this.scanHistory
        .filter(s => s.regulation === reg.name)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

      return {
        id: reg.id,
        name: reg.name,
        lastScan: recentScan?.timestamp || null,
        status: recentScan?.status || 'not_scanned',
        score: recentScan?.score || 0,
        violationsCount: recentScan?.violations.length || 0
      };
    });

    const recentScans = this.scanHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    const overallScore = regulationStats.length > 0
      ? Math.round(regulationStats.reduce((sum, r) => sum + r.score, 0) / regulationStats.length)
      : 0;

    return {
      regulations: regulationStats,
      recentScans,
      activeAlerts: this.activeAlerts,
      overallScore
    };
  }

  /**
   * Get audit trail for compliance activities
   */
  async getAuditTrail(filters?: {
    startDate?: Date;
    endDate?: Date;
    regulation?: string;
    action?: string;
  }): Promise<AuditEntry[]> {
    let auditEntries: AuditEntry[] = [];

    // Collect all audit entries from scan history
    this.scanHistory.forEach(scan => {
      auditEntries.push(...scan.auditTrail);
    });

    // Apply filters
    if (filters) {
      if (filters.startDate) {
        auditEntries = auditEntries.filter(e => e.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        auditEntries = auditEntries.filter(e => e.timestamp <= filters.endDate!);
      }
      if (filters.action) {
        auditEntries = auditEntries.filter(e => e.action === filters.action);
      }
    }

    return auditEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(regulationId: string): Promise<{
    regulation: string;
    generatedAt: Date;
    period: { start: Date; end: Date };
    summary: {
      totalScans: number;
      averageScore: number;
      totalViolations: number;
      criticalViolations: number;
    };
    trends: Array<{ date: Date; score: number }>;
    topViolations: Array<{ rule: string; count: number }>;
    recommendations: string[];
  }> {
    const regulation = this.regulations.get(regulationId);
    if (!regulation) {
      throw new Error(`Regulation ${regulationId} not found`);
    }

    const scans = this.scanHistory.filter(s => s.regulation === regulation.name);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentScans = scans.filter(s => s.timestamp >= thirtyDaysAgo);

    const totalViolations = recentScans.reduce((sum, s) => sum + s.violations.length, 0);
    const criticalViolations = recentScans.reduce(
      (sum, s) => sum + s.violations.filter(v => v.severity === 'critical').length,
      0
    );

    const averageScore = recentScans.length > 0
      ? Math.round(recentScans.reduce((sum, s) => sum + s.score, 0) / recentScans.length)
      : 0;

    const trends = recentScans.map(s => ({
      date: s.timestamp,
      score: s.score
    }));

    // Count violations by rule
    const violationCounts = new Map<string, number>();
    recentScans.forEach(scan => {
      scan.violations.forEach(v => {
        violationCounts.set(v.ruleName, (violationCounts.get(v.ruleName) || 0) + 1);
      });
    });

    const topViolations = Array.from(violationCounts.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const allRecommendations = new Set<string>();
    recentScans.forEach(scan => {
      scan.recommendations.forEach(r => allRecommendations.add(r));
    });

    return {
      regulation: regulation.name,
      generatedAt: now,
      period: { start: thirtyDaysAgo, end: now },
      summary: {
        totalScans: recentScans.length,
        averageScore,
        totalViolations,
        criticalViolations
      },
      trends,
      topViolations,
      recommendations: Array.from(allRecommendations)
    };
  }

  /**
   * Get all available regulations
   */
  getRegulations(): ComplianceRegulation[] {
    return Array.from(this.regulations.values());
  }

  /**
   * Get specific regulation details
   */
  getRegulation(regulationId: string): ComplianceRegulation | undefined {
    return this.regulations.get(regulationId);
  }
}

export const complianceAutomationService = new ComplianceAutomationService();
