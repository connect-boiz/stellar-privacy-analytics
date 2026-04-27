import { complianceAutomationService } from '../services/complianceAutomationService';
import { complianceWorkflowService } from '../services/complianceWorkflowService';
import { legalRequirementsService } from '../services/legalRequirementsService';

describe('Compliance Automation Service', () => {
  describe('Regulations', () => {
    test('should load all regulations', () => {
      const regulations = complianceAutomationService.getRegulations();
      expect(regulations).toHaveLength(3);
      expect(regulations.map(r => r.id)).toContain('gdpr');
      expect(regulations.map(r => r.id)).toContain('ccpa');
      expect(regulations.map(r => r.id)).toContain('hipaa');
    });

    test('should get specific regulation', () => {
      const gdpr = complianceAutomationService.getRegulation('gdpr');
      expect(gdpr).toBeDefined();
      expect(gdpr?.name).toBe('General Data Protection Regulation');
      expect(gdpr?.rules).toHaveLength(5);
    });

    test('should return undefined for non-existent regulation', () => {
      const regulation = complianceAutomationService.getRegulation('non-existent');
      expect(regulation).toBeUndefined();
    });
  });

  describe('Compliance Scans', () => {
    test('should run compliance scan for GDPR', async () => {
      const result = await complianceAutomationService.runComplianceScan('gdpr');
      
      expect(result).toBeDefined();
      expect(result.scanId).toBeDefined();
      expect(result.regulation).toBe('General Data Protection Regulation');
      expect(result.status).toMatch(/compliant|non-compliant|partial|error/);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(Array.isArray(result.auditTrail)).toBe(true);
    });

    test('should run compliance scan for CCPA', async () => {
      const result = await complianceAutomationService.runComplianceScan('ccpa');
      
      expect(result).toBeDefined();
      expect(result.regulation).toBe('California Consumer Privacy Act');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('should run compliance scan for HIPAA', async () => {
      const result = await complianceAutomationService.runComplianceScan('hipaa');
      
      expect(result).toBeDefined();
      expect(result.regulation).toBe('Health Insurance Portability and Accountability Act');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('should throw error for invalid regulation', async () => {
      await expect(
        complianceAutomationService.runComplianceScan('invalid')
      ).rejects.toThrow('Regulation invalid not found');
    });

    test('should include audit trail in scan results', async () => {
      const result = await complianceAutomationService.runComplianceScan('gdpr');
      
      expect(result.auditTrail.length).toBeGreaterThan(0);
      result.auditTrail.forEach(entry => {
        expect(entry.id).toBeDefined();
        expect(entry.timestamp).toBeInstanceOf(Date);
        expect(entry.action).toBeDefined();
        expect(entry.actor).toBeDefined();
      });
    });
  });

  describe('Compliance Dashboard', () => {
    test('should get compliance dashboard', async () => {
      // Run a scan first
      await complianceAutomationService.runComplianceScan('gdpr');
      
      const dashboard = await complianceAutomationService.getComplianceDashboard();
      
      expect(dashboard).toBeDefined();
      expect(Array.isArray(dashboard.regulations)).toBe(true);
      expect(Array.isArray(dashboard.recentScans)).toBe(true);
      expect(Array.isArray(dashboard.activeAlerts)).toBe(true);
      expect(dashboard.overallScore).toBeGreaterThanOrEqual(0);
      expect(dashboard.overallScore).toBeLessThanOrEqual(100);
    });

    test('should include all regulations in dashboard', async () => {
      const dashboard = await complianceAutomationService.getComplianceDashboard();
      
      expect(dashboard.regulations).toHaveLength(3);
      const regulationIds = dashboard.regulations.map(r => r.id);
      expect(regulationIds).toContain('gdpr');
      expect(regulationIds).toContain('ccpa');
      expect(regulationIds).toContain('hipaa');
    });
  });

  describe('Compliance Reports', () => {
    test('should generate compliance report', async () => {
      // Run a scan first
      await complianceAutomationService.runComplianceScan('gdpr');
      
      const report = await complianceAutomationService.generateComplianceReport('gdpr');
      
      expect(report).toBeDefined();
      expect(report.regulation).toBe('General Data Protection Regulation');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.period).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(Array.isArray(report.trends)).toBe(true);
      expect(Array.isArray(report.topViolations)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    test('should include summary statistics in report', async () => {
      await complianceAutomationService.runComplianceScan('gdpr');
      const report = await complianceAutomationService.generateComplianceReport('gdpr');
      
      expect(report.summary.totalScans).toBeGreaterThanOrEqual(0);
      expect(report.summary.averageScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.averageScore).toBeLessThanOrEqual(100);
      expect(report.summary.totalViolations).toBeGreaterThanOrEqual(0);
      expect(report.summary.criticalViolations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Audit Trail', () => {
    test('should get audit trail', async () => {
      await complianceAutomationService.runComplianceScan('gdpr');
      
      const auditTrail = await complianceAutomationService.getAuditTrail();
      
      expect(Array.isArray(auditTrail)).toBe(true);
      expect(auditTrail.length).toBeGreaterThan(0);
    });

    test('should filter audit trail by date', async () => {
      await complianceAutomationService.runComplianceScan('gdpr');
      
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const auditTrail = await complianceAutomationService.getAuditTrail({
        startDate: yesterday,
        endDate: now
      });
      
      expect(Array.isArray(auditTrail)).toBe(true);
      auditTrail.forEach(entry => {
        expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(entry.timestamp.getTime()).toBeLessThanOrEqual(now.getTime());
      });
    });
  });

  describe('Monitoring', () => {
    test('should start monitoring', () => {
      expect(() => {
        complianceAutomationService.startMonitoring('0 */6 * * *');
      }).not.toThrow();
    });

    test('should stop monitoring', () => {
      complianceAutomationService.startMonitoring();
      expect(() => {
        complianceAutomationService.stopMonitoring();
      }).not.toThrow();
    });
  });
});

describe('Compliance Workflow Service', () => {
  describe('Workflow Creation', () => {
    test('should create workflow', async () => {
      const workflow = await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high',
        'user@example.com'
      );
      
      expect(workflow).toBeDefined();
      expect(workflow.workflowId).toBeDefined();
      expect(workflow.violationId).toBe('violation_123');
      expect(workflow.workflowType).toBe('data_minimization');
      expect(workflow.priority).toBe('high');
      expect(workflow.assignedTo).toBe('user@example.com');
      expect(workflow.status).toBe('pending');
      expect(Array.isArray(workflow.steps)).toBe(true);
      expect(workflow.steps.length).toBeGreaterThan(0);
    });

    test('should set due date based on priority', async () => {
      const criticalWorkflow = await complianceWorkflowService.createWorkflow(
        'violation_1',
        'data_breach_notification',
        'critical'
      );
      
      const lowWorkflow = await complianceWorkflowService.createWorkflow(
        'violation_2',
        'data_minimization',
        'low'
      );
      
      expect(criticalWorkflow.dueDate).toBeDefined();
      expect(lowWorkflow.dueDate).toBeDefined();
      
      if (criticalWorkflow.dueDate && lowWorkflow.dueDate) {
        expect(criticalWorkflow.dueDate.getTime()).toBeLessThan(lowWorkflow.dueDate.getTime());
      }
    });
  });

  describe('Workflow Steps', () => {
    test('should update step status', async () => {
      const workflow = await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      const firstStep = workflow.steps[0];
      const updatedWorkflow = await complianceWorkflowService.updateStepStatus(
        workflow.workflowId,
        firstStep.id,
        'completed',
        'user@example.com',
        'Step completed successfully'
      );
      
      expect(updatedWorkflow).toBeDefined();
      const updatedStep = updatedWorkflow.steps.find(s => s.id === firstStep.id);
      expect(updatedStep?.status).toBe('completed');
      expect(updatedStep?.completedBy).toBe('user@example.com');
      expect(updatedStep?.notes).toBe('Step completed successfully');
    });

    test('should calculate completion percentage', async () => {
      const workflow = await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      expect(workflow.completionPercentage).toBe(0);
      
      // Complete first step
      const firstStep = workflow.steps[0];
      const updatedWorkflow = await complianceWorkflowService.updateStepStatus(
        workflow.workflowId,
        firstStep.id,
        'completed'
      );
      
      expect(updatedWorkflow.completionPercentage).toBeGreaterThan(0);
    });

    test('should mark workflow as completed when all steps done', async () => {
      const workflow = await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      let updatedWorkflow = workflow;
      for (const step of workflow.steps) {
        updatedWorkflow = await complianceWorkflowService.updateStepStatus(
          workflow.workflowId,
          step.id,
          'completed'
        );
      }
      
      expect(updatedWorkflow.status).toBe('completed');
      expect(updatedWorkflow.completionPercentage).toBe(100);
      expect(updatedWorkflow.completedAt).toBeDefined();
    });
  });

  describe('Workflow Queries', () => {
    test('should get workflow by ID', async () => {
      const workflow = await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      const retrieved = await complianceWorkflowService.getWorkflow(workflow.workflowId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.workflowId).toBe(workflow.workflowId);
    });

    test('should get workflows by violation', async () => {
      await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      const workflows = await complianceWorkflowService.getWorkflowsByViolation('violation_123');
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows[0].violationId).toBe('violation_123');
    });

    test('should get workflows by status', async () => {
      await complianceWorkflowService.createWorkflow(
        'violation_123',
        'data_minimization',
        'high'
      );
      
      const workflows = await complianceWorkflowService.getWorkflowsByStatus('pending');
      expect(workflows.length).toBeGreaterThan(0);
      workflows.forEach(w => {
        expect(w.status).toBe('pending');
      });
    });
  });

  describe('Workflow Statistics', () => {
    test('should get workflow statistics', async () => {
      await complianceWorkflowService.createWorkflow(
        'violation_1',
        'data_minimization',
        'high'
      );
      
      await complianceWorkflowService.createWorkflow(
        'violation_2',
        'consent_management',
        'critical'
      );
      
      const stats = await complianceWorkflowService.getWorkflowStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.byStatus).toBeDefined();
      expect(stats.byPriority).toBeDefined();
      expect(stats.averageCompletionTime).toBeGreaterThanOrEqual(0);
      expect(stats.overdueCount).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Legal Requirements Service', () => {
  describe('Requirements Retrieval', () => {
    test('should get all requirements', () => {
      const requirements = legalRequirementsService.getAllRequirements();
      expect(Array.isArray(requirements)).toBe(true);
      expect(requirements.length).toBeGreaterThan(0);
    });

    test('should get requirements by regulation', () => {
      const gdprRequirements = legalRequirementsService.getRequirementsByRegulation('gdpr');
      expect(Array.isArray(gdprRequirements)).toBe(true);
      expect(gdprRequirements.length).toBeGreaterThan(0);
      gdprRequirements.forEach(req => {
        expect(req.regulationId).toBe('gdpr');
      });
    });

    test('should get specific requirement', () => {
      const requirement = legalRequirementsService.getRequirement('gdpr_art_5_1_c');
      expect(requirement).toBeDefined();
      expect(requirement?.title).toBe('Data Minimization Principle');
    });

    test('should get requirements by category', () => {
      const requirements = legalRequirementsService.getRequirementsByCategory('Consumer Rights');
      expect(Array.isArray(requirements)).toBe(true);
      requirements.forEach(req => {
        expect(req.category).toBe('Consumer Rights');
      });
    });

    test('should get requirements by jurisdiction', () => {
      const euRequirements = legalRequirementsService.getRequirementsByJurisdiction('EU');
      expect(Array.isArray(euRequirements)).toBe(true);
      euRequirements.forEach(req => {
        expect(req.applicableJurisdictions).toContain('EU');
      });
    });

    test('should get mandatory requirements', () => {
      const mandatory = legalRequirementsService.getMandatoryRequirements();
      expect(Array.isArray(mandatory)).toBe(true);
      mandatory.forEach(req => {
        expect(req.mandatory).toBe(true);
      });
    });
  });

  describe('Requirements Search', () => {
    test('should search requirements by keyword', () => {
      const results = legalRequirementsService.searchRequirements('consent');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    test('should search requirements case-insensitively', () => {
      const lowerResults = legalRequirementsService.searchRequirements('consent');
      const upperResults = legalRequirementsService.searchRequirements('CONSENT');
      expect(lowerResults.length).toBe(upperResults.length);
    });
  });

  describe('Requirement Mappings', () => {
    test('should get compliance rule for requirement', () => {
      const ruleId = legalRequirementsService.getComplianceRuleForRequirement('gdpr_art_5_1_c');
      expect(ruleId).toBe('gdpr-001');
    });

    test('should get requirements for compliance rule', () => {
      const requirements = legalRequirementsService.getRequirementsForComplianceRule('gdpr-001');
      expect(Array.isArray(requirements)).toBe(true);
      expect(requirements.length).toBeGreaterThan(0);
    });
  });

  describe('Requirement Applicability', () => {
    test('should check requirement applicability', () => {
      const isApplicable = legalRequirementsService.isRequirementApplicable(
        'gdpr_art_5_1_c',
        'EU'
      );
      expect(isApplicable).toBe(true);
    });

    test('should return false for non-applicable jurisdiction', () => {
      const isApplicable = legalRequirementsService.isRequirementApplicable(
        'gdpr_art_5_1_c',
        'California'
      );
      expect(isApplicable).toBe(false);
    });
  });

  describe('Requirement Statistics', () => {
    test('should get requirement statistics', () => {
      const stats = legalRequirementsService.getRequirementStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byRegulation).toBeDefined();
      expect(stats.byCategory).toBeDefined();
      expect(stats.byJurisdiction).toBeDefined();
      expect(stats.mandatory).toBeGreaterThan(0);
      expect(stats.mandatory + stats.optional).toBe(stats.total);
    });
  });
});
