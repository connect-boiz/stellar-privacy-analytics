/**
 * Compliance Status Monitoring Service
 */

import { 
  ComplianceStatus, 
  ComplianceViolation, 
  PrivacyMetric, 
  DataAccessEvent 
} from '../types/privacyMetrics';

export interface ComplianceFramework {
  name: string;
  version: string;
  requirements: ComplianceRequirement[];
  assessmentFrequency: number; // days
}

export interface ComplianceRequirement {
  id: string;
  category: string;
  title: string;
  description: string;
  controls: ComplianceControl[];
  weight: number; // 0-1
  mandatory: boolean;
}

export interface ComplianceControl {
  id: string;
  title: string;
  description: string;
  type: 'technical' | 'administrative' | 'physical';
  implementationStatus: 'implemented' | 'partial' | 'not_implemented';
  evidence: string[];
  testResults?: ComplianceTestResult[];
}

export interface ComplianceTestResult {
  id: string;
  timestamp: number;
  status: 'pass' | 'fail' | 'warning';
  score: number; // 0-100
  details: string;
  evidence: string[];
}

export interface ComplianceAssessment {
  id: string;
  framework: string;
  timestamp: number;
  overallScore: number;
  categoryScores: Record<string, number>;
  requirements: ComplianceRequirementStatus[];
  violations: ComplianceViolation[];
  recommendations: ComplianceRecommendation[];
  nextAssessment: number;
  assessor: string;
}

export interface ComplianceRequirementStatus {
  requirementId: string;
  score: number;
  status: 'compliant' | 'non_compliant' | 'partial';
  gaps: string[];
  remediation: string[];
}

export interface ComplianceRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  dueDate: number;
  assignedTo?: string;
}

export class ComplianceMonitor {
  private static instance: ComplianceMonitor;
  private frameworks: Map<string, ComplianceFramework> = new Map();
  private assessments: Map<string, ComplianceAssessment[]> = new Map();
  private monitoringRules: ComplianceMonitoringRule[] = [];

  private constructor() {
    this.initializeFrameworks();
    this.initializeMonitoringRules();
  }

  static getInstance(): ComplianceMonitor {
    if (!ComplianceMonitor.instance) {
      ComplianceMonitor.instance = new ComplianceMonitor();
    }
    return ComplianceMonitor.instance;
  }

  private initializeFrameworks(): void {
    // GDPR Framework
    const gdprFramework: ComplianceFramework = {
      name: 'GDPR',
      version: '2018/1.1',
      assessmentFrequency: 365, // Annual
      requirements: [
        {
          id: 'art32',
          category: 'Security of Processing',
          title: 'Article 32 - Security of Processing',
          description: 'Technical and organizational measures to ensure data security',
          controls: [
            {
              id: 'encryption',
              title: 'Encryption at Rest and in Transit',
              description: 'Data must be encrypted both at rest and during transmission',
              type: 'technical',
              implementationStatus: 'implemented',
              evidence: ['encryption-config', 'security-audit-2024']
            },
            {
              id: 'access-control',
              title: 'Access Control',
              description: 'Role-based access control with regular reviews',
              type: 'technical',
              implementationStatus: 'implemented',
              evidence: ['rbac-config', 'access-review-2024']
            }
          ],
          weight: 0.3,
          mandatory: true
        },
        {
          id: 'art25',
          category: 'Data Minimization',
          title: 'Article 25 - Data Minimization',
          description: 'Collect and process only necessary data',
          controls: [
            {
              id: 'data-retention',
              title: 'Data Retention Policy',
              description: 'Automatic deletion of data after retention period',
              type: 'technical',
              implementationStatus: 'partial',
              evidence: ['retention-policy-doc']
            }
          ],
          weight: 0.25,
          mandatory: true
        }
      ]
    };

    // CCPA Framework
    const ccpaFramework: ComplianceFramework = {
      name: 'CCPA',
      version: '2020/1.0',
      assessmentFrequency: 180, // Semi-annual
      requirements: [
        {
          id: 'ccpa-1798.105',
          category: 'Right to Delete',
          title: 'Consumer Right to Delete',
          description: 'Consumers can request deletion of their personal information',
          controls: [
            {
              id: 'deletion-workflow',
              title: 'Deletion Request Workflow',
              description: 'Automated workflow for processing deletion requests',
              type: 'technical',
              implementationStatus: 'partial',
              evidence: ['deletion-process-docs']
            }
          ],
          weight: 0.4,
          mandatory: true
        }
      ]
    };

    this.frameworks.set('GDPR', gdprFramework);
    this.frameworks.set('CCPA', ccpaFramework);
  }

  private initializeMonitoringRules(): void {
    this.monitoringRules = [
      {
        id: 'data-access-monitoring',
        name: 'Data Access Monitoring',
        description: 'Monitor data access for compliance violations',
        framework: 'GDPR',
        requirementId: 'art32',
        condition: {
          metric: 'access_frequency',
          operator: 'gt',
          threshold: 1000,
          timeWindow: 3600000 // 1 hour
        },
        severity: 'medium',
        action: 'alert'
      },
      {
        id: 'retention-policy',
        name: 'Data Retention Policy',
        description: 'Monitor data retention compliance',
        framework: 'GDPR',
        requirementId: 'art25',
        condition: {
          metric: 'data_age',
          operator: 'gt',
          threshold: 2555, // 7 years in days
          timeWindow: 86400000 // 24 hours
        },
        severity: 'high',
        action: 'alert'
      }
    ];
  }

  // Main compliance monitoring methods
  public async assessCompliance(framework: string): Promise<ComplianceAssessment> {
    const frameworkDef = this.frameworks.get(framework);
    if (!frameworkDef) {
      throw new Error(`Framework ${framework} not found`);
    }

    const assessment: ComplianceAssessment = {
      id: `assessment-${Date.now()}`,
      framework,
      timestamp: Date.now(),
      overallScore: 0,
      categoryScores: {},
      requirements: [],
      violations: [],
      recommendations: [],
      nextAssessment: Date.now() + (frameworkDef.assessmentFrequency * 24 * 60 * 60 * 1000),
      assessor: 'system'
    };

    // Assess each requirement
    for (const requirement of frameworkDef.requirements) {
      const requirementStatus = await this.assessRequirement(requirement);
      assessment.requirements.push(requirementStatus);

      // Update category scores
      if (!assessment.categoryScores[requirement.category]) {
        assessment.categoryScores[requirement.category] = 0;
      }
      assessment.categoryScores[requirement.category] += requirementStatus.score * requirement.weight;
    }

    // Calculate overall score
    const totalWeight = frameworkDef.requirements.reduce((sum, req) => sum + req.weight, 0);
    assessment.overallScore = assessment.requirements.reduce((sum, req) => {
      const requirement = frameworkDef.requirements.find(r => r.id === req.requirementId);
      return sum + (req.score * (requirement?.weight || 0));
    }, 0) / totalWeight;

    // Generate recommendations
    assessment.recommendations = this.generateRecommendations(assessment);

    // Store assessment
    if (!this.assessments.has(framework)) {
      this.assessments.set(framework, []);
    }
    this.assessments.get(framework)!.push(assessment);

    return assessment;
  }

  private async assessRequirement(requirement: ComplianceRequirement): Promise<ComplianceRequirementStatus> {
    let totalScore = 0;
    let implementedControls = 0;
    const gaps: string[] = [];
    const remediation: string[] = [];

    for (const control of requirement.controls) {
      let controlScore = 0;

      switch (control.implementationStatus) {
        case 'implemented':
          controlScore = 100;
          implementedControls++;
          break;
        case 'partial':
          controlScore = 50;
          gaps.push(`${control.title}: Partial implementation`);
          remediation.push(`Complete implementation of ${control.title}`);
          break;
        case 'not_implemented':
          controlScore = 0;
          gaps.push(`${control.title}: Not implemented`);
          remediation.push(`Implement ${control.title}`);
          break;
      }

      // Check test results if available
      if (control.testResults) {
        const testScores = control.testResults.map(test => test.score);
        const avgTestScore = testScores.reduce((sum, score) => sum + score, 0) / testScores.length;
        controlScore = (controlScore + avgTestScore) / 2;
      }

      totalScore += controlScore;
    }

    const finalScore = requirement.controls.length > 0 ? totalScore / requirement.controls.length : 0;

    let status: 'compliant' | 'non_compliant' | 'partial';
    if (finalScore >= 90) {
      status = 'compliant';
    } else if (finalScore >= 60) {
      status = 'partial';
    } else {
      status = 'non_compliant';
    }

    return {
      requirementId: requirement.id,
      score: finalScore,
      status,
      gaps,
      remediation
    };
  }

  public async monitorCompliance(metrics: PrivacyMetric[], accessEvents: DataAccessEvent[]): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    for (const rule of this.monitoringRules) {
      const violation = await this.evaluateMonitoringRule(rule, metrics, accessEvents);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  private async evaluateMonitoringRule(
    rule: ComplianceMonitoringRule,
    metrics: PrivacyMetric[],
    accessEvents: DataAccessEvent[]
  ): Promise<ComplianceViolation | null> {
    const { condition } = rule;

    // Evaluate condition based on metric type
    let isViolation = false;
    let actualValue = 0;
    let description = '';

    switch (condition.metric) {
      case 'access_frequency':
        const recentAccess = accessEvents.filter(e => 
          Date.now() - e.timestamp < condition.timeWindow
        );
        actualValue = recentAccess.length;
        isViolation = this.evaluateCondition(actualValue, condition.operator, condition.threshold);
        description = `Access frequency threshold exceeded: ${actualValue} > ${condition.threshold}`;
        break;

      case 'data_age':
        // This would require access to data age information
        // For demo purposes, we'll simulate
        actualValue = Math.random() * 3000;
        isViolation = this.evaluateCondition(actualValue, condition.operator, condition.threshold);
        description = `Data retention policy violation: data age ${actualValue.toFixed(0)} days exceeds threshold`;
        break;
    }

    if (isViolation) {
      return {
        id: `violation-${Date.now()}-${rule.id}`,
        timestamp: Date.now(),
        severity: rule.severity,
        description,
        impact: `Potential compliance issue with ${rule.framework} - ${rule.name}`,
        remediation: `Review and address ${rule.name} according to ${rule.framework} requirements`,
        status: 'open'
      };
    }

    return null;
  }

  private evaluateCondition(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return actual > threshold;
      case 'gte': return actual >= threshold;
      case 'lt': return actual < threshold;
      case 'lte': return actual <= threshold;
      case 'eq': return actual === threshold;
      case 'ne': return actual !== threshold;
      default: return false;
    }
  }

  private generateRecommendations(assessment: ComplianceAssessment): ComplianceRecommendation[] {
    const recommendations: ComplianceRecommendation[] = [];

    for (const requirementStatus of assessment.requirements) {
      if (requirementStatus.status === 'non_compliant' || requirementStatus.status === 'partial') {
        for (const remediation of requirementStatus.remediation) {
          recommendations.push({
            id: `rec-${Date.now()}-${Math.random()}`,
            priority: requirementStatus.status === 'non_compliant' ? 'high' : 'medium',
            category: 'compliance',
            title: remediation,
            description: `Address compliance gap for requirement ${requirementStatus.requirementId}`,
            effort: 'medium',
            impact: 'high',
            dueDate: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
          });
        }
      }
    }

    return recommendations;
  }

  // Compliance status management
  public getComplianceStatus(framework?: string): ComplianceStatus[] {
    const statuses: ComplianceStatus[] = [];

    const frameworksToCheck = framework ? [framework] : Array.from(this.frameworks.keys());

    for (const fw of frameworksToCheck) {
      const assessments = this.assessments.get(fw) || [];
      const latestAssessment = assessments[assessments.length - 1];

      if (latestAssessment) {
        const frameworkDef = this.frameworks.get(fw)!;
        
        for (const requirement of frameworkDef.requirements) {
          const requirementStatus = latestAssessment.requirements.find(r => r.requirementId === requirement.id);
          
          if (requirementStatus) {
            statuses.push({
              id: `${fw}-${requirement.id}`,
              framework: fw as any,
              category: requirement.category,
              requirement: requirement.title,
              status: requirementStatus.status,
              score: requirementStatus.score,
              lastAssessed: latestAssessment.timestamp,
              nextAssessment: latestAssessment.nextAssessment,
              evidence: [],
              violations: [],
              owner: 'compliance-team'
            });
          }
        }
      }
    }

    return statuses;
  }

  public getComplianceTrends(framework: string, days: number = 30): Array<{
    date: number;
    score: number;
    violations: number;
  }> {
    const assessments = this.assessments.get(framework) || [];
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return assessments
      .filter(a => a.timestamp > cutoffDate)
      .map(a => ({
        date: a.timestamp,
        score: a.overallScore,
        violations: a.violations.length
      }))
      .sort((a, b) => a.date - b.date);
  }

  // Framework management
  public addFramework(framework: ComplianceFramework): void {
    this.frameworks.set(framework.name, framework);
  }

  public getFramework(name: string): ComplianceFramework | undefined {
    return this.frameworks.get(name);
  }

  public getAllFrameworks(): ComplianceFramework[] {
    return Array.from(this.frameworks.values());
  }

  // Monitoring rules management
  public addMonitoringRule(rule: ComplianceMonitoringRule): void {
    this.monitoringRules.push(rule);
  }

  public getMonitoringRules(): ComplianceMonitoringRule[] {
    return [...this.monitoringRules];
  }

  public updateMonitoringRule(ruleId: string, updates: Partial<ComplianceMonitoringRule>): void {
    const index = this.monitoringRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.monitoringRules[index] = { ...this.monitoringRules[index], ...updates };
    }
  }

  // Assessment management
  public getAssessments(framework: string): ComplianceAssessment[] {
    return this.assessments.get(framework) || [];
  }

  public getLatestAssessment(framework: string): ComplianceAssessment | undefined {
    const assessments = this.assessments.get(framework) || [];
    return assessments[assessments.length - 1];
  }

  // Compliance score calculation
  public calculateOverallComplianceScore(): number {
    const allFrameworks = Array.from(this.frameworks.keys());
    let totalScore = 0;
    let frameworkCount = 0;

    for (const framework of allFrameworks) {
      const latestAssessment = this.getLatestAssessment(framework);
      if (latestAssessment) {
        totalScore += latestAssessment.overallScore;
        frameworkCount++;
      }
    }

    return frameworkCount > 0 ? totalScore / frameworkCount : 0;
  }

  // Risk assessment
  public assessComplianceRisk(): {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: Array<{
      factor: string;
      level: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }>;
  } {
    const riskFactors: Array<{
      factor: string;
      level: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }> = [];

    const overallScore = this.calculateOverallComplianceScore();

    // Check for critical compliance issues
    for (const [framework, assessments] of this.assessments) {
      const latestAssessment = assessments[assessments.length - 1];
      if (latestAssessment) {
        const criticalViolations = latestAssessment.violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          riskFactors.push({
            factor: `${framework} Critical Violations`,
            level: 'critical',
            description: `${criticalViolations.length} critical violations found`
          });
        }

        const nonCompliantRequirements = latestAssessment.requirements.filter(r => r.status === 'non_compliant');
        if (nonCompliantRequirements.length > 0) {
          riskFactors.push({
            factor: `${framework} Non-Compliant Requirements`,
            level: 'high',
            description: `${nonCompliantRequirements.length} requirements are non-compliant`
          });
        }
      }
    }

    // Determine overall risk level
    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    if (riskFactors.some(f => f.level === 'critical')) {
      overallRisk = 'critical';
    } else if (riskFactors.some(f => f.level === 'high')) {
      overallRisk = 'high';
    } else if (overallScore < 70) {
      overallRisk = 'medium';
    } else if (overallScore < 50) {
      overallRisk = 'high';
    }

    return {
      overallRisk,
      riskFactors
    };
  }
}

interface ComplianceMonitoringRule {
  id: string;
  name: string;
  description: string;
  framework: string;
  requirementId: string;
  condition: {
    metric: string;
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
    threshold: number;
    timeWindow: number;
  };
  severity: ComplianceViolation['severity'];
  action: 'alert' | 'block' | 'log';
}

export default ComplianceMonitor;
