import { EventEmitter } from 'events';
import { MPCNode } from './mpc-node';
import { SecureTransport, MPCMessage, MPCMessageType } from './secure-transport';
import { MPCSession, MPCSessionStatus, Share } from './shamir-secret-sharing';
import { logger } from '../../utils/logger';

/**
 * Synchronization Worker for MPC compute and reveal phases
 * Coordinates multi-party computation across nodes
 */
export class SyncWorker extends EventEmitter {
  private mpcNode: MPCNode;
  private transport: SecureTransport;
  private pendingOperations: Map<string, PendingOperation> = new Map();
  private operationTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(mpcNode: MPCNode, transport: SecureTransport) {
    super();
    this.mpcNode = mpcNode;
    this.transport = transport;
    
    this.setupEventHandlers();
    this.startHeartbeat();
    
    logger.info('MPC Sync Worker initialized');
  }

  /**
   * Setup event handlers for MPC node and transport
   */
  private setupEventHandlers(): void {
    // Handle MPC node events
    this.mpcNode.on('sessionInitialized', this.handleSessionInitialized.bind(this));
    this.mpcNode.on('dataProcessed', this.handleDataProcessed.bind(this));
    this.mpcNode.on('computationCompleted', this.handleComputationCompleted.bind(this));
    this.mpcNode.on('sessionCompleted', this.handleSessionCompleted.bind(this));
    this.mpcNode.on('participantTimeout', this.handleParticipantTimeout.bind(this));

    // Handle transport events
    this.transport.on('messageReceived', this.handleMessageReceived.bind(this));
    this.transport.on('connected', this.handleNodeConnected.bind(this));
    this.transport.on('disconnected', this.handleNodeDisconnected.bind(this));
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.transport.sendHeartbeat();
      this.checkOperationTimeouts();
    }, 30000); // 30 seconds
  }

  /**
   * Handle session initialization
   */
  private async handleSessionInitialized(session: MPCSession): Promise<void> {
    logger.info(`Sync worker handling session initialization: ${session.id}`);
    
    // Notify other nodes about the new session
    const message: MPCMessage = {
      type: MPCMessageType.SESSION_INIT,
      sessionId: session.id,
      from: this.mpcNode['nodeId'],
      timestamp: new Date().toISOString(),
      payload: {
        participants: session.participants,
        operation: session.operation,
        threshold: session.threshold
      }
    };

    this.transport.broadcastMessage(message);
  }

  /**
   * Handle data processing completion
   */
  private async handleDataProcessed(sessionId: string, shares: Share[]): Promise<void> {
    logger.info(`Sync worker handling data processed for session: ${sessionId}`);
    
    // Distribute shares to other participants
    await this.mpcNode.distributeShares(sessionId, shares);
    
    // Notify other nodes about share distribution
    const session = this.mpcNode.getSession(sessionId);
    if (session) {
      for (const participant of session.participants) {
        if (participant !== this.mpcNode['nodeId']) {
          const participantShare = shares.find(s => s.id === parseInt(participant.slice(-1)));
          if (participantShare) {
            const message: MPCMessage = {
              type: MPCMessageType.SHARE_DISTRIBUTION,
              sessionId,
              from: this.mpcNode['nodeId'],
              to: participant,
              timestamp: new Date().toISOString(),
              payload: participantShare
            };

            this.transport.sendMessage(participant, message);
          }
        }
      }
    }
  }

  /**
   * Handle computation completion
   */
  private async handleComputationCompleted(sessionId: string, result: string): Promise<void> {
    logger.info(`Sync worker handling computation completed for session: ${sessionId}`);
    
    // Store result for reveal phase
    const pendingOp = this.pendingOperations.get(sessionId);
    if (pendingOp) {
      pendingOp.result = result;
      pendingOp.phase = 'reveal';
    }
  }

  /**
   * Handle session completion
   */
  private async handleSessionCompleted(sessionId: string, result: string): Promise<void> {
    logger.info(`Sync worker handling session completion: ${sessionId}`);
    
    // Clean up pending operation
    this.pendingOperations.delete(sessionId);
    
    // Clear timeout
    const timeout = this.operationTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.operationTimeouts.delete(sessionId);
    }

    // Notify other nodes about session completion
    const message: MPCMessage = {
      type: MPCMessageType.COMPUTATION_RESPONSE,
      sessionId,
      from: this.mpcNode['nodeId'],
      timestamp: new Date().toISOString(),
      payload: { result, status: 'completed' }
    };

    this.transport.broadcastMessage(message);
  }

  /**
   * Handle participant timeout
   */
  private async handleParticipantTimeout(nodeId: string): Promise<void> {
    logger.warn(`Sync worker handling participant timeout: ${nodeId}`);
    
    // Find affected sessions
    const sessions = this.mpcNode.getAllSessions();
    for (const session of sessions) {
      if (session.participants.includes(nodeId)) {
        // Mark session as failed due to participant timeout
        const message: MPCMessage = {
          type: MPCMessageType.ERROR,
          sessionId: session.id,
          from: this.mpcNode['nodeId'],
          timestamp: new Date().toISOString(),
          payload: {
            error: `Participant ${nodeId} timed out`,
            code: 'PARTICIPANT_TIMEOUT'
          }
        };

        this.transport.broadcastMessage(message);
      }
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessageReceived(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.debug(`Sync worker received message from ${fromNodeId}: ${message.type}`);
    
    try {
      switch (message.type) {
        case MPCMessageType.SESSION_INIT:
          await this.handleSessionInitMessage(fromNodeId, message);
          break;
        case MPCMessageType.SESSION_JOIN:
          await this.handleSessionJoinMessage(fromNodeId, message);
          break;
        case MPCMessageType.SHARE_DISTRIBUTION:
          await this.handleShareDistributionMessage(fromNodeId, message);
          break;
        case MPCMessageType.SHARE_ACK:
          await this.handleShareAckMessage(fromNodeId, message);
          break;
        case MPCMessageType.COMPUTATION_REQUEST:
          await this.handleComputationRequestMessage(fromNodeId, message);
          break;
        case MPCMessageType.COMPUTATION_RESPONSE:
          await this.handleComputationResponseMessage(fromNodeId, message);
          break;
        case MPCMessageType.HEARTBEAT:
          await this.handleHeartbeatMessage(fromNodeId, message);
          break;
        case MPCMessageType.HEARTBEAT_RESPONSE:
          await this.handleHeartbeatResponseMessage(fromNodeId, message);
          break;
        case MPCMessageType.ERROR:
          await this.handleErrorMessage(fromNodeId, message);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling message from ${fromNodeId}: ${error.message}`);
    }
  }

  /**
   * Handle session init message
   */
  private async handleSessionInitMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    if (!message.sessionId) return;

    const { participants, operation, threshold } = message.payload;
    
    // Join the session if we're a participant
    if (participants.includes(this.mpcNode['nodeId'])) {
      await this.mpcNode.joinSession(message.sessionId, fromNodeId);
      
      // Acknowledge session join
      const ackMessage: MPCMessage = {
        type: MPCMessageType.SESSION_JOIN,
        sessionId: message.sessionId,
        from: this.mpcNode['nodeId'],
        to: fromNodeId,
        timestamp: new Date().toISOString(),
        payload: { status: 'joined' }
      };

      this.transport.sendMessage(fromNodeId, ackMessage);
    }
  }

  /**
   * Handle session join message
   */
  private async handleSessionJoinMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.info(`Node ${fromNodeId} joined session ${message.sessionId}`);
    
    // Track participant join
    const pendingOp = this.pendingOperations.get(message.sessionId!);
    if (pendingOp) {
      pendingOp.joinedParticipants.add(fromNodeId);
      
      // Check if all participants have joined
      const session = this.mpcNode.getSession(message.sessionId!);
      if (session && pendingOp.joinedParticipants.size >= session.participants.length) {
        await this.startComputationPhase(message.sessionId!);
      }
    }
  }

  /**
   * Handle share distribution message
   */
  private async handleShareDistributionMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    if (!message.sessionId) return;

    const share = message.payload as Share;
    await this.mpcNode.receiveShare(message.sessionId, fromNodeId, share);
    
    // Acknowledge share receipt
    const ackMessage: MPCMessage = {
      type: MPCMessageType.SHARE_ACK,
      sessionId: message.sessionId,
      from: this.mpcNode['nodeId'],
      to: fromNodeId,
      timestamp: new Date().toISOString(),
      payload: { shareId: share.id }
    };

    this.transport.sendMessage(fromNodeId, ackMessage);
  }

  /**
   * Handle share acknowledgment message
   */
  private async handleShareAckMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.debug(`Share acknowledged by ${fromNodeId} for session ${message.sessionId}`);
    
    const pendingOp = this.pendingOperations.get(message.sessionId!);
    if (pendingOp) {
      pendingOp.acknowledgedShares.add(fromNodeId);
    }
  }

  /**
   * Handle computation request message
   */
  private async handleComputationRequestMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.info(`Computation request received from ${fromNodeId} for session ${message.sessionId}`);
    
    // Start computation if ready
    await this.startComputationPhase(message.sessionId!);
  }

  /**
   * Handle computation response message
   */
  private async handleComputationResponseMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.info(`Computation response received from ${fromNodeId} for session ${message.sessionId}`);
    
    const pendingOp = this.pendingOperations.get(message.sessionId!);
    if (pendingOp) {
      pendingOp.responses.set(fromNodeId, message.payload);
      
      // Check if we have responses from all participants
      const session = this.mpcNode.getSession(message.sessionId!);
      if (session && pendingOp.responses.size >= session.participants.length) {
        await this.finalizeComputation(message.sessionId!);
      }
    }
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeatMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    this.transport.processHeartbeat(fromNodeId);
    
    // Send heartbeat response
    const response: MPCMessage = {
      type: MPCMessageType.HEARTBEAT_RESPONSE,
      from: this.mpcNode['nodeId'],
      to: fromNodeId,
      timestamp: new Date().toISOString(),
      payload: { status: 'alive' }
    };

    this.transport.sendMessage(fromNodeId, response);
  }

  /**
   * Handle heartbeat response message
   */
  private async handleHeartbeatResponseMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    this.transport.processHeartbeat(fromNodeId);
  }

  /**
   * Handle error message
   */
  private async handleErrorMessage(fromNodeId: string, message: MPCMessage): Promise<void> {
    logger.error(`Error received from ${fromNodeId}: ${message.payload.error}`);
    
    // Handle session failure
    if (message.sessionId) {
      const session = this.mpcNode.getSession(message.sessionId);
      if (session) {
        session.status = MPCSessionStatus.FAILED;
        this.emit('sessionFailed', message.sessionId, message.payload.error);
      }
    }
  }

  /**
   * Handle node connection
   */
  private handleNodeConnected(nodeId: string): void {
    logger.info(`Node ${nodeId} connected`);
    this.mpcNode.handleHeartbeatResponse(nodeId);
  }

  /**
   * Handle node disconnection
   */
  private handleNodeDisconnected(nodeId: string): void {
    logger.warn(`Node ${nodeId} disconnected`);
    this.mpcNode.stopHeartbeat(nodeId);
  }

  /**
   * Start computation phase
   */
  private async startComputationPhase(sessionId: string): Promise<void> {
    const session = this.mpcNode.getSession(sessionId);
    if (!session) return;

    // Initialize pending operation
    const pendingOp: PendingOperation = {
      sessionId,
      phase: 'compute',
      startTime: new Date(),
      joinedParticipants: new Set(session.participants),
      acknowledgedShares: new Set(),
      responses: new Map()
    };

    this.pendingOperations.set(sessionId, pendingOp);
    
    // Set operation timeout
    const timeout = setTimeout(() => {
      this.handleOperationTimeout(sessionId);
    }, 300000); // 5 minutes

    this.operationTimeouts.set(sessionId, timeout);

    // Notify all participants to start computation
    const message: MPCMessage = {
      type: MPCMessageType.COMPUTATION_REQUEST,
      sessionId,
      from: this.mpcNode['nodeId'],
      timestamp: new Date().toISOString(),
      payload: { phase: 'compute' }
    };

    this.transport.broadcastMessage(message);
  }

  /**
   * Finalize computation
   */
  private async finalizeComputation(sessionId: string): Promise<void> {
    const pendingOp = this.pendingOperations.get(sessionId);
    if (!pendingOp) return;

    // Aggregate results from all participants
    const results = Array.from(pendingOp.responses.values());
    // In a real implementation, this would securely aggregate the results
    
    logger.info(`Computation finalized for session ${sessionId}`);
    this.emit('computationFinalized', sessionId, results);
  }

  /**
   * Handle operation timeout
   */
  private handleOperationTimeout(sessionId: string): void {
    logger.warn(`Operation timeout for session ${sessionId}`);
    
    const session = this.mpcNode.getSession(sessionId);
    if (session) {
      session.status = MPCSessionStatus.FAILED;
      this.emit('operationTimeout', sessionId);
    }

    // Clean up
    this.pendingOperations.delete(sessionId);
    this.operationTimeouts.delete(sessionId);
  }

  /**
   * Check for operation timeouts
   */
  private checkOperationTimeouts(): void {
    const now = new Date();
    
    for (const [sessionId, pendingOp] of this.pendingOperations) {
      const elapsed = now.getTime() - pendingOp.startTime.getTime();
      if (elapsed > 300000) { // 5 minutes
        this.handleOperationTimeout(sessionId);
      }
    }
  }

  /**
   * Get synchronization status
   */
  getSyncStatus(): SyncStatus {
    return {
      pendingOperations: this.pendingOperations.size,
      activeTimeouts: this.operationTimeouts.size,
      connectedNodes: this.transport.getConnectedNodes().length
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Clear all timeouts
    for (const timeout of this.operationTimeouts.values()) {
      clearTimeout(timeout);
    }

    // Clear pending operations
    this.pendingOperations.clear();
    this.operationTimeouts.clear();

    logger.info('MPC Sync Worker cleaned up');
  }
}

/**
 * Pending operation interface
 */
interface PendingOperation {
  sessionId: string;
  phase: 'compute' | 'reveal';
  startTime: Date;
  joinedParticipants: Set<string>;
  acknowledgedShares: Set<string>;
  responses: Map<string, any>;
  result?: string;
}

/**
 * Sync status interface
 */
interface SyncStatus {
  pendingOperations: number;
  activeTimeouts: number;
  connectedNodes: number;
}
