import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';
import { auditService } from './auditService';

export interface DataWorkflow {
  id: string;
  name: string;
  description: string;
  dataTypes: string[];
  processingSteps: ProcessingStep[];
  retentionPeriod: number;
  dataSubjects: string[];
  purposes: string[];
  legalBasis: string;
  crossBorderTransfer: boolean;
  encryptionLevel: 'none' | 'basic' | 'standard' | 'advanced';
  anonymizationTechniques: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessingStep {
  id: string;
  name: string;
  type: 'collection' | 'storage' | 'processing' | 'sharing' | 'deletion';
  description: string;
  dataAccess: string[];
  thirdParties: string[];
  securityMeasures: string[];
  retentionTime: number;
}

export interface RiskFactor {
  category: 'data_sensitivity' | 'processing_scope' | 'security_measures' | 'compliance' | 'third_party_risk';
  weight: number;
  score: number;
  description: string;
  mitigations: string[];
}

export interface RiskAssessment {
  id: string;
  workflowId: string;
  overallScore: number;
  category: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  mitigationStrategies: MitigationStrategy[];
  assessedAt: Date;
  assessorId: string;
  complianceFrameworks: ComplianceFramework[];
  recommendations: string[];
  historicalTrend?: RiskTrend[];
}

export interface MitigationStrategy {
  id: string;
  riskFactor: string;
  strategy: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  effort: 'low' | 'medium' | 'high';
  impact: number;
  description: string;
  implementation: string[];
}

export interface ComplianceFramework {
  name: string;
  version: string;
  requirements: ComplianceRequirement[];
  complianceScore: number;
  gaps: string[];
}

export interface ComplianceRequirement {
  article: string;
  description: string;
  mandatory: boolean;
  satisfied: boolean;
  riskImpact: number;
}

export interface RiskTrend {
  date: Date;
  score: number;
  category: string;
  changes: string[];
}

export interface RiskAssessmentCriteria {
  dataSensitivityWeights: Record<string, number>;
  processingWeights: Record<string, number>;
  securityWeights: Record<string, number>;
  complianceWeights: Record<string, number>;
  customFactors: CustomRiskFactor[];
}

export interface CustomRiskFactor {
  id: string;
  name: string;
  description: string;
  weight: number;
  evaluationFunction: string;
  category: string;
}

export class PrivacyRiskAssessmentService {
  private dbService: DatabaseService;
  private criteria: RiskAssessmentCriteria;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
    this.criteria = this.initializeDefaultCriteria();
  }

  private initializeDefaultCriteria(): RiskAssessmentCriteria {
    return {
      dataSensitivityWeights: {
        'personal_identifiable_info': 0.9,
        'special_category_data': 1.0,
        'financial_data': 0.8,
        'health_data': 0.95,
        'biometric_data': 1.0,
        'location_data': 0.7,
        'communication_data': 0.6,
        'behavioral_data': 0.5,
        'technical_data': 0.3,
        'anonymous_data': 0.1
      },
      processingWeights: {
        'collection': 0.6,
        'storage': 0.4,
        'processing': 0.8,
        'sharing': 0.9,
        'cross_border_transfer': 1.0,
        'automated_decision_making': 0.85,
        'profiling': 0.8
      },
      securityWeights: {
        'encryption': -0.3,
        'pseudonymization': -0.2,
        'access_controls': -0.25,
        'audit_logging': -0.15,
        'data_minimization': -0.2,
        'privacy_by_design': -0.3
      },
      complianceWeights: {
        'gdpr': 0.8,
        'ccpa': 0.7,
        'hipaa': 0.9,
        'pci_dss': 0.6,
        'sox': 0.5
      },
      customFactors: []
    };
  }

  async assessWorkflowRisk(workflow: DataWorkflow, assessorId: string): Promise<RiskAssessment> {
    try {
      logger.info(`Starting risk assessment for workflow: ${workflow.id}`);

      const riskFactors = await this.evaluateRiskFactors(workflow);
      const overallScore = this.calculateOverallScore(riskFactors);
      const category = this.categorizeRisk(overallScore);
      const mitigationStrategies = await this.generateMitigationStrategies(riskFactors);
      const complianceFrameworks = await this.evaluateCompliance(workflow);
      const recommendations = this.generateRecommendations(riskFactors, mitigationStrategies);
      const historicalTrend = await this.getHistoricalTrend(workflow.id);

      const assessment: RiskAssessment = {
        id: `ra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workflowId: workflow.id,
        overallScore,
        category,
        riskFactors,
        mitigationStrategies,
        assessedAt: new Date(),
        assessorId,
        complianceFrameworks,
        recommendations,
        historicalTrend
      };

      // Save assessment to database
      await this.saveAssessment(assessment);

      // Log assessment for audit
      await auditService.logEvent({
        eventType: 'RISK_ASSESSMENT_COMPLETED',
        userId: assessorId,
        resourceId: workflow.id,
        details: {
          assessmentId: assessment.id,
          overallScore,
          category,
          riskFactorsCount: riskFactors.length
        }
      });

      logger.info(`Risk assessment completed for workflow ${workflow.id}: ${category} risk (${overallScore})`);
      return assessment;

    } catch (error) {
      logger.error(`Error assessing workflow risk for ${workflow.id}:`, error);
      throw new Error(`Risk assessment failed: ${error.message}`);
    }
  }

  private async evaluateRiskFactors(workflow: DataWorkflow): Promise<RiskFactor[]> {
    const riskFactors: RiskFactor[] = [];

    // Data Sensitivity Analysis
    const sensitivityRisk = this.evaluateDataSensitivity(workflow.dataTypes);
    riskFactors.push(sensitivityRisk);

    // Processing Scope Analysis
    const processingRisk = this.evaluateProcessingScope(workflow.processingSteps);
    riskFactors.push(processingRisk);

    // Security Measures Analysis
    const securityRisk = this.evaluateSecurityMeasures(workflow);
    riskFactors.push(securityRisk);

    // Compliance Analysis
    const complianceRisk = this.evaluateComplianceRisk(workflow);
    riskFactors.push(complianceRisk);

    // Third Party Risk Analysis
    const thirdPartyRisk = this.evaluateThirdPartyRisk(workflow.processingSteps);
    riskFactors.push(thirdPartyRisk);

    // Custom Risk Factors
    for (const customFactor of this.criteria.customFactors) {
      const customRisk = await this.evaluateCustomFactor(workflow, customFactor);
      if (customRisk) {
        riskFactors.push(customRisk);
      }
    }

    return riskFactors;
  }

  private evaluateDataSensitivity(dataTypes: string[]): RiskFactor {
    let maxScore = 0;
    let sensitiveTypes: string[] = [];

    for (const dataType of dataTypes) {
      const score = this.criteria.dataSensitivityWeights[dataType] || 0.5;
      if (score > maxScore) {
        maxScore = score;
      }
      if (score > 0.7) {
        sensitiveTypes.push(dataType);
      }
    }

    const mitigations = [
      'Implement data minimization principles',
      'Apply strong pseudonymization or anonymization',
      'Enhanced consent mechanisms',
      'Strict access controls'
    ];

    return {
      category: 'data_sensitivity',
      weight: 0.3,
      score: maxScore,
      description: `Data sensitivity assessment based on data types: ${sensitiveTypes.join(', ')}`,
      mitigations
    };
  }

  private evaluateProcessingScope(processingSteps: ProcessingStep[]): RiskFactor {
    let totalRisk = 0;
    let highRiskActivities: string[] = [];

    for (const step of processingSteps) {
      const stepRisk = this.criteria.processingWeights[step.type] || 0.5;
      totalRisk = Math.max(totalRisk, stepRisk);

      if (stepRisk > 0.8) {
        highRiskActivities.push(step.name);
      }

      // Additional risk for cross-border transfers
      if (step.type === 'sharing' && step.thirdParties.some(p => p.includes('international'))) {
        totalRisk = Math.max(totalRisk, 0.9);
      }
    }

    const mitigations = [
      'Limit processing to necessary activities only',
      'Implement privacy by design principles',
      'Enhanced transparency for data subjects',
      'Regular impact assessments for high-risk activities'
    ];

    return {
      category: 'processing_scope',
      weight: 0.25,
      score: totalRisk,
      description: `Processing scope risk from activities: ${highRiskActivities.join(', ')}`,
      mitigations
    };
  }

  private evaluateSecurityMeasures(workflow: DataWorkflow): RiskFactor {
    let securityScore = 0.5; // Base risk

    // Encryption level assessment
    const encryptionScores = {
      'none': 0,
      'basic': -0.1,
      'standard': -0.2,
      'advanced': -0.3
    };
    securityScore += encryptionScores[workflow.encryptionLevel] || 0;

    // Anonymization techniques
    if (workflow.anonymizationTechniques.length > 0) {
      securityScore -= 0.1 * Math.min(workflow.anonymizationTechniques.length, 3);
    }

    // Evaluate security measures in processing steps
    const securityMeasures = new Set<string>();
    workflow.processingSteps.forEach(step => {
      step.securityMeasures.forEach(measure => securityMeasures.add(measure));
    });

    for (const measure of securityMeasures) {
      const reduction = this.criteria.securityWeights[measure];
      if (reduction) {
        securityScore += reduction;
      }
    }

    // Ensure score doesn't go below 0
    securityScore = Math.max(0, securityScore);

    const mitigations = [
      'Implement end-to-end encryption',
      'Add comprehensive pseudonymization',
      'Enhance access control mechanisms',
      'Implement regular security audits'
    ];

    return {
      category: 'security_measures',
      weight: 0.2,
      score: securityScore,
      description: `Security assessment based on encryption level: ${workflow.encryptionLevel}, measures: ${Array.from(securityMeasures).join(', ')}`,
      mitigations
    };
  }

  private evaluateComplianceRisk(workflow: DataWorkflow): RiskFactor {
    let complianceScore = 0.3; // Base compliance risk
    const gaps: string[] = [];

    // GDPR compliance checks
    if (!workflow.legalBasis) {
      complianceScore += 0.3;
      gaps.push('Missing legal basis for processing');
    }

    if (workflow.crossBorderTransfer && !workflow.dataSubjects.includes('eu_data_subjects')) {
      complianceScore += 0.2;
      gaps.push('Cross-border transfer without adequate safeguards');
    }

    if (workflow.retentionPeriod > 365) {
      complianceScore += 0.15;
      gaps.push('Excessive data retention period');
    }

    // Data subject rights
    if (!workflow.purposes.some(p => p.includes('consent'))) {
      complianceScore += 0.1;
      gaps.push('Lack of explicit consent mechanisms');
    }

    const mitigations = [
      'Establish clear legal basis for all processing',
      'Implement data subject rights mechanisms',
      'Review and update retention policies',
      'Ensure adequate safeguards for international transfers'
    ];

    return {
      category: 'compliance',
      weight: 0.15,
      score: Math.min(1.0, complianceScore),
      description: `Compliance gaps identified: ${gaps.join(', ')}`,
      mitigations
    };
  }

  private evaluateThirdPartyRisk(processingSteps: ProcessingStep[]): RiskFactor {
    let thirdPartyRisk = 0;
    const thirdParties = new Set<string>();

    processingSteps.forEach(step => {
      step.thirdParties.forEach(party => thirdParties.add(party));
    });

    // Risk increases with number of third parties
    thirdPartyRisk = Math.min(0.8, thirdParties.length * 0.15);

    // Higher risk for certain types of third parties
    const highRiskThirdParties = ['analytics', 'advertising', 'data_broker', 'international'];
    const hasHighRiskThirdParty = Array.from(thirdParties).some(party =>
      highRiskThirdParties.some(risk => party.toLowerCase().includes(risk))
    );

    if (hasHighRiskThirdParty) {
      thirdPartyRisk = Math.min(1.0, thirdPartyRisk + 0.3);
    }

    const mitigations = [
      'Conduct thorough third-party due diligence',
      'Implement data processing agreements',
      'Regular third-party audits',
      'Limit third-party data sharing'
    ];

    return {
      category: 'third_party_risk',
      weight: 0.1,
      score: thirdPartyRisk,
      description: `Third-party risk from ${thirdParties.size} third parties: ${Array.from(thirdParties).join(', ')}`,
      mitigations
    };
  }

  private async evaluateCustomFactor(workflow: DataWorkflow, customFactor: CustomRiskFactor): Promise<RiskFactor | null> {
    try {
      // This would evaluate custom risk factors based on user-defined functions
      // For now, return a placeholder implementation
      return {
        category: 'custom',
        weight: customFactor.weight,
        score: 0.5,
        description: `Custom factor: ${customFactor.name}`,
        mitigations: []
      };
    } catch (error) {
      logger.error(`Error evaluating custom factor ${customFactor.id}:`, error);
      return null;
    }
  }

  private calculateOverallScore(riskFactors: RiskFactor[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of riskFactors) {
      totalScore += factor.score * factor.weight;
      totalWeight += factor.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private categorizeRisk(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score <= 0.3) return 'low';
    if (score <= 0.5) return 'medium';
    if (score <= 0.7) return 'high';
    return 'critical';
  }

  private async generateMitigationStrategies(riskFactors: RiskFactor[]): Promise<MitigationStrategy[]> {
    const strategies: MitigationStrategy[] = [];

    for (const factor of riskFactors) {
      for (const mitigation of factor.mitigations) {
        const strategy: MitigationStrategy = {
          id: `ms_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          riskFactor: factor.category,
          strategy: mitigation,
          priority: this.determinePriority(factor.score),
          effort: this.estimateEffort(mitigation),
          impact: this.calculateImpact(factor.score, factor.weight),
          description: `Mitigation for ${factor.category}: ${mitigation}`,
          implementation: this.getImplementationSteps(mitigation)
        };
        strategies.push(strategy);
      }
    }

    return strategies.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private determinePriority(score: number): 'low' | 'medium' | 'high' | 'urgent' {
    if (score >= 0.8) return 'urgent';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  private estimateEffort(mitigation: string): 'low' | 'medium' | 'high' {
    const highEffortKeywords = ['implement', 'develop', 'architecture', 'comprehensive'];
    const lowEffortKeywords = ['review', 'update', 'document', 'configure'];

    if (highEffortKeywords.some(keyword => mitigation.toLowerCase().includes(keyword))) {
      return 'high';
    }
    if (lowEffortKeywords.some(keyword => mitigation.toLowerCase().includes(keyword))) {
      return 'low';
    }
    return 'medium';
  }

  private calculateImpact(score: number, weight: number): number {
    return Math.round((score * weight) * 100);
  }

  private getImplementationSteps(mitigation: string): string[] {
    // This would contain detailed implementation steps for each mitigation
    return [
      'Conduct impact assessment',
      'Develop implementation plan',
      'Allocate resources',
      'Implement changes',
      'Monitor effectiveness'
    ];
  }

  private async evaluateCompliance(workflow: DataWorkflow): Promise<ComplianceFramework[]> {
    const frameworks: ComplianceFramework[] = [];

    // GDPR Evaluation
    const gdprFramework = await this.evaluateGDPRCompliance(workflow);
    frameworks.push(gdprFramework);

    // CCPA Evaluation (if applicable)
    if (workflow.dataSubjects.includes('california_residents')) {
      const ccpaFramework = await this.evaluateCCPACompliance(workflow);
      frameworks.push(ccpaFramework);
    }

    return frameworks;
  }

  private async evaluateGDPRCompliance(workflow: DataWorkflow): Promise<ComplianceFramework> {
    const requirements: ComplianceRequirement[] = [
      {
        article: 'Article 6 - Lawfulness of processing',
        description: 'Legal basis for processing',
        mandatory: true,
        satisfied: !!workflow.legalBasis,
        riskImpact: 0.8
      },
      {
        article: 'Article 7 - Conditions for consent',
        description: 'Valid consent mechanisms',
        mandatory: true,
        satisfied: workflow.purposes.some(p => p.includes('consent')),
        riskImpact: 0.7
      },
      {
        article: 'Article 25 - Data protection by design',
        description: 'Privacy by design principles',
        mandatory: true,
        satisfied: workflow.encryptionLevel !== 'none',
        riskImpact: 0.6
      }
    ];

    const satisfiedCount = requirements.filter(r => r.satisfied).length;
    const complianceScore = satisfiedCount / requirements.length;

    const gaps = requirements
      .filter(r => !r.satisfied && r.mandatory)
      .map(r => r.article);

    return {
      name: 'GDPR',
      version: '2018',
      requirements,
      complianceScore,
      gaps
    };
  }

  private async evaluateCCPACompliance(workflow: DataWorkflow): Promise<ComplianceFramework> {
    const requirements: ComplianceRequirement[] = [
      {
        article: 'Section 1798.120 - Right to Opt-Out',
        description: 'Consumer opt-out mechanisms',
        mandatory: true,
        satisfied: workflow.purposes.some(p => p.includes('opt-out')),
        riskImpact: 0.7
      },
      {
        article: 'Section 1798.100 - Right to Know',
        description: 'Transparency about data collection',
        mandatory: true,
        satisfied: workflow.description.length > 100,
        riskImpact: 0.6
      }
    ];

    const satisfiedCount = requirements.filter(r => r.satisfied).length;
    const complianceScore = satisfiedCount / requirements.length;

    const gaps = requirements
      .filter(r => !r.satisfied && r.mandatory)
      .map(r => r.article);

    return {
      name: 'CCPA',
      version: '2020',
      requirements,
      complianceScore,
      gaps
    };
  }

  private generateRecommendations(riskFactors: RiskFactor[], mitigationStrategies: MitigationStrategy[]): string[] {
    const recommendations: string[] = [];

    // High-level recommendations based on risk factors
    const highRiskFactors = riskFactors.filter(f => f.score > 0.7);
    if (highRiskFactors.length > 0) {
      recommendations.push('Immediate attention required for high-risk factors');
    }

    // Prioritized mitigation strategies
    const urgentStrategies = mitigationStrategies.filter(s => s.priority === 'urgent');
    if (urgentStrategies.length > 0) {
      recommendations.push(`Implement ${urgentStrategies.length} urgent mitigation strategies immediately`);
    }

    // Compliance recommendations
    const complianceRisks = riskFactors.filter(f => f.category === 'compliance' && f.score > 0.5);
    if (complianceRisks.length > 0) {
      recommendations.push('Address compliance gaps to avoid regulatory penalties');
    }

    // Security recommendations
    const securityRisks = riskFactors.filter(f => f.category === 'security_measures' && f.score > 0.6);
    if (securityRisks.length > 0) {
      recommendations.push('Enhance security measures to protect data privacy');
    }

    return recommendations;
  }

  private async getHistoricalTrend(workflowId: string): Promise<RiskTrend[]> {
    try {
      // Query historical assessments from database
      const historicalData = await this.dbService.query(`
        SELECT assessed_at, overall_score, category 
        FROM risk_assessments 
        WHERE workflow_id = $1 
        ORDER BY assessed_at DESC 
        LIMIT 10
      `, [workflowId]);

      return historicalData.map(row => ({
        date: new Date(row.assessed_at),
        score: row.overall_score,
        category: row.category,
        changes: [] // Would need to track changes between assessments
      }));
    } catch (error) {
      logger.error(`Error fetching historical trend for workflow ${workflowId}:`, error);
      return [];
    }
  }

  private async saveAssessment(assessment: RiskAssessment): Promise<void> {
    try {
      await this.dbService.query(`
        INSERT INTO risk_assessments (
          id, workflow_id, overall_score, category, risk_factors,
          mitigation_strategies, assessed_at, assessor_id,
          compliance_frameworks, recommendations, historical_trend
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        assessment.id,
        assessment.workflowId,
        assessment.overallScore,
        assessment.category,
        JSON.stringify(assessment.riskFactors),
        JSON.stringify(assessment.mitigationStrategies),
        assessment.assessedAt,
        assessment.assessorId,
        JSON.stringify(assessment.complianceFrameworks),
        JSON.stringify(assessment.recommendations),
        JSON.stringify(assessment.historicalTrend || [])
      ]);
    } catch (error) {
      logger.error(`Error saving assessment ${assessment.id}:`, error);
      throw error;
    }
  }

  async getAssessmentHistory(workflowId: string, limit: number = 10): Promise<RiskAssessment[]> {
    try {
      const result = await this.dbService.query(`
        SELECT * FROM risk_assessments 
        WHERE workflow_id = $1 
        ORDER BY assessed_at DESC 
        LIMIT $2
      `, [workflowId, limit]);

      return result.rows.map(row => ({
        id: row.id,
        workflowId: row.workflow_id,
        overallScore: row.overall_score,
        category: row.category,
        riskFactors: JSON.parse(row.risk_factors),
        mitigationStrategies: JSON.parse(row.mitigation_strategies),
        assessedAt: new Date(row.assessed_at),
        assessorId: row.assessor_id,
        complianceFrameworks: JSON.parse(row.compliance_frameworks),
        recommendations: JSON.parse(row.recommendations),
        historicalTrend: JSON.parse(row.historical_trend)
      }));
    } catch (error) {
      logger.error(`Error fetching assessment history for workflow ${workflowId}:`, error);
      return [];
    }
  }

  async updateAssessmentCriteria(criteria: Partial<RiskAssessmentCriteria>): Promise<void> {
    try {
      this.criteria = { ...this.criteria, ...criteria };
      
      // Save updated criteria to database
      await this.dbService.query(`
        INSERT INTO assessment_criteria (criteria_data, updated_at) 
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET 
          criteria_data = $1, 
          updated_at = $2
      `, [JSON.stringify(this.criteria), new Date()]);

      logger.info('Assessment criteria updated successfully');
    } catch (error) {
      logger.error('Error updating assessment criteria:', error);
      throw error;
    }
  }

  async generateRiskHeatMap(organizationId?: string): Promise<any> {
    try {
      let query = `
        SELECT w.id, w.name, ra.overall_score, ra.category, ra.assessed_at
        FROM workflows w
        LEFT JOIN risk_assessments ra ON w.id = ra.workflow_id
      `;
      const params: any[] = [];

      if (organizationId) {
        query += ' WHERE w.organization_id = $1';
        params.push(organizationId);
      }

      query += ' ORDER BY ra.assessed_at DESC';

      const result = await this.dbService.query(query, params);

      // Group by risk category for heat map visualization
      const heatMapData = {
        low: { count: 0, workflows: [] },
        medium: { count: 0, workflows: [] },
        high: { count: 0, workflows: [] },
        critical: { count: 0, workflows: [] }
      };

      result.rows.forEach(row => {
        const category = row.category || 'medium';
        heatMapData[category].count++;
        heatMapData[category].workflows.push({
          id: row.id,
          name: row.name,
          score: row.overall_score,
          assessedAt: row.assessed_at
        });
      });

      return heatMapData;
    } catch (error) {
      logger.error('Error generating risk heat map:', error);
      throw error;
    }
  }
}
