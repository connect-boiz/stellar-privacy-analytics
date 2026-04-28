import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { sandboxConfig } from '../config/sandboxConfig';
import { getRedisClient } from '../config/redis';

export interface MockPayment {
  paymentId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  customerId?: string;
  status: 'success' | 'failed' | 'pending';
  failureType?: 'insufficient_funds' | 'network_error' | 'timeout' | 'invalid_signature';
  transactionHash?: string;
  blockNumber?: number;
  timestamp: string;
  metadata: {
    environment: string;
    mockData: boolean;
    zeroValueToken?: boolean;
  };
}

export interface MockPaymentHistory {
  payments: MockPayment[];
  totalCount: number;
  limit: number;
  offset: number;
}

export class MockPaymentService {
  private redisClient = getRedisClient();

  async createMockPayment(data: {
    subscriptionId: string;
    amount: number;
    currency: string;
    customerId?: string;
    shouldFail?: boolean;
    failureType?: 'insufficient_funds' | 'network_error' | 'timeout' | 'invalid_signature';
  }): Promise<MockPayment> {
    const paymentId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Determine if payment should fail
    const shouldFail = data.shouldFail || this.simulateRandomFailure();
    const failureType = shouldFail ? (data.failureType || this.getRandomFailureType()) : undefined;
    
    const payment: MockPayment = {
      paymentId,
      subscriptionId: data.subscriptionId,
      amount: sandboxConfig.isFeatureEnabled('zeroValueTokens') ? 0 : data.amount,
      currency: data.currency,
      customerId: data.customerId,
      status: shouldFail ? 'failed' : 'success',
      failureType,
      transactionHash: shouldFail ? undefined : this.generateMockTransactionHash(),
      blockNumber: shouldFail ? undefined : Math.floor(Math.random() * 1000000),
      timestamp,
      metadata: {
        environment: sandboxConfig.getConfig().environment,
        mockData: true,
        zeroValueToken: sandboxConfig.isFeatureEnabled('zeroValueTokens')
      }
    };

    // Store in Redis
    await this.redisClient.setex(
      `sandbox:payment:${paymentId}`,
      86400 * 7, // 7 days
      JSON.stringify(payment)
    );

    // Add to subscription payment history
    await this.redisClient.lpush(
      `sandbox:subscription:${data.subscriptionId}:payments`,
      JSON.stringify(payment)
    );

    // Trim payment history to last 100 payments
    await this.redisClient.ltrim(`sandbox:subscription:${data.subscriptionId}:payments`, 0, 99);

    // Emit to internal indexer (simulate SubscriptionBilled event)
    await this.emitSubscriptionBilledEvent(payment);

    logger.info('Mock payment created', { 
      paymentId, 
      subscriptionId: data.subscriptionId,
      amount: payment.amount,
      status: payment.status,
      failureType: payment.failureType
    });

    return payment;
  }

  async getMockPaymentHistory(params: {
    subscriptionId?: string;
    limit: number;
    offset: number;
  }): Promise<MockPaymentHistory> {
    const { subscriptionId, limit, offset } = params;
    
    let payments: MockPayment[] = [];
    
    if (subscriptionId) {
      // Get payments for specific subscription
      const paymentData = await this.redisClient.lrange(
        `sandbox:subscription:${subscriptionId}:payments`,
        offset,
        offset + limit - 1
      );
      
      payments = paymentData.map(payment => JSON.parse(payment));
    } else {
      // Get all mock payments (more expensive operation)
      const allKeys = await this.redisClient.keys('sandbox:payment:*');
      const paymentKeys = allKeys.filter(key => key.includes(':payment:') && !key.includes(':subscription:'));
      
      // Get payments with pagination
      const startIndex = offset;
      const endIndex = Math.min(startIndex + limit - 1, paymentKeys.length - 1);
      const paginatedKeys = paymentKeys.slice(startIndex, endIndex + 1);
      
      if (paginatedKeys.length > 0) {
        const paymentData = await this.redisClient.mget(...paginatedKeys);
        payments = paymentData
          .filter(payment => payment !== null)
          .map(payment => JSON.parse(payment))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    }

    const totalCount = subscriptionId 
      ? await this.redisClient.llen(`sandbox:subscription:${subscriptionId}:payments`)
      : (await this.redisClient.keys('sandbox:payment:*')).length;

    return {
      payments,
      totalCount,
      limit,
      offset
    };
  }

  async getPaymentById(paymentId: string): Promise<MockPayment | null> {
    const paymentData = await this.redisClient.get(`sandbox:payment:${paymentId}`);
    return paymentData ? JSON.parse(paymentData) : null;
  }

  async updatePaymentStatus(paymentId: string, status: 'success' | 'failed' | 'pending'): Promise<MockPayment | null> {
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      return null;
    }

    payment.status = status;
    payment.timestamp = new Date().toISOString();

    // Update in Redis
    await this.redisClient.setex(
      `sandbox:payment:${paymentId}`,
      86400 * 7,
      JSON.stringify(payment)
    );

    // Update in subscription history
    const subscriptionPayments = await this.redisClient.lrange(
      `sandbox:subscription:${payment.subscriptionId}:payments`,
      0,
      -1
    );

    // Find and update the payment in the list
    for (let i = 0; i < subscriptionPayments.length; i++) {
      const paymentData = JSON.parse(subscriptionPayments[i]);
      if (paymentData.paymentId === paymentId) {
        await this.redisClient.lset(
          `sandbox:subscription:${payment.subscriptionId}:payments`,
          i,
          JSON.stringify(payment)
        );
        break;
      }
    }

    logger.info('Mock payment status updated', { paymentId, status });
    return payment;
  }

  async simulatePaymentFailure(paymentId: string, failureType: 'insufficient_funds' | 'network_error' | 'timeout' | 'invalid_signature'): Promise<MockPayment | null> {
    return this.updatePaymentStatus(paymentId, 'failed').then(payment => {
      if (payment) {
        payment.failureType = failureType;
        payment.timestamp = new Date().toISOString();
        
        // Update with failure type
        this.redisClient.setex(
          `sandbox:payment:${paymentId}`,
          86400 * 7,
          JSON.stringify(payment)
        );
      }
      return payment;
    });
  }

  private simulateRandomFailure(): boolean {
    if (!sandboxConfig.isFeatureEnabled('failureSimulation')) {
      return false;
    }
    
    // 10% chance of random failure for testing
    return Math.random() < 0.1;
  }

  private getRandomFailureType(): 'insufficient_funds' | 'network_error' | 'timeout' | 'invalid_signature' {
    const failureTypes: Array<'insufficient_funds' | 'network_error' | 'timeout' | 'invalid_signature'> = [
      'insufficient_funds',
      'network_error', 
      'timeout',
      'invalid_signature'
    ];
    
    return failureTypes[Math.floor(Math.random() * failureTypes.length)];
  }

  private generateMockTransactionHash(): string {
    // Generate a realistic-looking Stellar transaction hash
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
  }

  private async emitSubscriptionBilledEvent(payment: MockPayment): Promise<void> {
    try {
      const billedEvent = {
        eventId: uuidv4(),
        subscriptionId: payment.subscriptionId,
        amount: payment.amount,
        currency: payment.currency,
        billingPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        billingPeriodEnd: new Date().toISOString(),
        paymentStatus: payment.status,
        timestamp: payment.timestamp,
        metadata: {
          environment: payment.metadata.environment,
          mockData: true,
          paymentId: payment.paymentId,
          failureType: payment.failureType
        }
      };

      // Store in indexer events queue
      await this.redisClient.lpush('sandbox:indexer:events', JSON.stringify({
        eventType: 'SubscriptionBilled',
        data: billedEvent,
        timestamp: new Date().toISOString(),
        source: 'mock_payment',
        environment: sandboxConfig.getConfig().environment
      }));

      // Trim events queue
      await this.redisClient.ltrim('sandbox:indexer:events', 0, 999);

      logger.debug('Subscription billed event emitted from mock payment', { 
        paymentId: payment.paymentId,
        eventId: billedEvent.eventId 
      });
    } catch (error) {
      logger.error('Failed to emit subscription billed event', { paymentId: payment.paymentId, error });
    }
  }

  async getPaymentStatistics(subscriptionId?: string): Promise<{
    totalPayments: number;
    successfulPayments: number;
    failedPayments: number;
    pendingPayments: number;
    totalAmount: number;
    failureRate: number;
  }> {
    const history = await this.getMockPaymentHistory({
      subscriptionId,
      limit: 10000,
      offset: 0
    });

    const stats = {
      totalPayments: history.payments.length,
      successfulPayments: history.payments.filter(p => p.status === 'success').length,
      failedPayments: history.payments.filter(p => p.status === 'failed').length,
      pendingPayments: history.payments.filter(p => p.status === 'pending').length,
      totalAmount: history.payments.filter(p => p.status === 'success').reduce((sum, p) => sum + p.amount, 0),
      failureRate: 0
    };

    stats.failureRate = stats.totalPayments > 0 ? (stats.failedPayments / stats.totalPayments) * 100 : 0;

    return stats;
  }

  async clearMockPaymentData(subscriptionId?: string): Promise<void> {
    if (subscriptionId) {
      // Clear payments for specific subscription
      await this.redisClient.del(`sandbox:subscription:${subscriptionId}:payments`);
      
      logger.info('Mock payment data cleared for subscription', { subscriptionId });
    } else {
      // Clear all mock payment data
      const paymentKeys = await this.redisClient.keys('sandbox:payment:*');
      const subscriptionKeys = await this.redisClient.keys('sandbox:subscription:*:payments');
      
      const allKeys = [...paymentKeys, ...subscriptionKeys];
      
      if (allKeys.length > 0) {
        await this.redisClient.del(...allKeys);
        logger.warn('All mock payment data cleared', { keyCount: allKeys.length });
      }
    }
  }
}
