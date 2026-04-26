import { logger } from '../utils/logger';

export interface UserAttributes {
  userId?: string;
  roles: string[];
  department?: string;
  clearanceLevel?: string;
  ipAddress?: string;
  jurisdiction?: string;
  consent: boolean;
  purpose?: string;
  dataClassification?: string;
  apiKeyPermissions?: string[];
  [key: string]: any;
}

export interface Resource {
  path: string;
  method: string;
  service: string;
  dataClassification?: string;
  sensitivityLevel?: string;
  requiredConsent?: boolean;
  jurisdiction?: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  policy: string;
  context: {
    userAttributes: UserAttributes;
    resource: Resource;
    matchedRules: string[];
    timestamp: Date;
  };
}

export interface ABACPolicy {
  id: string;
  name: string;
  description: string;
  rules: ABACRule[];
  priority: number;
  enabled: boolean;
  effect: 'allow' | 'deny';
}

export interface ABACRule {
  id: string;
  name: string;
  target: {
    users?: AttributeCondition[];
    resources?: AttributeCondition[];
    environment?: AttributeCondition[];
  };
  condition: LogicalExpression;
}

export interface AttributeCondition {
  attribute: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than';
  value: any;
}

export interface LogicalExpression {
  operator: 'and' | 'or' | 'not';
  operands: (LogicalExpression | AttributeCondition)[];
}

export class ABACService {
  private policies: Map<string, ABACPolicy>;
  private attributeResolver: AttributeResolver;
  private decisionCache: Map<string, AccessDecision>;
  private cacheTimeout: number;

  constructor() {
    this.policies = new Map();
    this.attributeResolver = new AttributeResolver();
    this.decisionCache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    
    this.initializeDefaultPolicies();
    this.setupCacheCleanup();
  }

  async evaluateAccess(
    userAttributes: UserAttributes,
    resource: Resource
  ): Promise<AccessDecision> {
    const startTime = Date.now();
    const cacheKey = this.createDecisionCacheKey(userAttributes, resource);
    
    // Check cache first
    const cached = this.decisionCache.get(cacheKey);
    if (cached && (Date.now() - cached.context.timestamp.getTime() < this.cacheTimeout)) {
      return cached;
    }
    
    try {
      // Resolve dynamic attributes
      const resolvedAttributes = await this.attributeResolver.resolve(userAttributes, resource);
      
      // Get applicable policies
      const applicablePolicies = this.getApplicablePolicies(resolvedAttributes, resource);
      
      // Evaluate policies in priority order
      const decisions: AccessDecision[] = [];
      
      for (const policy of applicablePolicies) {
        const decision = await this.evaluatePolicy(policy, resolvedAttributes, resource);
        decisions.push(decision);
        
        // Deny policies take precedence over allow policies
        if (!decision.allowed && policy.effect === 'deny') {
          this.cacheDecision(cacheKey, decision);
          return decision;
        }
      }
      
      // If no deny policies matched, check for allow policies
      const allowDecision = decisions.find(d => d.allowed);
      if (allowDecision) {
        this.cacheDecision(cacheKey, allowDecision);
        return allowDecision;
      }
      
      // Default deny
      const defaultDecision: AccessDecision = {
        allowed: false,
        reason: 'No applicable policies found - default deny',
        policy: 'default',
        context: {
          userAttributes: resolvedAttributes,
          resource,
          matchedRules: [],
          timestamp: new Date()
        }
      };
      
      this.cacheDecision(cacheKey, defaultDecision);
      return defaultDecision;
      
    } catch (error) {
      logger.error('ABAC evaluation error:', error);
      
      const errorDecision: AccessDecision = {
        allowed: false,
        reason: `ABAC evaluation error: ${(error as Error).message}`,
        policy: 'error',
        context: {
          userAttributes,
          resource,
          matchedRules: [],
          timestamp: new Date()
        }
      };
      
      return errorDecision;
    }
  }

  private async evaluatePolicy(
    policy: ABACPolicy,
    userAttributes: UserAttributes,
    resource: Resource
  ): Promise<AccessDecision> {
    try {
      const matchedRules: string[] = [];
      
      // Check if policy applies to this user and resource
      const targetMatch = this.evaluateTarget(policy.target, userAttributes, resource);
      if (!targetMatch) {
        return {
          allowed: false,
          reason: 'Policy target does not match',
          policy: policy.id,
          context: {
            userAttributes,
            resource,
            matchedRules: [],
            timestamp: new Date()
          }
        };
      }
      
      // Evaluate policy condition
      const conditionResult = this.evaluateLogicalExpression(policy.condition, userAttributes, resource);
      
      const decision: AccessDecision = {
        allowed: policy.effect === 'allow' ? conditionResult.result : !conditionResult.result,
        reason: conditionResult.result ? 
          `Policy ${policy.effect} - condition satisfied: ${conditionResult.explanation}` :
          `Policy ${policy.effect} - condition not satisfied: ${conditionResult.explanation}`,
        policy: policy.id,
        context: {
          userAttributes,
          resource,
          matchedRules: conditionResult.matchedRules,
          timestamp: new Date()
        }
      };
      
      return decision;
      
    } catch (error) {
      logger.error(`Policy evaluation error for ${policy.id}:`, error);
      
      return {
        allowed: false,
        reason: `Policy evaluation error: ${(error as Error).message}`,
        policy: policy.id,
        context: {
          userAttributes,
          resource,
          matchedRules: [],
          timestamp: new Date()
        }
      };
    }
  }

  private evaluateTarget(
    target: any,
    userAttributes: UserAttributes,
    resource: Resource
  ): boolean {
    // If no target specified, applies to all
    if (!target || (!target.users && !target.resources && !target.environment)) {
      return true;
    }
    
    let userMatch = true;
    let resourceMatch = true;
    let environmentMatch = true;
    
    // Evaluate user conditions
    if (target.users) {
      userMatch = target.users.every((condition: AttributeCondition) =>
        this.evaluateAttributeCondition(condition, userAttributes)
      );
    }
    
    // Evaluate resource conditions
    if (target.resources) {
      resourceMatch = target.resources.every((condition: AttributeCondition) =>
        this.evaluateAttributeCondition(condition, resource)
      );
    }
    
    // Evaluate environment conditions
    if (target.environment) {
      const environment = {
        timestamp: new Date(),
        ipAddress: userAttributes.ipAddress,
        jurisdiction: userAttributes.jurisdiction
      };
      
      environmentMatch = target.environment.every((condition: AttributeCondition) =>
        this.evaluateAttributeCondition(condition, environment)
      );
    }
    
    return userMatch && resourceMatch && environmentMatch;
  }

  private evaluateLogicalExpression(
    expression: LogicalExpression,
    userAttributes: UserAttributes,
    resource: Resource
  ): { result: boolean; explanation: string; matchedRules: string[] } {
    const matchedRules: string[] = [];
    
    switch (expression.operator) {
      case 'and':
        const andResults = expression.operands.map(operand => {
          if ('operator' in operand) {
            const result = this.evaluateAttributeCondition(operand as AttributeCondition, 
              { ...userAttributes, ...resource });
            if (result) matchedRules.push(`${operand.attribute} ${operand.operator} ${operand.value}`);
            return result;
          } else {
            return this.evaluateLogicalExpression(operand as LogicalExpression, userAttributes, resource).result;
          }
        });
        
        return {
          result: andResults.every(r => r),
          explanation: `All conditions must be true: ${andResults.join(', ')}`,
          matchedRules
        };
        
      case 'or':
        const orResults = expression.operands.map(operand => {
          if ('operator' in operand) {
            const result = this.evaluateAttributeCondition(operand as AttributeCondition, 
              { ...userAttributes, ...resource });
            if (result) matchedRules.push(`${operand.attribute} ${operand.operator} ${operand.value}`);
            return result;
          } else {
            return this.evaluateLogicalExpression(operand as LogicalExpression, userAttributes, resource).result;
          }
        });
        
        return {
          result: orResults.some(r => r),
          explanation: `At least one condition must be true: ${orResults.join(', ')}`,
          matchedRules
        };
        
      case 'not':
        const operandResult = expression.operands[0];
        if ('operator' in operandResult) {
          const result = this.evaluateAttributeCondition(operandResult as AttributeCondition, 
            { ...userAttributes, ...resource });
          if (result) matchedRules.push(`NOT ${operandResult.attribute} ${operandResult.operator} ${operandResult.value}`);
          return {
            result: !result,
            explanation: `Negated condition: NOT (${operandResult.attribute} ${operandResult.operator} ${operandResult.value})`,
            matchedRules
          };
        } else {
          const innerResult = this.evaluateLogicalExpression(operandResult as LogicalExpression, userAttributes, resource);
          return {
            result: !innerResult.result,
            explanation: `Negated expression: NOT (${innerResult.explanation})`,
            matchedRules
          };
        }
        
      default:
        return {
          result: false,
          explanation: `Unknown operator: ${expression.operator}`,
          matchedRules
        };
    }
  }

  private evaluateAttributeCondition(
    condition: AttributeCondition,
    context: any
  ): boolean {
    const attributeValue = this.getAttributeValue(condition.attribute, context);
    
    switch (condition.operator) {
      case 'equals':
        return attributeValue === condition.value;
      case 'not_equals':
        return attributeValue !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(attributeValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(attributeValue);
      case 'contains':
        return String(attributeValue).includes(String(condition.value));
      case 'starts_with':
        return String(attributeValue).startsWith(String(condition.value));
      case 'ends_with':
        return String(attributeValue).endsWith(String(condition.value));
      case 'greater_than':
        return Number(attributeValue) > Number(condition.value);
      case 'less_than':
        return Number(attributeValue) < Number(condition.value);
      default:
        return false;
    }
  }

  private getAttributeValue(attribute: string, context: any): any {
    const parts = attribute.split('.');
    let value = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private getApplicablePolicies(
    userAttributes: UserAttributes,
    resource: Resource
  ): ABACPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => policy.enabled)
      .filter(policy => this.evaluateTarget(policy.target, userAttributes, resource))
      .sort((a, b) => b.priority - a.priority);
  }

  private createDecisionCacheKey(
    userAttributes: UserAttributes,
    resource: Resource
  ): string {
    const keyData = {
      userId: userAttributes.userId,
      roles: userAttributes.roles,
      department: userAttributes.department,
      resourcePath: resource.path,
      resourceMethod: resource.method,
      resourceService: resource.service
    };
    
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private cacheDecision(key: string, decision: AccessDecision): void {
    this.decisionCache.set(key, decision);
  }

  private setupCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      this.decisionCache.forEach((decision, key) => {
        if (now - decision.context.timestamp.getTime() > this.cacheTimeout) {
          keysToDelete.push(key);
        }
      });
      
      keysToDelete.forEach(key => this.decisionCache.delete(key));
      
      if (keysToDelete.length > 0) {
        logger.debug(`Cleaned up ${keysToDelete.length} expired ABAC decisions`);
      }
    }, this.cacheTimeout);
  }

  private initializeDefaultPolicies(): void {
    // Policy: Allow analysts to access analytics endpoints
    const analystPolicy: ABACPolicy = {
      id: 'analyst-access',
      name: 'Analyst Access Policy',
      description: 'Allow users with analyst role to access analytics endpoints',
      effect: 'allow',
      priority: 100,
      enabled: true,
      target: {
        users: [
          { attribute: 'roles', operator: 'contains', value: 'analyst' }
        ],
        resources: [
          { attribute: 'service', operator: 'equals', value: 'analytics' }
        ]
      },
      condition: {
        operator: 'and',
        operands: [
          { attribute: 'consent', operator: 'equals', value: true },
          { attribute: 'dataClassification', operator: 'in', value: ['public', 'internal'] }
        ]
      }
    };

    // Policy: Deny access to sensitive data without proper clearance
    const sensitiveDataPolicy: ABACPolicy = {
      id: 'sensitive-data-protection',
      name: 'Sensitive Data Protection Policy',
      description: 'Deny access to sensitive data without proper clearance',
      effect: 'deny',
      priority: 200,
      enabled: true,
      target: {
        resources: [
          { attribute: 'dataClassification', operator: 'equals', value: 'sensitive' }
        ]
      },
      condition: {
        operator: 'not',
        operands: [
          { attribute: 'clearanceLevel', operator: 'in', value: ['high', 'top-secret'] }
        ]
      }
    };

    // Policy: Require consent for personal data access
    const consentPolicy: ABACPolicy = {
      id: 'consent-requirement',
      name: 'Consent Requirement Policy',
      description: 'Require explicit consent for personal data access',
      effect: 'deny',
      priority: 150,
      enabled: true,
      target: {
        resources: [
          { attribute: 'dataClassification', operator: 'in', value: ['personal', 'pii'] }
        ]
      },
      condition: {
        operator: 'not',
        operands: [
          { attribute: 'consent', operator: 'equals', value: true }
        ]
      }
    };

    this.policies.set(analystPolicy.id, analystPolicy);
    this.policies.set(sensitiveDataPolicy.id, sensitiveDataPolicy);
    this.policies.set(consentPolicy.id, consentPolicy);
  }

  public addPolicy(policy: ABACPolicy): void {
    this.policies.set(policy.id, policy);
    this.decisionCache.clear(); // Clear cache to ensure new policy takes effect
    logger.info(`ABAC policy added: ${policy.id}`);
  }

  public updatePolicy(policyId: string, updates: Partial<ABACPolicy>): void {
    const existing = this.policies.get(policyId);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.policies.set(policyId, updated);
      this.decisionCache.clear();
      logger.info(`ABAC policy updated: ${policyId}`);
    }
  }

  public deletePolicy(policyId: string): void {
    this.policies.delete(policyId);
    this.decisionCache.clear();
    logger.info(`ABAC policy deleted: ${policyId}`);
  }

  public getPolicies(): ABACPolicy[] {
    return Array.from(this.policies.values());
  }

  public getPolicyStats(): {
    totalPolicies: number;
    enabledPolicies: number;
    cacheSize: number;
  } {
    const totalPolicies = this.policies.size;
    const enabledPolicies = Array.from(this.policies.values()).filter(p => p.enabled).length;
    
    return {
      totalPolicies,
      enabledPolicies,
      cacheSize: this.decisionCache.size
    };
  }
}

class AttributeResolver {
  async resolve(userAttributes: UserAttributes, resource: Resource): Promise<UserAttributes> {
    const resolved = { ...userAttributes };
    
    // Resolve dynamic attributes based on context
    resolved.timestamp = new Date();
    resolved.resourcePath = resource.path;
    resolved.resourceMethod = resource.method;
    resolved.resourceService = resource.service;
    
    // Resolve department-based clearance if not explicitly set
    if (!resolved.clearanceLevel && resolved.department) {
      resolved.clearanceLevel = this.getDepartmentClearance(resolved.department);
    }
    
    // Resolve jurisdiction based on IP
    if (!resolved.jurisdiction && resolved.ipAddress) {
      resolved.jurisdiction = await this.resolveJurisdiction(resolved.ipAddress);
    }
    
    return resolved;
  }

  private getDepartmentClearance(department: string): string {
    const clearanceMap: Record<string, string> = {
      'engineering': 'high',
      'data-analytics': 'high',
      'security': 'top-secret',
      'legal': 'high',
      'hr': 'medium',
      'marketing': 'low',
      'sales': 'low'
    };
    
    return clearanceMap[department.toLowerCase()] || 'low';
  }

  private async resolveJurisdiction(ipAddress: string): Promise<string> {
    // In a real implementation, this would use a GeoIP service
    // For now, return a default
    return 'US';
  }
}
