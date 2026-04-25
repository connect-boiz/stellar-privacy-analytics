import { DatabaseService } from '../services/databaseService';
import { PoolClient } from 'pg';
import { logger } from '../utils/logger';

export interface SanitizedMetadata {
  id: string;
  datasetId: string;
  originalMetadata: Record<string, any>;
  sanitizedMetadata: Record<string, any>;
  piiDetections: PIIDetection[];
  processingTime: number;
  processedAt: Date;
  version: number;
  status: 'processed' | 'failed' | 'pending';
  workerId?: string;
  retryCount: number;
}

export interface PIIDetection {
  type: string;
  value: string;
  maskedValue: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number;
  method: 'regex' | 'ner' | 'custom';
}

export interface MetadataQuery {
  datasetId?: string;
  status?: SanitizedMetadata['status'];
  processedAfter?: Date;
  processedBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface MetadataIndex {
  id: string;
  datasetId: string;
  searchableText: string;
  piiTypes: string[];
  processingTime: number;
  processedAt: Date;
}

export class MetadataRepository {
  private isReadReplica: boolean;

  constructor(private db: DatabaseService, options: { isReadReplica?: boolean } = {}) {
    this.isReadReplica = options.isReadReplica || false;
    
    logger.info('Metadata Repository initialized', {
      isReadReplica: this.isReadReplica,
    });
  }

  private setupPoolEvents(): void {
    this.pool.on('connect', (client) => {
      logger.debug('New database connection established', {
        isReadReplica: this.isReadReplica,
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        totalCount: this.pool.totalCount,
      });
    });

    this.pool.on('error', (err, client) => {
      logger.error('Database connection error:', {
        error: err.message,
        isReadReplica: this.isReadReplica,
        client: {
          processId: client.processID,
          connectionTimeout: client.connectionTimeout,
        },
      });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database connection removed', {
        isReadReplica: this.isReadReplica,
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Database connection acquired', {
        isReadReplica: this.isReadReplica,
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });
    });
  }

  /**
   * Store sanitized metadata
   */
  async storeSanitizedMetadata(
    datasetId: string,
    sanitizedMetadata: Record<string, any>,
    originalMetadata: Record<string, any>,
    piiDetections: PIIDetection[],
    processingTime: number,
    workerId?: string
  ): Promise<string> {
    return await this.db.transaction(async (client) => {
      const id = this.generateMetadataId();
      const now = new Date();
      
      // Insert main metadata record
      const insertQuery = `
        INSERT INTO sanitized_metadata (
          id, dataset_id, original_metadata, sanitized_metadata, 
          pii_detections, processing_time, processed_at, version, 
          status, worker_id, retry_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        id,
        datasetId,
        JSON.stringify(originalMetadata),
        JSON.stringify(sanitizedMetadata),
        JSON.stringify(piiDetections),
        processingTime,
        now,
        1,
        'processed',
        workerId,
        0,
      ];

      const result = await client.query(insertQuery, values);
      
      // Create searchable index record
      await this.createSearchIndex(client, {
        id,
        datasetId,
        metadata: sanitizedMetadata,
        piiDetections,
        processingTime,
        processedAt: now,
      });

      logger.info('Sanitized metadata stored', {
        id,
        datasetId,
        piiDetectionsCount: piiDetections.length,
        processingTime,
        workerId,
      });

      return result.rows[0].id;
    });
  }

  /**
   * Create searchable index for metadata
   */
  private async createSearchIndex(
    client: PoolClient,
    indexData: {
      id: string;
      datasetId: string;
      metadata: Record<string, any>;
      piiDetections: PIIDetection[];
      processingTime: number;
      processedAt: Date;
    }
  ): Promise<void> {
    // Create searchable text from metadata
    const searchableText = this.extractSearchableText(indexData.metadata);
    
    // Extract unique PII types
    const piiTypes = [...new Set(indexData.piiDetections.map(d => d.type))];

    const insertQuery = `
      INSERT INTO metadata_search_index (
        id, dataset_id, searchable_text, pii_types, 
        processing_time, processed_at, tsvector
      ) VALUES ($1, $2, $3, $4, $5, $6, to_tsvector($7))
      ON CONFLICT (id) DO UPDATE SET
        searchable_text = EXCLUDED.searchable_text,
        pii_types = EXCLUDED.pii_types,
        processing_time = EXCLUDED.processing_time,
        processed_at = EXCLUDED.processed_at,
        tsvector = to_tsvector(EXCLUDED.searchable_text)
    `;

    await client.query(insertQuery, [
      indexData.id,
      indexData.datasetId,
      searchableText,
      JSON.stringify(piiTypes),
      indexData.processingTime,
      indexData.processedAt,
      searchableText,
    ]);
  }

  /**
   * Extract searchable text from metadata
   */
  private extractSearchableText(metadata: Record<string, any>): string {
    const searchableParts: string[] = [];

    const extractText = (obj: any, prefix: string = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          searchableParts.push(value);
        } else if (typeof value === 'number') {
          searchableParts.push(value.toString());
        } else if (typeof value === 'object' && value !== null) {
          extractText(value, `${prefix}${key}.`);
        }
      }
    };

    extractText(metadata);
    return searchableParts.join(' ');
  }

  /**
   * Get sanitized metadata by ID
   */
  async getMetadata(id: string): Promise<SanitizedMetadata | null> {
    const query = `
      SELECT id, dataset_id, original_metadata, sanitized_metadata, 
             pii_detections, processing_time, processed_at, version, 
             status, worker_id, retry_count
      FROM sanitized_metadata
      WHERE id = $1
    `;

    const rows = await this.db.query<any>(query, [id]);
    
    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToMetadata(rows[0]);
  }

  /**
   * Get metadata by dataset ID
   */
  async getMetadataByDatasetId(datasetId: string): Promise<SanitizedMetadata[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT id, dataset_id, original_metadata, sanitized_metadata, 
               pii_detections, processing_time, processed_at, version, 
               status, worker_id, retry_count
        FROM sanitized_metadata
        WHERE dataset_id = $1
        ORDER BY processed_at DESC
      `;

      const result = await client.query(query, [datasetId]);
      
      return result.rows.map(row => this.mapRowToMetadata(row));
    } finally {
      client.release();
    }
  }

  /**
   * Query metadata with filters
   */
  async queryMetadata(query: MetadataQuery): Promise<{
    metadata: SanitizedMetadata[];
    total: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let paramIndex = 1;

      if (query.datasetId) {
        whereClause += ` AND dataset_id = $${paramIndex++}`;
        values.push(query.datasetId);
      }

      if (query.status) {
        whereClause += ` AND status = $${paramIndex++}`;
        values.push(query.status);
      }

      if (query.processedAfter) {
        whereClause += ` AND processed_at >= $${paramIndex++}`;
        values.push(query.processedAfter);
      }

      if (query.processedBefore) {
        whereClause += ` AND processed_at <= $${paramIndex++}`;
        values.push(query.processedBefore);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM sanitized_metadata ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated results
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const dataQuery = `
        SELECT id, dataset_id, original_metadata, sanitized_metadata, 
               pii_detections, processing_time, processed_at, version, 
               status, worker_id, retry_count
        FROM sanitized_metadata
        ${whereClause}
        ORDER BY processed_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);
      const dataResult = await client.query(dataQuery, values);
      
      return {
        metadata: dataResult.rows.map(row => this.mapRowToMetadata(row)),
        total,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Search metadata using full-text search
   */
  async searchMetadata(
    searchText: string,
    options: {
      datasetId?: string;
      piiTypes?: string[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    metadata: SanitizedMetadata[];
    total: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let paramIndex = 1;

      // Add full-text search
      whereClause += ` AND tsvector @@ plainto_tsquery($${paramIndex++})`;
      values.push(searchText);

      if (options.datasetId) {
        whereClause += ` AND dataset_id = $${paramIndex++}`;
        values.push(options.datasetId);
      }

      if (options.piiTypes && options.piiTypes.length > 0) {
        whereClause += ` AND pii_types::jsonb ?| $${paramIndex++}`;
        values.push(JSON.stringify(options.piiTypes));
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM metadata_search_index ${whereClause}
      `;
      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated results
      const limit = options.limit || 20;
      const offset = options.offset || 0;

      const dataQuery = `
        SELECT m.id, m.dataset_id, m.original_metadata, m.sanitized_metadata, 
               m.pii_detections, m.processing_time, m.processed_at, m.version, 
               m.status, m.worker_id, m.retry_count
        FROM metadata_search_index s
        JOIN sanitized_metadata m ON s.id = m.id
        ${whereClause}
        ORDER BY s.processed_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);
      const dataResult = await client.query(dataQuery, values);
      
      return {
        metadata: dataResult.rows.map(row => this.mapRowToMetadata(row)),
        total,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update metadata status
   */
  async updateMetadataStatus(
    id: string,
    status: SanitizedMetadata['status'],
    workerId?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE sanitized_metadata
        SET status = $1, worker_id = $2
        WHERE id = $3
      `;

      await client.query(query, [status, workerId, id]);
      
      logger.info('Metadata status updated', { id, status, workerId });
    } finally {
      client.release();
    }
  }

  /**
   * Increment retry count for failed metadata
   */
  async incrementRetryCount(id: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE sanitized_metadata
        SET retry_count = retry_count + 1
        WHERE id = $1
      `;

      await client.query(query, [id]);
      
      logger.info('Metadata retry count incremented', { id });
    } finally {
      client.release();
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStatistics(): Promise<{
    totalProcessed: number;
    successfulProcessed: number;
    failedProcessed: number;
    averageProcessingTime: number;
    totalPIIDetections: number;
    commonPIITypes: Record<string, number>;
    processingTrend: Array<{
      date: string;
      count: number;
      avgTime: number;
    }>;
  }> {
    const client = await this.pool.connect();
    
    try {
      // Get basic statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'processed' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          AVG(processing_time) as avg_time,
          SUM(array_length(pii_detections, 1)) as total_pii
        FROM sanitized_metadata
      `;

      const statsResult = await client.query(statsQuery);
      const stats = statsResult.rows[0];

      // Get common PII types
      const piiTypesQuery = `
        SELECT 
          jsonb_array_elements(pii_detections)->>'type' as pii_type,
          COUNT(*) as count
        FROM sanitized_metadata
        WHERE pii_detections IS NOT NULL
        GROUP BY jsonb_array_elements(pii_detections)->>'type'
        ORDER BY count DESC
        LIMIT 10
      `;

      const piiTypesResult = await client.query(piiTypesQuery);
      const commonPIITypes: Record<string, number> = {};
      
      for (const row of piiTypesResult.rows) {
        commonPIITypes[row.pii_type] = parseInt(row.count);
      }

      // Get processing trend (last 7 days)
      const trendQuery = `
        SELECT 
          DATE(processed_at) as date,
          COUNT(*) as count,
          AVG(processing_time) as avg_time
        FROM sanitized_metadata
        WHERE processed_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(processed_at)
        ORDER BY date DESC
      `;

      const trendResult = await client.query(trendQuery);
      const processingTrend = trendResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count),
        avgTime: parseFloat(row.avg_time),
      }));

      return {
        totalProcessed: parseInt(stats.total),
        successfulProcessed: parseInt(stats.successful),
        failedProcessed: parseInt(stats.failed),
        averageProcessingTime: parseFloat(stats.avg_time) || 0,
        totalPIIDetections: parseInt(stats.total_pii) || 0,
        commonPIITypes,
        processingTrend,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    database: {
      connected: boolean;
      totalConnections: number;
      idleConnections: number;
      waitingConnections: number;
    };
    tables: {
      sanitizedMetadata: boolean;
      searchIndex: boolean;
    };
  }> {
    try {
      const client = await this.pool.connect();
      
      // Test basic connectivity
      await client.query('SELECT 1');
      
      // Check if tables exist
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('sanitized_metadata', 'metadata_search_index')
        ) as tables_exist
      `);

      const tablesExist = tableCheck.rows[0].tables_exist;
      const hasSanitizedMetadata = tablesExist.includes(true);
      const hasSearchIndex = tablesExist.includes(true);

      client.release();

      const status = this.isReadReplica ? 'degraded' : 'healthy'; // Read replica is considered degraded for writes

      return {
        status,
        timestamp: new Date(),
        database: {
          connected: true,
          totalConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingConnections: this.pool.waitingCount,
        },
        tables: {
          sanitizedMetadata: hasSanitizedMetadata,
          searchIndex: hasSearchIndex,
        },
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        database: {
          connected: false,
          totalConnections: 0,
          idleConnections: 0,
          waitingConnections: 0,
        },
        tables: {
          sanitizedMetadata: false,
          searchIndex: false,
        },
      };
    }
  }

  /**
   * Map database row to SanitizedMetadata object
   */
  private mapRowToMetadata(row: any): SanitizedMetadata {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      originalMetadata: JSON.parse(row.original_metadata),
      sanitizedMetadata: JSON.parse(row.sanitized_metadata),
      piiDetections: JSON.parse(row.pii_detections || '[]'),
      processingTime: row.processing_time,
      processedAt: row.processed_at,
      version: row.version,
      status: row.status,
      workerId: row.worker_id,
      retryCount: row.retry_count,
    };
  }

  /**
   * Generate metadata ID
   */
  private generateMetadataId(): string {
    return `meta_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Metadata Repository connection pool closed');
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

export default MetadataRepository;
