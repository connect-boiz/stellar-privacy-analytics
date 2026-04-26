/**
 * Budget Management System Integration
 */

import {
  PrivacyBudget,
  BudgetAllocation,
  SimulationScenario,
  SimulationResult,
  BudgetAlert,
  BudgetAnalytics,
  UtilizationAnalytics,
  PerformanceAnalytics,
  TrendAnalytics,
  ForecastAnalytics,
  BenchmarkAnalytics
} from '../types/privacyBudget';

export interface BudgetManagementConfig {
  apiEndpoint: string;
  wsEndpoint: string;
  refreshInterval: number; // milliseconds
  syncEnabled: boolean;
  autoApprovalThreshold: number;
  alertThresholds: AlertThresholds;
}

export interface AlertThresholds {
  budgetUtilization: number; // 0-1
  roiDecline: number; // percentage
  riskIncrease: number; // percentage
  complianceDrop: number; // percentage
  efficiencyDrop: number; // percentage
}

export interface BudgetSyncResult {
  success: boolean;
  syncedBudgets: number;
  syncedAllocations: number;
  errors: string[];
  warnings: string[];
  timestamp: number;
}

export interface BudgetApproval {
  id: string;
  budgetId: string;
  type: 'creation' | 'modification' | 'reallocation';
  requestedBy: string;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  changes: BudgetChange[];
  justification: string;
  riskAssessment: RiskAssessment;
}

export interface BudgetChange {
  field: string;
  oldValue: any;
  newValue: any;
  impact: 'low' | 'medium' | 'high';
}

export interface RiskAssessment {
  overall: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  mitigation: string[];
}

export interface RiskFactor {
  type: 'financial' | 'operational' | 'compliance' | 'strategic';
  description: string;
  impact: 'low' | 'medium' | 'high';
  probability: 'low' | 'medium' | 'high';
}

export interface BudgetWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  initiatedBy: string;
  initiatedAt: number;
  completedAt?: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'review' | 'notification' | 'automation';
  assignee?: string;
  role?: string;
  status: 'pending' | 'completed' | 'skipped';
  completedAt?: number;
  comments?: string;
}

export class BudgetManagementIntegration {
  private static instance: BudgetManagementIntegration;
  private config: BudgetManagementConfig;
  private budgets: Map<string, PrivacyBudget> = new Map();
  private approvals: Map<string, BudgetApproval> = new Map();
  private workflows: Map<string, BudgetWorkflow> = new Map();
  private alerts: Map<string, BudgetAlert> = new Map();

  private constructor(config: BudgetManagementConfig) {
    this.config = config;
    this.initializeDefaultBudgets();
  }

  static getInstance(config?: BudgetManagementConfig): BudgetManagementIntegration {
    if (!BudgetManagementIntegration.instance) {
      if (!config) {
        config = {
          apiEndpoint: '/api/budget-management',
          wsEndpoint: 'ws://localhost:8080/budget-ws',
          refreshInterval: 30000,
          syncEnabled: true,
          autoApprovalThreshold: 10000, // $10,000
          alertThresholds: {
            budgetUtilization: 0.9,
            roiDecline: 0.15,
            riskIncrease: 0.2,
            complianceDrop: 0.1,
            efficiencyDrop: 0.15
          }
        };
      }
      BudgetManagementIntegration.instance = new BudgetManagementIntegration(config);
    }
    return BudgetManagementIntegration.instance;
  }

  private initializeDefaultBudgets(): void {
    const defaultBudgets: PrivacyBudget[] = [
      {
        id: 'budget-annual-2024',
        name: 'Annual Privacy Budget 2024',
        description: 'Annual budget for privacy initiatives and compliance',
        totalBudget: 1000000,
        allocatedBudget: 850000,
        remainingBudget: 150000,
        currency: 'USD',
        period: 'yearly',
        startDate: new Date('2024-01-01').getTime(),
        endDate: new Date('2024-12-31').getTime(),
        status: 'active',
        owner: 'privacy-department',
        department: 'Privacy & Compliance',
        constraints: {
          maxPerAnalysis: 100000,
          minPrivacyLevel: 0.8,
          requiredApprovals: ['manager', 'finance'],
          restrictedCategories: ['high_risk_research'],
          complianceFrameworks: ['GDPR', 'CCPA'],
          geographicRestrictions: ['EU', 'US', 'CA']
        },
        allocations: []
      },
      {
        id: 'budget-q1-2024',
        name: 'Q1 2024 Privacy Budget',
        description: 'Quarterly budget allocation for Q1 2024',
        totalBudget: 250000,
        allocatedBudget: 210000,
        remainingBudget: 40000,
        currency: 'USD',
        period: 'quarterly',
        startDate: new Date('2024-01-01').getTime(),
        endDate: new Date('2024-03-31').getTime(),
        status: 'active',
        owner: 'privacy-department',
        department: 'Privacy & Compliance',
        constraints: {
          maxPerAnalysis: 25000,
          minPrivacyLevel: 0.8,
          requiredApprovals: ['manager'],
          restrictedCategories: [],
          complianceFrameworks: ['GDPR', 'CCPA'],
          geographicRestrictions: ['EU', 'US', 'CA']
        },
        allocations: []
      }
    ];

    defaultBudgets.forEach(budget => {
      this.budgets.set(budget.id, budget);
    });
  }

  // Budget synchronization
  public async syncWithBudgetManagement(): Promise<BudgetSyncResult> {
    const result: BudgetSyncResult = {
      success: true,
      syncedBudgets: 0,
      syncedAllocations: 0,
      errors: [],
      warnings: [],
      timestamp: Date.now()
    };

    try {
      if (!this.config.syncEnabled) {
        result.warnings.push('Budget synchronization is disabled');
        return result;
      }

      // Sync budgets
      for (const [budgetId, budget] of this.budget) {
        try {
          await this.syncBudget(budget);
          result.syncedBudgets++;
        } catch (error) {
          result.errors.push(`Failed to sync budget ${budgetId}: ${error}`);
        }
      }

      // Sync allocations
      for (const budget of this.budget.values()) {
        for (const allocation of budget.allocations) {
          try {
            await this.syncAllocation(allocation);
            result.syncedAllocations++;
          } catch (error) {
            result.errors.push(`Failed to sync allocation ${allocation.id}: ${error}`);
          }
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Synchronization failed: ${error}`);
    }

    return result;
  }

  private async syncBudget(budget: PrivacyBudget): Promise<void> {
    // This would make an API call to sync budget with external system
    // For now, simulate the sync
    console.log(`Syncing budget ${budget.id} with budget management system`);
  }

  private async syncAllocation(allocation: BudgetAllocation): Promise<void> {
    // This would make an API call to sync allocation with external system
    // For now, simulate the sync
    console.log(`Syncing allocation ${allocation.id} with budget management system`);
  }

  // Budget creation and modification
  public async createBudget(
    budgetData: Omit<PrivacyBudget, 'id'>,
    requireApproval: boolean = true
  ): Promise<{ budget: PrivacyBudget; approval?: BudgetApproval }> {
    const budget: PrivacyBudget = {
      ...budgetData,
      id: `budget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Check if approval is required
    if (requireApproval && budget.totalBudget > this.config.autoApprovalThreshold) {
      const approval = await this.createApproval(budget, 'creation');
      this.approvals.set(approval.id, approval);
      
      return {
        budget,
        approval
      };
    } else {
      // Auto-approve
      this.budgets.set(budget.id, budget);
      await this.syncBudget(budget);
      
      return { budget };
    }
  }

  public async modifyBudget(
    budgetId: string,
    changes: Partial<PrivacyBudget>,
    justification: string
  ): Promise<{ success: boolean; approval?: BudgetApproval }> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }

    const oldBudget = { ...budget };
    const updatedBudget = { ...budget, ...changes };

    // Check if approval is required
    const requiresApproval = this.checkIfApprovalRequired(oldBudget, updatedBudget);
    
    if (requiresApproval) {
      const approval = await this.createApproval(updatedBudget, 'modification', justification);
      this.approvals.set(approval.id, approval);
      
      return {
        success: false,
        approval
      };
    } else {
      // Auto-approve
      this.budgets.set(budgetId, updatedBudget);
      await this.syncBudget(updatedBudget);
      
      return { success: true };
    }
  }

  public async reallocateBudget(
    budgetId: string,
    reallocations: Array<{
      allocationId: string;
      newAmount: number;
      justification: string;
    }>
  ): Promise<{ success: boolean; approval?: BudgetApproval }> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }

    const oldAllocations = [...budget.allocations];
    const newAllocations = budget.allocations.map(alloc => {
      const reallocation = reallocations.find(r => r.allocationId === alloc.id);
      if (reallocation) {
        return { ...alloc, amount: reallocation.newAmount };
      }
      return alloc;
    });

    // Validate reallocation
    const totalNewAmount = newAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    if (Math.abs(totalNewAmount - budget.totalBudget) > 0.01) {
      throw new Error('Reallocation amounts do not match total budget');
    }

    const updatedBudget = { ...budget, allocations: newAllocations };

    // Check if approval is required
    const requiresApproval = this.checkIfReallocationRequiresApproval(oldAllocations, newAllocations);
    
    if (requiresApproval) {
      const approval = await this.createApproval(updatedBudget, 'reallocation');
      this.approvals.set(approval.id, approval);
      
      return {
        success: false,
        approval
      };
    } else {
      // Auto-approve
      this.budgets.set(budgetId, updatedBudget);
      await this.syncBudget(updatedBudget);
      
      return { success: true };
    }
  }

  // Approval management
  public async approveBudget(approvalId: string, approvedBy: string, comments?: string): Promise<boolean> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval is not pending: ${approval.status}`);
    }

    // Update approval
    approval.approvedBy = approvedBy;
    approval.approvedAt = Date.now();
    approval.status = 'approved';

    // Apply the approved changes
    await this.applyApproval(approval);

    // Create workflow if needed
    await this.createWorkflowForApproval(approval);

    return true;
  }

  public async rejectBudget(approvalId: string, rejectedBy: string, reason: string): Promise<boolean> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval is not pending: ${approval.status}`);
    }

    approval.status = 'rejected';
    // In a real implementation, we would store the rejection reason

    return true;
  }

  private async createApproval(
    budget: PrivacyBudget,
    type: BudgetApproval['type'],
    justification?: string
  ): Promise<BudgetApproval> {
    const approval: BudgetApproval = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      budgetId: budget.id,
      type,
      requestedBy: 'current-user', // Would get from auth context
      requestedAt: Date.now(),
      status: 'pending',
      changes: this.calculateChanges(budget, type),
      justification: justification || '',
      riskAssessment: await this.assessRisk(budget, type)
    };

    return approval;
  }

  private calculateChanges(budget: PrivacyBudget, type: BudgetApproval['type']): BudgetChange[] {
    const changes: BudgetChange[] = [];

    if (type === 'creation') {
      changes.push({
        field: 'totalBudget',
        oldValue: 0,
        newValue: budget.totalBudget,
        impact: budget.totalBudget > 500000 ? 'high' : 'medium'
      });
    }

    return changes;
  }

  private async assessRisk(budget: PrivacyBudget, type: BudgetApproval['type']): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    let overall: RiskAssessment['overall'] = 'low';

    // Financial risk
    if (budget.totalBudget > 500000) {
      factors.push({
        type: 'financial',
        description: 'Large budget allocation',
        impact: 'high',
        probability: 'medium'
      });
      overall = 'medium';
    }

    // Compliance risk
    if (budget.constraints.complianceFrameworks.length > 2) {
      factors.push({
        type: 'compliance',
        description: 'Multiple compliance frameworks',
        impact: 'medium',
        probability: 'low'
      });
    }

    // Operational risk
    if (budget.allocations.length > 10) {
      factors.push({
        type: 'operational',
        description: 'Complex allocation structure',
        impact: 'medium',
        probability: 'medium'
      });
    }

    return {
      overall,
      factors,
      mitigation: [
        'Implement regular monitoring',
        'Establish clear governance procedures',
        'Conduct periodic risk assessments'
      ]
    };
  }

  private checkIfApprovalRequired(oldBudget: PrivacyBudget, newBudget: PrivacyBudget): boolean {
    // Check if budget amount changed significantly
    const budgetChange = Math.abs(newBudget.totalBudget - oldBudget.totalBudget);
    if (budgetChange > this.config.autoApprovalThreshold) {
      return true;
    }

    // Check if constraints changed
    if (JSON.stringify(oldBudget.constraints) !== JSON.stringify(newBudget.constraints)) {
      return true;
    }

    // Check if period changed
    if (oldBudget.period !== newBudget.period) {
      return true;
    }

    return false;
  }

  private checkIfReallocationRequiresApproval(oldAllocations: BudgetAllocation[], newAllocations: BudgetAllocation[]): boolean {
    // Check if any allocation changed by more than 20%
    for (let i = 0; i < oldAllocations.length; i++) {
      const oldAlloc = oldAllocations[i];
      const newAlloc = newAllocations.find(a => a.id === oldAlloc.id);
      
      if (newAlloc) {
        const changePercent = Math.abs(newAlloc.amount - oldAlloc.amount) / oldAlloc.amount;
        if (changePercent > 0.2) {
          return true;
        }
      }
    }

    return false;
  }

  private async applyApproval(approval: BudgetApproval): Promise<void> {
    // Apply the approved changes to the budget
    // This would update the budget in the system
    console.log(`Applying approval ${approval.id} for budget ${approval.budgetId}`);
  }

  private async createWorkflowForApproval(approval: BudgetApproval): Promise<void> {
    const workflow: BudgetWorkflow = {
      id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Budget ${approval.type} Workflow`,
      description: `Workflow for ${approval.type} of budget ${approval.budgetId}`,
      steps: this.createWorkflowSteps(approval),
      currentStep: 0,
      status: 'active',
      initiatedBy: approval.requestedBy,
      initiatedAt: Date.now()
    };

    this.workflows.set(workflow.id, workflow);
  }

  private createWorkflowSteps(approval: BudgetApproval): WorkflowStep[] {
    const steps: WorkflowStep[] = [];

    // Add notification step
    steps.push({
      id: 'notify-stakeholders',
      name: 'Notify Stakeholders',
      type: 'notification',
      status: 'pending'
    });

    // Add review step if required
    if (approval.changes.some(change => change.impact === 'high')) {
      steps.push({
        id: 'management-review',
        name: 'Management Review',
        type: 'review',
        role: 'management',
        status: 'pending'
      });
    }

    // Add implementation step
    steps.push({
      id: 'implementation',
      name: 'Implementation',
      type: 'automation',
      status: 'pending'
    });

    return steps;
  }

  // Analytics and reporting
  public async getBudgetAnalytics(budgetId: string): Promise<BudgetAnalytics> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }

    const utilization = await this.calculateUtilizationAnalytics(budget);
    const performance = await this.calculatePerformanceAnalytics(budget);
    const trends = await this.calculateTrendAnalytics(budget);
    const forecasts = await this.calculateForecastAnalytics(budget);
    const benchmarks = await this.calculateBenchmarkAnalytics(budget);

    return {
      utilization,
      performance,
      trends,
      forecasts,
      benchmarks
    };
  }

  private async calculateUtilizationAnalytics(budget: PrivacyBudget): Promise<UtilizationAnalytics> {
    const overall = budget.allocatedBudget / budget.totalBudget;
    
    const byCategory: Record<string, number> = {};
    budget.allocations.forEach(alloc => {
      byCategory[alloc.category.id] = alloc.amount / budget.totalBudget;
    });

    const byTime: any[] = []; // Would include historical utilization data
    const efficiency = 0.85; // Would calculate based on actual performance
    const waste = Math.max(0, 1 - efficiency);

    return {
      overall,
      byCategory,
      byTime,
      efficiency,
      waste
    };
  }

  private async calculatePerformanceAnalytics(budget: PrivacyBudget): Promise<PerformanceAnalytics> {
    const allocations = budget.allocations;
    
    const roi = allocations.reduce((sum, alloc) => sum + (alloc.expectedROI * alloc.amount), 0) / budget.allocatedBudget;
    const costEffectiveness = roi > 0.15 ? 0.9 : 0.7;
    const quality = 0.8; // Would calculate based on actual outcomes
    const timeliness = 0.85; // Would calculate based on delivery schedules
    const satisfaction = 0.82; // Would calculate based on stakeholder feedback

    return {
      roi,
      costEffectiveness,
      quality,
      timeliness,
      satisfaction
    };
  }

  private async calculateTrendAnalytics(budget: PrivacyBudget): Promise<TrendAnalytics> {
    // This would analyze historical trends for the budget
    return {
      direction: 'stable',
      magnitude: 0.05,
      seasonality: [],
      changePoints: [],
      forecast: []
    };
  }

  private async calculateForecastAnalytics(budget: PrivacyBudget): Promise<ForecastAnalytics> {
    // This would generate forecasts based on historical data
    return {
      shortTerm: [],
      mediumTerm: [],
      longTerm: [],
      confidence: 0.8,
      accuracy: 0.85
    };
  }

  private async calculateBenchmarkAnalytics(budget: PrivacyBudget): Promise<BenchmarkAnalytics> {
    // This would compare against industry benchmarks
    return {
      industry: [],
      internal: [],
      peers: [],
      ranking: 5,
      percentile: 65
    };
  }

  // Alert management
  public async checkBudgetAlerts(budgetId: string): Promise<BudgetAlert[]> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }

    const alerts: BudgetAlert[] = [];
    const thresholds = this.config.alertThresholds;

    // Check utilization alert
    const utilization = budget.allocatedBudget / budget.totalBudget;
    if (utilization > thresholds.budgetUtilization) {
      alerts.push({
        id: `alert-${Date.now()}-utilization`,
        type: 'budget_exceeded',
        severity: utilization > 0.95 ? 'critical' : 'high',
        title: 'High Budget Utilization',
        message: `Budget utilization is ${(utilization * 100).toFixed(1)}%`,
        threshold: thresholds.budgetUtilization,
        currentValue: utilization,
        budgetId,
        timestamp: Date.now(),
        acknowledged: false,
        resolved: false
      });
    }

    // Check ROI alert (would need historical data)
    // Check risk alert (would need simulation results)
    // Check compliance alert (would need compliance monitoring)

    return alerts;
  }

  // Workflow management
  public getWorkflow(workflowId: string): BudgetWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  public getAllWorkflows(): BudgetWorkflow[] {
    return Array.from(this.workflows.values());
  }

  public async advanceWorkflow(workflowId: string, stepId: string, comments?: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Workflow step not found: ${stepId}`);
    }

    step.status = 'completed';
    step.completedAt = Date.now();
    if (comments) {
      step.comments = comments;
    }

    // Move to next step
    const currentStepIndex = workflow.steps.findIndex(s => s.id === stepId);
    if (currentStepIndex < workflow.steps.length - 1) {
      workflow.currentStep = currentStepIndex + 1;
    } else {
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
    }

    return true;
  }

  // Configuration management
  public updateConfig(newConfig: Partial<BudgetManagementConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): BudgetManagementConfig {
    return { ...this.config };
  }

  // Data access methods
  public getBudget(id: string): PrivacyBudget | undefined {
    return this.budgets.get(id);
  }

  public getAllBudgets(): PrivacyBudget[] {
    return Array.from(this.budgets.values());
  }

  public getApproval(id: string): BudgetApproval | undefined {
    return this.approvals.get(id);
  }

  public getAllApprovals(): BudgetApproval[] {
    return Array.from(this.approvals.values());
  }

  public getAlert(id: string): BudgetAlert | undefined {
    return this.alerts.get(id);
  }

  public getAllAlerts(): BudgetAlert[] {
    return Array.from(this.alerts.values());
  }

  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    return true;
  }

  public resolveAlert(alertId: string, resolutionNotes?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    if (resolutionNotes) {
      alert.resolutionNotes = resolutionNotes;
    }

    return true;
  }

  // Cleanup and maintenance
  public cleanupExpiredApprovals(): number {
    let cleaned = 0;
    const now = Date.now();
    const expiryTime = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [id, approval] of this.approvals) {
      if (approval.status === 'pending' && (now - approval.requestedAt) > expiryTime) {
        approval.status = 'expired';
        cleaned++;
      }
    }

    return cleaned;
  }

  public cleanupOldAlerts(): number {
    let cleaned = 0;
    const now = Date.now();
    const retentionTime = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [id, alert] of this.alerts) {
      if (alert.status === 'resolved' && alert.resolvedAt && (now - alert.resolvedAt) > retentionTime) {
        this.alerts.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  public reset(): void {
    this.budgets.clear();
    this.approvals.clear();
    this.workflows.clear();
    this.alerts.clear();
    this.initializeDefaultBudgets();
  }
}

export default BudgetManagementIntegration;
