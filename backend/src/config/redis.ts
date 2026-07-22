import Redis from "redis";
import { logger } from "../utils/logger";
import { validateRedisUrl } from "../utils/redisUrlValidator";

let redisClient: Redis.RedisClientType;

export async function initializeRedis(): Promise<Redis.RedisClientType> {
  try {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error(
        "REDIS_URL environment variable is not set. " +
        "A valid Redis connection URL is required. " +
        "Format: redis[s]://[user:password@]host:port[/db] " +
        "Example: redis://:yourpassword@redis:6379 or rediss://user:pass@redis:6380",
      );
    }

    // Validate the Redis URL (throws in production if no password)
    const parsed = validateRedisUrl(redisUrl, { requirePassword: true });

    const redisConfig: any = {
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error("Redis reconnection failed after 10 attempts");
            return new Error("Redis reconnection failed");
          }
          return Math.min(retries * 100, 3000);
        },
      },
    };

    // Enable TLS if using rediss:// protocol
    if (parsed.hasTls) {
      redisConfig.socket.tls = true;
      redisConfig.socket.rejectUnauthorized = process.env.NODE_ENV === "production";
      logger.info("Redis connection using TLS (rediss://)");
    }

    redisClient = Redis.createClient(redisConfig);

    redisClient.on("error", (error) => {
      logger.error("Redis Client Error", { error: error.message });
    });

    redisClient.on("connect", () => {
      logger.info("Redis Client Connected");
    });

    redisClient.on("ready", () => {
      logger.info("Redis Client Ready");
    });

    redisClient.on("end", () => {
      logger.warn("Redis Client Connection Ended");
    });

    await redisClient.connect();

    // Test connection
    await redisClient.ping();
    logger.info("Redis connection established successfully");

    return redisClient;
  } catch (error) {
    logger.error("Failed to initialize Redis", { error: error.message });
    throw error;
  }
}

export function getRedisClient(): Redis.RedisClientType {
  if (!redisClient) {
    throw new Error(
      "Redis client not initialized. Call initializeRedis() first.",
    );
  }
  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
}
