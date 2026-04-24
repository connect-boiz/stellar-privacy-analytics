import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

let client: RedisClientType | null = null;
let isConnecting = false;

export const getRedisClient = (): RedisClientType => {
  if (!client) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis connection lost. Retrying in ${delay}ms... (Attempt ${retries})`);
          return delay;
        },
        connectTimeout: 5000,
      }
    }) as RedisClientType;

    client.on('error', (err: Error) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    client.on('reconnecting', () => {
      logger.info('Redis Client Reconnecting');
    });

    client.on('ready', () => {
      logger.info('Redis Client Ready');
    });
  }
  return client;
};

export const connectRedis = async (): Promise<void> => {
  if (isConnecting) return;
  
  const redisClient = getRedisClient();
  if (redisClient.isOpen) return;

  isConnecting = true;
  try {
    await redisClient.connect();
    logger.info('Successfully connected to Redis');
  } catch (error) {
    logger.error('Failed to connect to Redis initially:', error);
    // We don't throw here to prevent app crash, 
    // the reconnect strategy will take over
  } finally {
    isConnecting = false;
  }
};

export const redisStatus = {
  isConnected: () => client?.isOpen || false,
  isReady: () => client?.isReady || false,
};

// Graceful shutdown
process.on('SIGINT', async () => {
  if (client) {
    await client.quit();
  }
});
