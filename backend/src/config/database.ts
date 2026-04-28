import { knex, Knex } from 'knex';
import { logger } from '../utils/logger';
import { sandboxConfig } from './sandboxConfig';

export interface DatabaseConfig {
  client: 'pg';
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl?: boolean;
  };
  pool: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
    idleTimeoutMillis: number;
    reapIntervalMillis: number;
    createRetryIntervalMillis: number;
  };
  migrations: {
    directory: string;
    tableName: string;
  };
  seeds: {
    directory: string;
  };
}

class DatabaseManager {
  private mainInstance: Knex | null = null;
  private sandboxInstance: Knex | null = null;
  private config: DatabaseConfig;

  constructor() {
    this.config = this.loadDatabaseConfig();
  }

  private loadDatabaseConfig(): DatabaseConfig {
    const config: DatabaseConfig = {
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'stellar',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'stellar_db',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      },
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '60000'),
        createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT || '30000'),
        destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT || '5000'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
        reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL || '1000'),
        createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY || '100')
      },
      migrations: {
        directory: './migrations',
        tableName: 'knex_migrations'
      },
      seeds: {
        directory: './seeds'
      }
    };

    logger.info('Database configuration loaded', {
      host: config.connection.host,
      port: config.connection.port,
      database: config.connection.database,
      sandboxMode: sandboxConfig.isSandboxMode()
    });

    return config;
  }

  public getMainConnection(): Knex {
    if (!this.mainInstance) {
      this.mainInstance = knex(this.config);
      this.mainInstance.on('query', (query) => {
        if (sandboxConfig.isFeatureEnabled('enhancedLogging')) {
          logger.debug('Database query', { sql: query.sql, bindings: query.bindings });
        }
      });
      this.mainInstance.on('query-error', (error, query) => {
        logger.error('Database query error', { error: error.message, sql: query.sql });
      });
    }
    return this.mainInstance;
  }

  public getSandboxConnection(): Knex {
    if (!sandboxConfig.isSandboxMode()) {
      logger.warn('Sandbox connection requested but sandbox mode is disabled, returning main connection');
      return this.getMainConnection();
    }

    if (!this.sandboxInstance) {
      const sandboxConfig = this.getSandboxDatabaseConfig();
      this.sandboxInstance = knex(sandboxConfig);
      
      this.sandboxInstance.on('query', (query) => {
        if (sandboxConfig.isFeatureEnabled('enhancedLogging')) {
          logger.debug('Sandbox database query', { sql: query.sql, bindings: query.bindings });
        }
      });
      this.sandboxInstance.on('query-error', (error, query) => {
        logger.error('Sandbox database query error', { error: error.message, sql: query.sql });
      });
    }
    return this.sandboxInstance;
  }

  private getSandboxDatabaseConfig(): Knex.Config {
    const sandboxSchemaPrefix = sandboxConfig.getConfig().database.schemaPrefix;
    const sandboxDatabase = `${sandboxSchemaPrefix}${this.config.connection.database}`;
    
    return {
      ...this.config,
      connection: {
        ...this.config.connection,
        database: sandboxDatabase
      },
      searchPath: [sandboxSchemaPrefix + 'public', 'public']
    };
  }

  public getConnection(): Knex {
    if (sandboxConfig.isSandboxMode()) {
      return this.getSandboxConnection();
    }
    return this.getMainConnection();
  }

  public async createSandboxSchema(): Promise<void> {
    if (!sandboxConfig.isSandboxMode()) {
      throw new Error('Cannot create sandbox schema: sandbox mode is not enabled');
    }

    const mainDb = this.getMainConnection();
    const schemaPrefix = sandboxConfig.getConfig().database.schemaPrefix;
    const sandboxSchema = schemaPrefix + 'stellar';

    try {
      // Create sandbox database if it doesn't exist
      await mainDb.raw(`CREATE DATABASE IF NOT EXISTS ${sandboxSchema}`);
      logger.info('Sandbox database created', { database: sandboxSchema });

      // Connect to sandbox database and create schemas
      const sandboxDb = this.getSandboxConnection();
      
      // Create sandbox schemas with prefixes
      const schemas = [
        `${schemaPrefix}public`,
        `${schemaPrefix}analytics`,
        `${schemaPrefix}privacy`,
        `${schemaPrefix}audit`,
        `${schemaPrefix}subscriptions`
      ];

      for (const schema of schemas) {
        await sandboxDb.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        logger.debug('Sandbox schema created', { schema });
      }

      // Set default search path for sandbox connection
      await sandboxDb.raw(`SET search_path TO ${schemaPrefix}public, public`);
      
      logger.info('Sandbox schema setup completed', { schemas });
    } catch (error) {
      logger.error('Failed to create sandbox schema', error);
      throw error;
    }
  }

  public async migrateSandboxDatabase(): Promise<void> {
    if (!sandboxConfig.isSandboxMode()) {
      throw new Error('Cannot migrate sandbox database: sandbox mode is not enabled');
    }

    try {
      const sandboxDb = this.getSandboxConnection();
      const schemaPrefix = sandboxConfig.getConfig().database.schemaPrefix;
      
      // Update migration table name for sandbox
      const migrationConfig = {
        ...this.config.migrations,
        tableName: `${schemaPrefix}knex_migrations`
      };

      await sandboxDb.migrate.latest(migrationConfig);
      logger.info('Sandbox database migrations completed');
    } catch (error) {
      logger.error('Failed to migrate sandbox database', error);
      throw error;
    }
  }

  public async seedSandboxDatabase(): Promise<void> {
    if (!sandboxConfig.isSandboxMode()) {
      throw new Error('Cannot seed sandbox database: sandbox mode is not enabled');
    }

    try {
      const sandboxDb = this.getSandboxConnection();
      
      await sandboxDb.seed.run({
        directory: this.config.seeds.directory
      });
      
      logger.info('Sandbox database seeding completed');
    } catch (error) {
      logger.error('Failed to seed sandbox database', error);
      throw error;
    }
  }

  public async clearSandboxData(): Promise<void> {
    if (!sandboxConfig.isSandboxMode()) {
      throw new Error('Cannot clear sandbox data: sandbox mode is not enabled');
    }

    try {
      const sandboxDb = this.getSandboxConnection();
      const schemaPrefix = sandboxConfig.getConfig().database.schemaPrefix;
      
      // Get all tables in sandbox schemas
      const schemas = [`${schemaPrefix}public`, `${schemaPrefix}analytics`, `${schemaPrefix}privacy`, `${schemaPrefix}audit`, `${schemaPrefix}subscriptions`];
      
      for (const schema of schemas) {
        const tables = await sandboxDb.raw(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ?
        `, [schema]);

        for (const table of tables.rows) {
          await sandboxDb.raw(`TRUNCATE TABLE ${schema}.${table.table_name} RESTART IDENTITY CASCADE`);
          logger.debug('Sandbox table cleared', { schema, table: table.table_name });
        }
      }
      
      logger.info('Sandbox data cleared successfully');
    } catch (error) {
      logger.error('Failed to clear sandbox data', error);
      throw error;
    }
  }

  public async dropSandboxDatabase(): Promise<void> {
    if (!sandboxConfig.isSandboxMode()) {
      throw new Error('Cannot drop sandbox database: sandbox mode is not enabled');
    }

    try {
      const mainDb = this.getMainConnection();
      const schemaPrefix = sandboxConfig.getConfig().database.schemaPrefix;
      const sandboxDatabase = `${schemaPrefix}${this.config.connection.database}`;
      
      // Kill connections to sandbox database
      await mainDb.raw(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = ?
      `, [sandboxDatabase]);

      // Drop sandbox database
      await mainDb.raw(`DROP DATABASE IF EXISTS ${sandboxDatabase}`);
      
      // Close sandbox connection
      if (this.sandboxInstance) {
        await this.sandboxInstance.destroy();
        this.sandboxInstance = null;
      }
      
      logger.info('Sandbox database dropped', { database: sandboxDatabase });
    } catch (error) {
      logger.error('Failed to drop sandbox database', error);
      throw error;
    }
  }

  public async testConnection(): Promise<{ main: boolean; sandbox: boolean }> {
    const results = { main: false, sandbox: false };
    
    try {
      await this.getMainConnection().raw('SELECT 1');
      results.main = true;
      logger.info('Main database connection successful');
    } catch (error) {
      logger.error('Main database connection failed', error);
    }

    if (sandboxConfig.isSandboxMode()) {
      try {
        await this.getSandboxConnection().raw('SELECT 1');
        results.sandbox = true;
        logger.info('Sandbox database connection successful');
      } catch (error) {
        logger.error('Sandbox database connection failed', error);
      }
    }

    return results;
  }

  public async closeConnections(): Promise<void> {
    if (this.mainInstance) {
      await this.mainInstance.destroy();
      this.mainInstance = null;
    }
    
    if (this.sandboxInstance) {
      await this.sandboxInstance.destroy();
      this.sandboxInstance = null;
    }
    
    logger.info('Database connections closed');
  }

  public getSchemaPrefix(): string {
    return sandboxConfig.getConfig().database.schemaPrefix;
  }

  public isIsolationEnabled(): boolean {
    return sandboxConfig.getConfig().database.isolationEnabled;
  }
}

// Singleton instance
export const databaseManager = new DatabaseManager();

// Export types and utilities
export { DatabaseManager };
export type { DatabaseConfig };
