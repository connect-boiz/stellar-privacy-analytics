import { BudgetExhaustedException } from '@stellar/shared';

export class BudgetExhaustionHandler {
  private static instance: BudgetExhaustionHandler;
  private alertCallbacks: Array<(error: BudgetExhaustedException) => void> = [];

  private constructor() {}

  static getInstance(): BudgetExhaustionHandler {
    if (!BudgetExhaustionHandler.instance) {
      BudgetExhaustionHandler.instance = new BudgetExhaustionHandler();
    }
    return BudgetExhaustionHandler.instance;
  }

  handleBudgetExhausted(error: BudgetExhaustedException): {
    shouldRetry: boolean;
    retryDelay?: number;
    alternativeEpsilon?: number;
    message: string;
  } {
    const remainingEpsilon = error.remainingEpsilon;
    const requestedEpsilon = error.requestedEpsilon;

    if (remainingEpsilon <= 0) {
      this.logCriticalExhaustion(error);
      this.triggerAlerts(error);
      
      return {
        shouldRetry: false,
        message: `Privacy budget completely exhausted for user ${error.userId} on dataset ${error.datasetId}. Please reset budget or wait for renewal.`
      };
    }

    const alternativeEpsilon = this.calculateAlternativeEpsilon(requestedEpsilon, remainingEpsilon);
    
    if (alternativeEpsilon > 0) {
      this.logPartialExhaustion(error, alternativeEpsilon);
      
      return {
        shouldRetry: true,
        retryDelay: 1000,
        alternativeEpsilon,
        message: `Insufficient budget for requested ε=${requestedEpsilon}. Alternative ε=${alternativeEpsilon.toFixed(4)} available.`
      };
    }

    return {
      shouldRetry: false,
      message: `Insufficient privacy budget. Requested: ${requestedEpsilon}, Available: ${remainingEpsilon}`
    };
  }

  private calculateAlternativeEpsilon(requested: number, available: number): number {
    if (available <= 0) return 0;
    
    const conservativeRatio = 0.8;
    const alternative = Math.min(requested * 0.5, available * conservativeRatio);
    
    return Math.max(alternative, 0.01);
  }

  private logCriticalExhaustion(error: BudgetExhaustedException): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'CRITICAL',
      userId: error.userId,
      datasetId: error.datasetId,
      requestedEpsilon: error.requestedEpsilon,
      remainingEpsilon: error.remainingEpsilon,
      message: 'Privacy budget completely exhausted'
    };

    console.error('PRIVACY_BUDGET_EXHAUSTED', JSON.stringify(logEntry));
  }

  private logPartialExhaustion(error: BudgetExhaustedException, alternativeEpsilon: number): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      userId: error.userId,
      datasetId: error.datasetId,
      requestedEpsilon: error.requestedEpsilon,
      remainingEpsilon: error.remainingEpsilon,
      alternativeEpsilon,
      message: 'Partial privacy budget exhaustion'
    };

    console.warn('PRIVACY_BUDGET_WARNING', JSON.stringify(logEntry));
  }

  private triggerAlerts(error: BudgetExhaustedException): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error in budget exhaustion alert callback:', callbackError);
      }
    });
  }

  registerAlertCallback(callback: (error: BudgetExhaustedException) => void): void {
    this.alertCallbacks.push(callback);
  }

  unregisterAlertCallback(callback: (error: BudgetExhaustedException) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  createBudgetExhaustedResponse(error: BudgetExhaustedException) {
    const handling = this.handleBudgetExhausted(error);
    
    return {
      error: {
        name: 'BudgetExhaustedException',
        message: error.message,
        userId: error.userId,
        datasetId: error.datasetId,
        requestedEpsilon: error.requestedEpsilon,
        remainingEpsilon: error.remainingEpsilon
      },
      handling,
      timestamp: new Date().toISOString()
    };
  }

  async handleBudgetExhaustedAsync(error: BudgetExhaustedException): Promise<{
    success: boolean;
    action: string;
    details: any;
  }> {
    const handling = this.handleBudgetExhausted(error);
    
    if (handling.shouldRetry && handling.alternativeEpsilon) {
      return {
        success: true,
        action: 'retry_with_alternative',
        details: {
          alternativeEpsilon: handling.alternativeEpsilon,
          retryDelay: handling.retryDelay,
          message: handling.message
        }
      };
    }

    if (error.remainingEpsilon <= 0) {
      try {
        await this.notifyBudgetReset(error);
        return {
          success: false,
          action: 'notify_reset_required',
          details: {
            message: 'Budget reset notification sent',
            userId: error.userId,
            datasetId: error.datasetId
          }
        };
      } catch (notifyError) {
        return {
          success: false,
          action: 'reset_notification_failed',
          details: {
            error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
            message: 'Failed to send budget reset notification'
          }
        };
      }
    }

    return {
      success: false,
      action: 'insufficient_budget',
      details: {
        message: handling.message,
        requestedEpsilon: error.requestedEpsilon,
        remainingEpsilon: error.remainingEpsilon
      }
    };
  }

  private async notifyBudgetReset(error: BudgetExhaustedException): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Budget reset notification sent for user ${error.userId}, dataset ${error.datasetId}`);
        resolve();
      }, 100);
    });
  }

  getBudgetExhaustionStats(userId?: string, datasetId?: string): {
    totalExhaustions: number;
    criticalExhaustions: number;
    partialExhaustions: number;
    lastExhaustion?: Date;
  } {
    return {
      totalExhaustions: 0,
      criticalExhaustions: 0,
      partialExhaustions: 0,
      lastExhaustion: undefined
    };
  }

  resetExhaustionStats(): void {
    console.log('Budget exhaustion statistics reset');
  }
}
