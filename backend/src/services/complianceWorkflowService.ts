import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

/**
 * Compliance Workflow Automation Service
 * Manages automated workflows for compliance violation remediation
 */

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  type: 'manual' | 'automated' | 'approval';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  assignedTo?: string;
  dueDate?: Date;
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
  automationScript?: string;
}

export interface ComplianceWorkflow {
  id: string;
  workflowId: string;
  violationId: string;
  workflowType: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate?: Date;
  steps: WorkflowStep[];
  currentStep: number;
  completionPercentage: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class ComplianceWorkflowService {
  private workflows: Map<string, ComplianceWorkflow> = new Map();

  /**
   * Create a new compliance workflow
   */
  async createWorkflow(
    violationId: string,
    workflowType: string,
    priority: 'critical' | 'high' | 'medium' | 'low',
    assignedTo?: string
  ): Promise<ComplianceWorkflow> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const steps = this.generateWorkflowSteps(workflowType);
    const dueDate = this.calculateDueDate(priority);

    const workflow: ComplianceWorkflow = {
      id: workflowId,
      workflowId,
      violationId,
      workflowType,
      status: 'pending',
      assignedTo,
      priority,
      dueDate,
      steps,
      currentStep: 0,
      completionPercentage: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.workflows.set(workflowId, workflow);
    await this.persistWorkflow(workflow);

    logger.info('Compliance workflow created', {
      workflowId,
      violationId,
      workflowType,
      priority
    });

    return workflow;
  }

  /**
   * Generate workflow steps based on workflow type
   */
  private generateWorkflowSteps(workflowType: string): WorkflowStep[] {
    const stepTemplates: Record<string, WorkflowStep[]> = {
      'data_minimization': [
        {
          id: 'step_1',
          name: 'Identify Unnecessary Data Fields',
          description: 'Review and identify data fields that are not essential',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_2',
          name: 'Assess Impact',
          description: 'Assess the impact of removing identified fields',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_3',
          name: 'Get Approval',
          description: 'Obtain approval from data protection officer',
          type: 'approval',
          status: 'pending'
        },
        {
          id: 'step_4',
          name: 'Update Data Collection',
          description: 'Modify data collection forms and APIs',
          type: 'automated',
          status: 'pending',
          automationScript: 'updateDataCollection'
        },
        {
          id: 'step_5',
          name: 'Verify Changes',
          description: 'Verify that changes have been implemented correctly',
          type: 'manual',
          status: 'pending'
        }
      ],
      'consent_management': [
        {
          id: 'step_1',
          name: 'Review Consent Mechanisms',
          description: 'Review current consent collection mechanisms',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_2',
          name: 'Design Consent Flow',
          description: 'Design improved consent collection flow',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_3',
          name: 'Implement Consent System',
          description: 'Implement new consent management system',
          type: 'automated',
          status: 'pending',
          automationScript: 'implementConsentSystem'
        },
        {
          id: 'step_4',
          name: 'Test Consent Flow',
          description: 'Test consent collection and management',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_5',
          name: 'Deploy to Production',
          description: 'Deploy consent system to production',
          type: 'approval',
          status: 'pending'
        }
      ],
      'data_breach_notification': [
        {
          id: 'step_1',
          name: 'Assess Breach Severity',
          description: 'Assess the severity and scope of the breach',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_2',
          name: 'Contain Breach',
          description: 'Take immediate action to contain the breach',
          type: 'automated',
          status: 'pending',
          automationScript: 'containBreach'
        },
        {
          id: 'step_3',
          name: 'Notify Authorities',
          description: 'Notify relevant regulatory authorities',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_4',
          name: 'Notify Affected Users',
          description: 'Notify affected users about the breach',
          type: 'automated',
          status: 'pending',
          automationScript: 'notifyUsers'
        },
        {
          id: 'step_5',
          name: 'Document Incident',
          description: 'Document the incident and response',
          type: 'manual',
          status: 'pending'
        }
      ],
      'default': [
        {
          id: 'step_1',
          name: 'Investigate Issue',
          description: 'Investigate the compliance issue',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_2',
          name: 'Develop Remediation Plan',
          description: 'Develop a plan to address the issue',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_3',
          name: 'Get Approval',
          description: 'Get approval for remediation plan',
          type: 'approval',
          status: 'pending'
        },
        {
          id: 'step_4',
          name: 'Implement Solution',
          description: 'Implement the remediation solution',
          type: 'manual',
          status: 'pending'
        },
        {
          id: 'step_5',
          name: 'Verify Resolution',
          description: 'Verify that the issue has been resolved',
          type: 'manual',
          status: 'pending'
        }
      ]
    };

    return stepTemplates[workflowType] || stepTemplates['default'];
  }

  /**
   * Calculate due date based on priority
   */
  private calculateDueDate(priority: 'critical' | 'high' | 'medium' | 'low'): Date {
    const now = new Date();
    const daysToAdd: Record<string, number> = {
      critical: 3,
      high: 7,
      medium: 14,
      low: 30
    };

    const days = daysToAdd[priority] || 14;
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * Update workflow step status
   */
  async updateStepStatus(
    workflowId: string,
    stepId: string,
    status: 'in_progress' | 'completed' | 'failed' | 'skipped',
    completedBy?: string,
    notes?: string
  ): Promise<ComplianceWorkflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in workflow ${workflowId}`);
    }

    step.status = status;
    if (status === 'completed') {
      step.completedAt = new Date();
      step.completedBy = completedBy;
    }
    if (notes) {
      step.notes = notes;
    }

    // Update workflow status and progress
    workflow.updatedAt = new Date();
    workflow.completionPercentage = this.calculateCompletionPercentage(workflow.steps);

    const allCompleted = workflow.steps.every(s => s.status === 'completed' || s.status === 'skipped');
    if (allCompleted) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
    } else if (workflow.steps.some(s => s.status === 'in_progress')) {
      workflow.status = 'in_progress';
    }

    // Move to next step if current step is completed
    if (status === 'completed' || status === 'skipped') {
      const currentStepIndex = workflow.steps.findIndex(s => s.id === stepId);
      if (currentStepIndex < workflow.steps.length - 1) {
        workflow.currentStep = currentStepIndex + 1;
      }
    }

    await this.persistWorkflow(workflow);

    logger.info('Workflow step updated', {
      workflowId,
      stepId,
      status,
      completionPercentage: workflow.completionPercentage
    });

    return workflow;
  }

  /**
   * Calculate completion percentage
   */
  private calculateCompletionPercentage(steps: WorkflowStep[]): number {
    const completedSteps = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
    return Math.round((completedSteps / steps.length) * 100);
  }

  /**
   * Execute automated workflow step
   */
  async executeAutomatedStep(workflowId: string, stepId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    if (step.type !== 'automated') {
      throw new Error(`Step ${stepId} is not an automated step`);
    }

    try {
      await this.updateStepStatus(workflowId, stepId, 'in_progress');

      // Execute automation script
      if (step.automationScript) {
        await this.runAutomationScript(step.automationScript, workflow);
      }

      await this.updateStepStatus(workflowId, stepId, 'completed', 'system', 'Automated execution completed');
    } catch (error) {
      logger.error('Error executing automated step:', error);
      await this.updateStepStatus(workflowId, stepId, 'failed', 'system', `Error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Run automation script
   */
  private async runAutomationScript(scriptName: string, workflow: ComplianceWorkflow): Promise<void> {
    logger.info(`Running automation script: ${scriptName}`, { workflowId: workflow.workflowId });

    // Simulate script execution (in production, implement actual automation)
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info(`Automation script completed: ${scriptName}`);
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<ComplianceWorkflow | undefined> {
    return this.workflows.get(workflowId);
  }

  /**
   * Get workflows by violation ID
   */
  async getWorkflowsByViolation(violationId: string): Promise<ComplianceWorkflow[]> {
    return Array.from(this.workflows.values()).filter(w => w.violationId === violationId);
  }

  /**
   * Get workflows by status
   */
  async getWorkflowsByStatus(status: string): Promise<ComplianceWorkflow[]> {
    return Array.from(this.workflows.values()).filter(w => w.status === status);
  }

  /**
   * Get workflows assigned to user
   */
  async getWorkflowsByAssignee(assignedTo: string): Promise<ComplianceWorkflow[]> {
    return Array.from(this.workflows.values()).filter(w => w.assignedTo === assignedTo);
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<ComplianceWorkflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.status = 'cancelled';
    workflow.updatedAt = new Date();
    if (reason) {
      workflow.notes = reason;
    }

    await this.persistWorkflow(workflow);

    logger.info('Workflow cancelled', { workflowId, reason });

    return workflow;
  }

  /**
   * Persist workflow to storage
   */
  private async persistWorkflow(workflow: ComplianceWorkflow): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `compliance:workflow:${workflow.workflowId}`;
      await redis.setEx(key, 86400 * 90, JSON.stringify(workflow)); // 90 days retention
    } catch (error) {
      logger.error('Error persisting workflow:', error);
    }
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    averageCompletionTime: number;
    overdueCount: number;
  }> {
    const workflows = Array.from(this.workflows.values());
    const now = new Date();

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalCompletionTime = 0;
    let completedCount = 0;
    let overdueCount = 0;

    workflows.forEach(workflow => {
      byStatus[workflow.status] = (byStatus[workflow.status] || 0) + 1;
      byPriority[workflow.priority] = (byPriority[workflow.priority] || 0) + 1;

      if (workflow.status === 'completed' && workflow.completedAt) {
        const completionTime = workflow.completedAt.getTime() - workflow.createdAt.getTime();
        totalCompletionTime += completionTime;
        completedCount++;
      }

      if (workflow.dueDate && workflow.dueDate < now && workflow.status !== 'completed') {
        overdueCount++;
      }
    });

    const averageCompletionTime = completedCount > 0 
      ? Math.round(totalCompletionTime / completedCount / (1000 * 60 * 60 * 24)) // Convert to days
      : 0;

    return {
      total: workflows.length,
      byStatus,
      byPriority,
      averageCompletionTime,
      overdueCount
    };
  }
}

export const complianceWorkflowService = new ComplianceWorkflowService();
