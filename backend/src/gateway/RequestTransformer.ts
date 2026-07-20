import { Request, Response } from 'express';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { TransformationRule } from './PrivacyApiGateway';
import { EncryptionKeyStore } from './EncryptionKeyStore';
import { logger } from '../utils/logger';

export interface TransformationContext {
  requestId: string;
  userId?: string;
  privacyLevel: string;
  jurisdiction: string;
  purpose: string;
  timestamp: Date;
}

export interface TransformationResult {
  success: boolean;
  transformed: boolean;
  data?: any;
  error?: string;
  appliedTransformations: string[];
}

export interface MaskingConfig {
  type: 'partial' | 'full' | 'hash';
  preserveLength?: boolean;
  visibleChars?: number;
  maskChar?: string;
  algorithm?: string;
}

export interface EncryptionConfig {
  algorithm: string;
  keyId: string;
  ivLength: number;
  tagLength?: number;
}

export interface PseudonymizationConfig {
  salt: string;
  algorithm: string;
  deterministic: boolean;
  preserveFormat?: boolean;
}

export class RequestTransformer {
  private encryptionKeys: Map<string, Buffer>;
  private pseudonymizationSalts: Map<string, string>;
  private transformationCache: Map<string, any>;
  private keyStore: EncryptionKeyStore;
  private keysLoadedAtMtimeMs = 0;

  constructor(keyStore?: EncryptionKeyStore) {
    this.encryptionKeys = new Map();
    this.pseudonymizationSalts = new Map();
    this.transformationCache = new Map();
    this.keyStore = keyStore ?? new EncryptionKeyStore();

    this.initializeEncryptionKeys();
    this.initializeDefaultSalts();
  }

  async applyRequestTransformations(
    req: Request,
    rules: TransformationRule[]
  ): Promise<TransformationResult> {
    const context: TransformationContext = {
      requestId: (req as any).requestId || 'unknown',
      userId: (req as any).userId,
      privacyLevel: (req as any).privacyLevel || 'high',
      jurisdiction: req.headers['x-jurisdiction'] as string || 'US',
      purpose: req.headers['x-purpose'] as string || 'analytics',
      timestamp: new Date()
    };

    const appliedTransformations: string[] = [];
    let transformed = false;

    try {
      // Transform request body
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyResult = await this.transformData(req.body, rules, context, 'request.body');
        if (bodyResult.transformed) {
          req.body = bodyResult.data;
          transformed = true;
          appliedTransformations.push(...bodyResult.appliedTransformations);
        }
      }

      // Transform query parameters
      if (req.query && Object.keys(req.query).length > 0) {
        const queryResult = await this.transformData(req.query, rules, context, 'request.query');
        if (queryResult.transformed) {
          req.query = queryResult.data;
          transformed = true;
          appliedTransformations.push(...queryResult.appliedTransformations);
        }
      }

      // Transform path parameters
      if (req.params && Object.keys(req.params).length > 0) {
        const paramsResult = await this.transformData(req.params, rules, context, 'request.params');
        if (paramsResult.transformed) {
          req.params = paramsResult.data;
          transformed = true;
          appliedTransformations.push(...paramsResult.appliedTransformations);
        }
      }

      // Transform headers
      const headerResult = await this.transformHeaders(req.headers, rules, context);
      if (headerResult.transformed) {
        req.headers = headerResult.data;
        transformed = true;
        appliedTransformations.push(...headerResult.appliedTransformations);
      }

      logger.info('Request transformations applied', {
        requestId: context.requestId,
        transformations: appliedTransformations,
        privacyLevel: context.privacyLevel
      });

      return {
        success: true,
        transformed,
        appliedTransformations
      };

    } catch (error) {
      logger.error('Request transformation failed:', error);
      
      return {
        success: false,
        transformed: false,
        error: (error as Error).message,
        appliedTransformations
      };
    }
  }

  async applyResponseTransformations(
    res: Response,
    rules: TransformationRule[],
    context: TransformationContext
  ): Promise<TransformationResult> {
    const appliedTransformations: string[] = [];

    try {
      // Get response data
      let responseData: any;
      if (res.locals && res.locals.responseData) {
        responseData = res.locals.responseData;
      } else if ((res as any).data) {
        responseData = (res as any).data;
      }

      if (!responseData) {
        return {
          success: true,
          transformed: false,
          appliedTransformations
        };
      }

      const result = await this.transformData(responseData, rules, context, 'response.data');
      
      if (result.transformed) {
        // Update response data
        if (res.locals) {
          res.locals.responseData = result.data;
        }
        (res as any).data = result.data;
      }

      logger.info('Response transformations applied', {
        requestId: context.requestId,
        transformations: result.appliedTransformations,
        privacyLevel: context.privacyLevel
      });

      return {
        success: true,
        transformed: result.transformed,
        data: result.data,
        appliedTransformations: result.appliedTransformations
      };

    } catch (error) {
      logger.error('Response transformation failed:', error);
      
      return {
        success: false,
        transformed: false,
        error: (error as Error).message,
        appliedTransformations
      };
    }
  }

  private async transformData(
    data: any,
    rules: TransformationRule[],
    context: TransformationContext,
    path: string
  ): Promise<TransformationResult> {
    const appliedTransformations: string[] = [];
    let transformed = false;
    let result = data;

    try {
      // Apply rules that match this data path
      const applicableRules = rules.filter(rule => 
        this.ruleMatchesPath(rule, path, result)
      );

      for (const rule of applicableRules) {
        const transformationResult = await this.applyTransformation(rule, result, context);
        
        if (transformationResult.transformed) {
          result = transformationResult.data;
          transformed = true;
          appliedTransformations.push(`${rule.type}:${rule.field}`);
        }
      }

      // Recursively transform nested objects
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const transformedObj: any = {};
        
        for (const [key, value] of Object.entries(result)) {
          const nestedPath = `${path}.${key}`;
          const nestedResult = await this.transformData(value, rules, context, nestedPath);
          
          if (nestedResult.transformed) {
            transformedObj[key] = nestedResult.data;
            transformed = true;
            appliedTransformations.push(...nestedResult.appliedTransformations);
          } else {
            transformedObj[key] = value;
          }
        }
        
        result = transformedObj;
      }

      // Transform arrays
      else if (Array.isArray(result)) {
        const transformedArray = [];
        
        for (let i = 0; i < result.length; i++) {
          const itemPath = `${path}[${i}]`;
          const itemResult = await this.transformData(result[i], rules, context, itemPath);
          
          transformedArray.push(itemResult.data || result[i]);
          
          if (itemResult.transformed) {
            transformed = true;
            appliedTransformations.push(...itemResult.appliedTransformations);
          }
        }
        
        result = transformedArray;
      }

      return {
        success: true,
        transformed,
        data: result,
        appliedTransformations
      };

    } catch (error) {
      logger.error(`Data transformation failed for path ${path}:`, error);
      
      return {
        success: false,
        transformed: false,
        error: (error as Error).message,
        appliedTransformations
      };
    }
  }

  private async applyTransformation(
    rule: TransformationRule,
    data: any,
    _context: TransformationContext
  ): Promise<TransformationResult> {
    try {
      let transformedData = data;

      switch (rule.type) {
        case 'mask':
          transformedData = this.maskData(data, rule.parameters as MaskingConfig);
          break;
          
        case 'encrypt':
          transformedData = await this.encryptData(data, rule.parameters as EncryptionConfig);
          break;
          
        case 'hash':
          transformedData = this.hashData(data, rule.parameters);
          break;
          
        case 'remove':
          transformedData = undefined;
          break;
          
        case 'pseudonymize':
          transformedData = this.pseudonymizeData(data, rule.parameters as PseudonymizationConfig);
          break;
          
        default:
          throw new Error(`Unknown transformation type: ${rule.type}`);
      }

      return {
        success: true,
        transformed: transformedData !== data,
        data: transformedData,
        appliedTransformations: [`${rule.type}:${rule.field}`]
      };

    } catch (error) {
      logger.error(`Transformation ${rule.type} failed:`, error);
      
      return {
        success: false,
        transformed: false,
        error: (error as Error).message,
        appliedTransformations: []
      };
    }
  }

  private maskData(data: any, config: MaskingConfig): any {
    if (data === null || data === undefined) {
      return data;
    }

    const str = String(data);
    const maskChar = config.maskChar || '*';
    
    switch (config.type) {
      case 'full':
        return maskChar.repeat(str.length);
        
      case 'partial':
        const visible = config.visibleChars || 4;
        if (str.length <= visible) {
          return maskChar.repeat(str.length);
        }
        return str.substring(0, visible) + maskChar.repeat(str.length - visible);
        
      case 'hash':
        return createHash('sha256').update(str).digest('hex').substring(0, config.preserveLength ? str.length : 16);
        
      default:
        return data;
    }
  }

  private async encryptData(data: any, config: EncryptionConfig): Promise<string> {
    if (data === null || data === undefined) {
      return data;
    }

    return this.encryptValue(String(data), config);
  }

  public encryptValue(data: string, config: EncryptionConfig): string {
    const key = this.getEncryptionKey(config.keyId);
    const iv = randomBytes(config.ivLength || 16);
    const cipher = createCipheriv(config.algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  public decryptValue(encrypted: string, config: EncryptionConfig): string {
    if (encrypted === null || encrypted === undefined) {
      return encrypted;
    }

    const key = this.getEncryptionKey(config.keyId);

    const separatorIndex = encrypted.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error('Invalid encrypted payload format');
    }

    const iv = Buffer.from(encrypted.slice(0, separatorIndex), 'hex');
    const encryptedHex = encrypted.slice(separatorIndex + 1);
    const decipher = createDecipheriv(config.algorithm, key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private hashData(data: any, parameters?: any): string {
    if (data === null || data === undefined) {
      return data;
    }

    const algorithm = parameters?.algorithm || 'sha256';
    const str = String(data);
    
    return createHash(algorithm).update(str).digest('hex');
  }

  private pseudonymizeData(data: any, config: PseudonymizationConfig): string {
    if (data === null || data === undefined) {
      return data;
    }

    const str = String(data);
    const salt = config.salt || 'default';
    const algorithm = config.algorithm || 'sha256';
    
    if (config.deterministic) {
      // Deterministic pseudonymization - same input always produces same output
      const hash = createHash(algorithm).update(salt + str).digest('hex');
      
      if (config.preserveFormat) {
        // Try to preserve original format (e.g., email structure)
        return this.preserveFormat(str, hash);
      }
      
      return hash;
    } else {
      // Non-deterministic - random but reversible with salt
      return createHash(algorithm).update(salt + str + randomBytes(8).toString('hex')).digest('hex');
    }
  }

  private preserveFormat(original: string, pseudonym: string): string {
    // Simple format preservation for common patterns
    if (original.includes('@')) {
      // Email format
      const [local, domain] = original.split('@');
      const pseudoLocal = pseudonym.substring(0, local.length);
      return `${pseudoLocal}@${domain}`;
    }
    
    if (original.includes('-')) {
      // Phone number or similar format
      const parts = original.split('-');
      const pseudoParts = parts.map((part, index) => {
        const start = index * (pseudonym.length / parts.length);
        const end = start + part.length;
        return pseudonym.substring(start, end);
      });
      return pseudoParts.join('-');
    }
    
    // Default: return pseudonym with original length
    return pseudonym.substring(0, original.length);
  }

  private async transformHeaders(
    headers: any,
    rules: TransformationRule[],
    context: TransformationContext
  ): Promise<TransformationResult> {
    const appliedTransformations: string[] = [];
    let transformed = false;

    try {
      const headerRules = rules.filter(rule => 
        rule.field.startsWith('headers.') || rule.field.startsWith('header.')
      );

      for (const rule of headerRules) {
        const headerName = rule.field.replace(/^headers?\./, '');
        const headerValue = headers[headerName];
        
        if (headerValue !== undefined) {
          const result = await this.applyTransformation(rule, headerValue, context);
          
          if (result.transformed) {
            headers[headerName] = result.data;
            transformed = true;
            appliedTransformations.push(`${rule.type}:headers.${headerName}`);
          }
        }
      }

      return {
        success: true,
        transformed,
        data: headers,
        appliedTransformations
      };

    } catch (error) {
      logger.error('Header transformation failed:', error);
      
      return {
        success: false,
        transformed: false,
        error: (error as Error).message,
        appliedTransformations
      };
    }
  }

  private ruleMatchesPath(rule: TransformationRule, path: string, data: any): boolean {
    // Simple field matching - can be enhanced with regex patterns
    if (rule.field === '*') {
      return true;
    }
    
    if (rule.field === path) {
      return true;
    }
    
    // Check if field is a property in the current data
    if (data && typeof data === 'object' && rule.field in data) {
      return true;
    }
    
    // Check for nested field matching
    if (path.endsWith('.' + rule.field)) {
      return true;
    }
    
    return false;
  }

  private initializeEncryptionKeys(): void {
    const loadResult = this.keyStore.load();
    this.keysLoadedAtMtimeMs = this.keyStore.getLastModifiedMs();

    if (loadResult.status === 'recovered') {
      this.encryptionKeys = loadResult.keys;
      logger.info('Recovered encryption keys from durable store on startup', {
        keyCount: loadResult.keys.size,
        keyIds: Array.from(loadResult.keys.keys()),
        storePath: this.keyStore.getFilePath()
      });
      return;
    }

    if (loadResult.status === 'corrupted') {
      logger.warn('Encryption key store is corrupted; regenerating fresh default key', {
        storePath: this.keyStore.getFilePath()
      });
    } else if (loadResult.status === 'empty') {
      logger.warn('Encryption key store exists but contains no valid keys; regenerating fresh default key', {
        storePath: this.keyStore.getFilePath()
      });
    } else {
      logger.warn('No encryption keys found in durable store; generating fresh default key', {
        storePath: this.keyStore.getFilePath()
      });
    }

    const defaultKey = randomBytes(32);
    this.encryptionKeys.set('default', defaultKey);
    this.persistEncryptionKeys();

    logger.info('Fresh default encryption key generated and persisted', {
      keyId: 'default',
      storePath: this.keyStore.getFilePath(),
      reason: loadResult.status
    });
  }

  private syncKeysFromStore(force = false): void {
    if (!force && !this.keyStore.hasExternalChanges(this.keysLoadedAtMtimeMs)) {
      return;
    }

    const loadResult = this.keyStore.load();
    this.keysLoadedAtMtimeMs = this.keyStore.getLastModifiedMs();

    if (loadResult.status === 'recovered') {
      this.encryptionKeys = loadResult.keys;
      logger.info('Synchronized encryption keys from durable store', {
        keyCount: loadResult.keys.size,
        keyIds: Array.from(loadResult.keys.keys()),
        storePath: this.keyStore.getFilePath()
      });
    }
  }

  private getEncryptionKey(keyId: string): Buffer {
    this.syncKeysFromStore();

    let key = this.encryptionKeys.get(keyId);
    if (!key) {
      // Force a reload from the store in case the mtime-based
      // sync check missed an external update (e.g. same-second writes).
      this.syncKeysFromStore(true);
      key = this.encryptionKeys.get(keyId);
    }
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    return key;
  }

  private initializeDefaultSalts(): void {
    this.pseudonymizationSalts.set('default', 'stellar_privacy_salt_2024');
  }

  private persistEncryptionKeys(): void {
    try {
      this.keyStore.save(this.encryptionKeys);
      this.keysLoadedAtMtimeMs = this.keyStore.getLastPersistedMtimeMs();
    } catch (error) {
      logger.error('Failed to persist encryption keys', {
        storePath: this.keyStore.getFilePath(),
        error: (error as Error).message
      });
      throw error;
    }
  }

  public addEncryptionKey(keyId: string, key: Buffer): void {
    if (!keyId || key.length === 0) {
      throw new Error('Encryption key id and material are required');
    }

    this.encryptionKeys.set(keyId, key);
    this.persistEncryptionKeys();
    logger.info(`Encryption key added: ${keyId}`, {
      storePath: this.keyStore.getFilePath()
    });
  }

  public removeEncryptionKey(keyId: string): void {
    if (!this.encryptionKeys.has(keyId)) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    if (this.encryptionKeys.size <= 1) {
      throw new Error('Cannot remove the last remaining encryption key');
    }

    this.encryptionKeys.delete(keyId);
    this.persistEncryptionKeys();
    logger.info(`Encryption key removed: ${keyId}`, {
      storePath: this.keyStore.getFilePath()
    });
  }

  public addPseudonymizationSalt(saltId: string, salt: string): void {
    this.pseudonymizationSalts.set(saltId, salt);
    logger.info(`Pseudonymization salt added: ${saltId}`);
  }

  public getTransformationStats(): {
    totalTransformations: number;
    cacheSize: number;
    encryptionKeys: number;
    pseudonymizationSalts: number;
  } {
    return {
      totalTransformations: this.transformationCache.size,
      cacheSize: this.transformationCache.size,
      encryptionKeys: this.encryptionKeys.size,
      pseudonymizationSalts: this.pseudonymizationSalts.size
    };
  }
}
