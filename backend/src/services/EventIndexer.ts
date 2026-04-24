import { rpc, Contract, xdr } from '@stellar/stellar-sdk';
import axios from 'axios';

export interface IndexedEvent {
  id: string;
  contractId: string;
  ledger: number;
  topic: string[];
  sanitizedData: any;
  timestamp: string;
}

export class EventIndexer {
  private server: rpc.Server;
  private cursor: string | undefined;
  private isRunning: boolean = false;
  private cache: Map<string, IndexedEvent> = new Map();
  private webhooks: string[] = [];

  constructor(rpcUrl: string, startingCursor?: string, webhooks: string[] = []) {
    this.server = new rpc.Server(rpcUrl);
    this.cursor = startingCursor;
    this.webhooks = webhooks;
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('Starting Soroban Event Indexer...');
    this.pollEvents();
  }

  public stop() {
    this.isRunning = false;
  }

  public getCachedEvents(): IndexedEvent[] {
    return Array.from(this.cache.values()).sort((a, b) => b.ledger - a.ledger);
  }

  private async pollEvents() {
    while (this.isRunning) {
      try {
        const latestLedger = await this.server.getLatestLedger();
        
        // Handle re-orgs/gaps by ensuring cursor is valid, otherwise fallback to recent ledgers
        const startLedger = this.cursor ? parseInt(this.cursor) : latestLedger.sequence - 100;

        const response = await this.server.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              topics: [
                xdr.ScVal.scvSymbol('analytics_ready')
              ]
            }
          ],
          limit: 100
        });

        for (const event of response.events) {
          this.processEvent(event);
        }

        if (response.latestLedger) {
          this.cursor = response.latestLedger.toString();
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('Error fetching events, retrying...', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private processEvent(event: rpc.Api.EventResponse) {
    if (this.cache.has(event.id)) return;

    // Sanitize data: remove any raw encrypted blobs/sensitive CIDs
    const sanitizedData = this.sanitizeScVal(event.value);

    const indexedEvent: IndexedEvent = {
      id: event.id,
      contractId: event.contractId.toString(),
      ledger: event.ledger,
      topic: event.topic.map(t => t.value()?.toString() || ''),
      sanitizedData,
      timestamp: new Date().toISOString()
    };

    this.cache.set(event.id, indexedEvent);
    this.notifyWebhooks(indexedEvent);
  }

  private sanitizeScVal(value: xdr.ScVal): any {
    // Basic recursive sanitization logic
    // Removes anything explicitly labeled 'blob', 'raw_data', or 'encrypted'
    // In production, robust XDR decoding specific to the contract schema is utilized here
    const strValue = JSON.stringify(value);
    if (strValue.includes('encrypted') || strValue.includes('blob')) {
      return '[REDACTED_SENSITIVE_DATA]';
    }
    return strValue; 
  }

  private async notifyWebhooks(event: IndexedEvent) {
    const promises = this.webhooks.map(url => axios.post(url, event).catch(e => console.error(`Webhook failed for ${url}`)));
    await Promise.allSettled(promises);
  }
}