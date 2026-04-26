import { EventEmitter } from 'events';
import { ServiceRegistry, ServiceInstance } from './ServiceRegistry';
import { ServiceMesh } from './ServiceMesh';
import { logger } from '../utils/logger';
import { promClient } from '../utils/prometheus';

export interface HealthCheck {
  serviceName: string;
  endpoint: string;
  interval: number;
  timeout: number;
  expectedStatus?: number;
  customCheck?: (instance: ServiceInstance) => Promise<boolean>;
}

export interface ServiceHealthMetrics {
  serviceName: string;
  totalInstances: number;
  healthyInstances: number;
  unhealthyInstances: number;
  averageResponseTime: number;
  uptime: number;
  lastCheck: Date;
  alerts: Alert[];
}

export interface Alert {
  id: string;
  type: 'service_down' | 'slow_response' | 'high_error_rate' | 'circuit_breaker_open';
  severity: 'low' | 'medium' | 'high' | 'critical';
  serviceName: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export class HealthMonitor extends EventEmitter {
  private serviceRegistry: ServiceRegistry;
  private serviceMesh: ServiceMesh;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private metrics: Map<string, ServiceHealthMetrics> = new Map();
  
  // Prometheus metrics
  private serviceUpGauge: promClient.Gauge<string>;
  private serviceResponseTimeHistogram: promClient.Histogram<string>;
  private serviceErrorRateGauge: promClient.Gauge<string>;
  private circuitBreakerStateGauge: promClient.Gauge<string>;

  constructor(
    serviceRegistry: ServiceRegistry,
    serviceMesh: ServiceMesh
  ) {
    super();
    this.serviceRegistry = serviceRegistry;
    this.serviceMesh = serviceMesh;

    // Initialize Prometheus metrics
    this.initializePrometheusMetrics();

    // Set up event listeners
    this.setupEventListeners();
  }

  private initializePrometheusMetrics(): void {
    this.serviceUpGauge = new promClient.Gauge({
      name: 'stellar_service_up',
      help: 'Service availability status (1 for up, 0 for down)',
      labelNames: ['service_name', 'instance_id']
    });

    this.serviceResponseTimeHistogram = new promClient.Histogram({
      name: 'stellar_service_response_time_seconds',
      help: 'Service response time in seconds',
      labelNames: ['service_name', 'instance_id'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    this.serviceErrorRateGauge = new promClient.Gauge({
      name: 'stellar_service_error_rate',
      help: 'Service error rate (0-1)',
      labelNames: ['service_name']
    });

    this.circuitBreakerStateGauge = new promClient.Gauge({
      name: 'stellar_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half_open)',
      labelNames: ['service_name']
    });
  }

  private setupEventListeners(): void {
    this.serviceRegistry.on('serviceHealthFailed', (instance, error) => {
      this.createAlert({
        id: `service_down_${instance.id}_${Date.now()}`,
        type: 'service_down',
        severity: 'high',
        serviceName: instance.name,
        message: `Service instance ${instance.id} is down: ${error.message}`,
        timestamp: new Date(),
        resolved: false
      });

      this.serviceUpGauge.set({ service_name: instance.name, instance_id: instance.id }, 0);
    });

    this.serviceRegistry.on('serviceHealthRestored', (instance) => {
      this.resolveAlert(`service_down_${instance.id}`);
      this.serviceUpGauge.set({ service_name: instance.name, instance_id: instance.id }, 1);
    });

    this.serviceMesh.on('requestCompleted', (serviceName: string, status: string, responseTime: number) => {
      if (status === 'success') {
        this.serviceResponseTimeHistogram
          .labels({ service_name: serviceName, instance_id: 'unknown' })
          .observe(responseTime / 1000);
      }
    });
  }

  addHealthCheck(healthCheck: HealthCheck): void {
    const key = `${healthCheck.serviceName}_${healthCheck.endpoint}`;
    this.healthChecks.set(key, healthCheck);
    
    // Start the health check
    this.startHealthCheck(key);
    
    logger.info(`Health check added for ${healthCheck.serviceName} at ${healthCheck.endpoint}`);
  }

  removeHealthCheck(serviceName: string, endpoint: string): void {
    const key = `${serviceName}_${endpoint}`;
    const interval = this.checkIntervals.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(key);
    }
    
    this.healthChecks.delete(key);
    logger.info(`Health check removed for ${serviceName} at ${endpoint}`);
  }

  private startHealthCheck(key: string): void {
    const healthCheck = this.healthChecks.get(key);
    if (!healthCheck) return;

    const interval = setInterval(async () => {
      await this.performHealthCheck(healthCheck);
    }, healthCheck.interval);

    this.checkIntervals.set(key, interval);
    
    // Perform initial check
    this.performHealthCheck(healthCheck);
  }

  private async performHealthCheck(healthCheck: HealthCheck): Promise<void> {
    try {
      const instances = await this.serviceRegistry.getAllServices(healthCheck.serviceName);
      
      for (const instance of instances) {
        const startTime = Date.now();
        
        try {
          let isHealthy = false;
          
          if (healthCheck.customCheck) {
            isHealthy = await healthCheck.customCheck(instance);
          } else {
            const response = await this.serviceMesh.get(
              healthCheck.serviceName,
              healthCheck.endpoint,
              { timeout: healthCheck.timeout }
            );
            
            isHealthy = healthCheck.expectedStatus 
              ? response.status === healthCheck.expectedStatus
              : response.status >= 200 && response.status < 300;
          }

          const responseTime = Date.now() - startTime;
          
          // Update metrics
          this.updateServiceMetrics(instance.name, {
            totalInstances: instances.length,
            healthyInstances: instances.filter(i => i.health === 'healthy').length,
            unhealthyInstances: instances.filter(i => i.health === 'unhealthy').length,
            averageResponseTime: responseTime,
            uptime: isHealthy ? 100 : 0,
            lastCheck: new Date(),
            alerts: this.getServiceAlerts(instance.name)
          });

          // Check for slow response
          if (responseTime > 5000) { // 5 seconds threshold
            this.createAlert({
              id: `slow_response_${instance.id}_${Date.now()}`,
              type: 'slow_response',
              severity: 'medium',
              serviceName: instance.name,
              message: `Service ${instance.name} responding slowly: ${responseTime}ms`,
              timestamp: new Date(),
              resolved: false
            });
          }

        } catch (error) {
          logger.warn(`Health check failed for ${instance.name}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Health check error for ${healthCheck.serviceName}:`, error);
    }
  }

  private updateServiceMetrics(serviceName: string, metrics: ServiceHealthMetrics): void {
    this.metrics.set(serviceName, metrics);
    
    // Update Prometheus metrics
    this.serviceErrorRateGauge.set(
      { service_name: serviceName },
      metrics.totalInstances > 0 ? metrics.unhealthyInstances / metrics.totalInstances : 0
    );
  }

  private createAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);
    
    logger.warn(`Alert created: ${alert.type} for ${alert.serviceName} - ${alert.message}`);
  }

  private resolveAlert(alertIdPrefix: string): void {
    for (const [id, alert] of this.alerts.entries()) {
      if (id.startsWith(alertIdPrefix) && !alert.resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date();
        this.emit('alertResolved', alert);
        logger.info(`Alert resolved: ${alert.type} for ${alert.serviceName}`);
      }
    }
  }

  private getServiceAlerts(serviceName: string): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.serviceName === serviceName && !alert.resolved);
  }

  async getOverallHealthStatus(): Promise<Record<string, any>> {
    const allServices = await this.serviceRegistry.getAllServices();
    const serviceNames = [...new Set(allServices.map(s => s.name))];
    
    const overallStatus = {
      healthy: 0,
      unhealthy: 0,
      total: serviceNames.length,
      services: {} as Record<string, ServiceHealthMetrics>,
      alerts: Array.from(this.alerts.values()).filter(a => !a.resolved),
      timestamp: new Date()
    };

    for (const serviceName of serviceNames) {
      const instances = allServices.filter(s => s.name === serviceName);
      const healthyInstances = instances.filter(i => i.health === 'healthy');
      
      const serviceMetrics: ServiceHealthMetrics = {
        serviceName,
        totalInstances: instances.length,
        healthyInstances: healthyInstances.length,
        unhealthyInstances: instances.filter(i => i.health === 'unhealthy').length,
        averageResponseTime: 0,
        uptime: instances.length > 0 ? (healthyInstances.length / instances.length) * 100 : 0,
        lastCheck: new Date(),
        alerts: this.getServiceAlerts(serviceName)
      };

      overallStatus.services[serviceName] = serviceMetrics;
      
      if (serviceMetrics.uptime >= 80) {
        overallStatus.healthy++;
      } else {
        overallStatus.unhealthy++;
      }
    }

    return overallStatus;
  }

  getServiceMetrics(serviceName?: string): Record<string, ServiceHealthMetrics> {
    if (serviceName) {
      const metrics = this.metrics.get(serviceName);
      return metrics ? { [serviceName]: metrics } : {};
    }
    
    return Object.fromEntries(this.metrics.entries());
  }

  getActiveAlerts(severity?: string): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved && (!severity || alert.severity === severity));
  }

  async checkCircuitBreakerStates(): Promise<void> {
    const serviceHealth = await this.serviceMesh.getServiceHealth();
    
    for (const [serviceName, health] of Object.entries(serviceHealth)) {
      const circuitBreakerState = health.circuitBreakerState;
      
      // Map circuit breaker state to numeric value for Prometheus
      let stateValue = 0; // CLOSED
      if (circuitBreakerState === 'open') stateValue = 1;
      if (circuitBreakerState === 'half_open') stateValue = 2;
      
      this.circuitBreakerStateGauge.set(
        { service_name: serviceName },
        stateValue
      );

      // Create alert if circuit breaker is open
      if (circuitBreakerState === 'open') {
        this.createAlert({
          id: `circuit_breaker_${serviceName}_${Date.now()}`,
          type: 'circuit_breaker_open',
          severity: 'high',
          serviceName,
          message: `Circuit breaker is OPEN for service ${serviceName}`,
          timestamp: new Date(),
          resolved: false
        });
      } else {
        this.resolveAlert(`circuit_breaker_${serviceName}`);
      }
    }
  }

  async startMonitoring(): Promise<void> {
    // Start circuit breaker monitoring
    setInterval(() => {
      this.checkCircuitBreakerStates();
    }, 10000); // Check every 10 seconds

    logger.info('Health monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    // Clear all health check intervals
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    logger.info('Health monitoring stopped');
  }

  getPrometheusMetrics(): string {
    return promClient.register.metrics();
  }
}
