import * as https from 'https';
import * as tls from 'tls';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

/**
 * Secure TLS 1.3 tunnel for MPC node communication
 */
export class TLSTunnel extends EventEmitter {
  private server: Server | null = null;
  private connections: Map<string, TLSSocket> = new Map();
  private nodeId: string;
  private certPath: string;
  private keyPath: string;
  private caPath: string;

  constructor(nodeId: string, certPath: string, keyPath: string, caPath?: string) {
    super();
    this.nodeId = nodeId;
    this.certPath = certPath;
    this.keyPath = keyPath;
    this.caPath = caPath || '';
  }

  /**
   * Start TLS server for incoming connections
   */
  async startServer(port: number): Promise<void> {
    try {
      // Validate certificate files exist
      if (!existsSync(this.certPath) || !existsSync(this.keyPath)) {
        throw new Error(`Certificate files not found: ${this.certPath}, ${this.keyPath}`);
      }

      const options: any = {
        key: readFileSync(this.keyPath),
        cert: readFileSync(this.certPath),
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        requestCert: true,
        rejectUnauthorized: true,
      };

      // Add CA certificate if provided
      if (this.caPath && existsSync(this.caPath)) {
        options.ca = readFileSync(this.caPath);
      }

      this.server = createServer(options, (socket) => {
        this.handleConnection(socket);
      });

      this.server.listen(port, () => {
        logger.info(`MPC TLS server listening on port ${port} for node ${this.nodeId}`);
        this.emit('serverStarted', port);
      });

      this.server.on('error', (error) => {
        logger.error(`TLS server error: ${error.message}`);
        this.emit('error', error);
      });

    } catch (error) {
      logger.error(`Failed to start TLS server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to remote MPC node
   */
  async connectToNode(remoteNodeId: string, host: string, port: number): Promise<void> {
    try {
      const options: any = {
        host,
        port,
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        cert: readFileSync(this.certPath),
        key: readFileSync(this.keyPath),
        rejectUnauthorized: true,
      };

      // Add CA certificate if provided
      if (this.caPath && existsSync(this.caPath)) {
        options.ca = readFileSync(this.caPath);
      }

      const socket = connect(options, () => {
        logger.info(`Connected to MPC node ${remoteNodeId} at ${host}:${port}`);
        this.connections.set(remoteNodeId, socket);
        this.emit('connected', remoteNodeId);
      });

      socket.on('data', (data) => {
        this.handleMessage(remoteNodeId, data);
      });

      socket.on('error', (error) => {
        logger.error(`Connection error with node ${remoteNodeId}: ${error.message}`);
        this.connections.delete(remoteNodeId);
        this.emit('disconnected', remoteNodeId);
      });

      socket.on('close', () => {
        logger.info(`Connection closed with node ${remoteNodeId}`);
        this.connections.delete(remoteNodeId);
        this.emit('disconnected', remoteNodeId);
      });

    } catch (error) {
      logger.error(`Failed to connect to node ${remoteNodeId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send message to specific node
   */
  sendMessage(nodeId: string, message: MPCMessage): boolean {
    const socket = this.connections.get(nodeId);
    if (!socket) {
      logger.warn(`No connection to node ${nodeId}`);
      return false;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(messageBuffer.length, 0);

      socket.write(Buffer.concat([lengthBuffer, messageBuffer]));
      return true;
    } catch (error) {
      logger.error(`Failed to send message to node ${nodeId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Broadcast message to all connected nodes
   */
  broadcastMessage(message: MPCMessage): number {
    let sentCount = 0;
    for (const nodeId of this.connections.keys()) {
      if (this.sendMessage(nodeId, message)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * Get list of connected nodes
   */
  getConnectedNodes(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if connected to specific node
   */
  isConnected(nodeId: string): boolean {
    return this.connections.has(nodeId);
  }

  /**
   * Disconnect from specific node
   */
  disconnect(nodeId: string): void {
    const socket = this.connections.get(nodeId);
    if (socket) {
      socket.end();
      this.connections.delete(nodeId);
    }
  }

  /**
   * Stop server and close all connections
   */
  async stop(): Promise<void> {
    // Close all connections
    for (const [nodeId, socket] of this.connections) {
      socket.end();
    }
    this.connections.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('MPC TLS server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: TLSSocket): void {
    const remoteNodeId = socket.getPeerCertificate().subject?.CN || 'unknown';

    logger.info(`Incoming connection from ${remoteNodeId}`);

    socket.on('data', (data) => {
      this.handleMessage(remoteNodeId, data);
    });

    socket.on('error', (error) => {
      logger.error(`Connection error with ${remoteNodeId}: ${error.message}`);
    });

    socket.on('close', () => {
      logger.info(`Connection closed with ${remoteNodeId}`);
      this.connections.delete(remoteNodeId);
    });

    this.connections.set(remoteNodeId, socket);
    this.emit('connected', remoteNodeId);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(nodeId: string, data: Buffer): void {
    try {
      // Handle partial messages
      if (!this.messageBuffer) {
        this.messageBuffer = data;
      } else {
        this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
      }

      while (this.messageBuffer && this.messageBuffer.length >= 4) {
        const messageLength = this.messageBuffer.readUInt32BE(0);

        if (this.messageBuffer.length < 4 + messageLength) {
          // Need more data
          break;
        }

        const messageData = this.messageBuffer.slice(4, 4 + messageLength);
        this.messageBuffer = this.messageBuffer.slice(4 + messageLength);

        try {
          const message = JSON.parse(messageData.toString()) as MPCMessage;
          this.emit('message', nodeId, message);
        } catch (parseError) {
          logger.error(`Failed to parse message from ${nodeId}: ${parseError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error handling message from ${nodeId}: ${error.message}`);
    }
  }

  private messageBuffer: Buffer | null = null;
}

/**
 * MPC Message interface
 */
export interface MPCMessage {
  type: MPCMessageType;
  sessionId: string;
  from: string;
  to?: string;
  timestamp: number;
  payload: any;
}

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

/**
 * Generate self-signed certificates for testing/development
 */
export function generateSelfSignedCert(nodeId: string, outputDir: string): void {
  const { execSync } = require('child_process');
  const path = require('path');

  const keyPath = path.join(outputDir, `${nodeId}-key.pem`);
  const certPath = path.join(outputDir, `${nodeId}-cert.pem`);

  try {
    execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=${nodeId}"`, {
      stdio: 'inherit'
    });

    logger.info(`Generated self-signed certificate for ${nodeId}`);
  } catch (error) {
    logger.error(`Failed to generate certificate for ${nodeId}: ${error.message}`);
    throw error;
  }
}
