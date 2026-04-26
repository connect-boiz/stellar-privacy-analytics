import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface AnonymizationConfig {
  algorithm: 'k-anonymity' | 'l-diversity' | 't-closeness';
  k?: number; // For k-anonymity
  l?: number; // For l-diversity
  t?: number; // For t-closeness
  quasiIdentifiers: string[];
  sensitiveAttribute?: string;
  maxSuppressionRate?: number;
  utilityWeights?: {
    informationLoss: number;
    disclosureRisk: number;
    executionTime: number;
  };
}

export interface AnonymizationResult {
  anonymizedData: any[];
  metrics: AnonymizationMetrics;
  config: AnonymizationConfig;
  processingTime: number;
  suppressedRecords: number;
  equivalenceClasses: EquivalenceClass[];
}

export interface AnonymizationMetrics {
  kValue?: number;
  lValue?: number;
  tValue?: number;
  averageEquivalenceClassSize: number;
  informationLoss: number;
  disclosureRisk: number;
  privacyUtility: number;
  reidentificationRisk: number;
  anonymityLevel: number;
  dataUtilityScore: number;
}

export interface EquivalenceClass {
  records: any[];
  size: number;
  quasiIdentifierValues: Record<string, any>;
  sensitiveValues: any[];
  diversity: number;
  risk: number;
}

export interface PrivacyAudit {
  originalRisk: number;
  anonymizedRisk: number;
  riskReduction: number;
  complianceLevel: 'low' | 'medium' | 'high' | 'excellent';
  recommendations: string[];
}

export class DataAnonymizationService {
  private auditHistory: Map<string, PrivacyAudit[]> = new Map();

  constructor() {
    logger.info('Data Anonymization Service initialized');
  }

  // Main anonymization method
  async anonymizeDataset(
    data: any[],
    config: AnonymizationConfig
  ): Promise<AnonymizationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Starting anonymization with ${config.algorithm} algorithm`);

      let result: AnonymizationResult;

      switch (config.algorithm) {
        case 'k-anonymity':
          result = await this.applyKAnonymity(data, config);
          break;
        case 'l-diversity':
          result = await this.applyLDiversity(data, config);
          break;
        case 't-closeness':
          result = await this.applyTCloseness(data, config);
          break;
        default:
          throw new Error(`Unsupported anonymization algorithm: ${config.algorithm}`);
      }

      result.processingTime = Date.now() - startTime;
      result.config = config;

      logger.info(`Anonymization completed in ${result.processingTime}ms`);
      return result;

    } catch (error) {
      logger.error('Anonymization failed:', error);
      throw error;
    }
  }

  // K-Anonymity Implementation
  private async applyKAnonymity(
    data: any[],
    config: AnonymizationConfig
  ): Promise<AnonymizationResult> {
    const k = config.k || 5;
    const quasiIdentifiers = config.quasiIdentifiers;
    const maxSuppressionRate = config.maxSuppressionRate || 0.1;

    logger.info(`Applying k-anonymity with k=${k}`);

    // Group records by quasi-identifier values
    const equivalenceClasses = this.groupByQuasiIdentifiers(data, quasiIdentifiers);

    // Apply generalization and suppression
    const anonymizedClasses: EquivalenceClass[] = [];
    let suppressedRecords = 0;

    for (const [key, records] of equivalenceClasses) {
      if (records.length < k) {
        // Suppress small equivalence classes
        suppressedRecords += records.length;
        continue;
      }

      const anonymizedClass = await this.generalizeEquivalenceClass(
        records,
        quasiIdentifiers,
        config
      );
      anonymizedClasses.push(anonymizedClass);
    }

    // Flatten anonymized classes back to dataset
    const anonymizedData = anonymizedClasses.flatMap(cls => cls.records);

    // Calculate metrics
    const metrics = this.calculateKAnonymityMetrics(
      anonymizedClasses,
      k,
      data.length,
      suppressedRecords
    );

    return {
      anonymizedData,
      metrics,
      config,
      processingTime: 0, // Will be set by caller
      suppressedRecords,
      equivalenceClasses: anonymizedClasses
    };
  }

  // L-Diversity Implementation
  private async applyLDiversity(
    data: any[],
    config: AnonymizationConfig
  ): Promise<AnonymizationResult> {
    const k = config.k || 5;
    const l = config.l || 3;
    const quasiIdentifiers = config.quasiIdentifiers;
    const sensitiveAttribute = config.sensitiveAttribute!;

    logger.info(`Applying l-diversity with k=${k}, l=${l}`);

    // First apply k-anonymity
    const kAnonymityResult = await this.applyKAnonymity(data, config);

    // Then ensure l-diversity
    const lDiverseClasses: EquivalenceClass[] = [];
    let suppressedRecords = 0;

    for (const eqClass of kAnonymityResult.equivalenceClasses) {
      const sensitiveValues = eqClass.records.map(r => r[sensitiveAttribute]);
      const uniqueSensitiveValues = new Set(sensitiveValues);

      if (uniqueSensitiveValues.size < l) {
        // Need to further generalize or suppress
        if (eqClass.size >= k * 2) {
          // Try further generalization
          const generalizedClass = await this.furtherGeneralizeForLDiversity(
            eqClass,
            quasiIdentifiers,
            sensitiveAttribute,
            l
          );
          lDiverseClasses.push(generalizedClass);
        } else {
          // Suppress
          suppressedRecords += eqClass.size;
        }
      } else {
        lDiverseClasses.push({
          ...eqClass,
          diversity: uniqueSensitiveValues.size
        });
      }
    }

    // Flatten anonymized classes
    const anonymizedData = lDiverseClasses.flatMap(cls => cls.records);

    // Calculate metrics
    const metrics = this.calculateLDiversityMetrics(
      lDiverseClasses,
      k,
      l,
      data.length,
      suppressedRecords
    );

    return {
      anonymizedData,
      metrics,
      config,
      processingTime: 0,
      suppressedRecords,
      equivalenceClasses: lDiverseClasses
    };
  }

  // T-Closeness Implementation
  private async applyTCloseness(
    data: any[],
    config: AnonymizationConfig
  ): Promise<AnonymizationResult> {
    const k = config.k || 5;
    const t = config.t || 0.2;
    const quasiIdentifiers = config.quasiIdentifiers;
    const sensitiveAttribute = config.sensitiveAttribute!;

    logger.info(`Applying t-closeness with k=${k}, t=${t}`);

    // First apply k-anonymity
    const kAnonymityResult = await this.applyKAnonymity(data, config);

    // Calculate distribution of sensitive attribute in original data
    const originalDistribution = this.calculateSensitiveAttributeDistribution(
      data,
      sensitiveAttribute
    );

    // Ensure t-closeness for each equivalence class
    const tCloseClasses: EquivalenceClass[] = [];
    let suppressedRecords = 0;

    for (const eqClass of kAnonymityResult.equivalenceClasses) {
      const classDistribution = this.calculateSensitiveAttributeDistribution(
        eqClass.records,
        sensitiveAttribute
      );

      const distance = this.calculateDistributionDistance(
        originalDistribution,
        classDistribution
      );

      if (distance > t) {
        // Need to adjust the class to meet t-closeness
        const adjustedClass = await this.adjustForTCloseness(
          eqClass,
          originalDistribution,
          quasiIdentifiers,
          sensitiveAttribute,
          t
        );
        
        if (adjustedClass) {
          tCloseClasses.push(adjustedClass);
        } else {
          suppressedRecords += eqClass.size;
        }
      } else {
        tCloseClasses.push({
          ...eqClass,
          risk: distance
        });
      }
    }

    // Flatten anonymized classes
    const anonymizedData = tCloseClasses.flatMap(cls => cls.records);

    // Calculate metrics
    const metrics = this.calculateTClosenessMetrics(
      tCloseClasses,
      k,
      t,
      data.length,
      suppressedRecords
    );

    return {
      anonymizedData,
      metrics,
      config,
      processingTime: 0,
      suppressedRecords,
      equivalenceClasses: tCloseClasses
    };
  }

  // Helper methods
  private groupByQuasiIdentifiers(
    data: any[],
    quasiIdentifiers: string[]
  ): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const record of data) {
      const key = quasiIdentifiers
        .map(qi => `${qi}=${record[qi]}`)
        .join('|');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    return groups;
  }

  private async generalizeEquivalenceClass(
    records: any[],
    quasiIdentifiers: string[],
    config: AnonymizationConfig
  ): Promise<EquivalenceClass> {
    const generalizedRecords = [...records];
    const quasiIdentifierValues: Record<string, any> = {};

    // Apply generalization to each quasi-identifier
    for (const qi of quasiIdentifiers) {
      const values = records.map(r => r[qi]);
      const generalizedValue = this.generalizeValues(values, qi);
      quasiIdentifierValues[qi] = generalizedValue;

      // Update all records
      for (const record of generalizedRecords) {
        record[qi] = generalizedValue;
      }
    }

    const sensitiveValues = config.sensitiveAttribute 
      ? records.map(r => r[config.sensitiveAttribute])
      : [];

    return {
      records: generalizedRecords,
      size: records.length,
      quasiIdentifierValues,
      sensitiveValues,
      diversity: new Set(sensitiveValues).size,
      risk: this.calculateClassRisk(records.length, records.length)
    };
  }

  private generalizeValues(values: any[], attribute: string): any {
    const uniqueValues = new Set(values);
    
    if (uniqueValues.size === 1) {
      return values[0]; // Already uniform
    }

    // Check data type and apply appropriate generalization
    const sampleValue = values[0];
    
    if (typeof sampleValue === 'number') {
      const min = Math.min(...values);
      const max = Math.max(...values);
      return `[${min}-${max}]`;
    } else if (typeof sampleValue === 'string') {
      // For categorical data, find common prefix or use hierarchy
      return this.generalizeCategoricalValues(values);
    } else if (sampleValue instanceof Date) {
      const minDate = new Date(Math.min(...values.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...values.map(d => d.getTime())));
      return `${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`;
    }

    return '*'; // Default generalization
  }

  private generalizeCategoricalValues(values: string[]): string {
    // Find common prefix
    const sortedValues = [...values].sort();
    const first = sortedValues[0];
    const last = sortedValues[sortedValues.length - 1];
    
    let commonPrefix = '';
    for (let i = 0; i < Math.min(first.length, last.length); i++) {
      if (first[i] === last[i]) {
        commonPrefix += first[i];
      } else {
        break;
      }
    }

    if (commonPrefix.length > 1) {
      return commonPrefix + '*';
    }

    return '*'; // No common prefix, use wildcard
  }

  private async furtherGeneralizeForLDiversity(
    eqClass: EquivalenceClass,
    quasiIdentifiers: string[],
    sensitiveAttribute: string,
    l: number
  ): Promise<EquivalenceClass> {
    // Apply more aggressive generalization
    const generalizedRecords = [...eqClass.records];
    
    for (const qi of quasiIdentifiers) {
      const values = generalizedRecords.map(r => r[qi]);
      const generalizedValue = this.generalizeValues(values, qi);
      
      for (const record of generalizedRecords) {
        record[qi] = generalizedValue;
      }
    }

    return {
      ...eqClass,
      records: generalizedRecords,
      quasiIdentifierValues: Object.fromEntries(
        quasiIdentifiers.map(qi => [qi, generalizedRecords[0][qi]])
      )
    };
  }

  private async adjustForTCloseness(
    eqClass: EquivalenceClass,
    targetDistribution: Map<string, number>,
    quasiIdentifiers: string[],
    sensitiveAttribute: string,
    t: number
  ): Promise<EquivalenceClass | null> {
    // This is a simplified implementation
    // In practice, this would involve more sophisticated distribution matching
    
    const currentDistribution = this.calculateSensitiveAttributeDistribution(
      eqClass.records,
      sensitiveAttribute
    );

    const distance = this.calculateDistributionDistance(
      targetDistribution,
      currentDistribution
    );

    if (distance <= t) {
      return eqClass;
    }

    // Try more generalization
    return await this.furtherGeneralizeForLDiversity(
      eqClass,
      quasiIdentifiers,
      sensitiveAttribute,
      2 // Minimum l for diversity
    );
  }

  private calculateSensitiveAttributeDistribution(
    records: any[],
    sensitiveAttribute: string
  ): Map<string, number> {
    const distribution = new Map<string, number>();

    for (const record of records) {
      const value = record[sensitiveAttribute];
      distribution.set(value, (distribution.get(value) || 0) + 1);
    }

    return distribution;
  }

  private calculateDistributionDistance(
    dist1: Map<string, number>,
    dist2: Map<string, number>
  ): number {
    // Calculate Earth Mover's Distance (simplified)
    const total1 = Array.from(dist1.values()).reduce((sum, val) => sum + val, 0);
    const total2 = Array.from(dist2.values()).reduce((sum, val) => sum + val, 0);
    
    let distance = 0;
    const allValues = new Set([...dist1.keys(), ...dist2.keys()]);
    
    for (const value of allValues) {
      const freq1 = (dist1.get(value) || 0) / total1;
      const freq2 = (dist2.get(value) || 0) / total2;
      distance += Math.abs(freq1 - freq2);
    }

    return distance;
  }

  private calculateClassRisk(classSize: number, totalRecords: number): number {
    return 1 / classSize;
  }

  // Metrics calculation methods
  private calculateKAnonymityMetrics(
    equivalenceClasses: EquivalenceClass[],
    k: number,
    totalRecords: number,
    suppressedRecords: number
  ): AnonymizationMetrics {
    const avgClassSize = equivalenceClasses.reduce((sum, cls) => sum + cls.size, 0) / equivalenceClasses.length;
    const informationLoss = this.calculateInformationLoss(equivalenceClasses);
    const disclosureRisk = Math.max(...equivalenceClasses.map(cls => cls.risk));
    const reidentificationRisk = 1 / k;

    return {
      kValue: k,
      averageEquivalenceClassSize: avgClassSize,
      informationLoss,
      disclosureRisk,
      reidentificationRisk,
      privacyUtility: 1 - disclosureRisk,
      anonymityLevel: Math.min(1, avgClassSize / k),
      dataUtilityScore: 1 - informationLoss,
      lValue: undefined,
      tValue: undefined
    };
  }

  private calculateLDiversityMetrics(
    equivalenceClasses: EquivalenceClass[],
    k: number,
    l: number,
    totalRecords: number,
    suppressedRecords: number
  ): AnonymizationMetrics {
    const baseMetrics = this.calculateKAnonymityMetrics(equivalenceClasses, k, totalRecords, suppressedRecords);
    const avgDiversity = equivalenceClasses.reduce((sum, cls) => sum + cls.diversity, 0) / equivalenceClasses.length;

    return {
      ...baseMetrics,
      lValue: l,
      privacyUtility: baseMetrics.privacyUtility * (avgDiversity / l)
    };
  }

  private calculateTClosenessMetrics(
    equivalenceClasses: EquivalenceClass[],
    k: number,
    t: number,
    totalRecords: number,
    suppressedRecords: number
  ): AnonymizationMetrics {
    const baseMetrics = this.calculateKAnonymityMetrics(equivalenceClasses, k, totalRecords, suppressedRecords);
    const avgRisk = equivalenceClasses.reduce((sum, cls) => sum + cls.risk, 0) / equivalenceClasses.length;

    return {
      ...baseMetrics,
      tValue: t,
      privacyUtility: baseMetrics.privacyUtility * (1 - avgRisk)
    };
  }

  private calculateInformationLoss(equivalenceClasses: EquivalenceClass[]): number {
    // Simplified information loss calculation
    let totalLoss = 0;
    let totalRecords = 0;

    for (const eqClass of equivalenceClasses) {
      totalLoss += eqClass.size * this.calculateClassInformationLoss(eqClass);
      totalRecords += eqClass.size;
    }

    return totalLoss / totalRecords;
  }

  private calculateClassInformationLoss(eqClass: EquivalenceClass): number {
    // Calculate how much generalization was applied
    let loss = 0;
    const quasiIdentifiers = Object.keys(eqClass.quasiIdentifierValues);

    for (const qi of quasiIdentifiers) {
      const value = eqClass.quasiIdentifierValues[qi];
      if (typeof value === 'string' && value.includes('*')) {
        loss += 0.5; // Generalization loss
      } else if (typeof value === 'string' && value.includes('-')) {
        loss += 0.3; // Range generalization loss
      }
    }

    return loss / quasiIdentifiers.length;
  }

  // Privacy audit and risk assessment
  async assessPrivacyRisk(
    originalData: any[],
    anonymizedData: any[],
    quasiIdentifiers: string[]
  ): Promise<PrivacyAudit> {
    const originalRisk = this.calculateDatasetRisk(originalData, quasiIdentifiers);
    const anonymizedRisk = this.calculateDatasetRisk(anonymizedData, quasiIdentifiers);
    const riskReduction = (originalRisk - anonymizedRisk) / originalRisk;

    let complianceLevel: 'low' | 'medium' | 'high' | 'excellent';
    if (riskReduction >= 0.9) complianceLevel = 'excellent';
    else if (riskReduction >= 0.7) complianceLevel = 'high';
    else if (riskReduction >= 0.5) complianceLevel = 'medium';
    else complianceLevel = 'low';

    const recommendations = this.generatePrivacyRecommendations(
      originalRisk,
      anonymizedRisk,
      complianceLevel
    );

    return {
      originalRisk,
      anonymizedRisk,
      riskReduction,
      complianceLevel,
      recommendations
    };
  }

  private calculateDatasetRisk(data: any[], quasiIdentifiers: string[]): number {
    const groups = this.groupByQuasiIdentifiers(data, quasiIdentifiers);
    let totalRisk = 0;
    let totalRecords = 0;

    for (const records of groups.values()) {
      totalRisk += records.length * this.calculateClassRisk(records.length, data.length);
      totalRecords += records.length;
    }

    return totalRisk / totalRecords;
  }

  private generatePrivacyRecommendations(
    originalRisk: number,
    anonymizedRisk: number,
    complianceLevel: string
  ): string[] {
    const recommendations: string[] = [];

    if (anonymizedRisk > 0.1) {
      recommendations.push('Consider increasing k-value for better anonymity');
    }

    if (originalRisk - anonymizedRisk < 0.5) {
      recommendations.push('Additional generalization may improve privacy protection');
    }

    if (complianceLevel === 'low' || complianceLevel === 'medium') {
      recommendations.push('Review quasi-identifier selection for better privacy');
    }

    recommendations.push('Regular privacy audits recommended for continuous compliance');

    return recommendations;
  }

  // Batch processing for large datasets
  async processBatchAnonymization(
    data: any[],
    config: AnonymizationConfig,
    batchSize: number = 1000
  ): Promise<AnonymizationResult> {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }

    logger.info(`Processing ${batches.length} batches of size ${batchSize}`);

    const results: AnonymizationResult[] = [];
    let totalSuppressedRecords = 0;
    const allEquivalenceClasses: EquivalenceClass[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batchResult = await this.anonymizeDataset(batches[i], config);
      results.push(batchResult);
      totalSuppressedRecords += batchResult.suppressedRecords;
      allEquivalenceClasses.push(...batchResult.equivalenceClasses);

      // Emit progress event if needed
      if (i % 10 === 0) {
        logger.info(`Processed batch ${i + 1}/${batches.length}`);
      }
    }

    // Combine results
    const combinedData = results.flatMap(r => r.anonymizedData);
    const avgMetrics = this.combineMetrics(results.map(r => r.metrics));

    return {
      anonymizedData: combinedData,
      metrics: avgMetrics,
      config,
      processingTime: results.reduce((sum, r) => sum + r.processingTime, 0),
      suppressedRecords: totalSuppressedRecords,
      equivalenceClasses: allEquivalenceClasses
    };
  }

  private combineMetrics(metrics: AnonymizationMetrics[]): AnonymizationMetrics {
    const count = metrics.length;
    
    return {
      kValue: metrics[0]?.kValue,
      lValue: metrics[0]?.lValue,
      tValue: metrics[0]?.tValue,
      averageEquivalenceClassSize: metrics.reduce((sum, m) => sum + m.averageEquivalenceClassSize, 0) / count,
      informationLoss: metrics.reduce((sum, m) => sum + m.informationLoss, 0) / count,
      disclosureRisk: metrics.reduce((sum, m) => sum + m.disclosureRisk, 0) / count,
      privacyUtility: metrics.reduce((sum, m) => sum + m.privacyUtility, 0) / count,
      reidentificationRisk: metrics.reduce((sum, m) => sum + m.reidentificationRisk, 0) / count,
      anonymityLevel: metrics.reduce((sum, m) => sum + m.anonymityLevel, 0) / count,
      dataUtilityScore: metrics.reduce((sum, m) => sum + m.dataUtilityScore, 0) / count
    };
  }

  // Public API methods
  getAnonymizationHistory(datasetId?: string): PrivacyAudit[] {
    if (datasetId) {
      return this.auditHistory.get(datasetId) || [];
    }
    
    return Array.from(this.auditHistory.values()).flat();
  }

  async generateAnonymizationReport(
    datasetId: string,
    originalData: any[],
    anonymizedData: any[],
    config: AnonymizationConfig
  ): Promise<any> {
    const audit = await this.assessPrivacyRisk(
      originalData,
      anonymizedData,
      config.quasiIdentifiers
    );

    // Store audit
    if (!this.auditHistory.has(datasetId)) {
      this.auditHistory.set(datasetId, []);
    }
    const auditList = this.auditHistory.get(datasetId);
    if (auditList) {
      auditList.push(audit);
    }

    return {
      datasetId,
      timestamp: new Date(),
      config,
      audit,
      summary: {
        recordsProcessed: originalData.length,
        algorithm: config.algorithm,
        complianceLevel: audit.complianceLevel,
        riskReduction: audit.riskReduction,
        recommendations: audit.recommendations.length
      }
    };
  }

  // Utility optimization
  async optimizePrivacyUtility(
    data: any[],
    quasiIdentifiers: string[],
    sensitiveAttribute: string,
    targetUtility: number = 0.8
  ): Promise<AnonymizationConfig> {
    logger.info('Optimizing privacy-utility trade-off');

    // Test different parameter combinations
    const testConfigs: AnonymizationConfig[] = [
      { algorithm: 'k-anonymity', k: 3, quasiIdentifiers },
      { algorithm: 'k-anonymity', k: 5, quasiIdentifiers },
      { algorithm: 'k-anonymity', k: 10, quasiIdentifiers },
      { algorithm: 'l-diversity', k: 5, l: 2, quasiIdentifiers, sensitiveAttribute },
      { algorithm: 'l-diversity', k: 5, l: 3, quasiIdentifiers, sensitiveAttribute },
      { algorithm: 'l-diversity', k: 5, l: 5, quasiIdentifiers, sensitiveAttribute }
    ];

    let bestConfig = testConfigs[0];
    let bestScore = 0;

    for (const config of testConfigs) {
      const result = await this.anonymizeDataset(data, config);
      const score = this.calculateUtilityScore(result.metrics, targetUtility);
      
      if (score > bestScore) {
        bestScore = score;
        bestConfig = config;
      }
    }

    logger.info(`Optimal configuration found: ${JSON.stringify(bestConfig)}`);
    return bestConfig;
  }

  private calculateUtilityScore(metrics: AnonymizationMetrics, targetUtility: number): number {
    const utilityDiff = Math.abs(metrics.dataUtilityScore - targetUtility);
    const privacyScore = metrics.privacyUtility;
    
    // Weighted score favoring both utility and privacy
    return privacyScore * (1 - utilityDiff);
  }
}
