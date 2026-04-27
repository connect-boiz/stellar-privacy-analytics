import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ServiceRegistry, ServiceInstance } from './ServiceRegistry';
import { CircuitBreakerRegistry, CircuitBreaker } from './CircuitBreaker';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface ServiceMeshConfig {
  requestTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableLoadBalancing?: boolean;
  enableCircuitBreaker?: boolean;
  enableMetrics?: boolean;
}

export interface ServiceRequest {
  serviceName: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
}

export interface ServiceResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  serviceInstance: ServiceInstance;
  responseTime: number;
}

export class ServiceMesh extends EventEmitter {
  private serviceRegistry: ServiceRegistry;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private config: Required<ServiceMeshConfig>;
  private requestMetrics: Map<string, any[]> = new Map();

  constructor(
    serviceRegistry: ServiceRegistry,
    config: ServiceMeshConfig = {}
  ) {
    super();
    this.serviceRegistry = serviceRegistry;
    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
    
    this.config = {
      requestTimeout: config.requestTimeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enableLoadBalancing: config.enableLoadBalancing !== false,
      enableCircuitBreaker: config.enableCircuitBreaker !== false,
      enableMetrics: config.enableMetrics !== false
    };

    // Set up service registry event listeners
    this.serviceRegistry.on('serviceHealthFailed', (serviceInstance, error) => {
      this.emit('serviceHealthIssue', serviceInstance, 'failed', error);
    });

    this.serviceRegistry.on('serviceHealthRestored', (serviceInstance) => {
      this.emit('serviceHealthIssue', serviceInstance, 'restored', null);
    });
  }

  async request<T = any>(serviceRequest: ServiceRequest): Promise<ServiceResponse<T>> {
    const startTime = Date.now();
    const serviceName = serviceRequest.serviceName;
    
    try {
      const serviceInstance = await this.serviceRegistry.getService(serviceName, true);
      
      if (!serviceInstance) {
        throw new Error(`No healthy instances available for service: ${serviceName}`);
      }

      const circuitBreaker = this.circuitBreakerRegistry.getCircuitBreaker(serviceName);
      
      const result = await circuitBreaker.execute(async () => {
        return this.makeRequest<T>(serviceInstance, serviceRequest);
      });

      const responseTime = Date.now() - startTime;
      
      if (this.config.enableMetrics) {
        this.recordMetrics(serviceName, 'success', responseTime);
      }

      this.emit('requestCompleted', serviceName, 'success', responseTime);
      
      return {
        ...result,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (this.config.enableMetrics) {
        this.recordMetrics(serviceName, 'error', responseTime);
      }

      this.emit('requestCompleted', serviceName, 'error', responseTime);
      
      logger.error(`Service mesh request failed for ${serviceName}:`, error);
      throw error;
    }
  }

  private async makeRequest<T = any>(
    serviceInstance: ServiceInstance,
    serviceRequest: ServiceRequest
  ): Promise<Omit<ServiceResponse<T>, 'responseTime'>> {
    const url = `http://${serviceInstance.host}:${serviceInstance.port}${serviceRequest.path}`;
    
    const config: AxiosRequestConfig = {
      method: serviceRequest.method || 'GET',
      url,
      data: serviceRequest.data,
      params: serviceRequest.params,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Mesh': 'stellar',
        'X-Request-ID': this.generateRequestId(),
        ...serviceRequest.headers
      },
      timeout: serviceRequest.timeout || this.config.requestTimeout,
      validateStatus: (status) => status >= 200 && status < 500
    };

    let lastError: any;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response: AxiosResponse<T> = await axios(config);
        
        return {
          data: response.data,
          status: response.status,
          headers: response.headers as Record<string, string>,
          serviceInstance
        };
        
      } catch (error: any) {
        lastError = error;
        
        if (attempt < this.config.retryAttempts && this.shouldRetry(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(`Request to ${serviceInstance.name} failed, retrying in ${delay}ms (attempt ${attempt}/${this.config.retryAttempts})`, error);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  private shouldRetry(error: any): boolean {
    // Retry on network errors and 5xx errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT') {
      return true;
    }
    
    if (error.response && error.response.status >= 500) {
      return true;
    }
    
    return false;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordMetrics(serviceName: string, status: string, responseTime: number): void {
    if (!this.requestMetrics.has(serviceName)) {
      this.requestMetrics.set(serviceName, []);
    }
    
    const metrics = this.requestMetrics.get(serviceName)!;
    metrics.push({
      timestamp: Date.now(),
      status,
      responseTime
    });
    
    // Keep only last 1000 metrics per service
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }

  getServiceMetrics(serviceName?: string): Record<string, any> {
    const allMetrics: Record<string, any> = {};
    
    const servicesToCheck = serviceName ? [serviceName] : Array.from(this.requestMetrics.keys());
    
    for (const service of servicesToCheck) {
      const metrics = this.requestMetrics.get(service) || [];
      const recentMetrics = metrics.filter(m => Date.now() - m.timestamp < 300000); // Last 5 minutes
      
      if (recentMetrics.length > 0) {
        const successMetrics = recentMetrics.filter(m => m.status === 'success');
        const errorMetrics = recentMetrics.filter(m => m.status === 'error');
        
        allMetrics[service] = {
          totalRequests: recentMetrics.length,
          successRequests: successMetrics.length,
          errorRequests: errorMetrics.length,
          successRate: (successMetrics.length / recentMetrics.length) * 100,
          averageResponseTime: recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length,
          p95ResponseTime: this.calculatePercentile(recentMetrics.map(m => m.responseTime), 95),
          p99ResponseTime: this.calculatePercentile(recentMetrics.map(m => m.responseTime), 99)
        };
      }
    }
    
    return allMetrics;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  async getServiceHealth(): Promise<Record<string, any>> {
    const services = await this.serviceRegistry.getAllServices();
    const health: Record<string, any> = {};
    
    for (const service of services) {
      if (!health[service.name]) {
        health[service.name] = {
          instances: [],
          circuitBreakerState: this.circuitBreakerRegistry.getCircuitBreaker(service.name).getState()
        };
      }
      
      health[service.name].instances.push({
        id: service.id,
        host: service.host,
        port: service.port,
        health: service.health,
        lastHealthCheck: service.lastHealthCheck,
        version: service.version,
        tags: service.tags
      });
    }
    
    return health;
  }

  async discoverServices(): Promise<string[]> {
    const services = await this.serviceRegistry.getAllServices();
    const serviceNames = new Set<string>();
    
    for (const service of services) {
      serviceNames.add(service.name);
    }
    
    return Array.from(serviceNames);
  }

  // Convenience methods for common HTTP operations
  async get<T = any>(serviceName: string, path: string, options: Partial<ServiceRequest> = {}): Promise<ServiceResponse<T>> {
    return this.request<T>({ ...options, serviceName, path, method: 'GET' });
  }

  async post<T = any>(serviceName: string, path: string, data?: any, options: Partial<ServiceRequest> = {}): Promise<ServiceResponse<T>> {
    return this.request<T>({ ...options, serviceName, path, method: 'POST', data });
  }

  async put<T = any>(serviceName: string, path: string, data?: any, options: Partial<ServiceRequest> = {}): Promise<ServiceResponse<T>> {
    return this.request<T>({ ...options, serviceName, path, method: 'PUT', data });
  }

  async delete<T = any>(serviceName: string, path: string, options: Partial<ServiceRequest> = {}): Promise<ServiceResponse<T>> {
    return this.request<T>({ ...options, serviceName, path, method: 'DELETE' });
  }

  async patch<T = any>(serviceName: string, path: string, data?: any, options: Partial<ServiceRequest> = {}): Promise<ServiceResponse<T>> {
    return this.request<T>({ ...options, serviceName, path, method: 'PATCH', data });
  }
}
