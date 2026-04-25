import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface NEREntity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence: number;
}

export interface NERResult {
  entities: NEREntity[];
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
  method: 'ner';
}

export interface NERModel {
  name: string;
  language: string;
  entities: string[];
  loaded: boolean;
  loadTime?: number;
}

// Simplified NER implementation (in production, you'd use a proper NLP library like spaCy, NLTK, or a cloud service)
export class NERProcessor {
  private models: Map<string, NERModel> = new Map();
  private modelsPath: string;
  private languages: string[];
  private confidenceThreshold: number;
  private enableNER: boolean = true;
  private entityMappings: Map<string, string> = new Map();

  // Simple pattern-based entity recognition as fallback
  private entityPatterns: Map<string, RegExp[]> = new Map();

  constructor(config: {
    modelsPath: string;
    languages: string[];
    confidenceThreshold: number;
  }) {
    this.modelsPath = config.modelsPath;
    this.languages = config.languages;
    this.confidenceThreshold = config.confidenceThreshold;

    this.initializeEntityMappings();
    this.initializeEntityPatterns();
    this.loadModels();

    logger.info('NER Processor initialized', {
      modelsPath: this.modelsPath,
      languages: this.languages,
      confidenceThreshold: this.confidenceThreshold,
      modelsLoaded: this.models.size,
    });
  }

  private initializeEntityMappings(): void {
    // Map NER labels to PII types
    this.entityMappings.set('PERSON', 'name');
    this.entityMappings.set('ORG', 'organization');
    this.entityMappings.set('GPE', 'location');
    this.entityMappings.set('EMAIL', 'email');
    this.entityMappings.set('PHONE', 'phone');
    this.entityMappings.set('ADDRESS', 'address');
    this.entityMappings.set('DATE', 'date');
    this.entityMappings.set('CARDINAL', 'number');
    this.entityMappings.set('MONEY', 'financial');
    this.entityMappings.set('ID', 'identifier');
    this.entityMappings.set('URL', 'url');
  }

  private initializeEntityPatterns(): void {
    // Simple regex patterns for entity recognition as fallback
    this.entityPatterns.set('PERSON', [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // First name + Last name
      /\b[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+\b/g, // First + Middle + Last name
    ]);

    this.entityPatterns.set('EMAIL', [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ]);

    this.entityPatterns.set('PHONE', [
      /\b(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    ]);

    this.entityPatterns.set('ADDRESS', [
      /\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi,
    ]);

    this.entityPatterns.set('ORGANIZATION', [
      /\b(?:[A-Z][a-z]+\s)+(?:Inc|Corp|LLC|Ltd|Company|Co|Incorporated)\b/g,
    ]);
  }

  private async loadModels(): Promise<void> {
    // In a real implementation, this would load actual NLP models
    // For now, we'll create mock models
    
    for (const language of this.languages) {
      const model: NERModel = {
        name: `ner_${language}`,
        language,
        entities: ['PERSON', 'ORG', 'GPE', 'EMAIL', 'PHONE', 'ADDRESS', 'DATE'],
        loaded: true,
        loadTime: Date.now(),
      };
      
      this.models.set(language, model);
    }

    logger.info(`Loaded ${this.models.size} NER models`);
  }

  /**
   * Process text with NER and mask detected entities
   */
  async maskWithNER(text: string): Promise<NERResult> {
    if (!this.enableNER) {
      return {
        entities: [],
        maskedText: text,
        detections: [],
      };
    }

    try {
      const entities = await this.extractEntities(text);
      const { maskedText, detections } = this.maskEntities(text, entities);

      return {
        entities,
        maskedText,
        detections,
      };
    } catch (error) {
      logger.error('NER processing failed:', error);
      return {
        entities: [],
        maskedText: text,
        detections: [],
      };
    }
  }

  /**
   * Extract entities from text
   */
  private async extractEntities(text: string): Promise<NEREntity[]> {
    const entities: NEREntity[] = [];

    // Use pattern-based entity recognition as fallback
    for (const [label, patterns] of this.entityPatterns) {
      for (const pattern of patterns) {
        const matches = Array.from(text.matchAll(pattern));
        
        for (const match of matches) {
          const startIndex = match.index || 0;
          const endIndex = startIndex + match[0].length;
          
          entities.push({
            text: match[0],
            label,
            start: startIndex,
            end: endIndex,
            confidence: this.calculateConfidence(match[0], label),
          });
        }
      }
    }

    // Remove overlapping entities (keep the one with higher confidence)
    const nonOverlappingEntities = this.removeOverlappingEntities(entities);

    return nonOverlappingEntities.filter(entity => 
      entity.confidence >= this.confidenceThreshold
    );
  }

  /**
   * Calculate confidence score for an entity
   */
  private calculateConfidence(text: string, label: string): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on entity characteristics
    switch (label) {
      case 'PERSON':
        // Higher confidence for proper names
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text)) {
          confidence += 0.3;
        }
        if (text.length > 3 && text.length < 30) {
          confidence += 0.1;
        }
        break;

      case 'EMAIL':
        // High confidence for valid email format
        if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(text)) {
          confidence += 0.4;
        }
        break;

      case 'PHONE':
        // High confidence for phone number patterns
        if (/^\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/.test(text)) {
          confidence += 0.4;
        }
        break;

      case 'ORGANIZATION':
        // Medium confidence for organization names
        if (/(Inc|Corp|LLC|Ltd|Company)$/i.test(text)) {
          confidence += 0.2;
        }
        if (text.length > 5 && text.length < 50) {
          confidence += 0.1;
        }
        break;

      case 'ADDRESS':
        // Medium confidence for address patterns
        if (/\d+\s+[A-Z][a-z]+/.test(text)) {
          confidence += 0.3;
        }
        break;

      default:
        // Default confidence
        break;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Remove overlapping entities, keeping the one with higher confidence
   */
  private removeOverlappingEntities(entities: NEREntity[]): NEREntity[] {
    // Sort entities by confidence (highest first)
    const sortedEntities = entities.sort((a, b) => b.confidence - a.confidence);
    const nonOverlapping: NEREntity[] = [];

    for (const entity of sortedEntities) {
      const hasOverlap = nonOverlapping.some(existing => 
        entity.start < existing.end && entity.end > existing.start
      );

      if (!hasOverlap) {
        nonOverlapping.push(entity);
      }
    }

    return nonOverlapping;
  }

  /**
   * Mask detected entities in text
   */
  private maskEntities(text: string, entities: NEREntity[]): { maskedText: string; detections: PIIDetection[] } {
    const detections: PIIDetection[] = [];
    let maskedText = text;

    // Sort entities by start position (reverse order to avoid index shifting)
    const sortedEntities = entities.sort((a, b) => b.start - a.start);

    for (const entity of sortedEntities) {
      const piiType = this.entityMappings.get(entity.label) || entity.label.toLowerCase();
      const maskedValue = this.maskEntityValue(entity.text, entity.label);
      
      // Replace in text
      const before = maskedText.substring(0, entity.start);
      const after = maskedText.substring(entity.end);
      maskedText = before + maskedValue + after;

      detections.push({
        type: piiType,
        value: entity.text,
        maskedValue,
        position: {
          start: entity.start,
          end: entity.end,
        },
        confidence: entity.confidence,
        method: 'ner',
      });
    }

    return { maskedText, detections };
  }

  /**
   * Mask entity value based on entity type
   */
  private maskEntityValue(text: string, label: string): string {
    switch (label) {
      case 'PERSON':
        // Mask name, keep first letter of first name and last name
        const parts = text.split(' ');
        if (parts.length >= 2) {
          return `${parts[0][0]}*** ${parts[parts.length - 1][0]}***`;
        }
        return `${text[0]}***`;

      case 'EMAIL':
        // Mask email like in PII masker
        const [username, domain] = text.split('@');
        const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
        const domainParts = domain.split('.');
        const maskedDomain = domainParts.map((part, index) => {
          if (index === domainParts.length - 1) {
            return part;
          }
          return part.substring(0, 1) + '*'.repeat(part.length - 1);
        }).join('.');
        return `${maskedUsername}@${maskedDomain}`;

      case 'PHONE':
        // Mask phone number
        return '***-***-****';

      case 'ADDRESS':
        // Mask address, keep general structure
        return '*** Address ***';

      case 'ORGANIZATION':
        // Mask organization name
        return `${text.substring(0, 2)}***`;

      case 'GPE': // Geopolitical Entity
        // Mask location
        return `${text.substring(0, 2)}***`;

      case 'DATE':
        // Mask date
        return '**/**/****';

      default:
        // Generic masking
        return '***';
    }
  }

  /**
   * Check if NER is enabled
   */
  isEnabled(): boolean {
    return this.enableNER;
  }

  /**
   * Get loaded models
   */
  getModels(): NERModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Get model by language
   */
  getModel(language: string): NERModel | undefined {
    return this.models.get(language);
  }

  /**
   * Add custom entity pattern
   */
  addEntityPattern(label: string, pattern: RegExp): void {
    if (!this.entityPatterns.has(label)) {
      this.entityPatterns.set(label, []);
    }
    
    this.entityPatterns.get(label)!.push(pattern);
    logger.info(`Added custom pattern for ${label}`);
  }

  /**
   * Remove entity pattern
   */
  removeEntityPattern(label: string, pattern?: RegExp): boolean {
    if (!pattern) {
      return this.entityPatterns.delete(label);
    }

    const patterns = this.entityPatterns.get(label);
    if (patterns) {
      const index = patterns.indexOf(pattern);
      if (index > -1) {
        patterns.splice(index, 1);
        if (patterns.length === 0) {
          this.entityPatterns.delete(label);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Update entity mapping
   */
  updateEntityMapping(nerLabel: string, piiType: string): void {
    this.entityMappings.set(nerLabel, piiType);
    logger.info(`Updated entity mapping: ${nerLabel} -> ${piiType}`);
  }

  /**
   * Get entity statistics
   */
  getEntityStatistics(text: string): {
    totalEntities: number;
    entitiesByType: Record<string, number>;
    averageConfidence: number;
    highConfidenceEntities: number;
  } {
    const result = this.extractEntities(text);
    const entitiesByType: Record<string, number> = {};
    let totalConfidence = 0;
    let highConfidenceCount = 0;

    for (const entity of result) {
      entitiesByType[entity.label] = (entitiesByType[entity.label] || 0) + 1;
      totalConfidence += entity.confidence;
      
      if (entity.confidence >= 0.8) {
        highConfidenceCount++;
      }
    }

    return {
      totalEntities: result.length,
      entitiesByType,
      averageConfidence: result.length > 0 ? totalConfidence / result.length : 0,
      highConfidenceEntities: highConfidenceCount,
    };
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    try {
      // Test with a simple text
      const testText = 'John Doe works at Acme Corp and can be reached at john@example.com';
      const result = this.maskWithNER(testText);
      return result.then(r => r.maskedText !== testText).catch(() => false);
    } catch (error) {
      logger.error('NER Processor health check failed:', error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    enableNER?: boolean;
    confidenceThreshold?: number;
    languages?: string[];
  }): void {
    if (config.enableNER !== undefined) {
      this.enableNER = config.enableNER;
    }
    
    if (config.confidenceThreshold !== undefined) {
      this.confidenceThreshold = config.confidenceThreshold;
    }
    
    if (config.languages) {
      this.languages = config.languages;
      this.loadModels();
    }

    logger.info('NER Processor configuration updated', {
      enableNER: this.enableNER,
      confidenceThreshold: this.confidenceThreshold,
      languages: this.languages,
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.models.clear();
    this.entityPatterns.clear();
    this.entityMappings.clear();
    
    logger.info('NER Processor cleaned up');
  }

  /**
   * Export configuration
   */
  exportConfig(): {
    models: NERModel[];
    entityMappings: Record<string, string>;
    entityPatterns: Record<string, string[]>;
    confidenceThreshold: number;
  } {
    const entityPatterns: Record<string, string[]> = {};
    
    for (const [label, patterns] of this.entityPatterns) {
      entityPatterns[label] = patterns.map(p => p.source);
    }

    return {
      models: this.getModels(),
      entityMappings: Object.fromEntries(this.entityMappings),
      entityPatterns,
      confidenceThreshold: this.confidenceThreshold,
    };
  }

  /**
   * Import configuration
   */
  importConfig(config: {
    entityMappings?: Record<string, string>;
    entityPatterns?: Record<string, string[]>;
    confidenceThreshold?: number;
  }): void {
    if (config.entityMappings) {
      this.entityMappings.clear();
      for (const [nerLabel, piiType] of Object.entries(config.entityMappings)) {
        this.entityMappings.set(nerLabel, piiType);
      }
    }

    if (config.entityPatterns) {
      this.entityPatterns.clear();
      for (const [label, patterns] of Object.entries(config.entityPatterns)) {
        this.entityPatterns.set(label, patterns.map(p => new RegExp(p, 'g')));
      }
    }

    if (config.confidenceThreshold !== undefined) {
      this.confidenceThreshold = config.confidenceThreshold;
    }

    logger.info('NER Processor configuration imported');
  }
}

export default NERProcessor;
