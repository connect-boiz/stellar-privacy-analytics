import Redis from 'redis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import axios, { AxiosResponse } from 'axios';

export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  health: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  metadata: Record<string, any>;
  tags: string[];
  version: string;
  weight: number;
}

export interface ServiceRegistration {
  name: string;
  host: string;
  port: number;
  metadata?: Record<string, any>;
  tags?: string[];
  version?: string;
  weight?: number;
  healthCheckEndpoint?: string;
  healthCheckInterval?: number;
}

export class ServiceRegistry extends EventEmitter {
  private redis: Redis.RedisClientType;
  private services: Map<string, ServiceInstance[]> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SERVICE_TTL = 60000; // 60 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(redisUrl: string) {
    super();
    this.redis = Redis.createClient({ url: redisUrl });
    this.initializeRedis();
  }

  public async initializeRedis(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Service Registry connected to Redis');
      await this.loadExistingServices();
    } catch (error) {
      logger.error('Failed to connect to Redis for Service Registry:', error);
      throw error;
    }
  }

  private async loadExistingServices(): Promise<void> {
    try {
      const serviceKeys = await this.redis.keys('service:*');
      for (const key of serviceKeys) {
        const serviceData = await this.redis.get(key);
        if (serviceData) {
          const services: ServiceInstance[] = JSON.parse(serviceData);
          this.services.set(key.replace('service:', ''), services);
        }
      }
      logger.info(`Loaded ${this.services.size} services from Redis`);
    } catch (error) {
      logger.error('Failed to load existing services:', error);
    }
  }

  async registerService(registration: ServiceRegistration): Promise<string> {
    const serviceId = `${registration.name}-${registration.host}:${registration.port}-${Date.now()}`;
    
    const serviceInstance: ServiceInstance = {
      id: serviceId,
      name: registration.name,
      host: registration.host,
      port: registration.port,
      health: 'unknown',
      lastHealthCheck: new Date(),
      metadata: registration.metadata || {},
      tags: registration.tags || [],
      version: registration.version || '1.0.0',
      weight: registration.weight || 1
    };

    // Add to local registry
    if (!this.services.has(registration.name)) {
      this.services.set(registration.name, []);
    }
    this.services.get(registration.name)!.push(serviceInstance);

    // Save to Redis
    await this.saveServiceToRedis(registration.name);

    // Start health checking
    this.startHealthCheck(serviceInstance, registration);

    logger.info(`Service registered: ${serviceId}`);
    this.emit('serviceRegistered', serviceInstance);

    return serviceId;
  }

  async deregisterService(serviceId: string): Promise<boolean> {
    for (const [serviceName, instances] of this.services.entries()) {
      const index = instances.findIndex(instance => instance.id === serviceId);
      if (index !== -1) {
        const removedInstance = instances.splice(index, 1)[0];
        
        // Stop health checking
        this.stopHealthCheck(serviceId);

        // Update Redis
        if (instances.length === 0) {
          this.services.delete(serviceName);
          await this.redis.del(`service:${serviceName}`);
        } else {
          await this.saveServiceToRedis(serviceName);
        }

        logger.info(`Service deregistered: ${serviceId}`);
        this.emit('serviceDeregistered', removedInstance);
        return true;
      }
    }
    return false;
  }

  async getService(serviceName: string, healthyOnly: boolean = true): Promise<ServiceInstance | null> {
    const instances = this.services.get(serviceName);
    if (!instances || instances.length === 0) {
      return null;
    }

    const availableInstances = healthyOnly 
      ? instances.filter(instance => instance.health === 'healthy')
      : instances;

    if (availableInstances.length === 0) {
      return null;
    }

    // Weighted round-robin selection
    return this.selectWeightedInstance(availableInstances);
  }

  async getAllServices(serviceName?: string): Promise<ServiceInstance[]> {
    if (serviceName) {
      return this.services.get(serviceName) || [];
    }

    const allServices: ServiceInstance[] = [];
    for (const instances of this.services.values()) {
      allServices.push(...instances);
    }
    return allServices;
  }

  private selectWeightedInstance(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance;
      }
    }
    
    return instances[0];
  }

  private startHealthCheck(serviceInstance: ServiceInstance, registration: ServiceRegistration): void {
    const interval = registration.healthCheckInterval || this.HEALTH_CHECK_INTERVAL;
    
    const healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck(serviceInstance, registration.healthCheckEndpoint);
    }, interval);

    this.healthCheckIntervals.set(serviceInstance.id, healthCheckTimer);
    
    // Perform initial health check
    this.performHealthCheck(serviceInstance, registration.healthCheckEndpoint);
  }

  private stopHealthCheck(serviceId: string): void {
    const timer = this.healthCheckIntervals.get(serviceId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckIntervals.delete(serviceId);
    }
  }

  private async performHealthCheck(serviceInstance: ServiceInstance, healthEndpoint?: string): Promise<void> {
    try {
      const endpoint = healthEndpoint || '/health';
      const url = `http://${serviceInstance.host}:${serviceInstance.port}${endpoint}`;
      
      const response: AxiosResponse = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 300
      });

      const previousHealth = serviceInstance.health;
      serviceInstance.health = 'healthy';
      serviceInstance.lastHealthCheck = new Date();

      if (previousHealth !== 'healthy') {
        logger.info(`Service health restored: ${serviceInstance.id}`);
        this.emit('serviceHealthRestored', serviceInstance);
      }

    } catch (error) {
      const previousHealth = serviceInstance.health;
      serviceInstance.health = 'unhealthy';
      serviceInstance.lastHealthCheck = new Date();

      if (previousHealth === 'healthy') {
        logger.warn(`Service health failed: ${serviceInstance.id}`, error);
        this.emit('serviceHealthFailed', serviceInstance, error);
      }
    }

    // Update in Redis
    await this.saveServiceToRedis(serviceInstance.name);
  }

  private async saveServiceToRedis(serviceName: string): Promise<void> {
    try {
      const instances = this.services.get(serviceName) || [];
      await this.redis.setEx(
        `service:${serviceName}`,
        this.SERVICE_TTL / 1000,
        JSON.stringify(instances)
      );
    } catch (error) {
      logger.error(`Failed to save service ${serviceName} to Redis:`, error);
    }
  }

  async getHealthyServicesCount(): Promise<number> {
    let healthyCount = 0;
    for (const instances of this.services.values()) {
      healthyCount += instances.filter(instance => instance.health === 'healthy').length;
    }
    return healthyCount;
  }

  async getServiceStatistics(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {
      totalServices: 0,
      healthyServices: 0,
      unhealthyServices: 0,
      unknownServices: 0,
      servicesByType: {}
    };

    for (const [serviceName, instances] of this.services.entries()) {
      stats.totalServices += instances.length;
      stats.servicesByType[serviceName] = {
        total: instances.length,
        healthy: instances.filter(i => i.health === 'healthy').length,
        unhealthy: instances.filter(i => i.health === 'unhealthy').length,
        unknown: instances.filter(i => i.health === 'unknown').length
      };

      stats.healthyServices += instances.filter(i => i.health === 'healthy').length;
      stats.unhealthyServices += instances.filter(i => i.health === 'unhealthy').length;
      stats.unknownServices += instances.filter(i => i.health === 'unknown').length;
    }

    return stats;
  }

  async shutdown(): Promise<void> {
    // Stop all health checks
    for (const timer of this.healthCheckIntervals.values()) {
      clearInterval(timer);
    }
    this.healthCheckIntervals.clear();

    // Close Redis connection
    await this.redis.quit();
    logger.info('Service Registry shutdown complete');
  }
}
