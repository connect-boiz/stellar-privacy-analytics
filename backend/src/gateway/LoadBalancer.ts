import axios from 'axios';
import { LoadBalancingConfig, ServiceConfig } from './PrivacyApiGateway';
import { logger } from '../utils/logger';

export interface ServiceHealth {
  serviceId: string;
  serviceName: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  responseTime: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  uptime: number;
  metadata: {
    version?: string;
    region?: string;
    capacity?: number;
    currentLoad?: number;
  };
}

export interface LoadBalancingStats {
  totalRequests: number;
  requestsByService: Record<string, number>;
  averageResponseTime: number;
  healthyServices: number;
  totalServices: number;
  strategy: string;
}

export interface RoutingDecision {
  serviceId: string;
  url: string;
  reason: string;
  metadata: {
    responseTime?: number;
    load?: number;
    weight?: number;
  };
}

export class LoadBalancer {
  private config: LoadBalancingConfig;
  private services: Map<string, ServiceConfig>;
  private serviceHealth: Map<string, ServiceHealth>;
  private requestCounts: Map<string, number>;
  private currentIndex: number;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: LoadBalancingConfig, services: ServiceConfig[]) {
    this.config = config;
    this.services = new Map();
    this.serviceHealth = new Map();
    this.requestCounts = new Map();
    this.currentIndex = 0;

    // Initialize services
    services.forEach(service => {
      this.services.set(service.id, service);
      this.serviceHealth.set(service.id, {
        serviceId: service.id,
        serviceName: service.name,
        url: service.baseUrl,
        status: 'unknown',
        lastHealthCheck: new Date(),
        responseTime: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        uptime: 0,
        metadata: {}
      });
      this.requestCounts.set(service.id, 0);
    });
  }

  async start(): Promise<void> {
    // Start health checking
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Initial health check
    await this.performHealthChecks();

    logger.info('Load balancer started', {
      strategy: this.config.strategy,
      servicesCount: this.services.size,
      healthCheckInterval: this.config.healthCheckInterval
    });
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    logger.info('Load balancer stopped');
  }

  async selectService(requestPath: string, requestMethod: string): Promise<RoutingDecision | null> {
    const healthyServices = this.getHealthyServices();

    if (healthyServices.length === 0) {
      logger.error('No healthy services available for routing');
      return null;
    }

    let selectedService: ServiceConfig;

    switch (this.config.strategy) {
      case 'round-robin':
        selectedService = this.selectRoundRobin(healthyServices);
        break;

      case 'least-connections':
        selectedService = this.selectLeastConnections(healthyServices);
        break;

      case 'weighted':
        selectedService = this.selectWeighted(healthyServices);
        break;

      case 'random':
        selectedService = this.selectRandom(healthyServices);
        break;

      default:
        selectedService = healthyServices[0];
    }

    // Update request count
    const currentCount = this.requestCounts.get(selectedService.id) || 0;
    this.requestCounts.set(selectedService.id, currentCount + 1);

    const health = this.serviceHealth.get(selectedService.id)!;

    return {
      serviceId: selectedService.id,
      url: selectedService.baseUrl,
      reason: `${this.config.strategy} selection`,
      metadata: {
        responseTime: health.responseTime,
        load: currentCount,
        weight: this.getServiceWeight(selectedService)
      }
    };
  }

  private selectRoundRobin(services: ServiceConfig[]): ServiceConfig {
    const service = services[this.currentIndex % services.length];
    this.currentIndex = (this.currentIndex + 1) % services.length;
    return service;
  }

  private selectLeastConnections(services: ServiceConfig[]): ServiceConfig {
    return services.reduce((least, current) => {
      const leastConnections = this.requestCounts.get(least.id) || 0;
      const currentConnections = this.requestCounts.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectWeighted(services: ServiceConfig[]): ServiceConfig {
    const totalWeight = services.reduce((sum, service) => 
      sum + this.getServiceWeight(service), 0);
    
    let random = Math.random() * totalWeight;
    
    for (const service of services) {
      random -= this.getServiceWeight(service);
      if (random <= 0) {
        return service;
      }
    }
    
    return services[0]; // Fallback
  }

  private selectRandom(services: ServiceConfig[]): ServiceConfig {
    const randomIndex = Math.floor(Math.random() * services.length);
    return services[randomIndex];
  }

  private getServiceWeight(service: ServiceConfig): number {
    // Simple weight calculation based on service health and response time
    const health = this.serviceHealth.get(service.id);
    if (!health || health.status !== 'healthy') {
      return 0;
    }

    let weight = 100; // Base weight

    // Adjust based on response time (lower is better)
    if (health.responseTime > 0) {
      weight = Math.max(10, weight - (health.responseTime / 10));
    }

    // Adjust based on consecutive successes
    weight += health.consecutiveSuccesses * 5;

    // Adjust based on consecutive failures
    weight -= health.consecutiveFailures * 10;

    return Math.max(1, weight);
  }

  private getHealthyServices(): ServiceConfig[] {
    return Array.from(this.services.values()).filter(service => {
      const health = this.serviceHealth.get(service.id);
      return health && health.status === 'healthy';
    });
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.services.values()).map(service =>
      this.checkServiceHealth(service)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  private async checkServiceHealth(service: ServiceConfig): Promise<void> {
    const health = this.serviceHealth.get(service.id)!;
    const startTime = Date.now();

    try {
      const healthCheckUrl = service.healthCheckPath 
        ? `${service.baseUrl}${service.healthCheckPath}`
        : `${service.baseUrl}/health`;

      const response = await axios.get(healthCheckUrl, {
        timeout: 5000, // 5 second timeout
        validateStatus: (status) => status < 500 // Consider 4xx as healthy
      });

      const responseTime = Date.now() - startTime;

      // Update health status
      health.lastHealthCheck = new Date();
      health.responseTime = responseTime;
      health.consecutiveSuccesses++;
      health.consecutiveFailures = 0;

      if (health.status !== 'healthy') {
        health.status = 'healthy';
        logger.info(`Service ${service.name} is now healthy`, {
          serviceId: service.id,
          responseTime
        });
      }

      // Update metadata if available
      if (response.data && typeof response.data === 'object') {
        health.metadata = {
          ...health.metadata,
          version: response.data.version,
          region: response.data.region,
          capacity: response.data.capacity,
          currentLoad: response.data.currentLoad
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;

      health.lastHealthCheck = new Date();
      health.responseTime = responseTime;
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;

      // Check if service should be marked as unhealthy
      if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
        if (health.status !== 'unhealthy') {
          health.status = 'unhealthy';
          logger.warn(`Service ${service.name} marked as unhealthy`, {
            serviceId: service.id,
            consecutiveFailures: health.consecutiveFailures,
            error: (error as Error).message
          });
        }
      }

      logger.debug(`Health check failed for service ${service.name}`, {
        serviceId: service.id,
        error: (error as Error).message,
        consecutiveFailures: health.consecutiveFailures
      });
    }
  }

  async getServicesHealth(): Promise<ServiceHealth[]> {
    return Array.from(this.serviceHealth.values());
  }

  async getServiceHealth(serviceId: string): Promise<ServiceHealth | null> {
    return this.serviceHealth.get(serviceId) || null;
  }

  async getLoadBalancingStats(): Promise<LoadBalancingStats> {
    const totalRequests = Array.from(this.requestCounts.values())
      .reduce((sum, count) => sum + count, 0);

    const requestsByService: Record<string, number> = {};
    this.requestCounts.forEach((count, serviceId) => {
      requestsByService[serviceId] = count;
    });

    const healthyServices = this.getHealthyServices().length;
    const totalServices = this.services.size;

    const averageResponseTime = Array.from(this.serviceHealth.values())
      .filter(h => h.status === 'healthy')
      .reduce((sum, h) => sum + h.responseTime, 0) / healthyServices || 0;

    return {
      totalRequests,
      requestsByService,
      averageResponseTime,
      healthyServices,
      totalServices,
      strategy: this.config.strategy
    };
  }

  async addService(service: ServiceConfig): Promise<void> {
    this.services.set(service.id, service);
    this.serviceHealth.set(service.id, {
      serviceId: service.id,
      serviceName: service.name,
      url: service.baseUrl,
      status: 'unknown',
      lastHealthCheck: new Date(),
      responseTime: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      uptime: 0,
      metadata: {}
    });
    this.requestCounts.set(service.id, 0);

    logger.info('Service added to load balancer', {
      serviceId: service.id,
      serviceName: service.name,
      url: service.baseUrl
    });
  }

  async removeService(serviceId: string): Promise<void> {
    this.services.delete(serviceId);
    this.serviceHealth.delete(serviceId);
    this.requestCounts.delete(serviceId);

    logger.info('Service removed from load balancer', { serviceId });
  }

  async updateService(serviceId: string, updates: Partial<ServiceConfig>): Promise<boolean> {
    const existing = this.services.get(serviceId);
    if (!existing) {
      return false;
    }

    const updated = { ...existing, ...updates };
    this.services.set(serviceId, updated);

    // Update health record if URL changed
    if (updates.baseUrl) {
      const health = this.serviceHealth.get(serviceId);
      if (health) {
        health.url = updates.baseUrl;
      }
    }

    logger.info('Service updated in load balancer', {
      serviceId,
      updates: Object.keys(updates)
    });

    return true;
  }

  async resetRequestCounts(): Promise<void> {
    this.requestCounts.clear();
    this.services.forEach(service => {
      this.requestCounts.set(service.id, 0);
    });

    logger.info('Request counts reset');
  }

  async getRoutingHistory(timeRange?: {
    start: Date;
    end: Date;
  }): Promise<Array<{
    timestamp: Date;
    serviceId: string;
    requestPath: string;
    responseTime: number;
  }>> {
    // In a real implementation, this would query a database
    // For now, return empty array
    return [];
  }

  public getStats(): {
    totalServices: number;
    healthyServices: number;
    totalRequests: number;
    strategy: string;
    healthCheckInterval: number;
  } {
    const healthyServices = this.getHealthyServices().length;
    const totalRequests = Array.from(this.requestCounts.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      totalServices: this.services.size,
      healthyServices,
      totalRequests,
      strategy: this.config.strategy,
      healthCheckInterval: this.config.healthCheckInterval
    };
  }
}
