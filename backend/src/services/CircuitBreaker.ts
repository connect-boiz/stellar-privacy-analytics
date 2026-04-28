import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  expectedRecoveryTime?: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;
  private readonly expectedRecoveryTime: number;

  constructor(private serviceName: string, options: CircuitBreakerOptions = {}) {
    super();
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.expectedRecoveryTime = options.expectedRecoveryTime || 30000; // 30 seconds
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.emit('stateChanged', this.state, this.serviceName);
        logger.info(`Circuit breaker for ${this.serviceName} entering HALF_OPEN state`);
      } else {
        throw new Error(`Circuit breaker is OPEN for service: ${this.serviceName}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Need 3 consecutive successes to close
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.emit('stateChanged', this.state, this.serviceName);
        logger.info(`Circuit breaker for ${this.serviceName} CLOSED after recovery`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      this.emit('stateChanged', this.state, this.serviceName);
      logger.warn(`Circuit breaker for ${this.serviceName} OPEN again after half-open failure`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.emit('stateChanged', this.state, this.serviceName);
      logger.warn(`Circuit breaker for ${this.serviceName} OPEN after ${this.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.resetTimeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getLastFailureTime(): number {
    return this.lastFailureTime;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.successCount = 0;
    this.emit('stateChanged', this.state, this.serviceName);
    logger.info(`Circuit breaker for ${this.serviceName} manually reset`);
  }

  getMetrics(): Record<string, any> {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout
    };
  }
}

export class CircuitBreakerRegistry {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  getCircuitBreaker(serviceName: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const circuitBreaker = new CircuitBreaker(serviceName, options);
      this.circuitBreakers.set(serviceName, circuitBreaker);
      
      // Set up event listeners
      circuitBreaker.on('stateChanged', (state: CircuitState) => {
        logger.info(`Circuit breaker state changed for ${serviceName}: ${state}`);
      });
    }
    
    return this.circuitBreakers.get(serviceName)!;
  }

  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return this.circuitBreakers;
  }

  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [serviceName, circuitBreaker] of this.circuitBreakers.entries()) {
      metrics[serviceName] = circuitBreaker.getMetrics();
    }
    
    return metrics;
  }

  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }
}
