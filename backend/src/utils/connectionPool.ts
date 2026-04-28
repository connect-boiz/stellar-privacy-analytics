import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';
import { EventEmitter } from 'events';

export interface ConnectionPoolConfig {
  host: string;
  port: number;
  password?: string;
  maxConnections: number;
  minConnections: number;
  acquireTimeout?: number;
  idleTimeout?: number;
}

export class ConnectionPool extends EventEmitter {
  private config: ConnectionPoolConfig;
  private availableConnections: RedisClientType[] = [];
  private activeConnections: Set<RedisClientType> = new Set();
  private waitingQueue: Array<{
    resolve: (client: RedisClientType) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private isClosing: boolean = false;
  private connectionCount: number = 0;

  constructor(config: ConnectionPoolConfig) {
    super();
    this.config = {
      acquireTimeout: 5000,
      idleTimeout: 300000, // 5 minutes
      ...config,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Create minimum number of connections
      for (let i = 0; i < this.config.minConnections; i++) {
        await this.createConnection();
      }

      logger.info('Redis connection pool initialized', {
        minConnections: this.config.minConnections,
        maxConnections: this.config.maxConnections,
      });

      // Setup idle connection cleanup
      this.setupIdleCleanup();
    } catch (error) {
      logger.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }

  private async createConnection(): Promise<RedisClientType> {
    if (this.connectionCount >= this.config.maxConnections) {
      throw new Error('Maximum connection limit reached');
    }

    const client = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port,
      },
      password: this.config.password,
    });

    client.on('error', (err) => {
      logger.error('Redis connection error:', err);
      this.handleConnectionError(client);
    });

    client.on('end', () => {
      logger.debug('Redis connection ended');
      this.removeConnection(client);
    });

    await client.connect();
    this.connectionCount++;
    this.availableConnections.push(client);

    logger.debug('New Redis connection created', {
      totalConnections: this.connectionCount,
      availableConnections: this.availableConnections.length,
    });

    return client;
  }

  async acquire(): Promise<RedisClientType> {
    if (this.isClosing) {
      throw new Error('Connection pool is closing');
    }

    // Check if there's an available connection
    if (this.availableConnections.length > 0) {
      const client = this.availableConnections.pop()!;
      this.activeConnections.add(client);
      
      logger.debug('Connection acquired from pool', {
        availableConnections: this.availableConnections.length,
        activeConnections: this.activeConnections.size,
      });

      return client;
    }

    // Try to create a new connection if under max limit
    if (this.connectionCount < this.config.maxConnections) {
      try {
        const client = await this.createConnection();
        this.availableConnections.pop(); // Remove from available
        this.activeConnections.add(client);
        return client;
      } catch (error) {
        logger.error('Failed to create new connection:', error);
      }
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(
          item => item.resolve === resolve
        );
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({
        resolve: (client) => {
          clearTimeout(timeout);
          resolve(client);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now(),
      });

      logger.debug('Connection request queued', {
        queueLength: this.waitingQueue.length,
      });
    });
  }

  release(client: RedisClientType): void {
    if (!this.activeConnections.has(client)) {
      logger.warn('Attempting to release connection not in active pool');
      return;
    }

    this.activeConnections.delete(client);

    // Check if there are waiting requests
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      this.activeConnections.add(client);
      waiter.resolve(client);

      logger.debug('Connection assigned to waiting request', {
        queueLength: this.waitingQueue.length,
      });
    } else {
      // Return to available pool
      this.availableConnections.push(client);

      logger.debug('Connection released to pool', {
        availableConnections: this.availableConnections.length,
        activeConnections: this.activeConnections.size,
      });
    }
  }

  async execute<T>(
    fn: (client: RedisClientType) => Promise<T>
  ): Promise<T> {
    const client = await this.acquire();
    
    try {
      const result = await fn(client);
      this.release(client);
      return result;
    } catch (error) {
      this.release(client);
      throw error;
    }
  }

  private handleConnectionError(client: RedisClientType): void {
    // Remove from active or available
    this.activeConnections.delete(client);
    const index = this.availableConnections.indexOf(client);
    if (index !== -1) {
      this.availableConnections.splice(index, 1);
    }

    this.connectionCount--;

    // Try to create a replacement connection
    if (!this.isClosing && this.connectionCount < this.config.minConnections) {
      this.createConnection().catch(err => {
        logger.error('Failed to create replacement connection:', err);
      });
    }
  }

  private removeConnection(client: RedisClientType): void {
    this.activeConnections.delete(client);
    const index = this.availableConnections.indexOf(client);
    if (index !== -1) {
      this.availableConnections.splice(index, 1);
    }
    this.connectionCount--;
  }

  private setupIdleCleanup(): void {
    setInterval(() => {
      if (this.isClosing) return;

      const excessConnections = this.availableConnections.length - this.config.minConnections;
      
      if (excessConnections > 0) {
        logger.debug('Cleaning up idle connections', {
          excessConnections,
        });

        for (let i = 0; i < excessConnections; i++) {
          const client = this.availableConnections.pop();
          if (client) {
            client.quit().catch(err => {
              logger.error('Error closing idle connection:', err);
            });
            this.connectionCount--;
          }
        }
      }
    }, this.config.idleTimeout);
  }

  async close(): Promise<void> {
    if (this.isClosing) return;

    this.isClosing = true;
    logger.info('Closing connection pool...');

    // Reject all waiting requests
    this.waitingQueue.forEach(waiter => {
      waiter.reject(new Error('Connection pool is closing'));
    });
    this.waitingQueue = [];

    // Close all connections
    const allConnections = [
      ...this.availableConnections,
      ...Array.from(this.activeConnections),
    ];

    await Promise.all(
      allConnections.map(client =>
        client.quit().catch(err => {
          logger.error('Error closing connection:', err);
        })
      )
    );

    this.availableConnections = [];
    this.activeConnections.clear();
    this.connectionCount = 0;

    logger.info('Connection pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.acquire();
      await client.ping();
      this.release(client);
      return true;
    } catch (error) {
      logger.error('Connection pool health check failed:', error);
      return false;
    }
  }

  getStats(): {
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    waitingRequests: number;
  } {
    return {
      totalConnections: this.connectionCount,
      availableConnections: this.availableConnections.length,
      activeConnections: this.activeConnections.size,
      waitingRequests: this.waitingQueue.length,
    };
  }
}
