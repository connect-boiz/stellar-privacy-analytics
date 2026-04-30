import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { sandboxConfig } from '../config/sandboxConfig';
import { getRedisClient } from '../config/redis';

export interface SubscriptionBilledEvent {
  eventId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  paymentStatus: 'success' | 'failed' | 'pending';
  timestamp: string;
  metadata: {
    environment: string;
    mockData: boolean;
  };
}

export interface GracePeriod {
  gracePeriodId: string;
  subscriptionId: string;
  gracePeriodDays: number;
  startDate: string;
  endDate: string;
  reason?: string;
  isActive: boolean;
  timestamp: string;
}

export interface DunningProcess {
  dunningId: string;
  subscriptionId: string;
  dunningLevel: number;
  contactMethod: 'email' | 'sms' | 'push' | 'webhook';
  message?: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'pending';
  responseReceived?: boolean;
}

export class SandboxService {
  private redisClient = getRedisClient();

  async simulateSubscriptionBilledEvent(data: {
    subscriptionId: string;
    amount: number;
    currency: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    paymentStatus?: 'success' | 'failed' | 'pending';
  }): Promise<SubscriptionBilledEvent> {
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const event: SubscriptionBilledEvent = {
      eventId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      currency: data.currency,
      billingPeriodStart: data.billingPeriodStart,
      billingPeriodEnd: data.billingPeriodEnd,
      paymentStatus: data.paymentStatus || 'success',
      timestamp,
      metadata: {
        environment: sandboxConfig.getConfig().environment,
        mockData: true
      }
    };

    // Store in Redis for webhooks and indexing
    await this.redisClient.setex(
      `sandbox:subscription_billed:${eventId}`,
      86400, // 24 hours
      JSON.stringify(event)
    );

    // Add to subscription history
    await this.redisClient.lpush(
      `sandbox:subscription:${data.subscriptionId}:billing_events`,
      JSON.stringify(event)
    );
    
    // Trim list to last 100 events
    await this.redisClient.ltrim(`sandbox:subscription:${data.subscriptionId}:billing_events`, 0, 99);

    // Emit to internal indexer (simulate)
    await this.emitToIndexer('SubscriptionBilled', event);

    logger.info('Subscription billed event simulated', { 
      eventId, 
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      status: event.paymentStatus
    });

    return event;
  }

  async simulateGracePeriod(data: {
    subscriptionId: string;
    gracePeriodDays: number;
    reason?: string;
  }): Promise<GracePeriod> {
    const gracePeriodId = uuidv4();
    const timestamp = new Date().toISOString();
    const startDate = timestamp;
    const endDate = new Date(Date.now() + data.gracePeriodDays * 24 * 60 * 60 * 1000).toISOString();

    const gracePeriod: GracePeriod = {
      gracePeriodId,
      subscriptionId: data.subscriptionId,
      gracePeriodDays: data.gracePeriodDays,
      startDate,
      endDate,
      reason: data.reason,
      isActive: true,
      timestamp
    };

    // Store in Redis
    await this.redisClient.setex(
      `sandbox:grace_period:${gracePeriodId}`,
      data.gracePeriodDays * 86400, // Duration of grace period
      JSON.stringify(gracePeriod)
    );

    // Add to subscription grace periods
    await this.redisClient.lpush(
      `sandbox:subscription:${data.subscriptionId}:grace_periods`,
      JSON.stringify(gracePeriod)
    );

    // Emit to internal indexer
    await this.emitToIndexer('GracePeriodStarted', gracePeriod);

    logger.info('Grace period simulated', { 
      gracePeriodId, 
      subscriptionId: data.subscriptionId,
      days: data.gracePeriodDays
    });

    return gracePeriod;
  }

  async simulateDunningProcess(data: {
    subscriptionId: string;
    dunningLevel: number;
    contactMethod: 'email' | 'sms' | 'push' | 'webhook';
    message?: string;
  }): Promise<DunningProcess> {
    const dunningId = uuidv4();
    const timestamp = new Date().toISOString();

    const dunningProcess: DunningProcess = {
      dunningId,
      subscriptionId: data.subscriptionId,
      dunningLevel: data.dunningLevel,
      contactMethod: data.contactMethod,
      message: data.message || this.generateDunningMessage(data.dunningLevel),
      sentAt: timestamp,
      status: 'sent',
      responseReceived: false
    };

    // Store in Redis
    await this.redisClient.setex(
      `sandbox:dunning:${dunningId}`,
      86400 * 30, // 30 days
      JSON.stringify(dunningProcess)
    );

    // Add to subscription dunning history
    await this.redisClient.lpush(
      `sandbox:subscription:${data.subscriptionId}:dunning`,
      JSON.stringify(dunningProcess)
    );

    // Simulate webhook/notification
    await this.simulateNotification(data.contactMethod, dunningProcess);

    // Emit to internal indexer
    await this.emitToIndexer('DunningProcessInitiated', dunningProcess);

    logger.info('Dunning process simulated', { 
      dunningId, 
      subscriptionId: data.subscriptionId,
      level: data.dunningLevel,
      method: data.contactMethod
    });

    return dunningProcess;
  }

  async getSubscriptionHistory(subscriptionId: string): Promise<{
    billingEvents: SubscriptionBilledEvent[];
    gracePeriods: GracePeriod[];
    dunningProcesses: DunningProcess[];
  }> {
    const [billingEvents, gracePeriods, dunningProcesses] = await Promise.all([
      this.getSubscriptionBillingEvents(subscriptionId),
      this.getSubscriptionGracePeriods(subscriptionId),
      this.getSubscriptionDunningProcesses(subscriptionId)
    ]);

    return {
      billingEvents,
      gracePeriods,
      dunningProcesses
    };
  }

  private async getSubscriptionBillingEvents(subscriptionId: string): Promise<SubscriptionBilledEvent[]> {
    const events = await this.redisClient.lrange(
      `sandbox:subscription:${subscriptionId}:billing_events`,
      0,
      -1
    );
    
    return events.map(event => JSON.parse(event));
  }

  private async getSubscriptionGracePeriods(subscriptionId: string): Promise<GracePeriod[]> {
    const gracePeriods = await this.redisClient.lrange(
      `sandbox:subscription:${subscriptionId}:grace_periods`,
      0,
      -1
    );
    
    return gracePeriods.map(period => JSON.parse(period));
  }

  private async getSubscriptionDunningProcesses(subscriptionId: string): Promise<DunningProcess[]> {
    const dunningProcesses = await this.redisClient.lrange(
      `sandbox:subscription:${subscriptionId}:dunning`,
      0,
      -1
    );
    
    return dunningProcesses.map(process => JSON.parse(process));
  }

  private generateDunningMessage(level: number): string {
    const messages = {
      1: "Friendly reminder: Your subscription payment is due. Please update your payment method to avoid service interruption.",
      2: "Payment overdue: Your subscription payment is now overdue. Please update your payment method immediately.",
      3: "Urgent: Your subscription will be suspended soon due to unpaid balance. Please take action now.",
      4: "Final notice: Your subscription will be terminated within 24 hours due to unpaid balance.",
      5: "Account terminated: Your subscription has been terminated due to non-payment. Contact support if you believe this is an error."
    };
    
    return messages[level as keyof typeof messages] || messages[1];
  }

  private async simulateNotification(
    contactMethod: 'email' | 'sms' | 'push' | 'webhook',
    dunningProcess: DunningProcess
  ): Promise<void> {
    // Simulate notification delay
    const delay = sandboxConfig.isMockDataEnabled('webhookDelays') 
      ? Math.random() * 2000 + 500 // 500ms to 2.5s delay
      : 0;

    setTimeout(async () => {
      logger.info('Mock notification sent', {
        method: contactMethod,
        dunningId: dunningProcess.dunningId,
        subscriptionId: dunningProcess.subscriptionId,
        delay: `${delay}ms`
      });

      // Store notification result
      await this.redisClient.setex(
        `sandbox:notification:${dunningProcess.dunningId}`,
        86400,
        JSON.stringify({
          sent: true,
          sentAt: new Date().toISOString(),
          method: contactMethod,
          delay: delay
        })
      );
    }, delay);
  }

  private async emitToIndexer(eventType: string, data: any): Promise<void> {
    try {
      // Simulate internal indexer event emission
      const indexerEvent = {
        eventType,
        data,
        timestamp: new Date().toISOString(),
        source: 'sandbox',
        environment: sandboxConfig.getConfig().environment
      };

      // Store in indexer queue
      await this.redisClient.lpush('sandbox:indexer:events', JSON.stringify(indexerEvent));
      
      // Trim queue to last 1000 events
      await this.redisClient.ltrim('sandbox:indexer:events', 0, 999);

      logger.debug('Event emitted to indexer', { eventType, eventId: data.eventId || data.gracePeriodId || data.dunningId });
    } catch (error) {
      logger.error('Failed to emit event to indexer', { eventType, error });
    }
  }

  async clearSandboxData(subscriptionId?: string): Promise<void> {
    if (subscriptionId) {
      // Clear data for specific subscription
      const keys = [
        `sandbox:subscription:${subscriptionId}:billing_events`,
        `sandbox:subscription:${subscriptionId}:grace_periods`,
        `sandbox:subscription:${subscriptionId}:dunning`
      ];

      await Promise.all(keys.map(key => this.redisClient.del(key)));
      
      logger.info('Sandbox data cleared for subscription', { subscriptionId });
    } else {
      // Clear all sandbox data (use with caution)
      const pattern = 'sandbox:*';
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        logger.warn('All sandbox data cleared', { keyCount: keys.length });
      }
    }
  }
}
