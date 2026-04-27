import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import { Counter, Gauge, Histogram } from 'prom-client';

// Performance metrics
const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]
});

const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections'
});

const dbConnectionsIdle = new Gauge({
  name: 'db_connections_idle',
  help: 'Number of idle database connections'
});

const dbPoolWaiting = new Gauge({
  name: 'db_pool_waiting_queries',
  help: 'Number of queries waiting for a connection'
});

const dbErrorsTotal = new Counter({
  name: 'db_errors_total',
  help: 'Total number of database errors',
  labelNames: ['error_type']
});

const dbCircuitBreakerState = new Gauge({
  name: 'db_circuit_breaker_state',
  help: 'State of the database circuit breaker (0=closed, 1=open, 2=half-open)',
  labelNames: ['resource']
});

export enum CircuitBreakerState {
  CLOSED = 0,
  OPEN = 1,
  HALF_OPEN = 2
}

interface ConnectionInfo {
  client: PoolClient;
  acquiredAt: number;
  traceId?: string;
}

export class DatabaseService {
  private pool: Pool;
  private activeConnections: Map<PoolClient, ConnectionInfo> = new Map();
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number = 5;
  private readonly recoveryTimeout: number = 30000; // 30 seconds

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      ...config,
      max: config.max || 50, // Optimize for high concurrency
      idleTimeoutMillis: config.idleTimeoutMillis || 10000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
      maxUses: 7500, // Close connection after 7500 uses to prevent memory leaks
    });

    this.setupMonitoring();
    this.startLeakDetection();
  }

  private setupMonitoring(): void {
    this.pool.on('connect', () => {
      logger.debug('Database connection established');
      this.updatePoolMetrics();
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error', { error: err.message });
      dbErrorsTotal.inc({ error_type: 'pool' });
      this.handleFailure();
      this.updatePoolMetrics();
    });

    this.pool.on('acquire', (client) => {
      this.activeConnections.set(client, {
        client,
        acquiredAt: Date.now()
      });
      this.updatePoolMetrics();
    });

    this.pool.on('remove', () => {
      this.updatePoolMetrics();
    });
  }

  private updatePoolMetrics(): void {
    dbConnectionsActive.set(this.pool.totalCount - this.pool.idleCount);
    dbConnectionsIdle.set(this.pool.idleCount);
    dbPoolWaiting.set(this.pool.waitingCount);
    dbCircuitBreakerState.set({ resource: 'postgres' }, this.circuitBreakerState);
  }

  private handleFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      logger.warn('Database circuit breaker OPENED due to multiple failures');
    }
  }

  private handleSuccess(): void {
    if (this.circuitBreakerState !== CircuitBreakerState.CLOSED) {
      logger.info('Database circuit breaker CLOSED - service recovered');
    }
    this.failureCount = 0;
    this.circuitBreakerState = CircuitBreakerState.CLOSED;
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.recoveryTimeout) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        logger.info('Database circuit breaker HALF-OPEN - attempting recovery');
      } else {
        throw new Error('Database circuit breaker is OPEN. Request rejected.');
      }
    }
  }

  async query<T = any>(text: string, params: any[] = [], traceId?: string): Promise<T[]> {
    this.checkCircuitBreaker();
    
    const startTime = process.hrtime();
    let client: PoolClient | undefined;

    try {
      client = await this.pool.connect();
      const res = await client.query(text, params);
      
      this.handleSuccess();
      this.recordMetrics(startTime, 'query', 'success');
      
      return res.rows;
    } catch (error) {
      this.handleFailure();
      this.recordMetrics(startTime, 'query', 'error');
      dbErrorsTotal.inc({ error_type: 'query' });
      
      logger.error('Database query error', { 
        error: error.message, 
        query: text.substring(0, 100),
        traceId 
      });
      
      throw error;
    } finally {
      if (client) {
        client.release();
        this.activeConnections.delete(client);
      }
      this.updatePoolMetrics();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>, traceId?: string): Promise<T> {
    this.checkCircuitBreaker();
    
    const startTime = process.hrtime();
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      this.handleSuccess();
      this.recordMetrics(startTime, 'transaction', 'success');
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.handleFailure();
      this.recordMetrics(startTime, 'transaction', 'error');
      dbErrorsTotal.inc({ error_type: 'transaction' });
      
      logger.error('Database transaction error', { 
        error: error.message, 
        traceId 
      });
      
      throw error;
    } finally {
      client.release();
      this.activeConnections.delete(client);
      this.updatePoolMetrics();
    }
  }

  private recordMetrics(startTime: [number, number], type: string, status: string): void {
    const diff = process.hrtime(startTime);
    const duration = diff[0] + diff[1] / 1e9;
    dbQueryDuration.observe({ query_type: type, status }, duration);
  }

  private startLeakDetection(): void {
    // Check for leaked connections every minute
    setInterval(() => {
      const now = Date.now();
      const leakThreshold = 30000; // 30 seconds

      for (const [client, info] of this.activeConnections.entries()) {
        const duration = now - info.acquiredAt;
        if (duration > leakThreshold) {
          logger.warn('Potential database connection leak detected', {
            durationMs: duration,
            traceId: info.traceId,
            totalActive: this.activeConnections.size
          });

          // In case of extreme leaks, we might want to force close
          if (duration > leakThreshold * 10) {
            logger.error('Forcing release of long-running connection', {
              durationMs: duration
            });
            client.release(true); // Release with error to force close
            this.activeConnections.delete(client);
          }
        }
      }
      this.updatePoolMetrics();
    }, 60000);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1');
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      active: this.activeConnections.size,
      circuitBreaker: CircuitBreakerState[this.circuitBreakerState]
    };
  }
}
