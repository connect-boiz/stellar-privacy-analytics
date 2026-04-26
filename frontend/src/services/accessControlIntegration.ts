/**
 * Access Control Integration Service
 */

import {
  DatasetMetadata,
  AccessMetadata,
  AccessPermission,
  AccessRole,
  AccessPolicy,
  AccessRequest,
  AccessAudit,
  AccessRestriction,
  PrivacyMetadata,
  ComplianceFramework
} from '../types/dataCatalog';

export interface AccessControlConfig {
  enabled: boolean;
  enforceByDefault: boolean;
  auditAllAccess: boolean;
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
  integrationMode: 'standalone' | 'ldap' | 'oauth' | 'saml' | 'custom';
  externalSystems: ExternalSystemConfig[];
  defaultPolicies: DefaultPolicyConfig[];
  approvalWorkflows: ApprovalWorkflowConfig[];
}

export interface ExternalSystemConfig {
  type: 'ldap' | 'active_directory' | 'oauth' | 'saml' | 'rbac' | 'abac' | 'custom';
  name: string;
  endpoint: string;
  credentials: SystemCredentials;
  syncEnabled: boolean;
  syncInterval: number; // minutes
  mapping: FieldMapping[];
  filters: SyncFilter[];
}

export interface SystemCredentials {
  type: 'username_password' | 'token' | 'certificate' | 'api_key' | 'oauth_client';
  username?: string;
  password?: string;
  token?: string;
  certificate?: string;
  privateKey?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
  required: boolean;
}

export interface SyncFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in';
  value: any;
}

export interface DefaultPolicyConfig {
  name: string;
  description: string;
  scope: PolicyScope;
  rules: DefaultPolicyRule[];
  priority: number;
  enabled: boolean;
}

export interface DefaultPolicyRule {
  effect: 'allow' | 'deny' | 'require_approval';
  actions: string[];
  conditions: PolicyCondition[];
  exceptions: PolicyException[];
}

export interface PolicyScope {
  resources: string[];
  principals: string[];
  actions: string[];
  environments: string[];
}

export interface PolicyCondition {
  attribute: string;
  operator: string;
  value: any;
  description: string;
}

export interface PolicyException {
  condition: PolicyCondition;
  effect: 'allow' | 'deny';
  reason: string;
  expiresAt?: number;
}

export interface ApprovalWorkflowConfig {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  timeout: number; // hours
  autoApproveConditions: PolicyCondition[];
}

export interface WorkflowTrigger {
  type: 'access_request' | 'policy_violation' | 'privilege_escalation' | 'custom';
  conditions: PolicyCondition[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'notification' | 'verification' | 'custom';
  assignee: string | string[] | 'manager' | 'owner' | 'admin' | 'custom';
  conditions: PolicyCondition[];
  actions: WorkflowAction[];
  timeout: number; // hours
  required: boolean;
}

export interface WorkflowAction {
  type: 'send_email' | 'send_notification' | 'create_ticket' | 'update_permission' | 'log_audit' | 'custom';
  parameters: Record<string, any>;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  policies: string[];
  conditions: PolicyCondition[];
  expiresAt?: number;
  restrictions: AccessRestriction[];
  auditRequired: boolean;
  approvalRequired: boolean;
}

export interface AccessContext {
  user: UserContext;
  resource: ResourceContext;
  action: string;
  environment: string;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestMetadata?: Record<string, any>;
}

export interface UserContext {
  id: string;
  username: string;
  email: string;
  roles: string[];
  groups: string[];
  department: string;
  location: string;
  clearance: string;
  attributes: Record<string, any>;
  sessionInfo: SessionInfo;
}

export interface SessionInfo {
  id: string;
  startTime: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
  riskScore: number;
}

export interface ResourceContext {
  id: string;
  type: string;
  name: string;
  owner: string;
  department: string;
  classification: string;
  sensitivity: string;
  tags: string[];
  attributes: Record<string, any>;
  lineage: string[];
}

export interface AccessEvaluation {
  request: AccessContext;
  decision: AccessDecision;
  evaluation: EvaluationResult;
  audit: AuditEntry;
  recommendations: Recommendation[];
}

export interface EvaluationResult {
  totalPolicies: number;
  matchedPolicies: number;
  allowPolicies: number;
  denyPolicies: number;
  approvalPolicies: number;
  evaluationTime: number;
  conflicts: PolicyConflict[];
  overrides: PolicyOverride[];
}

export interface PolicyConflict {
  policies: string[];
  type: 'allow_deny' | 'priority' | 'condition' | 'custom';
  description: string;
  resolution: 'deny' | 'allow' | 'manual' | 'escalate';
  resolvedBy?: string;
}

export interface PolicyOverride {
  policyId: string;
  reason: string;
  overriddenBy: string;
  timestamp: number;
  expiresAt?: number;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  resourceType: string;
  result: 'allow' | 'deny' | 'error';
  reason: string;
  policies: string[];
  conditions: PolicyCondition[];
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  duration: number;
  riskScore: number;
  metadata: Record<string, any>;
}

export interface Recommendation {
  type: 'security' | 'compliance' | 'efficiency' | 'optimization';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  effort: string;
  actions: string[];
  dueDate?: number;
  assignee?: string;
}

export class AccessControlIntegration {
  private static instance: AccessControlIntegration;
  private config: AccessControlConfig;
  private permissions: Map<string, AccessPermission> = new Map();
  private roles: Map<string, AccessRole> = new Map();
  private policies: Map<string, AccessPolicy> = new Map();
  private requests: Map<string, AccessRequest> = new Map();
  private audits: AccessAudit[] = [];
  private cache: Map<string, AccessDecision> = new Map();
  private externalSystems: Map<string, ExternalSystemConfig> = new Map();

  private constructor(config: AccessControlConfig) {
    this.config = config;
    this.initializeDefaultPolicies();
    this.initializeApprovalWorkflows();
    this.startPeriodicSync();
  }

  static getInstance(config?: AccessControlIntegration): AccessControlIntegration {
    if (!AccessControlIntegration.instance) {
      if (!config) {
        config = {
          enabled: true,
          enforceByDefault: true,
          auditAllAccess: true,
          cacheEnabled: true,
          cacheTTL: 300, // 5 minutes
          integrationMode: 'standalone',
          externalSystems: [],
          defaultPolicies: [],
          approvalWorkflows: []
        };
      }
      AccessControlIntegration.instance = new AccessControlIntegration(config);
    }
    return AccessControlIntegration.instance;
  }

  private initializeDefaultPolicies(): void {
    // Initialize default access policies
    const defaultPolicies: AccessPolicy[] = [
      {
        id: 'public_read_policy',
        name: 'Public Read Access',
        description: 'Allow read access to public datasets',
        type: 'allow',
        scope: {
          resources: ['dataset:*'],
          principals: ['*'],
          actions: ['read'],
          environments: ['*']
        },
        rules: [
          {
            effect: 'allow',
            actions: ['read'],
            conditions: [
              {
                attribute: 'resource.privacy.level',
                operator: 'equals',
                value: 'public',
                description: 'Resource must be public'
              }
            ],
            exceptions: []
          }
        ],
        conditions: [],
        priority: 100,
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'system',
        lastModified: Date.now(),
        modifiedBy: 'system'
      },
      {
        id: 'owner_full_access',
        name: 'Owner Full Access',
        description: 'Full access for dataset owners',
        type: 'allow',
        scope: {
          resources: ['dataset:*'],
          principals: ['*'],
          actions: ['*'],
          environments: ['*']
        },
        rules: [
          {
            effect: 'allow',
            actions: ['*'],
            conditions: [
              {
                attribute: 'user.id',
                operator: 'equals',
                value: 'resource.owner',
                description: 'User must be the resource owner'
              }
            ],
            exceptions: []
          }
        ],
        conditions: [],
        priority: 90,
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'system',
        lastModified: Date.now(),
        modifiedBy: 'system'
      },
      {
        id: 'department_access',
        name: 'Department Access',
        description: 'Access within same department',
        type: 'allow',
        scope: {
          resources: ['dataset:*'],
          principals: ['*'],
          actions: ['read', 'write'],
          environments: ['*']
        },
        rules: [
          {
            effect: 'allow',
            actions: ['read', 'write'],
            conditions: [
              {
                attribute: 'user.department',
                operator: 'equals',
                value: 'resource.department',
                description: 'User must be in same department'
              },
              {
                attribute: 'resource.privacy.level',
                operator: 'in',
                value: ['public', 'internal'],
                description: 'Resource must be public or internal'
              }
            ],
            exceptions: []
          }
        ],
        conditions: [],
        priority: 80,
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'system',
        lastModified: Date.now(),
        modifiedBy: 'system'
      },
      {
        id: 'restricted_approval',
        name: 'Restricted Data Approval',
        description: 'Require approval for restricted data',
        type: 'require_approval',
        scope: {
          resources: ['dataset:*'],
          principals: ['*'],
          actions: ['read', 'write'],
          environments: ['*']
        },
        rules: [
          {
            effect: 'require_approval',
            actions: ['read', 'write'],
            conditions: [
              {
                attribute: 'resource.privacy.level',
                operator: 'in',
                value: ['confidential', 'restricted'],
                description: 'Resource must be confidential or restricted'
              }
            ],
            exceptions: [
              {
                condition: {
                  attribute: 'user.id',
                  operator: 'equals',
                  value: 'resource.owner',
                  description: 'Owners bypass approval'
                },
                effect: 'allow',
                reason: 'Owner access'
              }
            ]
          }
        ],
        conditions: [],
        priority: 70,
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'system',
        lastModified: Date.now(),
        modifiedBy: 'system'
      },
      {
        id: 'deny_sensitive',
        name: 'Deny Sensitive Access',
        description: 'Deny access to sensitive data without proper clearance',
        type: 'deny',
        scope: {
          resources: ['dataset:*'],
          principals: ['*'],
          actions: ['*'],
          environments: ['*']
        },
        rules: [
          {
            effect: 'deny',
            actions: ['*'],
            conditions: [
              {
                attribute: 'resource.privacy.sensitivity',
                operator: 'equals',
                value: 'critical',
                description: 'Resource has critical sensitivity'
              },
              {
                attribute: 'user.clearance',
                operator: 'not_equals',
                value: 'top_secret',
                description: 'User does not have top secret clearance'
              }
            ],
            exceptions: []
          }
        ],
        conditions: [],
        priority: 60,
        enabled: true,
        createdAt: Date.now(),
        createdBy: 'system',
        lastModified: Date.now(),
        modifiedBy: 'system'
      }
    ];

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });
  }

  private initializeApprovalWorkflows(): void {
    // Initialize default approval workflows
    const workflows: ApprovalWorkflowConfig[] = [
      {
        name: 'Restricted Data Access',
        description: 'Approval workflow for accessing restricted data',
        trigger: {
          type: 'access_request',
          conditions: [
            {
              attribute: 'resource.privacy.level',
              operator: 'in',
              value: ['confidential', 'restricted'],
              description: 'Resource is confidential or restricted'
            }
          ]
        },
        steps: [
          {
            id: 'manager_approval',
            name: 'Manager Approval',
            type: 'approval',
            assignee: 'manager',
            conditions: [],
            actions: [
              {
                type: 'send_email',
                parameters: {
                  template: 'access_request_approval',
                  recipients: ['manager', 'requester']
                }
              }
            ],
            timeout: 48,
            required: true
          },
          {
            id: 'owner_notification',
            name: 'Owner Notification',
            type: 'notification',
            assignee: 'owner',
            conditions: [],
            actions: [
              {
                type: 'send_notification',
                parameters: {
                  message: 'Access request for your data has been approved',
                  channel: 'slack'
                }
              }
            ],
            timeout: 24,
            required: false
          }
        ],
        timeout: 72,
        autoApproveConditions: [
          {
            attribute: 'user.clearance',
            operator: 'equals',
            value: 'top_secret',
            description: 'User has top secret clearance'
          }
        ]
      }
    ];

    // Store workflows (would be in a separate workflow service)
    this.config.approvalWorkflows.push(...workflows);
  }

  private startPeriodicSync(): void {
    if (this.config.externalSystems.length === 0) return;

    // Sync with external systems periodically
    setInterval(() => {
      this.syncWithExternalSystems();
    }, 60 * 60 * 1000); // Every hour
  }

  // Main access control methods
  public async evaluateAccess(context: AccessContext): Promise<AccessEvaluation> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cacheKey = this.generateCacheKey(context);
        const cachedDecision = this.cache.get(cacheKey);
        if (cachedDecision && cachedDecision.expiresAt && cachedDecision.expiresAt > Date.now()) {
          return this.createEvaluation(context, cachedDecision, startTime, true);
        }
      }

      // Get applicable policies
      const applicablePolicies = this.getApplicablePolicies(context);

      // Evaluate policies
      const decision = await this.evaluatePolicies(applicablePolicies, context);

      // Check for approval requirements
      if (decision.approvalRequired) {
        const approvalResult = await this.checkApprovalRequirements(context, decision);
        decision.allowed = approvalResult.allowed;
        decision.reason = approvalResult.reason;
      }

      // Apply additional restrictions
      const restrictions = await this.applyAccessRestrictions(context, decision);
      decision.restrictions = restrictions;

      // Cache decision
      if (this.config.cacheEnabled && decision.allowed) {
        const cacheKey = this.generateCacheKey(context);
        const expiresAt = Date.now() + (this.config.cacheTTL * 1000);
        this.cache.set(cacheKey, { ...decision, expiresAt });
      }

      // Create evaluation result
      const evaluation = this.createEvaluation(context, decision, startTime, false);

      // Audit the access attempt
      if (this.config.auditAllAccess) {
        await this.auditAccess(evaluation);
      }

      return evaluation;

    } catch (error) {
      console.error('Access evaluation failed:', error);
      
      const errorDecision: AccessDecision = {
        allowed: false,
        reason: 'Access evaluation error',
        policies: [],
        conditions: [],
        auditRequired: true,
        approvalRequired: false,
        restrictions: []
      };

      return this.createEvaluation(context, errorDecision, startTime, false);
    }
  }

  private getApplicablePolicies(context: AccessContext): AccessPolicy[] {
    const applicablePolicies: AccessPolicy[] = [];

    this.policies.forEach(policy => {
      if (!policy.enabled) return;

      // Check if policy applies to the context
      if (this.policyAppliesToContext(policy, context)) {
        applicablePolicies.push(policy);
      }
    });

    // Sort by priority (higher priority first)
    applicablePolicies.sort((a, b) => b.priority - a.priority);

    return applicablePolicies;
  }

  private policyAppliesToContext(policy: AccessPolicy, context: AccessContext): boolean {
    const scope = policy.scope;

    // Check resource scope
    if (scope.resources.length > 0) {
      const resourceMatches = scope.resources.some(pattern => 
        this.matchesPattern(context.resource.id, pattern) ||
        this.matchesPattern(context.resource.type, pattern)
      );
      if (!resourceMatches) return false;
    }

    // Check principal scope
    if (scope.principals.length > 0) {
      const principalMatches = scope.principals.some(pattern => 
        this.matchesPattern(context.user.id, pattern) ||
        context.user.roles.some(role => this.matchesPattern(role, pattern)) ||
        context.user.groups.some(group => this.matchesPattern(group, pattern))
      );
      if (!principalMatches) return false;
    }

    // Check action scope
    if (scope.actions.length > 0) {
      const actionMatches = scope.actions.some(pattern => 
        this.matchesPattern(context.action, pattern)
      );
      if (!actionMatches) return false;
    }

    // Check environment scope
    if (scope.environments.length > 0) {
      const environmentMatches = scope.environments.some(pattern => 
        this.matchesPattern(context.environment, pattern)
      );
      if (!environmentMatches) return false;
    }

    return true;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(value);
    }
    return value === pattern;
  }

  private async evaluatePolicies(policies: AccessPolicy[], context: AccessContext): Promise<AccessDecision> {
    let allowed = !this.config.enforceByDefault;
    let reason = '';
    const appliedPolicies: string[] = [];
    const appliedConditions: PolicyCondition[] = [];
    let approvalRequired = false;
    let expiresAt: number | undefined;

    const evaluation: EvaluationResult = {
      totalPolicies: policies.length,
      matchedPolicies: 0,
      allowPolicies: 0,
      denyPolicies: 0,
      approvalPolicies: 0,
      evaluationTime: 0,
      conflicts: [],
      overrides: []
    };

    for (const policy of policies) {
      evaluation.matchedPolicies++;

      for (const rule of policy.rules) {
        const conditionsMet = await this.evaluateConditions(rule.conditions, context);
        
        if (conditionsMet) {
          appliedPolicies.push(policy.id);
          appliedConditions.push(...rule.conditions);

          switch (rule.effect) {
            case 'allow':
              allowed = true;
              evaluation.allowPolicies++;
              reason = `Allowed by policy: ${policy.name}`;
              break;
            case 'deny':
              allowed = false;
              evaluation.denyPolicies++;
              reason = `Denied by policy: ${policy.name}`;
              break;
            case 'require_approval':
              approvalRequired = true;
              evaluation.approvalPolicies++;
              reason = `Approval required by policy: ${policy.name}`;
              break;
          }

          // Check for exceptions
          const exceptionApplies = rule.exceptions.some(exception => 
            this.evaluateCondition(exception.condition, context)
          );

          if (exceptionApplies) {
            if (exceptionApplies && exception.effect === 'allow') {
              allowed = true;
              reason = `Exception applied for policy: ${policy.name}`;
            }
          }
        }
      }
    }

    // Set expiration for temporary access
    if (allowed && context.user.attributes?.temporaryAccess) {
      expiresAt = context.user.attributes.temporaryAccess.expiresAt;
    }

    return {
      allowed,
      reason,
      policies: appliedPolicies,
      conditions: appliedConditions,
      expiresAt,
      restrictions: [],
      auditRequired: true,
      approvalRequired
    };
  }

  private async evaluateConditions(conditions: PolicyCondition[], context: AccessContext): Promise<boolean> {
    if (conditions.length === 0) return true;

    for (const condition of conditions) {
      if (!await this.evaluateCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  private async evaluateCondition(condition: PolicyCondition, context: AccessContext): Promise<boolean> {
    const value = this.getAttributeValue(condition.attribute, context);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'contains':
        return Array.isArray(value) ? value.includes(condition.value) : 
          String(value).includes(String(condition.value));
      case 'not_contains':
        return Array.isArray(value) ? !value.includes(condition.value) : 
          !String(value).includes(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) ? condition.value.includes(value) : false;
      case 'not_in':
        return Array.isArray(condition.value) ? !condition.value.includes(value) : true;
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'greater_than_or_equal':
        return Number(value) >= Number(condition.value);
      case 'less_than_or_equal':
        return Number(value) <= Number(condition.value);
      case 'starts_with':
        return String(value).startsWith(String(condition.value));
      case 'ends_with':
        return String(value).endsWith(String(condition.value));
      default:
        return false;
    }
  }

  private getAttributeValue(attribute: string, context: AccessContext): any {
    const parts = attribute.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private async checkApprovalRequirements(context: AccessContext, decision: AccessDecision): Promise<{ allowed: boolean; reason: string }> {
    // Check if there's an existing approved request
    const existingRequest = await this.findExistingApprovalRequest(context);
    if (existingRequest && existingRequest.status === 'approved') {
      return {
        allowed: true,
        reason: 'Access already approved'
      };
    }

    // Check auto-approval conditions
    const autoApproveWorkflow = this.config.approvalWorkflows.find(wf => 
      wf.trigger.type === 'access_request' &&
      wf.autoApproveConditions.some(condition => 
        this.evaluateCondition(condition, context)
      )
    );

    if (autoApproveWorkflow) {
      return {
        allowed: true,
        reason: 'Auto-approved based on conditions'
      };
    }

    // Create approval request
    const request = await this.createApprovalRequest(context, decision);
    if (request) {
      return {
        allowed: false,
        reason: `Approval required. Request ID: ${request.id}`
      };
    }

    return {
      allowed: false,
      reason: 'Approval required but request creation failed'
    };
  }

  private async findExistingApprovalRequest(context: AccessContext): Promise<AccessRequest | undefined> {
    const requests = Array.from(this.requests.values());
    
    return requests.find(request => 
      request.requester === context.user.id &&
      request.resource === context.resource.id &&
      request.actions.includes(context.action) &&
      request.status === 'approved' &&
      request.expiresAt && request.expiresAt > Date.now()
    );
  }

  private async createApprovalRequest(context: AccessContext, decision: AccessDecision): Promise<AccessRequest | undefined> {
    const request: AccessRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requester: context.user.id,
      resource: context.resource.id,
      resourceType: context.resource.type,
      actions: [context.action],
      justification: context.requestMetadata?.justification || 'Access request',
      duration: 7, // 7 days default
      status: 'pending',
      requestedAt: Date.now(),
      accessGranted: false
    };

    this.requests.set(request.id, request);

    // Trigger approval workflow
    await this.triggerApprovalWorkflow(request, context);

    return request;
  }

  private async triggerApprovalWorkflow(request: AccessRequest, context: AccessContext): Promise<void> {
    // Find applicable workflow
    const workflow = this.config.approvalWorkflows.find(wf => 
      wf.trigger.type === 'access_request' &&
      wf.trigger.conditions.every(condition => 
        this.evaluateCondition(condition, context)
      )
    );

    if (!workflow) return;

    // Execute workflow steps
    for (const step of workflow.steps) {
      await this.executeWorkflowStep(step, request, context);
    }
  }

  private async executeWorkflowStep(step: WorkflowStep, request: AccessRequest, context: AccessContext): Promise<void> {
    switch (step.type) {
      case 'approval':
        // Would create approval task for assignee
        console.log(`Creating approval task for ${step.assignee}`);
        break;
      case 'notification':
        // Would send notification
        step.actions.forEach(action => {
          this.executeWorkflowAction(action, request, context);
        });
        break;
      case 'verification':
        // Would perform verification
        console.log(`Performing verification for step ${step.id}`);
        break;
    }
  }

  private executeWorkflowAction(action: WorkflowAction, request: AccessRequest, context: AccessContext): void {
    switch (action.type) {
      case 'send_email':
        console.log(`Sending email with parameters:`, action.parameters);
        break;
      case 'send_notification':
        console.log(`Sending notification with parameters:`, action.parameters);
        break;
      case 'create_ticket':
        console.log(`Creating ticket with parameters:`, action.parameters);
        break;
      case 'update_permission':
        console.log(`Updating permission with parameters:`, action.parameters);
        break;
      case 'log_audit':
        console.log(`Logging audit with parameters:`, action.parameters);
        break;
    }
  }

  private async applyAccessRestrictions(context: AccessContext, decision: AccessDecision): Promise<AccessRestriction[]> {
    const restrictions: AccessRestriction[] = [];

    // Time-based restrictions
    if (context.user.attributes?.timeRestrictions) {
      restrictions.push({
        type: 'time_based',
        description: 'Access restricted to specific hours',
        conditions: context.user.attributes.timeRestrictions.conditions,
        enforced: true,
        bypassAllowed: false
      });
    }

    // Geographic restrictions
    if (context.user.attributes?.geoRestrictions) {
      restrictions.push({
        type: 'geographic',
        description: 'Access restricted to specific locations',
        conditions: context.user.attributes.geoRestrictions.conditions,
        enforced: true,
        bypassAllowed: false
      });
    }

    // Purpose-based restrictions
    if (context.requestMetadata?.purpose) {
      restrictions.push({
        type: 'purpose_based',
        description: 'Access limited to specific purpose',
        conditions: [{
          type: 'purpose',
          operator: 'equals',
          value: context.requestMetadata.purpose,
          description: 'Purpose must match'
        }],
        enforced: true,
        bypassAllowed: false
      });
    }

    // Data volume restrictions
    if (context.resource.attributes?.maxDataVolume) {
      restrictions.push({
        type: 'custom',
        description: 'Data volume limit enforced',
        conditions: [{
          type: 'custom',
          operator: 'less_than_or_equal',
          value: context.resource.attributes.maxDataVolume,
          description: 'Data volume must not exceed limit'
        }],
        enforced: true,
        bypassAllowed: true,
        bypassReason: 'Manager approval required for volume override'
      });
    }

    return restrictions;
  }

  private createEvaluation(context: AccessContext, decision: AccessDecision, startTime: number, fromCache: boolean): AccessEvaluation {
    const evaluationTime = Date.now() - startTime;
    
    const evaluation: EvaluationResult = {
      totalPolicies: decision.policies.length,
      matchedPolicies: decision.policies.length,
      allowPolicies: decision.allowed ? 1 : 0,
      denyPolicies: decision.allowed ? 0 : 1,
      approvalPolicies: decision.approvalRequired ? 1 : 0,
      evaluationTime,
      conflicts: [],
      overrides: []
    };

    const audit: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: context.timestamp,
      userId: context.user.id,
      action: context.action,
      resource: context.resource.id,
      resourceType: context.resource.type,
      result: decision.allowed ? 'allow' : 'deny',
      reason: decision.reason,
      policies: decision.policies,
      conditions: decision.conditions,
      ipAddress: context.ipAddress || 'unknown',
      userAgent: context.userAgent || 'unknown',
      sessionId: context.sessionId || 'unknown',
      duration: evaluationTime,
      riskScore: this.calculateRiskScore(context, decision),
      metadata: {
        fromCache,
        approvalRequired: decision.approvalRequired,
        restrictions: decision.restrictions.length
      }
    };

    const recommendations = this.generateRecommendations(context, decision, evaluation);

    return {
      request: context,
      decision,
      evaluation,
      audit,
      recommendations
    };
  }

  private calculateRiskScore(context: AccessContext, decision: AccessDecision): number {
    let riskScore = 0;

    // User risk factors
    if (context.user.sessionInfo.riskScore > 0.5) {
      riskScore += 0.3;
    }

    // Resource risk factors
    if (context.resource.sensitivity === 'critical') {
      riskScore += 0.4;
    } else if (context.resource.sensitivity === 'high') {
      riskScore += 0.2;
    }

    // Action risk factors
    if (context.action === 'delete' || context.action === 'admin') {
      riskScore += 0.2;
    }

    // Time-based risk
    const hour = new Date(context.timestamp).getHours();
    if (hour < 6 || hour > 22) {
      riskScore += 0.1;
    }

    // Location-based risk
    if (context.user.location !== context.resource.department) {
      riskScore += 0.1;
    }

    return Math.min(riskScore, 1.0);
  }

  private generateRecommendations(context: AccessContext, decision: AccessDecision, evaluation: EvaluationResult): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Security recommendations
    if (decision.approvalRequired) {
      recommendations.push({
        type: 'security',
        priority: 'medium',
        title: 'Streamline Approval Process',
        description: 'Consider implementing auto-approval for trusted users',
        impact: 'Reduce access time for legitimate users',
        effort: 'medium',
        actions: ['Review approval criteria', 'Implement auto-approval rules'],
        dueDate: Date.now() + (30 * 24 * 60 * 60 * 1000)
      });
    }

    // Compliance recommendations
    if (evaluation.evaluationTime > 1000) { // > 1 second
      recommendations.push({
        type: 'compliance',
        priority: 'low',
        title: 'Optimize Policy Evaluation',
        description: 'Policy evaluation is taking longer than expected',
        impact: 'Improve system performance',
        effort: 'low',
        actions: ['Review policy complexity', 'Enable caching optimizations']
      });
    }

    // Efficiency recommendations
    if (decision.conditions.length > 5) {
      recommendations.push({
        type: 'efficiency',
        priority: 'low',
        title: 'Simplify Access Conditions',
        description: 'Large number of conditions may impact performance',
        impact: 'Faster access decisions',
        effort: 'low',
        actions: ['Consolidate similar conditions', 'Use role-based access']
      });
    }

    return recommendations;
  }

  private async auditAccess(evaluation: AccessEvaluation): Promise<void> {
    this.audits.push({
      id: evaluation.audit.id,
      timestamp: evaluation.audit.timestamp,
      user: evaluation.audit.userId,
      action: evaluation.audit.action,
      resource: evaluation.audit.resource,
      resourceType: evaluation.audit.resourceType,
      result: evaluation.audit.result,
      reason: evaluation.audit.reason,
      policies: evaluation.audit.policies,
      conditions: evaluation.audit.conditions,
      ipAddress: evaluation.audit.ipAddress,
      userAgent: evaluation.audit.userAgent,
      sessionId: evaluation.audit.sessionId,
      metadata: evaluation.audit.metadata
    });
  }

  private generateCacheKey(context: AccessContext): string {
    const key = {
      userId: context.user.id,
      resourceId: context.resource.id,
      action: context.action,
      environment: context.environment,
      userRoles: context.user.roles.sort(),
      userGroups: context.user.groups.sort()
    };
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private async syncWithExternalSystems(): Promise<void> {
    for (const system of this.config.externalSystems) {
      if (!system.syncEnabled) continue;

      try {
        await this.syncWithSystem(system);
      } catch (error) {
        console.error(`Failed to sync with system ${system.name}:`, error);
      }
    }
  }

  private async syncWithSystem(system: ExternalSystemConfig): Promise<void> {
    console.log(`Syncing with ${system.name}...`);
    
    // Implementation would depend on system type
    switch (system.type) {
      case 'ldap':
        await this.syncWithLDAP(system);
        break;
      case 'oauth':
        await this.syncWithOAuth(system);
        break;
      case 'saml':
        await this.syncWithSAML(system);
        break;
      default:
        console.log(`Sync not implemented for ${system.type}`);
    }
  }

  private async syncWithLDAP(system: ExternalSystemConfig): Promise<void> {
    // LDAP synchronization implementation
    console.log('LDAP sync implementation');
  }

  private async syncWithOAuth(system: ExternalSystemConfig): Promise<void> {
    // OAuth synchronization implementation
    console.log('OAuth sync implementation');
  }

  private async syncWithSAML(system: ExternalSystemConfig): Promise<void> {
    // SAML synchronization implementation
    console.log('SAML sync implementation');
  }

  // Permission management
  public async grantPermission(permission: AccessPermission): Promise<boolean> {
    try {
      this.permissions.set(permission.id, permission);
      
      // Clear cache for affected users
      this.clearCacheForUser(permission.principal);
      
      return true;
    } catch (error) {
      console.error('Failed to grant permission:', error);
      return false;
    }
  }

  public async revokePermission(permissionId: string): Promise<boolean> {
    try {
      const permission = this.permissions.get(permissionId);
      if (!permission) return false;

      this.permissions.delete(permissionId);
      
      // Clear cache for affected user
      this.clearCacheForUser(permission.principal);
      
      return true;
    } catch (error) {
      console.error('Failed to revoke permission:', error);
      return false;
    }
  }

  // Role management
  public async createRole(role: AccessRole): Promise<boolean> {
    try {
      this.roles.set(role.id, role);
      return true;
    } catch (error) {
      console.error('Failed to create role:', error);
      return false;
    }
  }

  public async updateRole(roleId: string, updates: Partial<AccessRole>): Promise<boolean> {
    try {
      const role = this.roles.get(roleId);
      if (!role) return false;

      const updatedRole = { ...role, ...updates, lastModified: Date.now() };
      this.roles.set(roleId, updatedRole);
      
      // Clear cache for role members
      role.members.forEach(member => this.clearCacheForUser(member));
      
      return true;
    } catch (error) {
      console.error('Failed to update role:', error);
      return false;
    }
  }

  public async deleteRole(roleId: string): Promise<boolean> {
    try {
      const role = this.roles.get(roleId);
      if (!role) return false;

      this.roles.delete(roleId);
      
      // Clear cache for role members
      role.members.forEach(member => this.clearCacheForUser(member));
      
      return true;
    } catch (error) {
      console.error('Failed to delete role:', error);
      return false;
    }
  }

  // Request management
  public async createAccessRequest(request: Omit<AccessRequest, 'id' | 'requestedAt' | 'status'>): Promise<AccessRequest> {
    const newRequest: AccessRequest = {
      ...request,
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestedAt: Date.now(),
      status: 'pending'
    };

    this.requests.set(newRequest.id, newRequest);
    return newRequest;
  }

  public async approveRequest(requestId: string, reviewer: string, comments?: string): Promise<boolean> {
    try {
      const request = this.requests.get(requestId);
      if (!request) return false;

      request.status = 'approved';
      request.reviewedAt = Date.now();
      request.reviewedBy = reviewer;
      request.reviewComments = comments;
      request.accessGranted = true;

      // Grant temporary permission
      const permission: AccessPermission = {
        id: `temp_${request.id}`,
        principal: request.requester,
        resource: request.resource,
        resourceType: request.resourceType,
        actions: request.actions,
        conditions: [],
        grantedAt: Date.now(),
        grantedBy: reviewer,
        expiresAt: Date.now() + (request.duration * 24 * 60 * 60 * 1000),
        status: 'active',
        justification: `Approved via request ${requestId}`
      };

      await this.grantPermission(permission);
      return true;

    } catch (error) {
      console.error('Failed to approve request:', error);
      return false;
    }
  }

  public async rejectRequest(requestId: string, reviewer: string, reason: string): Promise<boolean> {
    try {
      const request = this.requests.get(requestId);
      if (!request) return false;

      request.status = 'rejected';
      request.reviewedAt = Date.now();
      request.reviewedBy = reviewer;
      request.reviewComments = reason;

      return true;

    } catch (error) {
      console.error('Failed to reject request:', error);
      return false;
    }
  }

  // Policy management
  public async createPolicy(policy: AccessPolicy): Promise<boolean> {
    try {
      this.policies.set(policy.id, policy);
      this.clearCache(); // Clear all cache when policies change
      return true;
    } catch (error) {
      console.error('Failed to create policy:', error);
      return false;
    }
  }

  public async updatePolicy(policyId: string, updates: Partial<AccessPolicy>): Promise<boolean> {
    try {
      const policy = this.policies.get(policyId);
      if (!policy) return false;

      const updatedPolicy = { ...policy, ...updates, lastModified: Date.now() };
      this.policies.set(policyId, updatedPolicy);
      this.clearCache(); // Clear all cache when policies change
      return true;
    } catch (error) {
      console.error('Failed to update policy:', error);
      return false;
    }
  }

  public async deletePolicy(policyId: string): Promise<boolean> {
    try {
      this.policies.delete(policyId);
      this.clearCache(); // Clear all cache when policies change
      return true;
    } catch (error) {
      console.error('Failed to delete policy:', error);
      return false;
    }
  }

  // Audit and reporting
  public getAuditLogs(limit?: number, filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    result?: 'allow' | 'deny' | 'error';
    startTime?: number;
    endTime?: number;
  }): AccessAudit[] {
    let logs = [...this.audits];

    // Apply filters
    if (filters) {
      if (filters.userId) {
        logs = logs.filter(log => log.user === filters.userId);
      }
      if (filters.action) {
        logs = logs.filter(log => log.action === filters.action);
      }
      if (filters.resource) {
        logs = logs.filter(log => log.resource === filters.resource);
      }
      if (filters.result) {
        logs = logs.filter(log => log.result === filters.result);
      }
      if (filters.startTime) {
        logs = logs.filter(log => log.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        logs = logs.filter(log => log.timestamp <= filters.endTime!);
      }
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? logs.slice(0, limit) : logs;
  }

  public generateAccessReport(timeRange: { start: number; end: number }): {
    summary: AccessReportSummary;
    topUsers: UserAccessSummary[];
    topResources: ResourceAccessSummary[];
    deniedAttempts: DeniedAttemptSummary[];
    recommendations: string[];
  } {
    const logs = this.getAuditLogs(undefined, {
      startTime: timeRange.start,
      endTime: timeRange.end
    });

    const summary = this.generateAccessSummary(logs);
    const topUsers = this.generateTopUsers(logs);
    const topResources = this.generateTopResources(logs);
    const deniedAttempts = this.generateDeniedAttempts(logs);
    const recommendations = this.generateAccessRecommendations(logs);

    return {
      summary,
      topUsers,
      topResources,
      deniedAttempts,
      recommendations
    };
  }

  private generateAccessSummary(logs: AccessAudit[]): AccessReportSummary {
    const totalRequests = logs.length;
    const allowedRequests = logs.filter(log => log.result === 'allow').length;
    const deniedRequests = logs.filter(log => log.result === 'deny').length;
    const errorRequests = logs.filter(log => log.result === 'error').length;
    const uniqueUsers = new Set(logs.map(log => log.user)).size;
    const uniqueResources = new Set(logs.map(log => log.resource)).size;
    const avgResponseTime = logs.reduce((sum, log) => sum + log.duration, 0) / logs.length;

    return {
      totalRequests,
      allowedRequests,
      deniedRequests,
      errorRequests,
      uniqueUsers,
      uniqueResources,
      avgResponseTime,
      allowRate: totalRequests > 0 ? (allowedRequests / totalRequests) * 100 : 0,
      denyRate: totalRequests > 0 ? (deniedRequests / totalRequests) * 100 : 0,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0
    };
  }

  private generateTopUsers(logs: AccessAudit[]): UserAccessSummary[] {
    const userStats = new Map<string, {
      requests: number;
      allowed: number;
      denied: number;
      avgResponseTime: number;
      riskScore: number;
    }>();

    logs.forEach(log => {
      if (!userStats.has(log.user)) {
        userStats.set(log.user, {
          requests: 0,
          allowed: 0,
          denied: 0,
          avgResponseTime: 0,
          riskScore: 0
        });
      }

      const stats = userStats.get(log.user)!;
      stats.requests++;
      if (log.result === 'allow') stats.allowed++;
      if (log.result === 'deny') stats.denied++;
      stats.avgResponseTime += log.duration;
      stats.riskScore += log.riskScore || 0;
    });

    const summaries: UserAccessSummary[] = [];
    userStats.forEach((stats, userId) => {
      summaries.push({
        userId,
        requests: stats.requests,
        allowed: stats.allowed,
        denied: stats.denied,
        avgResponseTime: stats.avgResponseTime / stats.requests,
        riskScore: stats.riskScore / stats.requests,
        allowRate: (stats.allowed / stats.requests) * 100
      });
    });

    return summaries.sort((a, b) => b.requests - a.requests).slice(0, 10);
  }

  private generateTopResources(logs: AccessAudit[]): ResourceAccessSummary[] {
    const resourceStats = new Map<string, {
      requests: number;
      allowed: number;
      denied: number;
      uniqueUsers: Set<string>;
    }>();

    logs.forEach(log => {
      if (!resourceStats.has(log.resource)) {
        resourceStats.set(log.resource, {
          requests: 0,
          allowed: 0,
          denied: 0,
          uniqueUsers: new Set()
        });
      }

      const stats = resourceStats.get(log.resource)!;
      stats.requests++;
      if (log.result === 'allow') stats.allowed++;
      if (log.result === 'deny') stats.denied++;
      stats.uniqueUsers.add(log.user);
    });

    const summaries: ResourceAccessSummary[] = [];
    resourceStats.forEach((stats, resourceId) => {
      summaries.push({
        resourceId,
        requests: stats.requests,
        allowed: stats.allowed,
        denied: stats.denied,
        uniqueUsers: stats.uniqueUsers.size,
        allowRate: (stats.allowed / stats.requests) * 100
      });
    });

    return summaries.sort((a, b) => b.requests - a.requests).slice(0, 10);
  }

  private generateDeniedAttempts(logs: AccessAudit[]): DeniedAttemptSummary[] {
    const deniedLogs = logs.filter(log => log.result === 'deny');
    const reasonStats = new Map<string, number>();

    deniedLogs.forEach(log => {
      const reason = log.reason || 'Unknown';
      reasonStats.set(reason, (reasonStats.get(reason) || 0) + 1);
    });

    const summaries: DeniedAttemptSummary[] = [];
    reasonStats.forEach((count, reason) => {
      summaries.push({
        reason,
        count,
        percentage: (count / deniedLogs.length) * 100
      });
    });

    return summaries.sort((a, b) => b.count - a.count);
  }

  private generateAccessRecommendations(logs: AccessAudit[]): string[] {
    const recommendations: string[] = [];

    const denyRate = (logs.filter(log => log.result === 'deny').length / logs.length) * 100;
    if (denyRate > 20) {
      recommendations.push('High deny rate detected. Review access policies and user training.');
    }

    const avgResponseTime = logs.reduce((sum, log) => sum + log.duration, 0) / logs.length;
    if (avgResponseTime > 500) {
      recommendations.push('Slow response times detected. Consider optimizing policy evaluation.');
    }

    const errorRate = (logs.filter(log => log.result === 'error').length / logs.length) * 100;
    if (errorRate > 5) {
      recommendations.push('High error rate detected. Review system configuration and logs.');
    }

    return recommendations;
  }

  // Cache management
  private clearCache(): void {
    this.cache.clear();
  }

  private clearCacheForUser(userId: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((decision, key) => {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Configuration management
  public updateConfig(config: Partial<AccessControlConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): AccessControlConfig {
    return { ...this.config };
  }

  // Public API methods
  public getPermissions(): AccessPermission[] {
    return Array.from(this.permissions.values());
  }

  public getRoles(): AccessRole[] {
    return Array.from(this.roles.values());
  }

  public getPolicies(): AccessPolicy[] {
    return Array.from(this.policies.values());
  }

  public getRequests(status?: 'pending' | 'approved' | 'rejected' | 'expired'): AccessRequest[] {
    const requests = Array.from(this.requests.values());
    return status ? requests.filter(req => req.status === status) : requests;
  }

  public getCacheStats(): {
    size: number;
    hitRate?: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      ttl: this.config.cacheTTL
    };
  }
}

interface AccessReportSummary {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  errorRequests: number;
  uniqueUsers: number;
  uniqueResources: number;
  avgResponseTime: number;
  allowRate: number;
  denyRate: number;
  errorRate: number;
}

interface UserAccessSummary {
  userId: string;
  requests: number;
  allowed: number;
  denied: number;
  avgResponseTime: number;
  riskScore: number;
  allowRate: number;
}

interface ResourceAccessSummary {
  resourceId: string;
  requests: number;
  allowed: number;
  denied: number;
  uniqueUsers: number;
  allowRate: number;
}

interface DeniedAttemptSummary {
  reason: string;
  count: number;
  percentage: number;
}

export default AccessControlIntegration;
