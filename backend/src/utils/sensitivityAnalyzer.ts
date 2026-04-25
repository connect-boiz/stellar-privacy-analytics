import {
  SensitivityAnalysisResult,
  DPAggregationType,
  PrivacyMode
} from '@stellar/shared';

interface ParsedQuery {
  type: 'SELECT';
  aggregations: AggregationInfo[];
  groupBy?: string[];
  where?: string;
  from: string;
}

interface AggregationInfo {
  type: DPAggregationType;
  column: string;
  alias?: string;
}

export class SensitivityAnalyzer {
  private defaultColumnBounds: Map<string, { min: number; max: number }>;

  constructor(columnBounds?: Map<string, { min: number; max: number }>) {
    this.defaultColumnBounds = columnBounds || new Map();
  }

  analyzeQuery(query: string, mode: PrivacyMode = PrivacyMode.STRICT): SensitivityAnalysisResult {
    const parsedQuery = this.parseQuery(query);

    if (!parsedQuery.aggregations.length) {
      throw new Error('Query must contain at least one aggregation function for differential privacy');
    }

    const globalSensitivity = this.calculateGlobalSensitivity(parsedQuery, mode);
    const groupBySensitivities = this.calculateGroupBySensitivities(parsedQuery, mode);

    return {
      globalSensitivity,
      groupBySensitivities,
      aggregationType: parsedQuery.aggregations[0]?.type || DPAggregationType.COUNT,
      affectedColumns: parsedQuery.aggregations.map(agg => agg.column)
    };
  }

  private parseQuery(query: string): ParsedQuery {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim().toUpperCase();

    const selectMatch = normalizedQuery.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)/i);
    if (!selectMatch) {
      throw new Error('Invalid SELECT query format');
    }

    const [, selectPart, fromTable] = selectMatch;
    const aggregations = this.extractAggregations(selectPart);

    const groupByMatch = normalizedQuery.match(/GROUP BY\s+(.*?)$/i);
    const groupBy = groupByMatch ? groupByMatch[1].split(',').map(col => col.trim()) : undefined;

    const whereMatch = normalizedQuery.match(/WHERE\s+(.*?)(?:\s+GROUP\s+BY|$)/i);
    const where = whereMatch ? whereMatch[1] : undefined;

    return {
      type: 'SELECT',
      aggregations,
      groupBy,
      where,
      from: fromTable
    };
  }

  private extractAggregations(selectPart: string): AggregationInfo[] {
    const aggregations: AggregationInfo[] = [];
    const parts = selectPart.split(',').map(part => part.trim());

    for (const part of parts) {
      const aggMatch = part.match(/(COUNT|SUM|AVG|AVERAGE|MIN|MAX|VARIANCE)\s*\(\s*(.*?)\s*\)(?:\s+AS\s+(\w+))?/i);

      if (aggMatch) {
        const [, aggType, column, alias] = aggMatch;
        const normalizedType = this.normalizeAggregationType(aggType.toUpperCase());

        aggregations.push({
          type: normalizedType,
          column: column === '*' ? '*' : column.replace(/['"]/g, ''),
          alias
        });
      }
    }

    return aggregations;
  }

  private normalizeAggregationType(type: string): DPAggregationType {
    switch (type) {
      case 'COUNT': return DPAggregationType.COUNT;
      case 'SUM': return DPAggregationType.SUM;
      case 'AVG':
      case 'AVERAGE': return DPAggregationType.AVERAGE;
      case 'MIN': return DPAggregationType.MIN;
      case 'MAX': return DPAggregationType.MAX;
      case 'VARIANCE': return DPAggregationType.VARIANCE;
      default: throw new Error(`Unsupported aggregation type: ${type}`);
    }
  }

  private calculateGlobalSensitivity(parsedQuery: ParsedQuery, mode: PrivacyMode): number {
    if (parsedQuery.groupBy && parsedQuery.groupBy.length > 0) {
      return this.calculateGroupByGlobalSensitivity(parsedQuery, mode);
    }

    const sensitivities = parsedQuery.aggregations.map(agg =>
      this.calculateAggregationSensitivity(agg, mode)
    );

    return Math.max(...sensitivities);
  }

  private calculateGroupByGlobalSensitivity(parsedQuery: ParsedQuery, mode: PrivacyMode): number {
    const groupSensitivities = Array.from(this.calculateGroupBySensitivities(parsedQuery, mode).values());
    return Math.max(...groupSensitivities);
  }

  private calculateGroupBySensitivities(parsedQuery: ParsedQuery, mode: PrivacyMode): Map<string, number> {
    const sensitivities = new Map<string, number>();

    if (!parsedQuery.groupBy || parsedQuery.groupBy.length === 0) {
      return sensitivities;
    }

    const groupByColumns = parsedQuery.groupBy;

    for (const agg of parsedQuery.aggregations) {
      const sensitivity = this.calculateAggregationSensitivity(agg, mode);
      const groupKey = `${agg.type}_${agg.column}`;
      sensitivities.set(groupKey, sensitivity);
    }

    return sensitivities;
  }

  private calculateAggregationSensitivity(agg: AggregationInfo, mode: PrivacyMode): number {
    switch (agg.type) {
      case DPAggregationType.COUNT:
        return this.calculateCountSensitivity(mode);

      case DPAggregationType.SUM:
        return this.calculateSumSensitivity(agg.column, mode);

      case DPAggregationType.AVERAGE:
        return this.calculateAverageSensitivity(agg.column, mode);

      case DPAggregationType.MIN:
      case DPAggregationType.MAX:
        return this.calculateMinMaxSensitivity(agg.column, mode);

      case DPAggregationType.VARIANCE:
        return this.calculateVarianceSensitivity(agg.column, mode);

      default:
        throw new Error(`Unsupported aggregation type for sensitivity calculation: ${agg.type}`);
    }
  }

  private calculateCountSensitivity(mode: PrivacyMode): number {
    return mode === PrivacyMode.STRICT ? 1 : 0.5;
  }

  private calculateSumSensitivity(column: string, mode: PrivacyMode): number {
    if (column === '*') {
      throw new Error('SUM(*) is not supported for differential privacy');
    }

    const bounds = this.defaultColumnBounds.get(column);
    if (!bounds) {
      console.warn(`No bounds specified for column ${column}, using default sensitivity`);
      return mode === PrivacyMode.STRICT ? 1000 : 500;
    }

    const range = bounds.max - bounds.min;
    return mode === PrivacyMode.STRICT ? range : range * 0.5;
  }

  private calculateAverageSensitivity(column: string, mode: PrivacyMode): number {
    const sumSensitivity = this.calculateSumSensitivity(column, mode);
    const countSensitivity = this.calculateCountSensitivity(mode);

    return sumSensitivity + countSensitivity;
  }

  private calculateMinMaxSensitivity(column: string, mode: PrivacyMode): number {
    const bounds = this.defaultColumnBounds.get(column);
    if (!bounds) {
      console.warn(`No bounds specified for column ${column}, using default sensitivity`);
      return mode === PrivacyMode.STRICT ? 1000 : 500;
    }

    const range = bounds.max - bounds.min;
    return mode === PrivacyMode.STRICT ? range : range * 0.5;
  }

  private calculateVarianceSensitivity(column: string, mode: PrivacyMode): number {
    const bounds = this.defaultColumnBounds.get(column);
    if (!bounds) {
      console.warn(`No bounds specified for column ${column}, using default sensitivity`);
      return mode === PrivacyMode.STRICT ? 1000000 : 500000;
    }

    const range = bounds.max - bounds.min;
    const maxDeviation = Math.max(Math.abs(bounds.min), Math.abs(bounds.max));
    const varianceSensitivity = 4 * maxDeviation * range;

    return mode === PrivacyMode.STRICT ? varianceSensitivity : varianceSensitivity * 0.5;
  }

  setColumnBounds(column: string, min: number, max: number): void {
    this.defaultColumnBounds.set(column, { min, max });
  }

  getColumnBounds(column: string): { min: number; max: number } | undefined {
    return this.defaultColumnBounds.get(column);
  }

  updateColumnBounds(bounds: Map<string, { min: number; max: number }>): void {
    for (const [column, bound] of bounds) {
      this.defaultColumnBounds.set(column, bound);
    }
  }

  validateQueryForDP(query: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parsed = this.parseQuery(query);

      if (parsed.aggregations.length === 0) {
        errors.push('Query must contain at least one aggregation function');
      }

      for (const agg of parsed.aggregations) {
        if (agg.type === DPAggregationType.SUM && agg.column === '*') {
          errors.push('SUM(*) is not supported for differential privacy');
        }
      }

      if (parsed.aggregations.length > 5) {
        errors.push('Too many aggregations. Maximum 5 aggregations allowed per query');
      }

    } catch (error) {
      errors.push(`Invalid query syntax: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
