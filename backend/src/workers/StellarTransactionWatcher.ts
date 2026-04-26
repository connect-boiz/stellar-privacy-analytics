import { Server, xdr, rpc } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { getRedisClient, connectRedis } from '../utils/redis';
import axios from 'axios';

// Types
interface PermissionEvent {
  contractId: string;
  userPublicKey: string;
  datasetId: string;
  granted: boolean;
  timestamp: number;
}

export class StellarTransactionWatcher {
  private rpcServer: Server; 
  private redisClient: any;
  private cursorKey = 'stellar:watcher:cursor';
  private permissionCacheKey = 'permissions:dataset:';
  private isRunning = false;
  private reconnectTimeout = 1000;
  private maxReconnectTimeout = 30000;

  constructor(
    private rpcUrl: string,
    private redisUrl: string,
    private contractId: string,
    private webhookUrls: string[] = []
  ) {
    this.rpcServer = new Server(rpcUrl);
    // Use the central Redis client
    this.redisClient = getRedisClient();
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    try {
      // Connect specifically for this watcher if not already connected
      await connectRedis();
      logger.info('Stellar Transaction Watcher started', { contractId: this.contractId });
      this.watchEvents();
    } catch (error) {
      logger.error('Failed to start Stellar Watcher', error);
      this.scheduleReconnect();
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('Stellar Transaction Watcher stopped');
  }

  private async watchEvents() {
    while (this.isRunning) {
      try {
        const lastLedger = await this.getCursor();
        
        // Fetch events since lastLedger
        // In real app we'd use getEvents with startLedger
        const response = await (this.rpcServer as any).getEvents({
          startLedger: lastLedger + 1,
          filters: [
            {
              type: 'contract',
              contractIds: [this.contractId],
            },
          ],
        });

        if (response.events && response.events.length > 0) {
          for (const event of response.events) {
            await this.processEvent(event);
            await this.updateCursor(event.ledger);
          }
          this.reconnectTimeout = 1000; // Reset backoff
        } else {
          // No new events, wait a bit
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        logger.error('Error polling Stellar events', error);
        this.scheduleReconnect();
        break; // Exit loop, start scheduled reconnect
      }
    }
  }

  private async processEvent(event: any) {
    try {
      // Decode events - this depends on the contract implementation
      // Usually Soroban events are XDR encoded
      const payload = this.parseEventPayload(event);
      if (!payload) return;

      const { userPublicKey, datasetId, granted } = payload;
      
      // 1. Update Redis Cache
      const cacheKey = `${this.permissionCacheKey}${datasetId}:${userPublicKey}`;
      if (granted) {
        await this.redisClient.set(cacheKey, '1', { EX: 86400 * 7 }); // Cache for 7 days
      } else {
        await this.redisClient.del(cacheKey);
      }

      logger.info('Permission updated from ledger', { datasetId, userPublicKey, granted, ledger: event.ledger });

      // 2. Emit Webhooks
      await this.emitWebhooks(payload);

    } catch (error) {
      logger.error('Failed to process Stellar event', { event, error });
    }
  }

  private parseEventPayload(event: any): PermissionEvent | null {
    // This is a simplified parser. In production, we'd use XDR decoding
    try {
      // Logic for parsing the specific event from the contract
      // Example: event.topic = ['PERMISSION_CHANGE', userKey, datasetID]
      // event.value = [granted: boolean]
      
      // Simulate decoding
      return {
        contractId: event.contractId,
        userPublicKey: 'GD...SIMULATED_KEY', // Extract from event.topic[1]
        datasetId: 'DATASET_123', // Extract from event.topic[2]
        granted: true, // Extract from event.value
        timestamp: Date.now()
      };
    } catch (error) {
      return null;
    }
  }

  private async emitWebhooks(payload: PermissionEvent) {
    for (const url of this.webhookUrls) {
      try {
        await axios.post(url, payload, { timeout: 5000 });
      } catch (error: any) {
        logger.warn('Failed to emit webhook', { url, error: error.message });
      }
    }
  }

  private async getCursor(): Promise<number> {
    const cursor = await this.redisClient.get(this.cursorKey);
    return cursor ? parseInt(cursor, 10) : 0; // Default to 0 or current ledger
  }

  private async updateCursor(ledger: number) {
    await this.redisClient.set(this.cursorKey, ledger.toString());
  }

  private scheduleReconnect() {
    if (!this.isRunning) return;
    
    logger.info(`Scheduling reconnect in ${this.reconnectTimeout}ms`);
    setTimeout(() => this.start(), this.reconnectTimeout);
    
    // Exponential backoff
    this.reconnectTimeout = Math.min(this.reconnectTimeout * 2, this.maxReconnectTimeout);
  }
}
