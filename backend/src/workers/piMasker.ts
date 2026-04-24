import { logger } from '../utils/logger';

export interface PIIPattern {
  name: string;
  pattern: RegExp;
  mask: string | ((match: RegExpMatchArray) => string);
  description: string;
  confidence: number;
}

export interface MaskingResult {
  maskedText: string;
  detections: PIIDetection[];
}

export interface PIIDetection {
  type: string;
  value: string;
  maskedValue: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number;
  method: 'regex';
}

export class PIIMasker {
  private patterns: Map<string, PIIPattern> = new Map();
  private enableRegex: boolean = true;
  private enableNER: boolean = false;
  private customPatterns: Record<string, string> = {};

  constructor(config: {
    enableRegex: boolean;
    enableNER: boolean;
    customPatterns?: Record<string, string>;
  }) {
    this.enableRegex = config.enableRegex;
    this.enableNER = config.enableNER;
    this.customPatterns = config.customPatterns || {};

    if (this.enableRegex) {
      this.initializePatterns();
    }

    logger.info('PII Masker initialized', {
      regexEnabled: this.enableRegex,
      nerEnabled: this.enableNER,
      customPatternsCount: Object.keys(this.customPatterns).length,
    });
  }

  private initializePatterns(): void {
    // Email addresses
    this.addPattern({
      name: 'email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      mask: (match) => {
        const email = match[0];
        const [username, domain] = email.split('@');
        const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
        const domainParts = domain.split('.');
        const maskedDomain = domainParts.map((part, index) => {
          if (index === domainParts.length - 1) {
            // Keep TLD as is
            return part;
          }
          return part.substring(0, 1) + '*'.repeat(part.length - 1);
        }).join('.');
        return `${maskedUsername}@${maskedDomain}`;
      },
      description: 'Email addresses',
      confidence: 0.95,
    });

    // Phone numbers (US format)
    this.addPattern({
      name: 'phone_us',
      pattern: /\b(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      mask: (match) => {
        const fullMatch = match[0];
        const areaCode = match[1];
        const prefix = match[2];
        const lineNumber = match[3];
        return `+1 (${areaCode}) ${prefix[0]}${prefix[1]}*-****-${lineNumber}`;
      },
      description: 'US phone numbers',
      confidence: 0.9,
    });

    // Phone numbers (International format)
    this.addPattern({
      name: 'phone_international',
      pattern: /\b\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
      mask: '+***-***-****-****',
      description: 'International phone numbers',
      confidence: 0.8,
    });

    // Social Security Numbers (US)
    this.addPattern({
      name: 'ssn',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      mask: '***-**-****',
      description: 'US Social Security Numbers',
      confidence: 0.95,
    });

    // Credit card numbers
    this.addPattern({
      name: 'credit_card',
      pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      mask: (match) => {
        const cardNumber = match[0];
        const lastFour = cardNumber.slice(-4);
        return '*'.repeat(cardNumber.length - 4) + lastFour;
      },
      description: 'Credit card numbers',
      confidence: 0.9,
    });

    // US Zip codes
    this.addPattern({
      name: 'zip_code',
      pattern: /\b\d{5}(?:-\d{4})?\b/g,
      mask: (match) => {
        const zip = match[0];
        if (zip.length === 5) {
          return zip.substring(0, 2) + '***';
        } else {
          return zip.substring(0, 2) + '***-' + zip.slice(-4);
        }
      },
      description: 'US ZIP codes',
      confidence: 0.7,
    });

    // IP addresses
    this.addPattern({
      name: 'ip_address',
      pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      mask: (match) => {
        const ip = match[0];
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.***.***`;
      },
      description: 'IP addresses',
      confidence: 0.8,
    });

    // URLs with potential sensitive information
    this.addPattern({
      name: 'url',
      pattern: /\bhttps?:\/\/(?:[-\w.])+(?:[:\d]+)?(?:\/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:\w)*)?)?\b/g,
      mask: (match) => {
        const url = new URL(match[0]);
        const hostname = url.hostname;
        const maskedHostname = hostname.split('.').map((part, index) => {
          if (index === 0 && part.length > 3) {
            return part.substring(0, 2) + '*'.repeat(part.length - 2);
          }
          return part;
        }).join('.');
        return `${url.protocol}//${maskedHostname}${url.pathname ? '/***' : ''}`;
      },
      description: 'URLs with sensitive information',
      confidence: 0.6,
    });

    // Dates (potential birth dates, etc.)
    this.addPattern({
      name: 'date',
      pattern: /\b(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}\b/g,
      mask: '**/**/****',
      description: 'Dates in MM/DD/YYYY format',
      confidence: 0.5,
    });

    // ISO dates
    this.addPattern({
      name: 'iso_date',
      pattern: /\b\d{4}-\d{2}-\d{2}\b/g,
      mask: '****-**-**',
      description: 'ISO date format',
      confidence: 0.5,
    });

    // Add custom patterns
    this.addCustomPatterns();
  }

  private addCustomPatterns(): void {
    for (const [name, patternString] of Object.entries(this.customPatterns)) {
      try {
        const pattern = new RegExp(patternString, 'g');
        this.addPattern({
          name: `custom_${name}`,
          pattern,
          mask: '***CUSTOM***',
          description: `Custom pattern: ${name}`,
          confidence: 0.7,
        });
      } catch (error) {
        logger.error(`Invalid custom pattern ${name}:`, error);
      }
    }
  }

  private addPattern(pattern: PIIPattern): void {
    this.patterns.set(pattern.name, pattern);
  }

  /**
   * Mask text using regex patterns
   */
  maskWithRegex(text: string): MaskingResult {
    const detections: PIIDetection[] = [];
    let maskedText = text;

    // Sort patterns by confidence (highest first)
    const sortedPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.confidence - a.confidence);

    for (const pattern of sortedPatterns) {
      const matches = Array.from(maskedText.matchAll(pattern.pattern));
      
      for (const match of matches) {
        const startIndex = match.index || 0;
        const endIndex = startIndex + match[0].length;
        
        let maskedValue: string;
        if (typeof pattern.mask === 'function') {
          maskedValue = pattern.mask(match);
        } else {
          maskedValue = pattern.mask;
        }

        // Replace in the text (adjust for previous replacements)
        const before = maskedText.substring(0, startIndex);
        const after = maskedText.substring(endIndex);
        maskedText = before + maskedValue + after;

        detections.push({
          type: pattern.name,
          value: match[0],
          maskedValue,
          position: {
            start: startIndex,
            end: endIndex,
          },
          confidence: pattern.confidence,
          method: 'regex',
        });
      }
    }

    return {
      maskedText,
      detections,
    };
  }

  /**
   * Check if regex masking is enabled
   */
  isRegexEnabled(): boolean {
    return this.enableRegex;
  }

  /**
   * Check if NER is enabled
   */
  isNREnabled(): boolean {
    return this.enableNER;
  }

  /**
   * Add a custom pattern
   */
  addCustomPattern(name: string, pattern: string, mask: string = '***CUSTOM***'): void {
    try {
      const regex = new RegExp(pattern, 'g');
      this.addPattern({
        name: `custom_${name}`,
        pattern: regex,
        mask,
        description: `Custom pattern: ${name}`,
        confidence: 0.7,
      });
      
      logger.info(`Custom pattern added: ${name}`);
    } catch (error) {
      logger.error(`Failed to add custom pattern ${name}:`, error);
      throw error;
    }
  }

  /**
   * Remove a pattern
   */
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Get all patterns
   */
  getPatterns(): PIIPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern by name
   */
  getPattern(name: string): PIIPattern | undefined {
    return this.patterns.get(name);
  }

  /**
   * Test a pattern against text
   */
  testPattern(patternName: string, text: string): {
    matches: string[];
    count: number;
    positions: Array<{ start: number; end: number }>;
  } {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern ${patternName} not found`);
    }

    const matches = Array.from(text.matchAll(pattern.pattern));
    const positions = matches.map(match => ({
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
    }));

    return {
      matches: matches.map(m => m[0]),
      count: matches.length,
      positions,
    };
  }

  /**
   * Validate pattern syntax
   */
  validatePattern(patternString: string): { valid: boolean; error?: string } {
    try {
      new RegExp(patternString);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid regex pattern' 
      };
    }
  }

  /**
   * Get statistics about PII detection
   */
  getDetectionStatistics(text: string): {
    totalDetections: number;
    detectionsByType: Record<string, number>;
    averageConfidence: number;
    highConfidenceDetections: number;
  } {
    const result = this.maskWithRegex(text);
    const detectionsByType: Record<string, number> = {};
    let totalConfidence = 0;
    let highConfidenceCount = 0;

    for (const detection of result.detections) {
      detectionsByType[detection.type] = (detectionsByType[detection.type] || 0) + 1;
      totalConfidence += detection.confidence;
      
      if (detection.confidence >= 0.8) {
        highConfidenceCount++;
      }
    }

    return {
      totalDetections: result.detections.length,
      detectionsByType,
      averageConfidence: result.detections.length > 0 ? totalConfidence / result.detections.length : 0,
      highConfidenceDetections: highConfidenceCount,
    };
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    try {
      // Test with a simple pattern
      const testText = 'Test email: test@example.com';
      const result = this.maskWithRegex(testText);
      return result.maskedText !== testText;
    } catch (error) {
      logger.error('PII Masker health check failed:', error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    enableRegex?: boolean;
    enableNER?: boolean;
    customPatterns?: Record<string, string>;
  }): void {
    if (config.enableRegex !== undefined) {
      this.enableRegex = config.enableRegex;
    }
    
    if (config.enableNER !== undefined) {
      this.enableNER = config.enableNER;
    }
    
    if (config.customPatterns) {
      this.customPatterns = config.customPatterns;
      this.addCustomPatterns();
    }

    logger.info('PII Masker configuration updated', {
      regexEnabled: this.enableRegex,
      nerEnabled: this.enableNER,
      customPatternsCount: Object.keys(this.customPatterns).length,
    });
  }

  /**
   * Export patterns for backup
   */
  exportPatterns(): Record<string, any> {
    const patterns: Record<string, any> = {};
    
    for (const [name, pattern] of this.patterns.entries()) {
      patterns[name] = {
        name: pattern.name,
        pattern: pattern.pattern.source,
        description: pattern.description,
        confidence: pattern.confidence,
        maskType: typeof pattern.mask,
      };
    }
    
    return patterns;
  }

  /**
   * Import patterns from backup
   */
  importPatterns(patterns: Record<string, any>): void {
    for (const [name, data] of Object.entries(patterns)) {
      try {
        const pattern: PIIPattern = {
          name: data.name,
          pattern: new RegExp(data.pattern, 'g'),
          description: data.description,
          confidence: data.confidence,
          mask: data.maskType === 'function' ? '***CUSTOM***' : data.mask,
        };
        
        this.patterns.set(name, pattern);
      } catch (error) {
        logger.error(`Failed to import pattern ${name}:`, error);
      }
    }
    
    logger.info(`Imported ${Object.keys(patterns).length} patterns`);
  }
}

export default PIIMasker;
