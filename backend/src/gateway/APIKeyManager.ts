import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';

export interface APIKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  restrictions: {
    allowedIPs: string[];
    allowedOrigins: string[];
    allowedServices: string[];
  };
  metadata: {
    owner: string;
    department: string;
    purpose: string;
    createdAt: Date;
    expiresAt?: Date;
    lastUsedAt?: Date;
    isActive: boolean;
  };
}

export interface APIKeyValidation {
  valid: boolean;
  keyInfo?: APIKey;
  reason?: string;
}

export interface APIKeyCreateRequest {
  name: string;
  permissions: string[];
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  restrictions?: {
    allowedIPs?: string[];
    allowedOrigins?: string[];
    allowedServices?: string[];
  };
  metadata: {
    owner: string;
    department: string;
    purpose: string;
    expiresAt?: Date;
  };
}

export interface APIKeyUsage {
  keyId: string;
  timestamp: Date;
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent: string;
  responseTime: number;
  statusCode: number;
}

export class APIKeyManager {
  private keys: Map<string, APIKey>;
  private usageLogs: APIKeyUsage[];
  private keyPrefixLength: number;
  private keyLength: number;

  constructor() {
    this.keys = new Map();
    this.usageLogs = [];
    this.keyPrefixLength = 8;
    this.keyLength = 64;
    
    this.initializeDefaultKeys();
    this.setupUsageLogCleanup();
  }

  async createKey(request: APIKeyCreateRequest): Promise<{ key: string; keyInfo: APIKey }> {
    try {
      // Generate API key
      const apiKey = this.generateAPIKey();
      const keyHash = this.hashKey(apiKey);
      const keyPrefix = apiKey.substring(0, this.keyPrefixLength);
      
      const keyInfo: APIKey = {
        id: this.generateKeyId(),
        name: request.name,
        keyHash,
        keyPrefix,
        permissions: request.permissions,
        rateLimit: request.rateLimit || {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
          requestsPerDay: 10000
        },
        restrictions: {
          allowedIPs: request.restrictions?.allowedIPs || [],
          allowedOrigins: request.restrictions?.allowedOrigins || [],
          allowedServices: request.restrictions?.allowedServices || []
        },
        metadata: {
          ...request.metadata,
          createdAt: new Date(),
          isActive: true
        }
      };
      
      // Store the key
      this.keys.set(keyInfo.id, keyInfo);
      
      logger.info('API key created', {
        keyId: keyInfo.id,
        keyPrefix,
        owner: request.metadata.owner,
        permissions: request.permissions
      });
      
      return { key: apiKey, keyInfo };
      
    } catch (error) {
      logger.error('Failed to create API key:', error);
      throw new Error(`API key creation failed: ${(error as Error).message}`);
    }
  }

  async validateKey(apiKey: string, context?: {
    ipAddress?: string;
    origin?: string;
    service?: string;
  }): Promise<APIKeyValidation> {
    try {
      if (!apiKey || typeof apiKey !== 'string') {
        return { valid: false, reason: 'Invalid API key format' };
      }
      
      // Extract prefix for quick lookup
      const prefix = apiKey.substring(0, this.keyPrefixLength);
      
      // Find key by prefix (more efficient than iterating all keys)
      const keyInfo = Array.from(this.keys.values()).find(k => k.keyPrefix === prefix);
      
      if (!keyInfo) {
        return { valid: false, reason: 'API key not found' };
      }
      
      // Check if key is active
      if (!keyInfo.metadata.isActive) {
        return { valid: false, reason: 'API key is deactivated' };
      }
      
      // Check if key has expired
      if (keyInfo.metadata.expiresAt && keyInfo.metadata.expiresAt < new Date()) {
        return { valid: false, reason: 'API key has expired' };
      }
      
      // Verify key hash
      const inputHash = this.hashKey(apiKey);
      if (!timingSafeEqual(Buffer.from(inputHash), Buffer.from(keyInfo.keyHash))) {
        return { valid: false, reason: 'Invalid API key' };
      }
      
      // Check restrictions
      const restrictionCheck = this.checkRestrictions(keyInfo, context);
      if (!restrictionCheck.allowed) {
        return { valid: false, reason: restrictionCheck.reason };
      }
      
      // Update last used timestamp
      keyInfo.metadata.lastUsedAt = new Date();
      
      return { valid: true, keyInfo };
      
    } catch (error) {
      logger.error('API key validation error:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  async revokeKey(keyId: string): Promise<boolean> {
    try {
      const keyInfo = this.keys.get(keyId);
      if (!keyInfo) {
        return false;
      }
      
      keyInfo.metadata.isActive = false;
      
      logger.info('API key revoked', {
        keyId,
        keyPrefix: keyInfo.keyPrefix,
        owner: keyInfo.metadata.owner
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to revoke API key:', error);
      return false;
    }
  }

  async deleteKey(keyId: string): Promise<boolean> {
    try {
      const keyInfo = this.keys.get(keyId);
      if (!keyInfo) {
        return false;
      }
      
      this.keys.delete(keyId);
      
      logger.info('API key deleted', {
        keyId,
        keyPrefix: keyInfo.keyPrefix,
        owner: keyInfo.metadata.owner
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to delete API key:', error);
      return false;
    }
  }

  async updateKey(keyId: string, updates: Partial<APIKey>): Promise<boolean> {
    try {
      const keyInfo = this.keys.get(keyId);
      if (!keyInfo) {
        return false;
      }
      
      // Update allowed fields
      if (updates.name) keyInfo.name = updates.name;
      if (updates.permissions) keyInfo.permissions = updates.permissions;
      if (updates.rateLimit) keyInfo.rateLimit = { ...keyInfo.rateLimit, ...updates.rateLimit };
      if (updates.restrictions) {
        keyInfo.restrictions = { ...keyInfo.restrictions, ...updates.restrictions };
      }
      if (updates.metadata) {
        keyInfo.metadata = { ...keyInfo.metadata, ...updates.metadata };
      }
      
      logger.info('API key updated', {
        keyId,
        keyPrefix: keyInfo.keyPrefix,
        updates: Object.keys(updates)
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to update API key:', error);
      return false;
    }
  }

  async getKeyInfo(keyId: string): Promise<APIKey | null> {
    return this.keys.get(keyId) || null;
  }

  async listKeys(filter?: {
    owner?: string;
    department?: string;
    active?: boolean;
    permissions?: string[];
  }): Promise<APIKey[]> {
    let keys = Array.from(this.keys.values());
    
    if (filter) {
      if (filter.owner) {
        keys = keys.filter(k => k.metadata.owner === filter.owner);
      }
      if (filter.department) {
        keys = keys.filter(k => k.metadata.department === filter.department);
      }
      if (filter.active !== undefined) {
        keys = keys.filter(k => k.metadata.isActive === filter.active);
      }
      if (filter.permissions && filter.permissions.length > 0) {
        keys = keys.filter(k => 
          filter.permissions!.some(perm => k.permissions.includes(perm))
        );
      }
    }
    
    // Return keys without sensitive information
    return keys.map(key => ({
      ...key,
      keyHash: '[REDACTED]'
    }));
  }

  async recordUsage(usage: Omit<APIKeyUsage, 'timestamp'>): Promise<void> {
    const usageRecord: APIKeyUsage = {
      ...usage,
      timestamp: new Date()
    };
    
    this.usageLogs.push(usageRecord);
    
    // Keep only last 10000 records per key
    const keyUsages = this.usageLogs.filter(u => u.keyId === usage.keyId);
    if (keyUsages.length > 10000) {
      const toRemove = keyUsages.slice(0, keyUsages.length - 10000);
      this.usageLogs = this.usageLogs.filter(u => !toRemove.includes(u));
    }
  }

  async getUsageStats(keyId: string, timeRange?: {
    start: Date;
    end: Date;
  }): Promise<{
    totalRequests: number;
    averageResponseTime: number;
    successRate: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    hourlyUsage: Array<{ hour: string; count: number }>;
  }> {
    let filteredUsage = this.usageLogs.filter(u => u.keyId === keyId);
    
    if (timeRange) {
      filteredUsage = filteredUsage.filter(u => 
        u.timestamp >= timeRange.start && u.timestamp <= timeRange.end
      );
    }
    
    const totalRequests = filteredUsage.length;
    const averageResponseTime = totalRequests > 0 
      ? filteredUsage.reduce((sum, u) => sum + u.responseTime, 0) / totalRequests 
      : 0;
    const successRate = totalRequests > 0 
      ? filteredUsage.filter(u => u.statusCode < 400).length / totalRequests 
      : 0;
    
    // Top endpoints
    const endpointCounts = new Map<string, number>();
    filteredUsage.forEach(u => {
      endpointCounts.set(u.endpoint, (endpointCounts.get(u.endpoint) || 0) + 1);
    });
    
    const topEndpoints = Array.from(endpointCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));
    
    // Hourly usage
    const hourlyCounts = new Map<string, number>();
    filteredUsage.forEach(u => {
      const hour = u.timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    });
    
    const hourlyUsage = Array.from(hourlyCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, count }));
    
    return {
      totalRequests,
      averageResponseTime,
      successRate,
      topEndpoints,
      hourlyUsage
    };
  }

  private generateAPIKey(): string {
    return randomBytes(this.keyLength).toString('hex');
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private generateKeyId(): string {
    return `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private checkRestrictions(
    keyInfo: APIKey,
    context?: {
      ipAddress?: string;
      origin?: string;
      service?: string;
    }
  ): { allowed: boolean; reason?: string } {
    if (!context) {
      return { allowed: true };
    }
    
    // Check IP restrictions
    if (keyInfo.restrictions.allowedIPs.length > 0 && context.ipAddress) {
      if (!keyInfo.restrictions.allowedIPs.includes(context.ipAddress)) {
        return { allowed: false, reason: 'IP address not allowed' };
      }
    }
    
    // Check origin restrictions
    if (keyInfo.restrictions.allowedOrigins.length > 0 && context.origin) {
      if (!keyInfo.restrictions.allowedOrigins.some(allowed => 
        context.origin!.includes(allowed)
      )) {
        return { allowed: false, reason: 'Origin not allowed' };
      }
    }
    
    // Check service restrictions
    if (keyInfo.restrictions.allowedServices.length > 0 && context.service) {
      if (!keyInfo.restrictions.allowedServices.includes(context.service)) {
        return { allowed: false, reason: 'Service not allowed' };
      }
    }
    
    return { allowed: true };
  }

  private initializeDefaultKeys(): void {
    // Create a default admin key for development
    const adminKey: APIKey = {
      id: 'admin_key_default',
      name: 'Default Admin Key',
      keyHash: this.hashKey('stellar_admin_default_key_1234567890abcdef'),
      keyPrefix: 'stellar_ad',
      permissions: ['admin', 'read', 'write', 'delete'],
      rateLimit: {
        requestsPerMinute: 1000,
        requestsPerHour: 50000,
        requestsPerDay: 1000000
      },
      restrictions: {
        allowedIPs: [],
        allowedOrigins: [],
        allowedServices: []
      },
      metadata: {
        owner: 'system',
        department: 'admin',
        purpose: 'System administration',
        createdAt: new Date(),
        isActive: true
      }
    };
    
    this.keys.set(adminKey.id, adminKey);
  }

  private setupUsageLogCleanup(): void {
    // Clean up old usage logs every hour
    setInterval(() => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const beforeCount = this.usageLogs.length;
      
      this.usageLogs = this.usageLogs.filter(log => log.timestamp > cutoff);
      
      const removed = beforeCount - this.usageLogs.length;
      if (removed > 0) {
        logger.debug(`Cleaned up ${removed} old API key usage logs`);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  public getStats(): {
    totalKeys: number;
    activeKeys: number;
    totalUsage: number;
    keysByDepartment: Record<string, number>;
  } {
    const keys = Array.from(this.keys.values());
    const keysByDepartment: Record<string, number> = {};
    
    keys.forEach(key => {
      const dept = key.metadata.department;
      keysByDepartment[dept] = (keysByDepartment[dept] || 0) + 1;
    });
    
    return {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.metadata.isActive).length,
      totalUsage: this.usageLogs.length,
      keysByDepartment
    };
  }
}
