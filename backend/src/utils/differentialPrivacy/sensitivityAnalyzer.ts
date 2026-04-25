import { QuerySensitivity, InvalidQueryException } from './types';

export interface ParsedQuery {
  type: 'SELECT' | 'COUNT' | 'SUM' | 'AVERAGE' | 'MAX' | 'MIN';
  columns: string[];
  table: string;
  groupBy: string[];
  whereClause?: string;
  aggregateColumn?: string;
}

export class SensitivityAnalyzer {
  private static readonly DEFAULT_SENSITIVITIES = {
    count: 1,
    sum: 1,
    average: 1,
    max: 1,
    min: 1
  };

  public analyzeQuery(query: string, maxDataValue?: number): QuerySensitivity {
    const parsed = this.parseQuery(query);
    
    switch (parsed.type) {
      case 'COUNT':
        return {
          sensitivity: this.DEFAULT_SENSITIVITIES.count,
          type: 'count',
          groupBy: parsed.groupBy.length > 0 ? parsed.groupBy : undefined
        };
      
      case 'SUM':
        if (!parsed.aggregateColumn) {
          throw new InvalidQueryException('SUM query must specify column', query);
        }
        return {
          sensitivity: maxDataValue || this.DEFAULT_SENSITIVITIES.sum,
          type: 'sum',
          groupBy: parsed.groupBy.length > 0 ? parsed.groupBy : undefined
        };
      
      case 'AVERAGE':
        if (!parsed.aggregateColumn) {
          throw new InvalidQueryException('AVERAGE query must specify column', query);
        }
        return {
          sensitivity: (maxDataValue || this.DEFAULT_SENSITIVITIES.average) / 2,
          type: 'average',
          groupBy: parsed.groupBy.length > 0 ? parsed.groupBy : undefined
        };
      
      case 'MAX':
        if (!parsed.aggregateColumn) {
          throw new InvalidQueryException('MAX query must specify column', query);
        }
        return {
          sensitivity: maxDataValue || this.DEFAULT_SENSITIVITIES.max,
          type: 'max',
          groupBy: parsed.groupBy.length > 0 ? parsed.groupBy : undefined
        };
      
      case 'MIN':
        if (!parsed.aggregateColumn) {
          throw new InvalidQueryException('MIN query must specify column', query);
        }
        return {
          sensitivity: maxDataValue || this.DEFAULT_SENSITIVITIES.min,
          type: 'min',
          groupBy: parsed.groupBy.length > 0 ? parsed.groupBy : undefined
        };
      
      default:
        throw new InvalidQueryException(`Unsupported query type: ${parsed.type}`, query);
    }
  }

  private parseQuery(query: string): ParsedQuery {
    const normalizedQuery = query.trim().toLowerCase();
    
    const countMatch = normalizedQuery.match(/select\s+count\(\*?\)\s+from\s+(\w+)/i);
    if (countMatch) {
      return {
        type: 'COUNT',
        columns: ['*'],
        table: countMatch[1],
        groupBy: this.extractGroupBy(normalizedQuery)
      };
    }

    const sumMatch = normalizedQuery.match(/select\s+sum\((\w+)\)\s+from\s+(\w+)/i);
    if (sumMatch) {
      return {
        type: 'SUM',
        columns: [sumMatch[1]],
        table: sumMatch[2],
        groupBy: this.extractGroupBy(normalizedQuery),
        aggregateColumn: sumMatch[1]
      };
    }

    const avgMatch = normalizedQuery.match(/select\s+avg\((\w+)\)\s+from\s+(\w+)/i);
    if (avgMatch) {
      return {
        type: 'AVERAGE',
        columns: [avgMatch[1]],
        table: avgMatch[2],
        groupBy: this.extractGroupBy(normalizedQuery),
        aggregateColumn: avgMatch[1]
      };
    }

    const maxMatch = normalizedQuery.match(/select\s+max\((\w+)\)\s+from\s+(\w+)/i);
    if (maxMatch) {
      return {
        type: 'MAX',
        columns: [maxMatch[1]],
        table: maxMatch[2],
        groupBy: this.extractGroupBy(normalizedQuery),
        aggregateColumn: maxMatch[1]
      };
    }

    const minMatch = normalizedQuery.match(/select\s+min\((\w+)\)\s+from\s+(\w+)/i);
    if (minMatch) {
      return {
        type: 'MIN',
        columns: [minMatch[1]],
        table: minMatch[2],
        groupBy: this.extractGroupBy(normalizedQuery),
        aggregateColumn: minMatch[1]
      };
    }

    const selectMatch = normalizedQuery.match(/select\s+(.+?)\s+from\s+(\w+)/i);
    if (selectMatch) {
      return {
        type: 'SELECT',
        columns: selectMatch[1].split(',').map(col => col.trim()),
        table: selectMatch[2],
        groupBy: this.extractGroupBy(normalizedQuery)
      };
    }

    throw new InvalidQueryException('Unable to parse query', query);
  }

  private extractGroupBy(query: string): string[] {
    const groupByMatch = query.match(/group\s+by\s+(.+?)(?:\s+order\s+by|\s+limit|\s*$)/i);
    if (!groupByMatch) {
      return [];
    }

    return groupByMatch[1].split(',').map(col => col.trim());
  }

  public calculateEpsilonCost(
    sensitivity: QuerySensitivity, 
    numGroups: number = 1,
    targetEpsilon: number = 1.0
  ): number {
    const baseCost = targetEpsilon / numGroups;
    
    if (sensitivity.type === 'average') {
      return baseCost * 2;
    }
    
    return baseCost;
  }

  public validateQuery(query: string): boolean {
    try {
      this.parseQuery(query);
      return true;
    } catch (error) {
      return false;
    }
  }

  public estimateQueryComplexity(query: string): number {
    const parsed = this.parseQuery(query);
    
    let complexity = 1;
    
    if (parsed.groupBy.length > 0) {
      complexity *= parsed.groupBy.length;
    }
    
    if (parsed.whereClause) {
      complexity *= 1.5;
    }
    
    switch (parsed.type) {
      case 'AVERAGE':
        complexity *= 1.2;
        break;
      case 'SUM':
        complexity *= 1.1;
        break;
      case 'COUNT':
        complexity *= 1.0;
        break;
      case 'MAX':
      case 'MIN':
        complexity *= 1.3;
        break;
    }
    
    return complexity;
  }
}
