import { redisClient, ensureRedisConnection } from './redis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryDelay?: number; // Delay between retries in milliseconds
  maxRetries?: number; // Maximum number of retries
}

/**
 * DistributedLock - A Redis-based distributed locking mechanism
 */
export class DistributedLock {
  private lockId: string;
  private key: string;
  private options: Required<LockOptions>;

  constructor(key: string, options: LockOptions = {}) {
    this.key = `lock:${key}`;
    this.lockId = uuidv4();
    this.options = {
      ttl: options.ttl || 10000, // 10 seconds default
      retryDelay: options.retryDelay || 200,
      maxRetries: options.maxRetries || 50,
    };
  }

  /**
   * Acquire the lock
   */
  async acquire(): Promise<boolean> {
    await ensureRedisConnection();
    
    let retries = 0;
    while (retries < this.options.maxRetries) {
      try {
        // NX: Only set if the key does not exist
        // PX: Set expiry time in milliseconds
        const result = await redisClient.set(this.key, this.lockId, {
          NX: true,
          PX: this.options.ttl,
        });

        if (result === 'OK') {
          logger.debug(`Lock acquired: ${this.key}`, { lockId: this.lockId });
          return true;
        }
      } catch (error) {
        logger.error(`Error acquiring lock: ${this.key}`, error);
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, this.options.retryDelay));
    }

    logger.warn(`Failed to acquire lock after ${retries} retries: ${this.key}`);
    return false;
  }

  /**
   * Release the lock
   */
  async release(): Promise<void> {
    await ensureRedisConnection();

    try {
      // Use Lua script to ensure atomicity (only release if we own the lock)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await redisClient.eval(script, {
        keys: [this.key],
        arguments: [this.lockId],
      });

      if (result === 1) {
        logger.debug(`Lock released: ${this.key}`, { lockId: this.lockId });
      } else {
        logger.warn(`Failed to release lock (not owner or expired): ${this.key}`, { lockId: this.lockId });
      }
    } catch (error) {
      logger.error(`Error releasing lock: ${this.key}`, error);
    }
  }

  /**
   * Execute a function within the lock
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    if (!acquired) {
      throw new Error(`Could not acquire lock for ${this.key}`);
    }

    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}
