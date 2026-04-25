import { EventEmitter } from 'events';
import { ShamirSecretSharing, Share, MPCSession, MPCOperation, MPCSessionStatus, MPCArithmetic } from './shamir-secret-sharing';
import { logger } from '../../utils/logger';

/**
 * Main MPC Node implementation
 * Handles secure multi-party computation sessions
 */
export class MPCNode extends EventEmitter {
  private nodeId: string;
  private shamir: ShamirSecretSharing;
  private arithmetic: MPCArithmetic;
  private sessions: Map<string, MPCSession> = new Map();
  private connectedNodes: Set<string> = new Set();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private participantTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SESSION_TIMEOUT_MS = 3600000; // 1 hour

  constructor(nodeId: string, threshold: number = 2, totalShares: number = 3) {
    super();
    this.nodeId = nodeId;
    this.shamir = new ShamirSecretSharing(threshold, totalShares);
    this.arithmetic = new MPCArithmetic(threshold, totalShares);
    
    logger.info(`MPC Node ${nodeId} initialized with threshold ${threshold}, total shares ${totalShares}`);
  }

  /**
   * Initialize a new MPC session
   */
  async initializeSession(sessionId: string, participants: string[], operation: MPCOperation): Promise<MPCSession> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    if (!participants.includes(this.nodeId)) {
      throw new Error('This node must be included in participants');
    }

    const session: MPCSession = {
      id: sessionId,
      participants: [...participants],
      threshold: this.shamir['threshold'],
      operation,
      status: MPCSessionStatus.INITIALIZING,
      createdAt: new Date(),
      shares: new Map()
    };

    this.sessions.set(sessionId, session);
    
    // Set session timeout
    this.setSessionTimeout(sessionId);
    
    this.emit('sessionInitialized', session);
    
    logger.info(`MPC Session ${sessionId} initialized with ${participants.length} participants`);
    return session;
  }

  /**
   * Set session timeout to prevent memory leaks
   */
  private setSessionTimeout(sessionId: string): void {
    if (this.sessionTimeouts.has(sessionId)) {
      clearTimeout(this.sessionTimeouts.get(sessionId)!);
    }

    const timeout = setTimeout(() => {
      this.handleSessionTimeout(sessionId);
    }, this.SESSION_TIMEOUT_MS);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Handle session timeout
   */
  private handleSessionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      logger.warn(`MPC Session ${sessionId} timed out and will be removed`);
      this.emit('sessionTimeout', sessionId);
      this.closeSession(sessionId);
    }
  }

  /**
   * Close and cleanup a session
   */
  public closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clear any session-specific data
      session.shares.clear();
      this.sessions.delete(sessionId);
      
      const timeout = this.sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        this.sessionTimeouts.delete(sessionId);
      }
      
      logger.info(`MPC Session ${sessionId} closed and resources released`);
    }
  }

  /**
   * Join an existing MPC session
   */
  async joinSession(sessionId: string, initiatorId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.participants.includes(this.nodeId)) {
      throw new Error('This node is not a participant in this session');
    }

    session.status = MPCSessionStatus.SHARING;
    this.emit('sessionJoined', sessionId, initiatorId);
    
    logger.info(`Node ${this.nodeId} joined session ${sessionId}`);
  }

  /**
   * Process input data and create secret shares
   */
  async processData(sessionId: string, inputData: string): Promise<Share[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== MPCSessionStatus.SHARING) {
      throw new Error(`Session ${sessionId} is not in sharing phase`);
    }

    // Create secret shares from input data
    const shares = this.shamir.split(inputData);
    
    // Store shares for this node
    session.shares.set(this.nodeId, shares[0]); // Store first share for this node
    
    this.emit('dataProcessed', sessionId, shares);
    logger.info(`Processed data for session ${sessionId}, created ${shares.length} shares`);
    
    return shares;
  }

  /**
   * Distribute shares to other participants
   */
  async distributeShares(sessionId: string, shares: Share[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // In a real implementation, this would send shares via secure channels
    // For now, we'll simulate the distribution
    for (const participant of session.participants) {
      if (participant !== this.nodeId) {
        // Find the share for this participant
        const participantShare = shares.find(s => s.id === parseInt(participant.slice(-1)));
        if (participantShare) {
          this.emit('shareDistributed', sessionId, participant, participantShare);
          logger.info(`Distributed share to ${participant} for session ${sessionId}`);
        }
      }
    }
  }

  /**
   * Receive share from another participant
   */
  async receiveShare(sessionId: string, fromNodeId: string, share: Share): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!this.shamir.verifyShare(share)) {
      throw new Error(`Invalid share received from ${fromNodeId}`);
    }

    session.shares.set(fromNodeId, share);
    this.emit('shareReceived', sessionId, fromNodeId, share);
    
    logger.info(`Received share from ${fromNodeId} for session ${sessionId}`);
    
    // Check if we have enough shares to proceed
    if (session.shares.size >= session.threshold) {
      await this.startComputation(sessionId);
    }
  }

  /**
   * Start computation phase
   */
  private async startComputation(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = MPCSessionStatus.COMPUTING;
    this.emit('computationStarted', sessionId);
    
    logger.info(`Starting computation for session ${sessionId}`);
    
    try {
      // Perform computation based on operation type
      const result = await this.performComputation(session);
      session.result = result;
      session.status = MPCSessionStatus.REVEALING;
      
      this.emit('computationCompleted', sessionId, result);
      logger.info(`Computation completed for session ${sessionId}`);
      
      // Start reveal phase
      await this.startRevealPhase(sessionId);
    } catch (error) {
      session.status = MPCSessionStatus.FAILED;
      this.emit('computationFailed', sessionId, error);
      logger.error(`Computation failed for session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Perform the actual MPC computation
   */
  private async performComputation(session: MPCSession): Promise<string> {
    const shares = Array.from(session.shares.values());
    
    switch (session.operation) {
      case MPCOperation.SUM:
        return this.performSum(shares);
      case MPCOperation.AVG:
        return this.performAverage(shares);
      default:
        throw new Error(`Unsupported operation: ${session.operation}`);
    }
  }

  /**
   * Perform sum operation on secret shares
   */
  private performSum(shares: Share[]): string {
    // In a real MPC implementation, this would involve secure computation
    // For this demo, we'll reconstruct the values and sum them
    let sum = 0;
    
    for (const share of shares) {
      try {
        const value = parseInt(this.shamir.reconstruct([share]));
        sum += value;
      } catch (error) {
        logger.warn(`Failed to reconstruct value from share: ${error.message}`);
      }
    }
    
    return sum.toString();
  }

  /**
   * Perform average operation on secret shares
   */
  private performAverage(shares: Share[]): string {
    const sum = this.performSum(shares);
    const count = shares.length;
    return (parseInt(sum) / count).toString();
  }

  /**
   * Start reveal phase
   */
  private async startRevealPhase(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.emit('revealPhaseStarted', sessionId);
    
    // In a real implementation, this would coordinate with other nodes
    // For now, we'll complete the session
    session.status = MPCSessionStatus.COMPLETED;
    this.emit('sessionCompleted', sessionId, session.result);
    
    logger.info(`Session ${sessionId} completed with result: ${session.result}`);
    
    // Auto-close session after completion with a short delay to allow retrieval
    setTimeout(() => this.closeSession(sessionId), 60000); // 1 minute
  }

  /**
   * Start heartbeat monitoring for a node
   */
  startHeartbeat(nodeId: string, intervalMs: number = 30000): void {
    if (this.heartbeatIntervals.has(nodeId)) {
      this.stopHeartbeat(nodeId);
    }

    const interval = setInterval(() => {
      this.emit('heartbeat', nodeId);
      this.resetParticipantTimeout(nodeId);
    }, intervalMs);

    this.heartbeatIntervals.set(nodeId, interval);
    this.resetParticipantTimeout(nodeId);
    
    logger.info(`Started heartbeat monitoring for node ${nodeId}`);
  }

  /**
   * Stop heartbeat monitoring for a node
   */
  stopHeartbeat(nodeId: string): void {
    const interval = this.heartbeatIntervals.get(nodeId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(nodeId);
      logger.info(`Stopped heartbeat monitoring for node ${nodeId}`);
    }
  }

  /**
   * Reset timeout for participant
   */
  private resetParticipantTimeout(nodeId: string): void {
    const existingTimeout = this.participantTimeouts.get(nodeId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.handleParticipantTimeout(nodeId);
    }, 60000); // 60 seconds timeout

    this.participantTimeouts.set(nodeId, timeout);
  }

  /**
   * Handle participant timeout
   */
  private handleParticipantTimeout(nodeId: string): void {
    logger.warn(`Node ${nodeId} timed out`);
    this.emit('participantTimeout', nodeId);
    this.connectedNodes.delete(nodeId);
    this.stopHeartbeat(nodeId);
  }

  /**
   * Handle heartbeat response
   */
  handleHeartbeatResponse(nodeId: string): void {
    if (!this.connectedNodes.has(nodeId)) {
      this.connectedNodes.add(nodeId);
      this.emit('nodeConnected', nodeId);
    }
    this.resetParticipantTimeout(nodeId);
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): MPCSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): MPCSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get connected nodes
   */
  getConnectedNodes(): string[] {
    return Array.from(this.connectedNodes);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all heartbeat intervals
    for (const [nodeId, interval] of this.heartbeatIntervals) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();

    // Clear all timeouts
    for (const timeout of this.participantTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.participantTimeouts.clear();

    // Clear session timeouts
    for (const timeout of this.sessionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.sessionTimeouts.clear();

    // Clear sessions and their shares
    for (const session of this.sessions.values()) {
      session.shares.clear();
    }
    this.sessions.clear();
    this.connectedNodes.clear();

    logger.info(`MPC Node ${this.nodeId} cleaned up`);
  }
}
