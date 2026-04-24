import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

/**
 * Timeout Policy for MPC participants
 * Handles non-responsive participants with configurable policies
 */
export class TimeoutPolicy extends EventEmitter {
  private nodeId: string;
  private policies: Map<string, TimeoutConfig> = new Map();
  private activeTimeouts: Map<string, TimeoutInfo> = new Map();
  private defaultConfig: TimeoutConfig;

  constructor(nodeId: string, defaultConfig?: Partial<TimeoutConfig>) {
    super();
    this.nodeId = nodeId;
    this.defaultConfig = {
      heartbeatTimeout: 60000,      // 60 seconds
      operationTimeout: 300000,     // 5 minutes
      shareDistributionTimeout: 120000, // 2 minutes
      computationTimeout: 600000,   // 10 minutes
      revealTimeout: 180000,         // 3 minutes
      maxRetries: 3,
      retryDelay: 5000,              // 5 seconds
      action: 'warn_and_continue'
    };

    if (defaultConfig) {
      this.defaultConfig = { ...this.defaultConfig, ...defaultConfig };
    }

    logger.info(`Timeout policy initialized for node ${nodeId}`);
  }

  /**
   * Set timeout policy for a specific session
   */
  setPolicy(sessionId: string, config: Partial<TimeoutConfig>): void {
    const policy: TimeoutConfig = { ...this.defaultConfig, ...config };
    this.policies.set(sessionId, policy);
    
    logger.info(`Timeout policy set for session ${sessionId}`);
  }

  /**
   * Get timeout policy for a session
   */
  getPolicy(sessionId: string): TimeoutConfig {
    return this.policies.get(sessionId) || this.defaultConfig;
  }

  /**
   * Start timeout for a specific operation
   */
  startTimeout(sessionId: string, operation: TimeoutOperation, participantId?: string): string {
    const policy = this.getPolicy(sessionId);
    const timeoutMs = this.getTimeoutForOperation(operation, policy);
    const timeoutId = this.generateTimeoutId(sessionId, operation, participantId);
    
    // Clear existing timeout if any
    this.clearTimeout(timeoutId);
    
    const timeoutInfo: TimeoutInfo = {
      id: timeoutId,
      sessionId,
      operation,
      participantId,
      startTime: new Date(),
      timeoutMs,
      retries: 0,
      status: 'active'
    };
    
    this.activeTimeouts.set(timeoutId, timeoutInfo);
    
    // Set the actual timeout
    const timeoutHandle = setTimeout(() => {
      this.handleTimeout(timeoutInfo);
    }, timeoutMs);
    
    timeoutInfo.handle = timeoutHandle;
    
    logger.info(`Timeout started: ${timeoutId} (${timeoutMs}ms)`);
    return timeoutId;
  }

  /**
   * Clear timeout
   */
  clearTimeout(timeoutId: string): boolean {
    const timeoutInfo = this.activeTimeouts.get(timeoutId);
    if (timeoutInfo && timeoutInfo.handle) {
      clearTimeout(timeoutInfo.handle);
      this.activeTimeouts.delete(timeoutId);
      logger.info(`Timeout cleared: ${timeoutId}`);
      return true;
    }
    return false;
  }

  /**
   * Reset timeout (refresh the timer)
   */
  resetTimeout(timeoutId: string): boolean {
    const timeoutInfo = this.activeTimeouts.get(timeoutId);
    if (timeoutInfo && timeoutInfo.handle) {
      clearTimeout(timeoutInfo.handle);
      
      const timeoutHandle = setTimeout(() => {
        this.handleTimeout(timeoutInfo);
      }, timeoutInfo.timeoutMs);
      
      timeoutInfo.handle = timeoutHandle;
      timeoutInfo.startTime = new Date();
      
      logger.debug(`Timeout reset: ${timeoutId}`);
      return true;
    }
    return false;
  }

  /**
   * Handle timeout occurrence
   */
  private handleTimeout(timeoutInfo: TimeoutInfo): void {
    const policy = this.getPolicy(timeoutInfo.sessionId);
    timeoutInfo.status = 'triggered';
    
    logger.warn(`Timeout triggered: ${timeoutInfo.id}`);
    
    // Emit timeout event
    this.emit('timeout', timeoutInfo);
    
    // Apply policy action
    switch (policy.action) {
      case 'warn_and_continue':
        this.handleWarnAndContinue(timeoutInfo, policy);
        break;
      case 'retry':
        this.handleRetry(timeoutInfo, policy);
        break;
      case 'fail_session':
        this.handleFailSession(timeoutInfo, policy);
        break;
      case 'remove_participant':
        this.handleRemoveParticipant(timeoutInfo, policy);
        break;
      default:
        logger.warn(`Unknown timeout action: ${policy.action}`);
    }
  }

  /**
   * Handle warn and continue action
   */
  private handleWarnAndContinue(timeoutInfo: TimeoutInfo, policy: TimeoutConfig): void {
    logger.warn(`Timeout warning for ${timeoutInfo.operation} in session ${timeoutInfo.sessionId}`);
    
    this.emit('timeoutWarning', {
      sessionId: timeoutInfo.sessionId,
      operation: timeoutInfo.operation,
      participantId: timeoutInfo.participantId,
      message: `Operation ${timeoutInfo.operation} timed out but continuing`
    });
    
    // Clear the timeout since we're continuing
    this.clearTimeout(timeoutInfo.id);
  }

  /**
   * Handle retry action
   */
  private handleRetry(timeoutInfo: TimeoutInfo, policy: TimeoutConfig): void {
    if (timeoutInfo.retries < policy.maxRetries) {
      timeoutInfo.retries++;
      timeoutInfo.status = 'retrying';
      
      logger.info(`Retrying timeout ${timeoutInfo.id} (attempt ${timeoutInfo.retries}/${policy.maxRetries})`);
      
      this.emit('timeoutRetry', {
        sessionId: timeoutInfo.sessionId,
        operation: timeoutInfo.operation,
        participantId: timeoutInfo.participantId,
        retry: timeoutInfo.retries,
        maxRetries: policy.maxRetries
      });
      
      // Schedule retry after delay
      setTimeout(() => {
        this.startTimeout(timeoutInfo.sessionId, timeoutInfo.operation, timeoutInfo.participantId);
      }, policy.retryDelay);
      
      // Clear current timeout
      this.clearTimeout(timeoutInfo.id);
    } else {
      // Max retries reached, fail the session
      this.handleFailSession(timeoutInfo, policy);
    }
  }

  /**
   * Handle fail session action
   */
  private handleFailSession(timeoutInfo: TimeoutInfo, policy: TimeoutConfig): void {
    logger.error(`Session ${timeoutInfo.sessionId} failed due to timeout: ${timeoutInfo.operation}`);
    
    this.emit('sessionFailed', {
      sessionId: timeoutInfo.sessionId,
      operation: timeoutInfo.operation,
      participantId: timeoutInfo.participantId,
      reason: 'timeout',
      message: `Operation ${timeoutInfo.operation} timed out after ${policy.maxRetries} retries`
    });
    
    // Clear all timeouts for this session
    this.clearSessionTimeouts(timeoutInfo.sessionId);
  }

  /**
   * Handle remove participant action
   */
  private handleRemoveParticipant(timeoutInfo: TimeoutInfo, policy: TimeoutConfig): void {
    if (timeoutInfo.participantId) {
      logger.warn(`Removing participant ${timeoutInfo.participantId} due to timeout`);
      
      this.emit('participantRemoved', {
        sessionId: timeoutInfo.sessionId,
        participantId: timeoutInfo.participantId,
        operation: timeoutInfo.operation,
        reason: 'timeout'
      });
      
      // Clear timeout for this participant
      this.clearTimeout(timeoutInfo.id);
    } else {
      // No specific participant, fail the session
      this.handleFailSession(timeoutInfo, policy);
    }
  }

  /**
   * Get timeout duration for operation
   */
  private getTimeoutForOperation(operation: TimeoutOperation, policy: TimeoutConfig): number {
    switch (operation) {
      case 'heartbeat':
        return policy.heartbeatTimeout;
      case 'share_distribution':
        return policy.shareDistributionTimeout;
      case 'computation':
        return policy.computationTimeout;
      case 'reveal':
        return policy.revealTimeout;
      case 'operation':
        return policy.operationTimeout;
      default:
        return policy.operationTimeout;
    }
  }

  /**
   * Generate timeout ID
   */
  private generateTimeoutId(sessionId: string, operation: TimeoutOperation, participantId?: string): string {
    const parts = [sessionId, operation];
    if (participantId) {
      parts.push(participantId);
    }
    return parts.join('_');
  }

  /**
   * Clear all timeouts for a session
   */
  clearSessionTimeouts(sessionId: string): void {
    const timeoutsToClear: string[] = [];
    
    for (const [timeoutId, timeoutInfo] of this.activeTimeouts) {
      if (timeoutInfo.sessionId === sessionId) {
        timeoutsToClear.push(timeoutId);
      }
    }
    
    for (const timeoutId of timeoutsToClear) {
      this.clearTimeout(timeoutId);
    }
    
    logger.info(`Cleared all timeouts for session ${sessionId}`);
  }

  /**
   * Get active timeouts
   */
  getActiveTimeouts(): TimeoutInfo[] {
    return Array.from(this.activeTimeouts.values());
  }

  /**
   * Get timeouts for a session
   */
  getSessionTimeouts(sessionId: string): TimeoutInfo[] {
    return Array.from(this.activeTimeouts.values()).filter(t => t.sessionId === sessionId);
  }

  /**
   * Get timeout statistics
   */
  getStatistics(): TimeoutStatistics {
    const timeouts = Array.from(this.activeTimeouts.values());
    const active = timeouts.filter(t => t.status === 'active').length;
    const triggered = timeouts.filter(t => t.status === 'triggered').length;
    const retrying = timeouts.filter(t => t.status === 'retrying').length;
    
    return {
      totalTimeouts: timeouts.length,
      activeTimeouts: active,
      triggeredTimeouts: triggered,
      retryingTimeouts: retrying,
      sessionsWithTimeouts: new Set(timeouts.map(t => t.sessionId)).size
    };
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    // Clear all active timeouts
    for (const timeoutId of this.activeTimeouts.keys()) {
      this.clearTimeout(timeoutId);
    }
    
    this.activeTimeouts.clear();
    this.policies.clear();
    
    logger.info('Timeout policy cleaned up');
  }
}

/**
 * Timeout configuration interface
 */
interface TimeoutConfig {
  heartbeatTimeout: number;
  operationTimeout: number;
  shareDistributionTimeout: number;
  computationTimeout: number;
  revealTimeout: number;
  maxRetries: number;
  retryDelay: number;
  action: TimeoutAction;
}

/**
 * Timeout operation types
 */
type TimeoutOperation = 'heartbeat' | 'share_distribution' | 'computation' | 'reveal' | 'operation';

/**
 * Timeout actions
 */
type TimeoutAction = 'warn_and_continue' | 'retry' | 'fail_session' | 'remove_participant';

/**
 * Timeout information interface
 */
interface TimeoutInfo {
  id: string;
  sessionId: string;
  operation: TimeoutOperation;
  participantId?: string;
  startTime: Date;
  timeoutMs: number;
  retries: number;
  status: 'active' | 'triggered' | 'retrying';
  handle?: any;
}

/**
 * Timeout statistics interface
 */
interface TimeoutStatistics {
  totalTimeouts: number;
  activeTimeouts: number;
  triggeredTimeouts: number;
  retryingTimeouts: number;
  sessionsWithTimeouts: number;
}
