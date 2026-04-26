import { ServiceRegistry, ServiceRegistration } from './ServiceRegistry';
import { ServiceMesh, ServiceMeshConfig } from './ServiceMesh';
import { HealthMonitor } from './HealthMonitor';
import { FailoverManager, FailoverPolicy, DisasterRecoveryPlan } from './FailoverManager';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface ServiceDiscoveryConfig {
  redisUrl: string;
  serviceMesh?: ServiceMeshConfig;
  autoRegister?: boolean;
  healthCheckInterval?: number;
  enableFailover?: boolean;
  enableMonitoring?: boolean;
}

export interface ServiceInfo {
  name: string;
  host: string;
  port: number;
  metadata?: Record<string, any>;
  tags?: string[];
  version?: string;
  weight?: number;
}

// Re-export types from other modules
export { ServiceRegistration } from './ServiceRegistry';
export { ServiceMeshConfig } from './ServiceMesh';
export { FailoverPolicy, DisasterRecoveryPlan } from './FailoverManager';

export class ServiceDiscovery extends EventEmitter {
  private serviceRegistry: ServiceRegistry;
  private serviceMesh: ServiceMesh;
  private healthMonitor: HealthMonitor;
  private failoverManager: FailoverManager;
  private config: Required<ServiceDiscoveryConfig>;
  private isInitialized: boolean = false;
  private currentServiceId?: string;

  constructor(config: ServiceDiscoveryConfig) {
    super();
    
    this.config = {
      redisUrl: config.redisUrl,
      serviceMesh: config.serviceMesh || {},
      autoRegister: config.autoRegister !== false,
      healthCheckInterval: config.healthCheckInterval || 30000,
      enableFailover: config.enableFailover !== false,
      enableMonitoring: config.enableMonitoring !== false
    };

    this.serviceRegistry = new ServiceRegistry(config.redisUrl);
    this.serviceMesh = new ServiceMesh(this.serviceRegistry, this.config.serviceMesh);
    this.healthMonitor = new HealthMonitor(this.serviceRegistry, this.serviceMesh);
    this.failoverManager = new FailoverManager(this.serviceRegistry, this.serviceMesh);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Forward events from components
    this.serviceRegistry.on('serviceRegistered', (instance) => {
      this.emit('serviceRegistered', instance);
    });

    this.serviceRegistry.on('serviceDeregistered', (instance) => {
      this.emit('serviceDeregistered', instance);
    });

    this.serviceMesh.on('serviceHealthIssue', (instance, status, error) => {
      this.emit('serviceHealthIssue', instance, status, error);
    });

    this.healthMonitor.on('alert', (alert) => {
      this.emit('alert', alert);
    });

    this.failoverManager.on('failoverInitiated', (serviceName) => {
      this.emit('failoverInitiated', serviceName);
    });

    this.failoverManager.on('disasterRecoveryInitiated', (serviceName) => {
      this.emit('disasterRecoveryInitiated', serviceName);
    });
  }

  async initialize(serviceInfo?: ServiceInfo): Promise<void> {
    try {
      logger.info('Initializing Service Discovery...');
      
      // Initialize service registry
      await this.serviceRegistry.initializeRedis();
      
      // Start health monitoring if enabled
      if (this.config.enableMonitoring) {
        await this.healthMonitor.startMonitoring();
      }
      
      // Auto-register current service if provided
      if (this.config.autoRegister && serviceInfo) {
        await this.registerCurrentService(serviceInfo);
      }
      
      this.isInitialized = true;
      logger.info('Service Discovery initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      logger.error('Failed to initialize Service Discovery:', error);
      throw error;
    }
  }

  private async registerCurrentService(serviceInfo: ServiceInfo): Promise<void> {
    try {
      const registration: ServiceRegistration = {
        name: serviceInfo.name,
        host: serviceInfo.host,
        port: serviceInfo.port,
        metadata: serviceInfo.metadata,
        tags: serviceInfo.tags,
        version: serviceInfo.version,
        weight: serviceInfo.weight,
        healthCheckEndpoint: '/health',
        healthCheckInterval: this.config.healthCheckInterval
      };

      this.currentServiceId = await this.serviceRegistry.registerService(registration);
      logger.info(`Current service registered with ID: ${this.currentServiceId}`);
      
    } catch (error) {
      logger.error('Failed to register current service:', error);
      throw error;
    }
  }

  async registerService(registration: ServiceRegistration): Promise<string> {
    this.ensureInitialized();
    return await this.serviceRegistry.registerService(registration);
  }

  async deregisterService(serviceId: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.serviceRegistry.deregisterService(serviceId);
  }

  async getService(serviceName: string): Promise<any> {
    this.ensureInitialized();
    return await this.serviceRegistry.getService(serviceName);
  }

  async getAllServices(serviceName?: string): Promise<any[]> {
    this.ensureInitialized();
    return await this.serviceRegistry.getAllServices(serviceName);
  }

  async discoverServices(): Promise<string[]> {
    this.ensureInitialized();
    return await this.serviceMesh.discoverServices();
  }

  // Service mesh methods
  async request(serviceRequest: any): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.request(serviceRequest);
  }

  async get(serviceName: string, path: string, options?: any): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.get(serviceName, path, options);
  }

  async post(serviceName: string, path: string, data?: any, options?: any): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.post(serviceName, path, data, options);
  }

  async put(serviceName: string, path: string, data?: any, options?: any): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.put(serviceName, path, data, options);
  }

  async delete(serviceName: string, path: string, options?: any): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.delete(serviceName, path, options);
  }

  // Health monitoring methods
  addHealthCheck(serviceName: string, endpoint: string, interval?: number): void {
    this.ensureInitialized();
    this.healthMonitor.addHealthCheck({
      serviceName,
      endpoint,
      interval: interval || this.config.healthCheckInterval,
      timeout: 5000
    });
  }

  removeHealthCheck(serviceName: string, endpoint: string): void {
    this.ensureInitialized();
    this.healthMonitor.removeHealthCheck(serviceName, endpoint);
  }

  async getHealthStatus(): Promise<any> {
    this.ensureInitialized();
    return await this.healthMonitor.getOverallHealthStatus();
  }

  getServiceMetrics(serviceName?: string): any {
    this.ensureInitialized();
    return this.healthMonitor.getServiceMetrics(serviceName);
  }

  getActiveAlerts(severity?: string): any[] {
    this.ensureInitialized();
    return this.healthMonitor.getActiveAlerts(severity);
  }

  // Failover management methods
  addFailoverPolicy(policy: FailoverPolicy): void {
    this.ensureInitialized();
    this.failoverManager.addFailoverPolicy(policy);
  }

  addDisasterRecoveryPlan(plan: DisasterRecoveryPlan): void {
    this.ensureInitialized();
    this.failoverManager.addDisasterRecoveryPlan(plan);
  }

  getFailoverStatus(serviceName?: string): any {
    this.ensureInitialized();
    return this.failoverManager.getFailoverStatus(serviceName);
  }

  async manualFailover(serviceName: string): Promise<void> {
    this.ensureInitialized();
    return await this.failoverManager.manualFailover(serviceName);
  }

  async manualFailback(serviceName: string): Promise<void> {
    this.ensureInitialized();
    return await this.failoverManager.manualFailback(serviceName);
  }

  // Performance optimization methods
  async optimizeServiceDiscovery(): Promise<void> {
    this.ensureInitialized();
    
    logger.info('Optimizing service discovery performance...');
    
    // Clean up stale services
    const allServices = await this.serviceRegistry.getAllServices();
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const service of allServices) {
      const timeSinceLastCheck = now - service.lastHealthCheck.getTime();
      if (timeSinceLastCheck > staleThreshold) {
        logger.warn(`Stale service detected: ${service.id}, last check: ${service.lastHealthCheck}`);
        await this.serviceRegistry.deregisterService(service.id);
      }
    }
    
    // Optimize Redis memory usage
    const stats = await this.serviceRegistry.getServiceStatistics();
    logger.info('Service statistics:', stats);
    
    this.emit('optimizationCompleted', stats);
  }

  // Monitoring and metrics
  getServiceMeshMetrics(): any {
    this.ensureInitialized();
    return this.serviceMesh.getServiceMetrics();
  }

  async getServiceHealth(): Promise<any> {
    this.ensureInitialized();
    return await this.serviceMesh.getServiceHealth();
  }

  getPrometheusMetrics(): string {
    this.ensureInitialized();
    return this.healthMonitor.getPrometheusMetrics();
  }

  // Utility methods
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Service Discovery is not initialized. Call initialize() first.');
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getCurrentServiceId(): string | undefined {
    return this.currentServiceId;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Service Discovery...');
    
    try {
      // Deregister current service
      if (this.currentServiceId) {
        await this.serviceRegistry.deregisterService(this.currentServiceId);
      }
      
      // Stop monitoring
      if (this.config.enableMonitoring) {
        await this.healthMonitor.stopMonitoring();
      }
      
      // Shutdown failover manager
      await this.failoverManager.shutdown();
      
      // Shutdown service registry
      await this.serviceRegistry.shutdown();
      
      this.isInitialized = false;
      logger.info('Service Discovery shutdown complete');
      
    } catch (error) {
      logger.error('Error during Service Discovery shutdown:', error);
      throw error;
    }
  }

  // Configuration methods
  updateConfig(newConfig: Partial<ServiceDiscoveryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Service Discovery configuration updated');
  }

  getConfig(): Required<ServiceDiscoveryConfig> {
    return { ...this.config };
  }
}
