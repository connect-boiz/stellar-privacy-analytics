import { EventEmitter } from 'events';
import { ServiceRegistry, ServiceInstance } from './ServiceRegistry';
import { ServiceMesh } from './ServiceMesh';
import { logger } from '../utils/logger';

export interface FailoverPolicy {
  serviceName: string;
  maxFailures: number;
  recoveryTimeout: number;
  failoverStrategy: 'round_robin' | 'weighted' | 'priority' | 'geographic';
  backupInstances: string[];
  enableAutoFailover: boolean;
  healthCheckInterval: number;
}

export interface DisasterRecoveryPlan {
  serviceName: string;
  primaryRegion: string;
  backupRegions: string[];
  dataReplicationDelay: number;
  maxDowntime: number;
  recoverySteps: string[];
  contactEmails: string[];
}

export class FailoverManager extends EventEmitter {
  private serviceRegistry: ServiceRegistry;
  private serviceMesh: ServiceMesh;
  private failoverPolicies: Map<string, FailoverPolicy> = new Map();
  private disasterRecoveryPlans: Map<string, DisasterRecoveryPlan> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private failoverStates: Map<string, FailoverState> = new Map();
  private recoveryTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    serviceRegistry: ServiceRegistry,
    serviceMesh: ServiceMesh
  ) {
    super();
    this.serviceRegistry = serviceRegistry;
    this.serviceMesh = serviceMesh;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.serviceRegistry.on('serviceHealthFailed', (instance, error) => {
      this.handleServiceFailure(instance);
    });

    this.serviceRegistry.on('serviceHealthRestored', (instance) => {
      this.handleServiceRecovery(instance);
    });

    this.serviceMesh.on('requestCompleted', (serviceName: string, status: string, responseTime: number) => {
      if (status === 'error') {
        this.incrementFailureCount(serviceName);
      } else if (status === 'success') {
        this.resetFailureCount(serviceName);
      }
    });
  }

  addFailoverPolicy(policy: FailoverPolicy): void {
    this.failoverPolicies.set(policy.serviceName, policy);
    this.failoverStates.set(policy.serviceName, FailoverState.NORMAL);
    logger.info(`Failover policy added for ${policy.serviceName}`);
  }

  addDisasterRecoveryPlan(plan: DisasterRecoveryPlan): void {
    this.disasterRecoveryPlans.set(plan.serviceName, plan);
    logger.info(`Disaster recovery plan added for ${plan.serviceName}`);
  }

  private async handleServiceFailure(instance: ServiceInstance): Promise<void> {
    const policy = this.failoverPolicies.get(instance.name);
    if (!policy || !policy.enableAutoFailover) {
      return;
    }

    const failureCount = this.incrementFailureCount(instance.name);
    logger.warn(`Service failure detected for ${instance.name}. Failure count: ${failureCount}`);

    if (failureCount >= policy.maxFailures) {
      await this.initiateFailover(instance.name, policy);
    }
  }

  private async handleServiceRecovery(instance: ServiceInstance): Promise<void> {
    const policy = this.failoverPolicies.get(instance.name);
    if (!policy) return;

    logger.info(`Service recovery detected for ${instance.name}`);
    this.resetFailureCount(instance.name);

    // Check if we should fail back to primary
    if (this.failoverStates.get(instance.name) === FailoverState.FAILED_OVER) {
      await this.initiateFailback(instance.name, policy);
    }
  }

  private incrementFailureCount(serviceName: string): number {
    const currentCount = this.failureCounts.get(serviceName) || 0;
    const newCount = currentCount + 1;
    this.failureCounts.set(serviceName, newCount);
    return newCount;
  }

  private resetFailureCount(serviceName: string): void {
    this.failureCounts.set(serviceName, 0);
  }

  private async initiateFailover(serviceName: string, policy: FailoverPolicy): Promise<void> {
    logger.warn(`Initiating failover for ${serviceName}`);
    this.failoverStates.set(serviceName, FailoverState.FAILED_OVER);
    
    this.emit('failoverInitiated', serviceName, policy);

    // Execute failover strategy
    try {
      await this.executeFailoverStrategy(serviceName, policy);
      
      // Set recovery timer
      const recoveryTimer = setTimeout(async () => {
        await this.attemptRecovery(serviceName, policy);
      }, policy.recoveryTimeout);
      
      this.recoveryTimers.set(serviceName, recoveryTimer);
      
      logger.info(`Failover completed for ${serviceName}`);
      this.emit('failoverCompleted', serviceName);
      
    } catch (error) {
      logger.error(`Failover failed for ${serviceName}:`, error);
      this.emit('failoverFailed', serviceName, error);
      
      // Initiate disaster recovery if failover fails
      await this.initiateDisasterRecovery(serviceName);
    }
  }

  private async executeFailoverStrategy(serviceName: string, policy: FailoverPolicy): Promise<void> {
    switch (policy.failoverStrategy) {
      case 'round_robin':
        await this.executeRoundRobinFailover(serviceName, policy);
        break;
      case 'weighted':
        await this.executeWeightedFailover(serviceName, policy);
        break;
      case 'priority':
        await this.executePriorityFailover(serviceName, policy);
        break;
      case 'geographic':
        await this.executeGeographicFailover(serviceName, policy);
        break;
      default:
        throw new Error(`Unknown failover strategy: ${policy.failoverStrategy}`);
    }
  }

  private async executeRoundRobinFailover(serviceName: string, policy: FailoverPolicy): Promise<void> {
    const instances = await this.serviceRegistry.getAllServices(serviceName);
    const backupInstances = instances.filter(i => policy.backupInstances.includes(i.id));
    
    if (backupInstances.length === 0) {
      throw new Error('No backup instances available for round-robin failover');
    }

    // Rotate through backup instances
    for (const instance of backupInstances) {
      try {
        await this.testInstance(instance);
        logger.info(`Round-robin failover successful to ${instance.id}`);
        return;
      } catch (error) {
        logger.warn(`Backup instance ${instance.id} failed, trying next`);
      }
    }
    
    throw new Error('All backup instances failed in round-robin failover');
  }

  private async executeWeightedFailover(serviceName: string, policy: FailoverPolicy): Promise<void> {
    const instances = await this.serviceRegistry.getAllServices(serviceName);
    const backupInstances = instances.filter(i => policy.backupInstances.includes(i.id));
    
    if (backupInstances.length === 0) {
      throw new Error('No backup instances available for weighted failover');
    }

    // Sort by weight (higher weight = higher priority)
    backupInstances.sort((a, b) => (b.weight || 1) - (a.weight || 1));
    
    for (const instance of backupInstances) {
      try {
        await this.testInstance(instance);
        logger.info(`Weighted failover successful to ${instance.id} (weight: ${instance.weight})`);
        return;
      } catch (error) {
        logger.warn(`Backup instance ${instance.id} failed, trying next with lower weight`);
      }
    }
    
    throw new Error('All backup instances failed in weighted failover');
  }

  private async executePriorityFailover(serviceName: string, policy: FailoverPolicy): Promise<void> {
    const instances = await this.serviceRegistry.getAllServices(serviceName);
    const backupInstances = instances.filter(i => policy.backupInstances.includes(i.id));
    
    if (backupInstances.length === 0) {
      throw new Error('No backup instances available for priority failover');
    }

    // Try backup instances in the order they appear in the policy
    for (const backupId of policy.backupInstances) {
      const instance = backupInstances.find(i => i.id === backupId);
      if (instance) {
        try {
          await this.testInstance(instance);
          logger.info(`Priority failover successful to ${instance.id}`);
          return;
        } catch (error) {
          logger.warn(`Priority backup instance ${instance.id} failed, trying next`);
        }
      }
    }
    
    throw new Error('All priority backup instances failed');
  }

  private async executeGeographicFailover(serviceName: string, policy: FailoverPolicy): Promise<void> {
    const instances = await this.serviceRegistry.getAllServices(serviceName);
    const backupInstances = instances.filter(i => policy.backupInstances.includes(i.id));
    
    if (backupInstances.length === 0) {
      throw new Error('No backup instances available for geographic failover');
    }

    // Group by region (assuming region is in metadata)
    const instancesByRegion = new Map<string, ServiceInstance[]>();
    for (const instance of backupInstances) {
      const region = instance.metadata.region || 'unknown';
      if (!instancesByRegion.has(region)) {
        instancesByRegion.set(region, []);
      }
      instancesByRegion.get(region)!.push(instance);
    }

    // Try regions in order of preference (could be configurable)
    const regionOrder = ['backup1', 'backup2', 'backup3'];
    
    for (const region of regionOrder) {
      const regionInstances = instancesByRegion.get(region);
      if (regionInstances && regionInstances.length > 0) {
        for (const instance of regionInstances) {
          try {
            await this.testInstance(instance);
            logger.info(`Geographic failover successful to ${instance.id} in region ${region}`);
            return;
          } catch (error) {
            logger.warn(`Instance ${instance.id} in region ${region} failed`);
          }
        }
      }
    }
    
    throw new Error('All geographic backup instances failed');
  }

  private async testInstance(instance: ServiceInstance): Promise<void> {
    const response = await this.serviceMesh.get(instance.name, '/health', {
      timeout: 5000
    });
    
    if (response.status !== 200) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
  }

  private async initiateFailback(serviceName: string, policy: FailoverPolicy): Promise<void> {
    logger.info(`Initiating failback for ${serviceName}`);
    this.failoverStates.set(serviceName, FailoverState.RECOVERING);
    
    this.emit('failbackInitiated', serviceName);
    
    try {
      // Check if primary instances are healthy
      const instances = await this.serviceRegistry.getAllServices(serviceName);
      const primaryInstances = instances.filter(i => !policy.backupInstances.includes(i.id));
      
      for (const instance of primaryInstances) {
        try {
          await this.testInstance(instance);
          logger.info(`Primary instance ${instance.id} is healthy, initiating failback`);
          break;
        } catch (error) {
          logger.warn(`Primary instance ${instance.id} still unhealthy`);
        }
      }
      
      this.failoverStates.set(serviceName, FailoverState.NORMAL);
      this.emit('failbackCompleted', serviceName);
      
    } catch (error) {
      logger.error(`Failback failed for ${serviceName}:`, error);
      this.emit('failbackFailed', serviceName, error);
    }
  }

  private async attemptRecovery(serviceName: string, policy: FailoverPolicy): Promise<void> {
    logger.info(`Attempting recovery for ${serviceName}`);
    
    try {
      // Check if primary instances are healthy
      const instances = await this.serviceRegistry.getAllServices(serviceName);
      const healthyInstances = instances.filter(i => i.health === 'healthy');
      
      if (healthyInstances.length > 0) {
        await this.initiateFailback(serviceName, policy);
      } else {
        logger.warn(`Recovery failed for ${serviceName}, no healthy instances found`);
        this.emit('recoveryFailed', serviceName);
      }
      
    } catch (error) {
      logger.error(`Recovery attempt failed for ${serviceName}:`, error);
      this.emit('recoveryFailed', serviceName);
    }
  }

  private async initiateDisasterRecovery(serviceName: string): Promise<void> {
    logger.error(`Initiating disaster recovery for ${serviceName}`);
    this.failoverStates.set(serviceName, FailoverState.DISASTER_RECOVERY);
    
    this.emit('disasterRecoveryInitiated', serviceName);
    
    const plan = this.disasterRecoveryPlans.get(serviceName);
    if (!plan) {
      logger.error(`No disaster recovery plan found for ${serviceName}`);
      return;
    }

    try {
      // Execute disaster recovery steps
      for (const step of plan.recoverySteps) {
        logger.info(`Executing disaster recovery step: ${step}`);
        // This would typically involve infrastructure automation
        await this.executeRecoveryStep(step);
      }
      
      logger.info(`Disaster recovery completed for ${serviceName}`);
      this.emit('disasterRecoveryCompleted', serviceName);
      
    } catch (error) {
      logger.error(`Disaster recovery failed for ${serviceName}:`, error);
      this.emit('disasterRecoveryFailed', serviceName, error);
    }
  }

  private async executeRecoveryStep(step: string): Promise<void> {
    // This would integrate with infrastructure automation tools
    // For now, just simulate the step
    await new Promise(resolve => setTimeout(resolve, 1000));
    logger.info(`Recovery step completed: ${step}`);
  }

  getFailoverStatus(serviceName?: string): Record<string, any> {
    const status: Record<string, any> = {};
    
    const servicesToCheck = serviceName ? [serviceName] : Array.from(this.failoverPolicies.keys());
    
    for (const service of servicesToCheck) {
      const policy = this.failoverPolicies.get(service);
      const state = this.failoverStates.get(service);
      const failureCount = this.failureCounts.get(service) || 0;
      
      status[service] = {
        policy: policy,
        state: state,
        failureCount: failureCount,
        hasDisasterRecoveryPlan: this.disasterRecoveryPlans.has(service)
      };
    }
    
    return status;
  }

  async manualFailover(serviceName: string): Promise<void> {
    const policy = this.failoverPolicies.get(serviceName);
    if (!policy) {
      throw new Error(`No failover policy found for ${serviceName}`);
    }
    
    logger.info(`Manual failover initiated for ${serviceName}`);
    await this.initiateFailover(serviceName, policy);
  }

  async manualFailback(serviceName: string): Promise<void> {
    const policy = this.failoverPolicies.get(serviceName);
    if (!policy) {
      throw new Error(`No failover policy found for ${serviceName}`);
    }
    
    logger.info(`Manual failback initiated for ${serviceName}`);
    await this.initiateFailback(serviceName, policy);
  }

  async shutdown(): Promise<void> {
    // Clear all recovery timers
    for (const timer of this.recoveryTimers.values()) {
      clearTimeout(timer);
    }
    this.recoveryTimers.clear();
    
    logger.info('Failover Manager shutdown complete');
  }
}

enum FailoverState {
  NORMAL = 'normal',
  FAILED_OVER = 'failed_over',
  RECOVERING = 'recovering',
  DISASTER_RECOVERY = 'disaster_recovery'
}
