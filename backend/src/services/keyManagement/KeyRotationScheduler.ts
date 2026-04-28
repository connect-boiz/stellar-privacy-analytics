import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import type { KeyMetadata } from './KeyManagementService';

export interface RotationPolicy {
  keyId: string;
  rotationIntervalDays: number;
  gracePeriodDays: number;
  autoRotate: boolean;
  notificationThresholdDays: number;
  maxUsageBeforeRotation?: number;
  rotateOnExpiry: boolean;
}

export interface RotationSchedule {
  keyId: string;
  nextRotation: Date;
  lastRotation?: Date;
  rotationCount: number;
  policy: RotationPolicy;
  status: 'scheduled' | 'due' | 'overdue' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Automated Key Rotation Scheduler
 * Manages lifecycle and automated rotation of cryptographic keys
 */
export class KeyRotationScheduler extends EventEmitter {
  private keyManagementService: any; // Circular dependency, use any
  private schedules: Map<string, RotationSchedule> = new Map();
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;

  // Default policies
  private readonly DEFAULT_POLICIES: Record<string, Partial<RotationPolicy>> = {
    master: {
      rotationIntervalDays: 90,
      gracePeriodDays: 7,
      autoRotate: true,
      notificationThresholdDays: 14,
      maxUsageBeforeRotation: 1000000,
      rotateOnExpiry: true
    },
    data: {
      rotationIntervalDays: 30,
      gracePeriodDays: 3,
      autoRotate: true,
      notificationThresholdDays: 7,
      maxUsageBeforeRotation: 100000,
      rotateOnExpiry: true
    },
    session: {
      rotationIntervalDays: 1,
      gracePeriodDays: 0,
      autoRotate: true,
      notificationThresholdDays: 0,
      maxUsageBeforeRotation: 1000,
      rotateOnExpiry: true
    },
    smpc: {
      rotationIntervalDays: 60,
      gracePeriodDays: 5,
      autoRotate: true,
      notificationThresholdDays: 10,
      maxUsageBeforeRotation: 10000,
      rotateOnExpiry: true
    },
    zkp: {
      rotationIntervalDays: 45,
      gracePeriodDays: 5,
      autoRotate: true,
      notificationThresholdDays: 10,
      maxUsageBeforeRotation: 50000,
      rotateOnExpiry: true
    }
  };

  constructor(keyManagementService: any) {
    super();
    this.keyManagementService = keyManagementService;
  }

  /**
   * Start the rotation scheduler
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Rotation scheduler already running');
      return;
    }

    this.running = true;

    // Check for due rotations every hour
    this.checkInterval = setInterval(() => {
      this.checkDueRotations();
    }, 60 * 60 * 1000);

    // Initial check
    await this.checkDueRotations();

    logger.info('Key rotation scheduler started');
    this.emit('started');
  }

  /**
   * Stop the rotation scheduler
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Clear check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all rotation timers
    for (const timer of this.rotationTimers.values()) {
      clearTimeout(timer);
    }
    this.rotationTimers.clear();

    logger.info('Key rotation scheduler stopped');
    this.emit('stopped');
  }

  /**
   * Schedule rotation for a key
   */
  scheduleRotation(keyId: string, metadata: KeyMetadata): void {
    // Get or create policy
    const policy = this.getOrCreatePolicy(keyId, metadata);

    // Calculate next rotation date
    const nextRotation = this.calculateNextRotation(metadata, policy);

    // Create schedule
    const schedule: RotationSchedule = {
      keyId,
      nextRotation,
      lastRotation: metadata.lastRotated,
      rotationCount: 0,
      policy,
      status: 'scheduled'
    };

    this.schedules.set(keyId, schedule);

    // Set timer for rotation
    this.setRotationTimer(keyId, nextRotation);

    logger.info('Rotation scheduled', {
      keyId,
      nextRotation: nextRotation.toISOString(),
      policy: policy.rotationIntervalDays
    });

    this.emit('rotationScheduled', { keyId, nextRotation });
  }

  /**
   * Cancel scheduled rotation
   */
  cancelRotation(keyId: string): void {
    const schedule = this.schedules.get(keyId);
    if (!schedule) {
      return;
    }

    // Clear timer
    const timer = this.rotationTimers.get(keyId);
    if (timer) {
      clearTimeout(timer);
      this.rotationTimers.delete(keyId);
    }

    // Remove schedule
    this.schedules.delete(keyId);

    logger.info('Rotation cancelled', { keyId });
    this.emit('rotationCancelled', { keyId });
  }

  /**
   * Update rotation policy for a key
   */
  updatePolicy(keyId: string, updates: Partial<RotationPolicy>): void {
    const schedule = this.schedules.get(keyId);
    if (!schedule) {
      throw new Error(`No rotation schedule found for key ${keyId}`);
    }

    // Update policy
    schedule.policy = { ...schedule.policy, ...updates };

    // Recalculate next rotation
    const metadata = this.keyManagementService.getKeyMetadata(keyId);
    if (metadata) {
      schedule.nextRotation = this.calculateNextRotation(metadata, schedule.policy);
      
      // Reset timer
      this.setRotationTimer(keyId, schedule.nextRotation);
    }

    this.schedules.set(keyId, schedule);

    logger.info('Rotation policy updated', { keyId, updates });
    this.emit('policyUpdated', { keyId, policy: schedule.policy });
  }

  /**
   * Force immediate rotation
   */
  async forceRotation(keyId: string, reason?: string): Promise<void> {
    const schedule = this.schedules.get(keyId);
    if (!schedule) {
      throw new Error(`No rotation schedule found for key ${keyId}`);
    }

    try {
      schedule.status = 'in_progress';
      this.schedules.set(keyId, schedule);

      logger.info('Forcing key rotation', { keyId, reason });
      this.emit('rotationStarted', { keyId, reason });

      // Trigger rotation
      await this.performRotation(keyId, reason || 'Forced rotation');

      schedule.status = 'completed';
      schedule.rotationCount++;
      schedule.lastRotation = new Date();
      this.schedules.set(keyId, schedule);

      logger.info('Forced rotation completed', { keyId });
      this.emit('rotationCompleted', { keyId });
    } catch (error: unknown) {
      schedule.status = 'failed';
      this.schedules.set(keyId, schedule);

      logger.error(`Forced rotation failed for key ${keyId}:`, error);
      this.emit('rotationFailed', { keyId, error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Get rotation schedule for a key
   */
  getSchedule(keyId: string): RotationSchedule | null {
    return this.schedules.get(keyId) || null;
  }

  /**
   * Get all rotation schedules
   */
  getAllSchedules(): RotationSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedules by status
   */
  getSchedulesByStatus(status: RotationSchedule['status']): RotationSchedule[] {
    return Array.from(this.schedules.values()).filter(s => s.status === status);
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalScheduled: number;
    dueRotations: number;
    overdueRotations: number;
    inProgress: number;
    totalRotations: number;
    failedRotations: number;
  } {
    const schedules = Array.from(this.schedules.values());

    return {
      totalScheduled: schedules.length,
      dueRotations: schedules.filter(s => s.status === 'due').length,
      overdueRotations: schedules.filter(s => s.status === 'overdue').length,
      inProgress: schedules.filter(s => s.status === 'in_progress').length,
      totalRotations: schedules.reduce((sum, s) => sum + s.rotationCount, 0),
      failedRotations: schedules.filter(s => s.status === 'failed').length
    };
  }

  // Private methods

  private async checkDueRotations(): Promise<void> {
    const now = new Date();

    for (const [keyId, schedule] of this.schedules.entries()) {
      if (!schedule.policy.autoRotate) {
        continue;
      }

      // Check if rotation is due
      if (schedule.nextRotation <= now && schedule.status === 'scheduled') {
        schedule.status = 'due';
        this.schedules.set(keyId, schedule);
        this.emit('rotationDue', keyId);

        // Perform rotation
        await this.performRotation(keyId, 'Scheduled rotation');
      }

      // Check if rotation is overdue
      const gracePeriodEnd = new Date(
        schedule.nextRotation.getTime() + 
        schedule.policy.gracePeriodDays * 24 * 60 * 60 * 1000
      );

      if (now > gracePeriodEnd && schedule.status === 'due') {
        schedule.status = 'overdue';
        this.schedules.set(keyId, schedule);
        this.emit('rotationOverdue', keyId);
      }

      // Check notification threshold
      const notificationDate = new Date(
        schedule.nextRotation.getTime() - 
        schedule.policy.notificationThresholdDays * 24 * 60 * 60 * 1000
      );

      if (now >= notificationDate && schedule.status === 'scheduled') {
        this.emit('rotationWarning', {
          keyId,
          daysUntilRotation: Math.ceil(
            (schedule.nextRotation.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          )
        });
      }

      // Check usage-based rotation
      const metadata = this.keyManagementService.getKeyMetadata(keyId);
      if (metadata && schedule.policy.maxUsageBeforeRotation) {
        if (metadata.usageCount >= schedule.policy.maxUsageBeforeRotation) {
          logger.warn('Key usage threshold exceeded', {
            keyId,
            usageCount: metadata.usageCount,
            threshold: schedule.policy.maxUsageBeforeRotation
          });
          await this.performRotation(keyId, 'Usage threshold exceeded');
        }
      }

      // Check expiry-based rotation
      if (metadata && metadata.expiresAt && schedule.policy.rotateOnExpiry) {
        if (metadata.expiresAt <= now && metadata.status === 'active') {
          logger.warn('Key expired', { keyId, expiresAt: metadata.expiresAt });
          await this.performRotation(keyId, 'Key expired');
        }
      }
    }
  }

  private async performRotation(keyId: string, reason: string): Promise<void> {
    const schedule = this.schedules.get(keyId);
    if (!schedule) {
      return;
    }

    try {
      schedule.status = 'in_progress';
      this.schedules.set(keyId, schedule);

      logger.info('Starting key rotation', { keyId, reason });

      // Perform rotation through key management service
      // Note: This will be called by the service itself to avoid circular dependency
      this.emit('rotationDue', keyId);

      // Update schedule after successful rotation
      schedule.status = 'completed';
      schedule.rotationCount++;
      schedule.lastRotation = new Date();
      
      // Calculate next rotation
      const metadata = this.keyManagementService.getKeyMetadata(keyId);
      if (metadata) {
        schedule.nextRotation = this.calculateNextRotation(metadata, schedule.policy);
        this.setRotationTimer(keyId, schedule.nextRotation);
      }

      this.schedules.set(keyId, schedule);

      logger.info('Key rotation completed', { keyId });
      this.emit('rotationCompleted', { keyId });
    } catch (error) {
      schedule.status = 'failed';
      this.schedules.set(keyId, schedule);

      logger.error(`Key rotation failed for ${keyId}:`, error);
      this.emit('rotationFailed', { keyId, error: getErrorMessage(error) });
    }
  }

  private getOrCreatePolicy(keyId: string, metadata: KeyMetadata): RotationPolicy {
    const defaultPolicy = this.DEFAULT_POLICIES[metadata.keyType] || this.DEFAULT_POLICIES.data;

    return {
      keyId,
      rotationIntervalDays: defaultPolicy.rotationIntervalDays!,
      gracePeriodDays: defaultPolicy.gracePeriodDays!,
      autoRotate: defaultPolicy.autoRotate!,
      notificationThresholdDays: defaultPolicy.notificationThresholdDays!,
      maxUsageBeforeRotation: defaultPolicy.maxUsageBeforeRotation,
      rotateOnExpiry: defaultPolicy.rotateOnExpiry!
    };
  }

  private calculateNextRotation(metadata: KeyMetadata, policy: RotationPolicy): Date {
    const baseDate = metadata.lastRotated || metadata.createdAt;
    const nextRotation = new Date(baseDate);
    nextRotation.setDate(nextRotation.getDate() + policy.rotationIntervalDays);

    // If key has expiry, use the earlier of rotation date or expiry
    if (metadata.expiresAt && policy.rotateOnExpiry) {
      return metadata.expiresAt < nextRotation ? metadata.expiresAt : nextRotation;
    }

    return nextRotation;
  }

  private setRotationTimer(keyId: string, nextRotation: Date): void {
    // Clear existing timer
    const existingTimer = this.rotationTimers.get(keyId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate delay
    const delay = nextRotation.getTime() - Date.now();

    // Only set timer if rotation is in the future
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.emit('rotationDue', keyId);
      }, delay);

      this.rotationTimers.set(keyId, timer);
    }
  }
}

export default KeyRotationScheduler;
