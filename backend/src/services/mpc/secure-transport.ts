import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

/**
 * Simplified secure transport for MPC node communication
 * In production, this would use proper TLS 1.3 with certificates
 */
export class SecureTransport extends EventEmitter {
  private nodeId: string;
  private connections: Map<string, Connection> = new Map();
  private messageQueue: Map<string, any[]> = new Map();
  private readonly MAX_QUEUE_SIZE = 1000;
  private isEncrypted: boolean = true;

  constructor(nodeId: string, encryptionEnabled: boolean = true) {
    super();
    this.nodeId = nodeId;
    this.isEncrypted = encryptionEnabled;
    
    logger.info(`Secure transport initialized for node ${nodeId} with encryption: ${encryptionEnabled}`);
  }

  /**
   * Connect to another MPC node
   */
  async connectToNode(remoteNodeId: string, address: string, port: number): Promise<void> {
    if (this.connections.has(remoteNodeId)) {
      logger.warn(`Already connected to node ${remoteNodeId}`);
      return;
    }

    // Simulate connection establishment
    const connection: Connection = {
      nodeId: remoteNodeId,
      address,
      port,
      status: 'connected',
      lastHeartbeat: new Date(),
      messageCount: 0
    };

    this.connections.set(remoteNodeId, connection);
    this.messageQueue.set(remoteNodeId, []);
    
    this.emit('connected', remoteNodeId);
    logger.info(`Connected to node ${remoteNodeId} at ${address}:${port}`);
  }

  /**
   * Disconnect from a node
   */
  disconnectFromNode(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      connection.status = 'disconnected';
      this.connections.delete(nodeId);
      this.messageQueue.delete(nodeId);
      
      this.emit('disconnected', nodeId);
      logger.info(`Disconnected from node ${nodeId}`);
    }
  }

  /**
   * Send message to a specific node
   */
  sendMessage(nodeId: string, message: any): boolean {
    const connection = this.connections.get(nodeId);
    if (!connection || connection.status !== 'connected') {
      logger.warn(`No active connection to node ${nodeId}`);
      return false;
    }

    try {
      // Simulate message encryption
      const encryptedMessage = this.isEncrypted ? this.encryptMessage(message) : message;
      
      // Simulate message sending
      connection.messageCount++;
      connection.lastHeartbeat = new Date();
      
      // Queue message for simulation
      const queue = this.messageQueue.get(nodeId);
      if (queue) {
        if (queue.length >= this.MAX_QUEUE_SIZE) {
          queue.shift(); // Remove oldest message to prevent unbounded growth
          logger.warn(`Message queue for node ${nodeId} exceeded max size, dropping oldest message`);
        }
        
        queue.push({
          ...encryptedMessage,
          timestamp: new Date(),
          from: this.nodeId,
          to: nodeId
        });
      }

      this.emit('messageSent', nodeId, message);
      logger.debug(`Message sent to node ${nodeId}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to send message to node ${nodeId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Broadcast message to all connected nodes
   */
  broadcastMessage(message: any): number {
    let sentCount = 0;
    for (const nodeId of this.connections.keys()) {
      if (this.sendMessage(nodeId, message)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * Simulate receiving a message
   */
  simulateMessageReceived(fromNodeId: string, message: any): void {
    try {
      // Simulate message decryption
      const decryptedMessage = this.isEncrypted ? this.decryptMessage(message) : message;
      
      this.emit('messageReceived', fromNodeId, decryptedMessage);
      logger.debug(`Message received from node ${fromNodeId}`);
    } catch (error) {
      logger.error(`Failed to process message from ${fromNodeId}: ${error.message}`);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(nodeId: string): ConnectionStatus {
    const connection = this.connections.get(nodeId);
    return connection ? connection.status : 'disconnected';
  }

  /**
   * Get all connected nodes
   */
  getConnectedNodes(): string[] {
    return Array.from(this.connections.keys()).filter(
      nodeId => this.connections.get(nodeId)?.status === 'connected'
    );
  }

  /**
   * Get connection info
   */
  getConnectionInfo(nodeId: string): Connection | undefined {
    return this.connections.get(nodeId);
  }

  /**
   * Send heartbeat to all connected nodes
   */
  sendHeartbeat(): void {
    const heartbeat = {
      type: 'HEARTBEAT',
      timestamp: new Date().toISOString(),
      nodeId: this.nodeId
    };

    this.broadcastMessage(heartbeat);
  }

  /**
   * Process heartbeat response
   */
  processHeartbeat(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      connection.lastHeartbeat = new Date();
      connection.status = 'connected';
    }
  }

  /**
   * Check for inactive connections
   */
  checkInactiveConnections(timeoutMs: number = 60000): string[] {
    const now = new Date();
    const inactiveNodes: string[] = [];

    for (const [nodeId, connection] of this.connections) {
      const timeSinceLastHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > timeoutMs) {
        inactiveNodes.push(nodeId);
        connection.status = 'inactive';
      }
    }

    return inactiveNodes;
  }

  /**
   * Simple message encryption (simulation)
   */
  private encryptMessage(message: any): any {
    // In production, this would use proper encryption algorithms
    return {
      ...message,
      encrypted: true,
      checksum: this.calculateChecksum(JSON.stringify(message))
    };
  }

  /**
   * Simple message decryption (simulation)
   */
  private decryptMessage(encryptedMessage: any): any {
    // In production, this would use proper decryption algorithms
    if (!encryptedMessage.encrypted) {
      return encryptedMessage;
    }

    const { encrypted, checksum, ...message } = encryptedMessage;
    const calculatedChecksum = this.calculateChecksum(JSON.stringify(message));
    
    if (checksum !== calculatedChecksum) {
      throw new Error('Message integrity check failed');
    }

    return message;
  }

  /**
   * Simple checksum calculation
   */
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get transport statistics
   */
  getStatistics(): TransportStatistics {
    const totalConnections = this.connections.size;
    const activeConnections = this.getConnectedNodes().length;
    let totalMessages = 0;

    for (const connection of this.connections.values()) {
      totalMessages += connection.messageCount;
    }

    return {
      nodeId: this.nodeId,
      totalConnections,
      activeConnections,
      totalMessages,
      encryptionEnabled: this.isEncrypted
    };
  }

  /**
   * Cleanup all connections
   */
  cleanup(): void {
    for (const nodeId of this.connections.keys()) {
      this.disconnectFromNode(nodeId);
    }
    
    // Explicitly clear all maps and buffers
    this.connections.clear();
    this.messageQueue.forEach(queue => {
      queue.length = 0; // Clear array content
    });
    this.messageQueue.clear();
    
    logger.info(`Secure transport for node ${this.nodeId} cleaned up and buffers released`);
  }
}

/**
 * Connection interface
 */
interface Connection {
  nodeId: string;
  address: string;
  port: number;
  status: ConnectionStatus;
  lastHeartbeat: Date;
  messageCount: number;
}

/**
 * Connection status enum
 */
type ConnectionStatus = 'connected' | 'disconnected' | 'inactive' | 'error';

/**
 * Transport statistics interface
 */
interface TransportStatistics {
  nodeId: string;
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  encryptionEnabled: boolean;
}

/**
 * Message interface for MPC communication
 */
export interface MPCMessage {
  type: string;
  sessionId?: string;
  from: string;
  to?: string;
  timestamp: string;
  payload: any;
}

/**
 * Message types for MPC communication
 */
export enum MPCMessageType {
  SESSION_INIT = 'SESSION_INIT',
  SESSION_JOIN = 'SESSION_JOIN',
  SESSION_LEAVE = 'SESSION_LEAVE',
  SHARE_DISTRIBUTION = 'SHARE_DISTRIBUTION',
  SHARE_ACK = 'SHARE_ACK',
  COMPUTATION_REQUEST = 'COMPUTATION_REQUEST',
  COMPUTATION_RESPONSE = 'COMPUTATION_RESPONSE',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_RESPONSE = 'HEARTBEAT_RESPONSE',
  ERROR = 'ERROR'
}
