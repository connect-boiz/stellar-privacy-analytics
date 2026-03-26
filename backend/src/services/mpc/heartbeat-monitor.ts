import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

/**
 * Heartbeat Monitor for MPC participants
 * Ensures all parties stay online during computation
 */
export class HeartbeatMonitor extends EventEmitter {
  private nodeId: string;
  private participants: Map<string, ParticipantStatus> = new Map();
  private heartbeatInterval: number = 30000; // 30 seconds
  private timeoutThreshold: number = 60000; // 60 seconds
  private monitoringInterval: any = null;

  constructor(nodeId: string, heartbeatIntervalMs: number = 30000, timeoutThresholdMs: number = 60000) {
    super();
    this.nodeId = nodeId;
    this.heartbeatInterval = heartbeatIntervalMs;
    this.timeoutThreshold = timeoutThresholdMs;
    
    logger.info(`Heartbeat monitor initialized for node ${nodeId}`);
  }

  /**
   * Add participant to monitor
   */
  addParticipant(participantId: string): void {
    if (!this.participants.has(participantId)) {
      this.participants.set(participantId, {
        id: participantId,
        status: 'active',
        lastHeartbeat: new Date(),
        missedHeartbeats: 0,
        totalHeartbeats: 0
      });
      
      logger.info(`Added participant ${participantId} to heartbeat monitoring`);
    }
  }

  /**
   * Remove participant from monitoring
   */
  removeParticipant(participantId: string): void {
    if (this.participants.delete(participantId)) {
      logger.info(`Removed participant ${participantId} from heartbeat monitoring`);
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.checkParticipants();
    }, this.heartbeatInterval);

    logger.info('Heartbeat monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Heartbeat monitoring stopped');
    }
  }

  /**
   * Process heartbeat from participant
   */
  processHeartbeat(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.lastHeartbeat = new Date();
      participant.totalHeartbeats++;
      participant.missedHeartbeats = 0;
      participant.status = 'active';
      
      this.emit('heartbeatReceived', participantId);
      logger.debug(`Heartbeat received from ${participantId}`);
    }
  }

  /**
   * Check all participants for timeouts
   */
  private checkParticipants(): void {
    const now = new Date();
    
    for (const [participantId, participant] of this.participants) {
      const timeSinceLastHeartbeat = now.getTime() - participant.lastHeartbeat.getTime();
      
      if (timeSinceLastHeartbeat > this.timeoutThreshold) {
        if (participant.status === 'active') {
          participant.status = 'timeout';
          participant.missedHeartbeats++;
          
          this.emit('participantTimeout', participantId);
          logger.warn(`Participant ${participantId} timed out`);
        }
      } else if (timeSinceLastHeartbeat > this.heartbeatInterval) {
        if (participant.status === 'active') {
          participant.status = 'warning';
          participant.missedHeartbeats++;
          
          this.emit('participantWarning', participantId);
          logger.warn(`Participant ${participantId} missed heartbeat`);
        }
      }
    }
  }

  /**
   * Get participant status
   */
  getParticipantStatus(participantId: string): ParticipantStatus | undefined {
    return this.participants.get(participantId);
  }

  /**
   * Get all participants
   */
  getAllParticipants(): ParticipantStatus[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get active participants
   */
  getActiveParticipants(): ParticipantStatus[] {
    return Array.from(this.participants.values()).filter(p => p.status === 'active');
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): HeartbeatStatistics {
    const participants = Array.from(this.participants.values());
    const active = participants.filter(p => p.status === 'active').length;
    const warning = participants.filter(p => p.status === 'warning').length;
    const timeout = participants.filter(p => p.status === 'timeout').length;
    
    return {
      totalParticipants: participants.length,
      activeParticipants: active,
      warningParticipants: warning,
      timeoutParticipants: timeout,
      heartbeatInterval: this.heartbeatInterval,
      timeoutThreshold: this.timeoutThreshold
    };
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stopMonitoring();
    this.participants.clear();
    logger.info('Heartbeat monitor cleaned up');
  }
}

/**
 * Participant status interface
 */
interface ParticipantStatus {
  id: string;
  status: 'active' | 'warning' | 'timeout' | 'disconnected';
  lastHeartbeat: Date;
  missedHeartbeats: number;
  totalHeartbeats: number;
}

/**
 * Heartbeat statistics interface
 */
interface HeartbeatStatistics {
  totalParticipants: number;
  activeParticipants: number;
  warningParticipants: number;
  timeoutParticipants: number;
  heartbeatInterval: number;
  timeoutThreshold: number;
}
