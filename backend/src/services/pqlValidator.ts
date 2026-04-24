import { logger } from '../utils/logger';

export interface PQLValidationError {
  code: string;
  message: string;
  location?: {
    line: number;
    column: number;
    token: string;
  };
  severity: 'error' | 'warning';
}

export interface PQLValidationResult {
  valid: boolean;
  errors: PQLValidationError[];
  warnings: PQLValidationError[];
  normalizedQuery?: string;
  metadata?: {
    queryType: string;
    tables: string[];
    columns: string[];
    functions: string[];
  };
}

export interface PQLParseNode {
  type: string;
  value?: string;
  children?: PQLParseNode[];
  position?: {
    line: number;
    column: number;
  };
}

export class PQLValidator {
  private allowedFunctions: Set<string>;
  private allowedAggregations: Set<string>;
  private reservedKeywords: Set<string>;
  private maxQueryLength: number;
  private maxJoins: number;
  private maxSubqueries: number;

  constructor(config: {
    maxQueryLength?: number;
    maxJoins?: number;
    maxSubqueries?: number;
    customFunctions?: string[];
  } = {}) {
    this.maxQueryLength = config.maxQueryLength || 10000;
    this.maxJoins = config.maxJoins || 5;
    this.maxSubqueries = config.maxSubqueries || 3;

    // Initialize allowed functions
    this.allowedFunctions = new Set([
      // Mathematical functions
      'ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'POWER', 'LOG', 'EXP',
      // String functions
      'CONCAT', 'SUBSTRING', 'LENGTH', 'UPPER', 'LOWER', 'TRIM',
      // Date functions
      'DATE', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
      // Statistical functions (differential privacy safe)
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VAR'
    ]);

    this.allowedAggregations = new Set([
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VAR'
    ]);

    this.reservedKeywords = new Set([
      'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT',
      'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'AS',
      'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
      'DISTINCT', 'ALL', 'ANY', 'SOME', 'UNION', 'INTERSECT', 'EXCEPT'
    ]);

    // Add custom functions
    if (config.customFunctions) {
      config.customFunctions.forEach(func => this.allowedFunctions.add(func));
    }
  }

  /**
   * Validate a PQL query
   */
  async validate(query: string): Promise<PQLValidationResult> {
    const errors: PQLValidationError[] = [];
    const warnings: PQLValidationError[] = [];

    try {
      // Basic validation checks
      this.validateBasicStructure(query, errors, warnings);
      
      if (errors.length > 0) {
        return { valid: false, errors, warnings };
      }

      // Parse the query
      const parseTree = this.parseQuery(query);
      
      // Semantic validation
      this.validateSemantics(parseTree, errors, warnings);
      
      // Security validation
      this.validateSecurity(parseTree, errors, warnings);
      
      // Privacy validation
      this.validatePrivacy(parseTree, errors, warnings);

      // Extract metadata
      const metadata = this.extractMetadata(parseTree);

      // Normalize query
      const normalizedQuery = this.normalizeQuery(parseTree);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalizedQuery,
        metadata
      };

    } catch (error) {
      logger.error('PQL validation error', {
        error: error.message,
        query: query.substring(0, 100)
      });

      errors.push({
        code: 'VALIDATION_ERROR',
        message: 'Query validation failed',
        severity: 'error'
      });

      return { valid: false, errors, warnings };
    }
  }

  /**
   * Basic structural validation
   */
  private validateBasicStructure(query: string, errors: PQLValidationError[], warnings: PQLValidationError[]): void {
    // Check query length
    if (query.length > this.maxQueryLength) {
      errors.push({
        code: 'QUERY_TOO_LONG',
        message: `Query exceeds maximum length of ${this.maxQueryLength} characters`,
        severity: 'error'
      });
    }

    // Check for basic SQL structure
    const trimmedQuery = query.trim();
    
    if (!trimmedQuery.toUpperCase().startsWith('SELECT')) {
      errors.push({
        code: 'INVALID_QUERY_TYPE',
        message: 'Query must start with SELECT',
        severity: 'error'
      });
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /DELETE\s+FROM/i,
      /UPDATE\s+.*\s+SET/i,
      /INSERT\s+INTO/i,
      /CREATE\s+TABLE/i,
      /ALTER\s+TABLE/i,
      /TRUNCATE\s+TABLE/i,
      /EXECUTE\s*\(/i,
      /UNION\s+ALL\s+SELECT/i,
      /--/,
      /\/\*/,
      /\*\//
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        errors.push({
          code: 'DANGEROUS_PATTERN',
          message: 'Query contains potentially dangerous pattern',
          severity: 'error'
        });
        break;
      }
    }

    // Check for unbalanced parentheses
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    
    if (openParens !== closeParens) {
      errors.push({
        code: 'UNBALANCED_PARENTHESES',
        message: 'Query has unbalanced parentheses',
        severity: 'error'
      });
    }

    // Check for unbalanced quotes
    const singleQuotes = (query.match(/'/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      errors.push({
        code: 'UNBALANCED_QUOTES',
        message: 'Query has unbalanced single quotes',
        severity: 'error'
      });
    }
  }

  /**
   * Simple PQL parser (basic implementation)
   */
  private parseQuery(query: string): PQLParseNode {
    // This is a simplified parser - in production, you'd use a proper SQL parser
    // For now, we'll do basic tokenization and structure analysis
    
    const tokens = this.tokenize(query);
    return this.buildParseTree(tokens);
  }

  /**
   * Tokenize the query
   */
  private tokenize(query: string): string[] {
    const tokenPattern = /(\bSELECT\b|\bFROM\b|\bWHERE\b|\bGROUP\b|\bBY\b|\bHAVING\b|\bORDER\b|\bLIMIT\b|\bJOIN\b|\bON\b|\bAND\b|\bOR\b|\bNOT\b|\bIN\b|\bEXISTS\b|\bBETWEEN\b|\bLIKE\b|\bIS\b|\bNULL\b|\bDISTINCT\b|\bAS\b|\bCOUNT\b|\bSUM\b|\bAVG\b|\bMIN\b|\bMAX\b|\bSTDDEV\b|\bVAR\b|\bABS\b|\bCEIL\b|\bFLOOR\b|\bROUND\b|\bSQRT\b|\bPOWER\b|\bLOG\b|\bEXP\b|\bCONCAT\b|\bSUBSTRING\b|\bLENGTH\b|\bUPPER\b|\bLOWER\b|\bTRIM\b|\bDATE\b|\bYEAR\b|\bMONTH\b|\bDAY\b|\bHOUR\b|\bMINUTE\b|\bSECOND\b|[a-zA-Z_][a-zA-Z0-9_]*\b|\d+\.?\d*|\S)/gi;
    
    return query.match(tokenPattern) || [];
  }

  /**
   * Build parse tree from tokens
   */
  private buildParseTree(tokens: string[]): PQLParseNode {
    // Simplified parse tree construction
    const root: PQLParseNode = {
      type: 'QUERY',
      children: []
    };

    let currentSection: PQLParseNode | null = null;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i].toUpperCase();

      if (token === 'SELECT') {
        currentSection = {
          type: 'SELECT',
          children: []
        };
        root.children!.push(currentSection);
      } else if (token === 'FROM') {
        currentSection = {
          type: 'FROM',
          children: []
        };
        root.children!.push(currentSection);
      } else if (token === 'WHERE') {
        currentSection = {
          type: 'WHERE',
          children: []
        };
        root.children!.push(currentSection);
      } else if (token === 'GROUP' && i + 1 < tokens.length && tokens[i + 1].toUpperCase() === 'BY') {
        currentSection = {
          type: 'GROUP_BY',
          children: []
        };
        root.children!.push(currentSection);
        i++; // Skip 'BY'
      } else if (token === 'HAVING') {
        currentSection = {
          type: 'HAVING',
          children: []
        };
        root.children!.push(currentSection);
      } else if (token === 'ORDER' && i + 1 < tokens.length && tokens[i + 1].toUpperCase() === 'BY') {
        currentSection = {
          type: 'ORDER_BY',
          children: []
        };
        root.children!.push(currentSection);
        i++; // Skip 'BY'
      } else if (token === 'LIMIT') {
        currentSection = {
          type: 'LIMIT',
          children: []
        };
        root.children!.push(currentSection);
      } else if (token === 'JOIN') {
        currentSection = {
          type: 'JOIN',
          children: []
        };
        root.children!.push(currentSection);
      } else if (currentSection && token !== ',' && token !== '(' && token !== ')') {
        currentSection.children!.push({
          type: 'IDENTIFIER',
          value: tokens[i]
        });
      }

      i++;
    }

    return root;
  }

  /**
   * Validate query semantics
   */
  private validateSemantics(parseTree: PQLParseNode, errors: PQLValidationError[], warnings: PQLValidationError[]): void {
    if (!parseTree.children) return;

    // Check for required SELECT clause
    const selectClause = parseTree.children.find(child => child.type === 'SELECT');
    if (!selectClause || !selectClause.children || selectClause.children.length === 0) {
      errors.push({
        code: 'MISSING_SELECT_COLUMNS',
        message: 'SELECT clause must specify at least one column',
        severity: 'error'
      });
    }

    // Check for required FROM clause
    const fromClause = parseTree.children.find(child => child.type === 'FROM');
    if (!fromClause || !fromClause.children || fromClause.children.length === 0) {
      errors.push({
        code: 'MISSING_FROM_CLAUSE',
        message: 'Query must include a FROM clause',
        severity: 'error'
      });
    }

    // Validate JOIN usage
    const joinClauses = parseTree.children.filter(child => child.type === 'JOIN');
    if (joinClauses.length > this.maxJoins) {
      errors.push({
        code: 'TOO_MANY_JOINS',
        message: `Query exceeds maximum allowed joins (${this.maxJoins})`,
        severity: 'error'
      });
    }

    // Validate GROUP BY usage
    const groupByClause = parseTree.children.find(child => child.type === 'GROUP_BY');
    const havingClause = parseTree.children.find(child => child.type === 'HAVING');
    
    if (havingClause && !groupByClause) {
      errors.push({
        code: 'HAVING_WITHOUT_GROUP_BY',
        message: 'HAVING clause requires GROUP BY clause',
        severity: 'error'
      });
    }

    // Validate aggregation functions
    if (selectClause) {
      const aggregations = this.findAggregations(selectClause);
      const nonAggregatedColumns = this.findNonAggregatedColumns(selectClause);
      
      if (aggregations.length > 0 && nonAggregatedColumns.length > 0 && !groupByClause) {
        warnings.push({
          code: 'MIXED_AGGREGATION',
          message: 'Query mixes aggregated and non-aggregated columns without GROUP BY',
          severity: 'warning'
        });
      }
    }
  }

  /**
   * Validate security constraints
   */
  private validateSecurity(parseTree: PQLParseNode, errors: PQLValidationError[], warnings: PQLValidationError[]): void {
    if (!parseTree.children) return;

    // Check for function usage
    const functions = this.findAllFunctions(parseTree);
    
    for (const func of functions) {
      if (!this.allowedFunctions.has(func.toUpperCase())) {
        errors.push({
          code: 'DISALLOWED_FUNCTION',
          message: `Function '${func}' is not allowed`,
          severity: 'error'
        });
      }
    }

    // Check for subqueries
    const subqueryCount = this.countSubqueries(parseTree);
    if (subqueryCount > this.maxSubqueries) {
      errors.push({
        code: 'TOO_MANY_SUBQUERIES',
        message: `Query exceeds maximum allowed subqueries (${this.maxSubqueries})`,
        severity: 'error'
      });
    }

    // Check for potentially expensive operations
    const expensivePatterns = this.findExpensivePatterns(parseTree);
    if (expensivePatterns.length > 0) {
      warnings.push({
        code: 'EXPENSIVE_OPERATION',
        message: `Query contains potentially expensive operations: ${expensivePatterns.join(', ')}`,
        severity: 'warning'
      });
    }
  }

  /**
   * Validate privacy constraints
   */
  private validatePrivacy(parseTree: PQLParseNode, errors: PQLValidationError[], warnings: PQLValidationError[]): void {
    if (!parseTree.children) return;

    // Check for privacy-safe aggregations
    const aggregations = this.findAggregations(parseTree);
    const unsafeAggregations = aggregations.filter(agg => !this.allowedAggregations.has(agg.toUpperCase()));
    
    if (unsafeAggregations.length > 0) {
      warnings.push({
        code: 'UNSAFE_AGGREGATION',
        message: `Query uses potentially unsafe aggregations: ${unsafeAggregations.join(', ')}`,
        severity: 'warning'
      });
    }

    // Check for SELECT *
    const selectClause = parseTree.children.find(child => child.type === 'SELECT');
    if (selectClause) {
      const hasSelectAll = selectClause.children?.some(child => 
        child.value === '*' || child.value?.includes('*')
      );
      
      if (hasSelectAll) {
        errors.push({
          code: 'SELECT_ALL_NOT_ALLOWED',
          message: 'SELECT * is not allowed for privacy reasons',
          severity: 'error'
        });
      }
    }

    // Check for insufficient privacy budget usage
    const groupByClause = parseTree.children.find(child => child.type === 'GROUP_BY');
    if (!groupByClause) {
      warnings.push({
        code: 'INSUFFICIENT_PRIVACY_PROTECTION',
        message: 'Query without GROUP BY may expose individual records',
        severity: 'warning'
      });
    }
  }

  /**
   * Extract metadata from parse tree
   */
  private extractMetadata(parseTree: PQLParseNode): any {
    const metadata = {
      queryType: 'SELECT',
      tables: [] as string[],
      columns: [] as string[],
      functions: [] as string[]
    };

    if (!parseTree.children) return metadata;

    // Extract tables from FROM and JOIN clauses
    const fromClause = parseTree.children.find(child => child.type === 'FROM');
    const joinClauses = parseTree.children.filter(child => child.type === 'JOIN');
    
    [fromClause, ...joinClauses].forEach(clause => {
      if (clause?.children) {
        clause.children.forEach(child => {
          if (child.type === 'IDENTIFIER' && child.value) {
            const table = child.value.split('.')[0]; // Extract table name
            if (!metadata.tables.includes(table)) {
              metadata.tables.push(table);
            }
          }
        });
      }
    });

    // Extract columns and functions from SELECT clause
    const selectClause = parseTree.children.find(child => child.type === 'SELECT');
    if (selectClause?.children) {
      selectClause.children.forEach(child => {
        if (child.type === 'IDENTIFIER') {
          if (child.value?.includes('(')) {
            // It's a function call
            const funcName = child.value.split('(')[0].toUpperCase();
            if (!metadata.functions.includes(funcName)) {
              metadata.functions.push(funcName);
            }
          } else if (child.value && !metadata.columns.includes(child.value)) {
            metadata.columns.push(child.value);
          }
        }
      });
    }

    return metadata;
  }

  /**
   * Normalize the query
   */
  private normalizeQuery(parseTree: PQLParseNode): string {
    // Basic normalization - in production, you'd use a proper SQL formatter
    if (!parseTree.children) return '';

    const normalizedParts: string[] = [];

    for (const child of parseTree.children) {
      switch (child.type) {
        case 'SELECT':
          normalizedParts.push('SELECT ' + child.children?.map(c => c.value).join(', '));
          break;
        case 'FROM':
          normalizedParts.push('FROM ' + child.children?.map(c => c.value).join(', '));
          break;
        case 'WHERE':
          normalizedParts.push('WHERE ' + child.children?.map(c => c.value).join(' '));
          break;
        case 'GROUP_BY':
          normalizedParts.push('GROUP BY ' + child.children?.map(c => c.value).join(', '));
          break;
        case 'HAVING':
          normalizedParts.push('HAVING ' + child.children?.map(c => c.value).join(' '));
          break;
        case 'ORDER_BY':
          normalizedParts.push('ORDER BY ' + child.children?.map(c => c.value).join(', '));
          break;
        case 'LIMIT':
          normalizedParts.push('LIMIT ' + child.children?.map(c => c.value).join(' '));
          break;
        case 'JOIN':
          normalizedParts.push('JOIN ' + child.children?.map(c => c.value).join(' '));
          break;
      }
    }

    return normalizedParts.join(' ');
  }

  // Helper methods
  private findAggregations(node: PQLParseNode): string[] {
    const aggregations: string[] = [];
    
    if (node.children) {
      for (const child of node.children) {
        if (child.value?.includes('(')) {
          const funcName = child.value.split('(')[0].toUpperCase();
          if (this.allowedAggregations.has(funcName)) {
            aggregations.push(funcName);
          }
        }
        aggregations.push(...this.findAggregations(child));
      }
    }
    
    return aggregations;
  }

  private findNonAggregatedColumns(node: PQLParseNode): string[] {
    const columns: string[] = [];
    
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'IDENTIFIER' && child.value && !child.value.includes('(')) {
          columns.push(child.value);
        }
        columns.push(...this.findNonAggregatedColumns(child));
      }
    }
    
    return columns;
  }

  private findAllFunctions(node: PQLParseNode): string[] {
    const functions: string[] = [];
    
    if (node.children) {
      for (const child of node.children) {
        if (child.value?.includes('(')) {
          const funcName = child.value.split('(')[0];
          functions.push(funcName);
        }
        functions.push(...this.findAllFunctions(child));
      }
    }
    
    return functions;
  }

  private countSubqueries(node: PQLParseNode): number {
    let count = 0;
    
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'SUBQUERY') {
          count++;
        }
        count += this.countSubqueries(child);
      }
    }
    
    return count;
  }

  private findExpensivePatterns(node: PQLParseNode): string[] {
    const patterns: string[] = [];
    
    // This is a simplified check - in production, you'd have more sophisticated detection
    if (node.children) {
      for (const child of node.children) {
        if (child.value?.toUpperCase().includes('LIKE')) {
          patterns.push('LIKE operator');
        }
        if (child.value?.toUpperCase().includes('REGEXP')) {
          patterns.push('Regular expression');
        }
        patterns.push(...this.findExpensivePatterns(child));
      }
    }
    
    return patterns;
  }
}

export default PQLValidator;
