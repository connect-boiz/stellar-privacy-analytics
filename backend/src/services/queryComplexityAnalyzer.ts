import { logger } from '../utils/logger';
import { PQLParseNode } from './pqlValidator';

export interface ComplexityMetrics {
  score: number; // 1-100 complexity score
  estimatedTime: number; // Estimated execution time in milliseconds
  estimatedCost: number; // Estimated computational cost units
  operations: {
    scans: number;
    joins: number;
    aggregations: number;
    filters: number;
    sorts: number;
    subqueries: number;
  };
  memoryUsage: number; // Estimated memory usage in MB
  privacyCost: {
    epsilon: number;
    delta: number;
  };
}

export interface ComplexityThresholds {
  maxScore: number;
  maxEstimatedTime: number; // milliseconds
  maxEstimatedCost: number;
  maxMemoryUsage: number; // MB
  maxJoins: number;
  maxSubqueries: number;
}

export interface ComplexityAnalysis {
  metrics: ComplexityMetrics;
  canExecute: boolean;
  reason?: string;
  recommendations: string[];
  warnings: string[];
}

export class QueryComplexityAnalyzer {
  private thresholds: ComplexityThresholds;
  private tableSizes: Map<string, number>; // Estimated row counts
  private columnCardinality: Map<string, number>; // Estimated distinct values

  constructor(config: {
    thresholds?: Partial<ComplexityThresholds>;
    tableSizes?: Map<string, number>;
    columnCardinality?: Map<string, number>;
  } = {}) {
    this.thresholds = {
      maxScore: 75,
      maxEstimatedTime: 30000, // 30 seconds
      maxEstimatedCost: 1000,
      maxMemoryUsage: 512, // 512 MB
      maxJoins: 5,
      maxSubqueries: 3,
      ...config.thresholds
    };

    this.tableSizes = config.tableSizes || new Map();
    this.columnCardinality = config.columnCardinality || new Map();
  }

  /**
   * Analyze query complexity
   */
  async analyze(parseTree: PQLParseNode, privacyBudget?: { epsilon: number; delta: number }): Promise<ComplexityAnalysis> {
    try {
      const metrics = this.calculateMetrics(parseTree, privacyBudget);
      const canExecute = this.canExecuteQuery(metrics);
      const reason = canExecute ? undefined : this.getRejectionReason(metrics);
      const recommendations = this.generateRecommendations(metrics);
      const warnings = this.generateWarnings(metrics);

      return {
        metrics,
        canExecute,
        reason,
        recommendations,
        warnings
      };
    } catch (error) {
      logger.error('Query complexity analysis failed', {
        error: error.message
      });

      return {
        metrics: this.getDefaultMetrics(),
        canExecute: false,
        reason: 'Complexity analysis failed',
        recommendations: ['Simplify the query and try again'],
        warnings: ['Unable to accurately assess query complexity']
      };
    }
  }

  /**
   * Calculate complexity metrics
   */
  private calculateMetrics(parseTree: PQLParseNode, privacyBudget?: { epsilon: number; delta: number }): ComplexityMetrics {
    const operations = this.countOperations(parseTree);
    const estimatedTime = this.estimateExecutionTime(parseTree, operations);
    const estimatedCost = this.estimateComputationalCost(parseTree, operations);
    const memoryUsage = this.estimateMemoryUsage(parseTree, operations);
    const score = this.calculateComplexityScore(operations, estimatedTime, estimatedCost, memoryUsage);
    const privacyCost = this.calculatePrivacyCost(operations, privacyBudget);

    return {
      score,
      estimatedTime,
      estimatedCost,
      operations,
      memoryUsage,
      privacyCost
    };
  }

  /**
   * Count different types of operations
   */
  private countOperations(parseTree: PQLParseNode): ComplexityMetrics['operations'] {
    const operations = {
      scans: 0,
      joins: 0,
      aggregations: 0,
      filters: 0,
      sorts: 0,
      subqueries: 0
    };

    this.traverseParseTree(parseTree, (node) => {
      switch (node.type) {
        case 'FROM':
          operations.scans += node.children?.length || 0;
          break;
        case 'JOIN':
          operations.joins++;
          break;
        case 'WHERE':
          operations.filters += this.countFilterConditions(node);
          break;
        case 'GROUP_BY':
          operations.aggregations += this.countAggregations(node);
          break;
        case 'ORDER_BY':
          operations.sorts++;
          break;
        case 'SUBQUERY':
          operations.subqueries++;
          break;
      }
    });

    return operations;
  }

  /**
   * Estimate execution time based on operations
   */
  private estimateExecutionTime(parseTree: PQLParseNode, operations: ComplexityMetrics['operations']): number {
    let baseTime = 100; // Base 100ms

    // Table scan time (based on estimated table sizes)
    const tables = this.extractTables(parseTree);
    for (const table of tables) {
      const tableSize = this.tableSizes.get(table) || 10000; // Default 10K rows
      baseTime += Math.log(tableSize) * 10; // Logarithmic scaling
    }

    // Join time
    baseTime += operations.joins * 500; // 500ms per join

    // Aggregation time
    baseTime += operations.aggregations * 200; // 200ms per aggregation

    // Filter time
    baseTime += operations.filters * 50; // 50ms per filter condition

    // Sort time
    baseTime += operations.sorts * 300; // 300ms per sort

    // Subquery time
    baseTime += operations.subqueries * 1000; // 1s per subquery

    return Math.round(baseTime);
  }

  /**
   * Estimate computational cost
   */
  private estimateComputationalCost(parseTree: PQLParseNode, operations: ComplexityMetrics['operations']): number {
    let cost = 0;

    // Base cost per operation type
    cost += operations.scans * 10;
    cost += operations.joins * 50;
    cost += operations.aggregations * 30;
    cost += operations.filters * 5;
    cost += operations.sorts * 40;
    cost += operations.subqueries * 100;

    // Additional cost based on table sizes
    const tables = this.extractTables(parseTree);
    for (const table of tables) {
      const tableSize = this.tableSizes.get(table) || 10000;
      cost += Math.sqrt(tableSize) * 0.1;
    }

    return Math.round(cost);
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(parseTree: PQLParseNode, operations: ComplexityMetrics['operations']): number {
    let memory = 50; // Base 50MB

    // Memory for joins
    memory += operations.joins * 100; // 100MB per join

    // Memory for aggregations
    memory += operations.aggregations * 50; // 50MB per aggregation

    // Memory for sorts
    memory += operations.sorts * 80; // 80MB per sort

    // Memory for subqueries
    memory += operations.subqueries * 200; // 200MB per subquery

    // Memory based on table sizes
    const tables = this.extractTables(parseTree);
    for (const table of tables) {
      const tableSize = this.tableSizes.get(table) || 10000;
      memory += (tableSize / 1000) * 0.1; // Scale with table size
    }

    return Math.round(memory);
  }

  /**
   * Calculate overall complexity score (1-100)
   */
  private calculateComplexityScore(
    operations: ComplexityMetrics['operations'],
    estimatedTime: number,
    estimatedCost: number,
    memoryUsage: number
  ): number {
    let score = 0;

    // Score based on operation counts
    score += Math.min(operations.scans * 5, 20);
    score += Math.min(operations.joins * 10, 30);
    score += Math.min(operations.aggregations * 5, 15);
    score += Math.min(operations.filters * 2, 10);
    score += Math.min(operations.sorts * 8, 20);
    score += Math.min(operations.subqueries * 15, 25);

    // Adjust based on estimated time
    if (estimatedTime > 10000) score += 20;
    else if (estimatedTime > 5000) score += 10;
    else if (estimatedTime > 2000) score += 5;

    // Adjust based on memory usage
    if (memoryUsage > 256) score += 15;
    else if (memoryUsage > 128) score += 8;
    else if (memoryUsage > 64) score += 4;

    // Adjust based on computational cost
    if (estimatedCost > 500) score += 15;
    else if (estimatedCost > 200) score += 8;
    else if (estimatedCost > 100) score += 4;

    return Math.min(score, 100);
  }

  /**
   * Calculate privacy cost
   */
  private calculatePrivacyCost(
    operations: ComplexityMetrics['operations'],
    privacyBudget?: { epsilon: number; delta: number }
  ): ComplexityMetrics['privacyCost'] {
    const baseEpsilon = privacyBudget?.epsilon || 0.1;
    const baseDelta = privacyBudget?.delta || 1e-6;

    // Adjust privacy cost based on operations
    let epsilonMultiplier = 1;
    let deltaMultiplier = 1;

    // More aggregations require more privacy budget
    epsilonMultiplier += operations.aggregations * 0.1;

    // More complex operations require more privacy budget
    epsilonMultiplier += operations.joins * 0.05;
    epsilonMultiplier += operations.subqueries * 0.1;

    return {
      epsilon: baseEpsilon * epsilonMultiplier,
      delta: baseDelta * deltaMultiplier
    };
  }

  /**
   * Check if query can be executed based on thresholds
   */
  private canExecuteQuery(metrics: ComplexityMetrics): boolean {
    return (
      metrics.score <= this.thresholds.maxScore &&
      metrics.estimatedTime <= this.thresholds.maxEstimatedTime &&
      metrics.estimatedCost <= this.thresholds.maxEstimatedCost &&
      metrics.memoryUsage <= this.thresholds.maxMemoryUsage &&
      metrics.operations.joins <= this.thresholds.maxJoins &&
      metrics.operations.subqueries <= this.thresholds.maxSubqueries
    );
  }

  /**
   * Get reason for rejection
   */
  private getRejectionReason(metrics: ComplexityMetrics): string {
    const reasons: string[] = [];

    if (metrics.score > this.thresholds.maxScore) {
      reasons.push(`Complexity score ${metrics.score} exceeds threshold ${this.thresholds.maxScore}`);
    }
    if (metrics.estimatedTime > this.thresholds.maxEstimatedTime) {
      reasons.push(`Estimated time ${metrics.estimatedTime}ms exceeds threshold ${this.thresholds.maxEstimatedTime}ms`);
    }
    if (metrics.estimatedCost > this.thresholds.maxEstimatedCost) {
      reasons.push(`Estimated cost ${metrics.estimatedCost} exceeds threshold ${this.thresholds.maxEstimatedCost}`);
    }
    if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      reasons.push(`Memory usage ${metrics.memoryUsage}MB exceeds threshold ${this.thresholds.maxMemoryUsage}MB`);
    }
    if (metrics.operations.joins > this.thresholds.maxJoins) {
      reasons.push(`Number of joins ${metrics.operations.joins} exceeds threshold ${this.thresholds.maxJoins}`);
    }
    if (metrics.operations.subqueries > this.thresholds.maxSubqueries) {
      reasons.push(`Number of subqueries ${metrics.operations.subqueries} exceeds threshold ${this.thresholds.maxSubqueries}`);
    }

    return reasons.join('; ');
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: ComplexityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.operations.joins > 2) {
      recommendations.push('Consider reducing the number of joins or using subqueries');
    }

    if (metrics.operations.aggregations > 3) {
      recommendations.push('Consider breaking complex aggregations into multiple queries');
    }

    if (metrics.operations.filters > 5) {
      recommendations.push('Consider combining filter conditions or adding indexes');
    }

    if (metrics.memoryUsage > 256) {
      recommendations.push('Consider reducing result set size with LIMIT clause');
    }

    if (metrics.estimatedTime > 10000) {
      recommendations.push('Consider adding more specific WHERE conditions to reduce processing time');
    }

    if (metrics.operations.sorts > 1) {
      recommendations.push('Consider minimizing sorting operations or using indexed columns');
    }

    if (metrics.operations.subqueries > 1) {
      recommendations.push('Consider replacing subqueries with JOINs where possible');
    }

    return recommendations;
  }

  /**
   * Generate warnings
   */
  private generateWarnings(metrics: ComplexityMetrics): string[] {
    const warnings: string[] = [];

    if (metrics.score > 50) {
      warnings.push('Query has high complexity and may impact system performance');
    }

    if (metrics.estimatedTime > 5000) {
      warnings.push('Query may take longer than 5 seconds to execute');
    }

    if (metrics.memoryUsage > 128) {
      warnings.push('Query may use significant memory resources');
    }

    if (metrics.operations.joins > 3) {
      warnings.push('Multiple joins may reduce query performance');
    }

    if (metrics.privacyCost.epsilon > 0.5) {
      warnings.push('Query requires significant privacy budget');
    }

    return warnings;
  }

  // Helper methods
  private traverseParseTree(node: PQLParseNode, callback: (node: PQLParseNode) => void): void {
    callback(node);
    
    if (node.children) {
      for (const child of node.children) {
        this.traverseParseTree(child, callback);
      }
    }
  }

  private countFilterConditions(whereNode: PQLParseNode): number {
    let count = 0;
    
    if (whereNode.children) {
      for (const child of whereNode.children) {
        if (child.type === 'IDENTIFIER' && child.value) {
          const value = child.value.toUpperCase();
          if (['AND', 'OR'].includes(value)) {
            count++;
          }
        }
      }
    }
    
    return Math.max(1, count); // At least one condition
  }

  private countAggregations(node: PQLParseNode): number {
    let count = 0;
    
    if (node.children) {
      for (const child of node.children) {
        if (child.value?.includes('(')) {
          count++;
        }
        count += this.countAggregations(child);
      }
    }
    
    return count;
  }

  private extractTables(parseTree: PQLParseNode): string[] {
    const tables: string[] = [];
    
    this.traverseParseTree(parseTree, (node) => {
      if (node.type === 'FROM' || node.type === 'JOIN') {
        if (node.children) {
          for (const child of node.children) {
            if (child.type === 'IDENTIFIER' && child.value) {
              const table = child.value.split('.')[0];
              if (!tables.includes(table)) {
                tables.push(table);
              }
            }
          }
        }
      }
    });
    
    return tables;
  }

  private getDefaultMetrics(): ComplexityMetrics {
    return {
      score: 100,
      estimatedTime: 60000,
      estimatedCost: 2000,
      operations: {
        scans: 0,
        joins: 0,
        aggregations: 0,
        filters: 0,
        sorts: 0,
        subqueries: 0
      },
      memoryUsage: 1024,
      privacyCost: {
        epsilon: 1.0,
        delta: 1e-3
      }
    };
  }

  /**
   * Update table size estimates
   */
  updateTableSize(table: string, rowCount: number): void {
    this.tableSizes.set(table, rowCount);
  }

  /**
   * Update column cardinality estimates
   */
  updateColumnCardinality(column: string, cardinality: number): void {
    this.columnCardinality.set(column, cardinality);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): ComplexityThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds: Partial<ComplexityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Complexity thresholds updated', this.thresholds);
  }

  /**
   * Get table size estimates
   */
  getTableSizes(): Map<string, number> {
    return new Map(this.tableSizes);
  }

  /**
   * Get column cardinality estimates
   */
  getColumnCardinality(): Map<string, number> {
    return new Map(this.columnCardinality);
  }
}

export default QueryComplexityAnalyzer;
