import { v4 as uuidv4 } from 'uuid';
import { PrivacyLevel, DataType } from '../types/privacy';

/**
 * Utility functions for the Stellar ecosystem
 */

export class Utils {
  /**
   * Generates a UUID v4
   */
  static generateId(): string {
    return uuidv4();
  }

  /**
   * Delays execution for a specified time
   */
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Deep clones an object
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Checks if a value is empty (null, undefined, empty string, empty array, empty object)
   */
  static isEmpty(value: any): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Sanitizes a string for safe usage
   */
  static sanitizeString(str: string): string {
    return str.replace(/[<>]/g, '').trim();
  }

  /**
   * Formats a date to ISO string
   */
  static formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parses a date from various formats
   */
  static parseDate(date: string | Date): Date {
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date format: ${date}`);
    }
    return parsed;
  }

  /**
   * Truncates a string to a specified length
   */
  static truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Converts bytes to human readable format
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Generates a random number between min and max
   */
  static randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Rounds a number to specified decimal places
   */
  static roundTo(num: number, decimals: number): number {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}

/**
 * Privacy-specific utilities
 */
export class PrivacyUtils {
  /**
   * Calculates privacy score based on settings
   */
  static calculatePrivacyScore(level: PrivacyLevel): number {
    switch (level) {
      case PrivacyLevel.MINIMAL: return 0.25;
      case PrivacyLevel.STANDARD: return 0.5;
      case PrivacyLevel.HIGH: return 0.75;
      case PrivacyLevel.MAXIMUM: return 1.0;
      default: return 0.5;
    }
  }

  /**
   * Determines if data type requires encryption
   */
  static requiresEncryption(dataType: DataType, isSensitive: boolean): boolean {
    if (isSensitive) return true;
    return [DataType.TEXT, DataType.GEOGRAPHICAL, DataType.TEMPORAL].includes(dataType);
  }

  /**
   * Calculates data sensitivity score
   */
  static calculateSensitivityScore(fields: Array<{ type: DataType; sensitive: boolean }>): number {
    if (fields.length === 0) return 0;
    
    const sensitiveCount = fields.filter(field => field.sensitive).length;
    const highRiskTypes = fields.filter(field => 
      [DataType.GEOGRAPHICAL, DataType.TEMPORAL, DataType.TEXT].includes(field.type)
    ).length;
    
    return (sensitiveCount + highRiskTypes * 0.5) / fields.length;
  }

  /**
   * Generates privacy recommendations
   */
  static generatePrivacyRecommendations(
    currentLevel: PrivacyLevel,
    sensitivityScore: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (sensitivityScore > 0.7 && currentLevel !== PrivacyLevel.MAXIMUM) {
      recommendations.push('Consider using Maximum privacy level for highly sensitive data');
    }
    
    if (sensitivityScore > 0.5 && currentLevel === PrivacyLevel.MINIMAL) {
      recommendations.push('Upgrade privacy level for moderate to high sensitivity data');
    }
    
    if (currentLevel === PrivacyLevel.MINIMAL) {
      recommendations.push('Enable differential privacy for statistical queries');
      recommendations.push('Consider data minimization techniques');
    }
    
    return recommendations;
  }

  /**
   * Validates privacy compliance
   */
  static validateCompliance(
    privacyLevel: PrivacyLevel,
    hasConsent: boolean,
    dataRetentionDays: number
  ): { compliant: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!hasConsent && privacyLevel !== PrivacyLevel.MAXIMUM) {
      issues.push('User consent is required for this privacy level');
    }
    
    if (dataRetentionDays > 365 && privacyLevel !== PrivacyLevel.MINIMAL) {
      issues.push('Data retention period exceeds recommended limits');
    }
    
    if (privacyLevel === PrivacyLevel.MINIMAL && !hasConsent) {
      issues.push('Minimal privacy requires explicit user consent');
    }
    
    return {
      compliant: issues.length === 0,
      issues
    };
  }
}

/**
 * Data processing utilities
 */
export class DataUtils {
  /**
   * Normalizes numerical data
   */
  static normalize(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return values.map(() => 0.5);
    return values.map(value => (value - min) / (max - min));
  }

  /**
   * Calculates basic statistics
   */
  static calculateStats(values: number[]): {
    count: number;
    sum: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
  } {
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;
    
    const sorted = [...values].sort((a, b) => a - b);
    const median = count % 2 === 0 
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];
    
    const min = sorted[0];
    const max = sorted[count - 1];
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    
    return { count, sum, mean, median, min, max, stdDev };
  }

  /**
   * Groups data by a key
   */
  static groupBy<T>(data: T[], key: keyof T): Record<string, T[]> {
    return data.reduce((groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * Filters data based on criteria
   */
  static filter<T>(data: T[], criteria: Partial<Record<keyof T, any>>): T[] {
    return data.filter(item => 
      Object.entries(criteria).every(([key, value]) => item[key as keyof T] === value)
    );
  }

  /**
   * Paginates data
   */
  static paginate<T>(data: T[], page: number, pageSize: number): {
    items: T[];
    totalPages: number;
    currentPage: number;
    totalItems: number;
  } {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = data.slice(startIndex, endIndex);
    const totalPages = Math.ceil(data.length / pageSize);
    
    return {
      items,
      totalPages,
      currentPage: page,
      totalItems: data.length
    };
  }
}
