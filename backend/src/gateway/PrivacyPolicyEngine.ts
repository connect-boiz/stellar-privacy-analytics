import { Request } from 'express';
import { PolicyConfig, PolicyRule, TransformationRule } from './PrivacyApiGateway';
import { logger } from '../utils/logger';

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  policyId?: string;
  transformations?: TransformationRule[];
  auditLog: PolicyAuditLog;
}

export interface PolicyAuditLog {
  timestamp: Date;
  requestId: string;
  policyId: string;
  decision: 'allow' | 'deny';
  reason: string;
  attributes: Record<string, any>;
  processingTime: number;
}

export interface PrivacyContext {
  level: string;
  jurisdiction: string;
  dataClassification: string;
  consent: boolean;
  purpose: string;
}

export class PrivacyPolicyEngine {
  private policies: Map<string, PolicyConfig>;
  private policyCache: Map<string, PolicyEvaluationResult>;
  private cacheTimeout: number;

  constructor(policies: PolicyConfig[] = []) {
    this.policies = new Map();
    this.policyCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    policies.forEach(policy => {
      if (policy.enabled) {
        this.policies.set(policy.id, policy);
      }
    });
    
    // Set up cache cleanup
    setInterval(() => this.cleanupCache(), this.cacheTimeout);
  }

  async evaluateRequest(
    req: Request,
    privacyLevel: string,
    userAttributes: Record<string, any>
  ): Promise<PolicyEvaluationResult> {
    const startTime = Date.now();
    const requestId = (req as any).requestId || 'unknown';
    
    try {
      // Create cache key
      const cacheKey = this.createCacheKey(req, privacyLevel, userAttributes);
      
      // Check cache first
      const cached = this.policyCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Extract privacy context
      const context = this.extractPrivacyContext(req, privacyLevel, userAttributes);
      
      // Evaluate policies in priority order
      const sortedPolicies = Array.from(this.policies.values())
        .filter(p => p.enabled)
        .sort((a, b) => b.priority - a.priority);
      
      let finalResult: PolicyEvaluationResult = {
        allowed: true,
        reason: 'No policies violated',
        auditLog: {
          timestamp: new Date(),
          requestId,
          policyId: 'default',
          decision: 'allow',
          reason: 'No policies violated',
          attributes: userAttributes,
          processingTime: Date.now() - startTime
        }
      };
      
      for (const policy of sortedPolicies) {
        const result = await this.evaluatePolicy(policy, req, context, userAttributes);
        
        if (!result.allowed) {
          finalResult = result;
          break; // First denying policy wins
        } else if (result.transformations && result.transformations.length > 0) {
          // Merge transformations from allowing policies
          finalResult.transformations = [
            ...(finalResult.transformations || []),
            ...result.transformations.filter(t => t !== undefined)
          ];
        }
      }
      
      // Update cache
      this.policyCache.set(cacheKey, finalResult);
      
      // Log evaluation
      logger.info('Policy evaluation completed', {
        requestId,
        allowed: finalResult.allowed,
        processingTime: finalResult.auditLog.processingTime,
        policiesEvaluated: sortedPolicies.length
      });
      
      return finalResult;
      
    } catch (error) {
      logger.error('Policy evaluation error:', error);
      
      return {
        allowed: false,
        reason: 'Policy evaluation failed',
        auditLog: {
          timestamp: new Date(),
          requestId,
          policyId: 'error',
          decision: 'deny',
          reason: 'Policy evaluation error',
          attributes: userAttributes,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  private async evaluatePolicy(
    policy: PolicyConfig,
    req: Request,
    context: PrivacyContext,
    userAttributes: Record<string, any>
  ): Promise<PolicyEvaluationResult> {
    const startTime = Date.now();
    const requestId = (req as any).requestId || 'unknown';
    
    try {
      for (const rule of policy.rules) {
        const evaluation = await this.evaluateRule(rule, req, context, userAttributes);
        
        if (evaluation.matched) {
          const result: PolicyEvaluationResult = {
            allowed: evaluation.action !== 'deny',
            reason: evaluation.reason || `Rule ${rule.attribute} ${rule.operator} ${rule.value} triggered ${evaluation.action}`,
            policyId: policy.id,
            transformations: evaluation.action === 'transform' ? [rule.transformation].filter(Boolean) : undefined,
            auditLog: {
              timestamp: new Date(),
              requestId,
              policyId: policy.id,
              decision: evaluation.action === 'deny' ? 'deny' : 'allow',
              reason: evaluation.reason || `Rule matched: ${rule.attribute} ${rule.operator} ${rule.value}`,
              attributes: userAttributes,
              processingTime: Date.now() - startTime
            }
          };
          
          // Log policy action if required
          if (evaluation.action === 'log' || evaluation.action === 'deny') {
            await this.logPolicyAction(result, rule);
          }
          
          return result;
        }
      }
      
      // No rules matched - allow by default
      return {
        allowed: true,
        reason: 'No rules matched',
        policyId: policy.id,
        auditLog: {
          timestamp: new Date(),
          requestId,
          policyId: policy.id,
          decision: 'allow',
          reason: 'No rules matched',
          attributes: userAttributes,
          processingTime: Date.now() - startTime
        }
      };
      
    } catch (error: any) {
      logger.error(`Policy evaluation error for ${policy.id}:`, error);
      
      return {
        allowed: false,
        reason: `Policy evaluation error: ${error.message}`,
        policyId: policy.id,
        auditLog: {
          timestamp: new Date(),
          requestId,
          policyId: policy.id,
          decision: 'deny',
          reason: `Policy evaluation error: ${error.message}`,
          attributes: userAttributes,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  private async evaluateRule(
    rule: PolicyRule,
    req: Request,
    context: PrivacyContext,
    userAttributes: Record<string, any>
  ): Promise<{ matched: boolean; action: string; reason?: string }> {
    let attributeValue: any;
    let reason: string;
    
    // Extract attribute value based on rule type
    switch (rule.attribute) {
      case 'privacy.level':
        attributeValue = context.level;
        break;
      case 'privacy.jurisdiction':
        attributeValue = context.jurisdiction;
        break;
      case 'privacy.dataClassification':
        attributeValue = context.dataClassification;
        break;
      case 'privacy.consent':
        attributeValue = context.consent;
        break;
      case 'privacy.purpose':
        attributeValue = context.purpose;
        break;
      case 'request.path':
        attributeValue = req.path;
        break;
      case 'request.method':
        attributeValue = req.method;
        break;
      case 'user.role':
        attributeValue = userAttributes.roles || [];
        break;
      case 'user.department':
        attributeValue = userAttributes.department;
        break;
      case 'user.ipAddress':
        attributeValue = userAttributes.ipAddress;
        break;
      default:
        attributeValue = userAttributes[rule.attribute];
    }
    
    // Handle array values (like roles)
    if (Array.isArray(attributeValue)) {
      attributeValue = attributeValue.join(',');
    }
    
    // Evaluate the condition
    let matched = false;
    
    switch (rule.operator) {
      case 'equals':
        matched = attributeValue === rule.value;
        reason = `${rule.attribute} equals ${rule.value} (actual: ${attributeValue})`;
        break;
      case 'contains':
        matched = String(attributeValue).includes(rule.value);
        reason = `${rule.attribute} contains ${rule.value} (actual: ${attributeValue})`;
        break;
      case 'startsWith':
        matched = String(attributeValue).startsWith(rule.value);
        reason = `${rule.attribute} starts with ${rule.value} (actual: ${attributeValue})`;
        break;
      case 'endsWith':
        matched = String(attributeValue).endsWith(rule.value);
        reason = `${rule.attribute} ends with ${rule.value} (actual: ${attributeValue})`;
        break;
      case 'regex':
        try {
          const regex = new RegExp(rule.value);
          matched = regex.test(String(attributeValue));
          reason = `${rule.attribute} matches regex ${rule.value} (actual: ${attributeValue})`;
        } catch (error) {
          logger.error(`Invalid regex in rule: ${rule.value}`, error);
          matched = false;
          reason = `Invalid regex: ${rule.value}`;
        }
        break;
      default:
        matched = false;
        reason = `Unknown operator: ${rule.operator}`;
    }
    
    return { matched, action: rule.action, reason };
  }

  private extractPrivacyContext(
    req: Request,
    privacyLevel: string,
    userAttributes: Record<string, any>
  ): PrivacyContext {
    return {
      level: privacyLevel,
      jurisdiction: req.headers['x-jurisdiction'] as string || 'US',
      dataClassification: req.headers['x-data-classification'] as string || 'confidential',
      consent: req.headers['x-consent'] === 'true',
      purpose: req.headers['x-purpose'] as string || 'analytics'
    };
  }

  private createCacheKey(
    req: Request,
    privacyLevel: string,
    userAttributes: Record<string, any>
  ): string {
    const keyData = {
      path: req.path,
      method: req.method,
      privacyLevel,
      userRole: userAttributes.roles || [],
      department: userAttributes.department,
      jurisdiction: req.headers['x-jurisdiction'],
      dataClassification: req.headers['x-data-classification']
    };
    
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.policyCache.forEach((value, key) => {
      if (now - value.auditLog.timestamp.getTime() > this.cacheTimeout) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.policyCache.delete(key));
    
    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} expired policy cache entries`);
    }
  }

  private async logPolicyAction(result: PolicyEvaluationResult, rule: PolicyRule): Promise<void> {
    // In a real implementation, this would write to an audit log
    logger.info('Policy action logged', {
      requestId: result.auditLog.requestId,
      policyId: result.policyId,
      decision: result.auditLog.decision,
      reason: result.auditLog.reason,
      rule: {
        attribute: rule.attribute,
        operator: rule.operator,
        value: rule.value,
        action: rule.action
      },
      timestamp: result.auditLog.timestamp
    });
  }

  public getPolicies(): PolicyConfig[] {
    return Array.from(this.policies.values());
  }

  public async updatePolicy(policy: PolicyConfig): Promise<void> {
    this.policies.set(policy.id, policy);
    
    // Clear cache to ensure new policy takes effect
    this.policyCache.clear();
    
    logger.info(`Policy updated: ${policy.id}`, {
      enabled: policy.enabled,
      rulesCount: policy.rules.length,
      priority: policy.priority
    });
  }

  public async deletePolicy(policyId: string): Promise<void> {
    this.policies.delete(policyId);
    this.policyCache.clear();
    
    logger.info(`Policy deleted: ${policyId}`);
  }

  public getPolicyStats(): {
    totalPolicies: number;
    enabledPolicies: number;
    cacheSize: number;
    cacheHitRate: number;
  } {
    const totalPolicies = this.policies.size;
    const enabledPolicies = Array.from(this.policies.values()).filter(p => p.enabled).length;
    
    return {
      totalPolicies,
      enabledPolicies,
      cacheSize: this.policyCache.size,
      cacheHitRate: 0 // In real implementation, track hit/miss ratio
    };
  }
}
