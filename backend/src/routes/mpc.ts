import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { MPCNode } from '../services/mpc/mpc-node';
import { SecureTransport } from '../services/mpc/secure-transport';
import { SyncWorker } from '../services/mpc/sync-worker';
import { HeartbeatMonitor } from '../services/mpc/heartbeat-monitor';
import { TimeoutPolicy } from '../services/mpc/timeout-policy';
import { StellarLogger } from '../services/mpc/stellar-logger';
import { MPCOperation, MPCSessionStatus } from '../services/mpc/shamir-secret-sharing';
import { logger } from '../utils/logger';

const router = Router();

// Global MPC instances (in production, these would be managed properly)
let mpcNode: MPCNode | null = null;
let transport: SecureTransport | null = null;
let syncWorker: SyncWorker | null = null;
let heartbeatMonitor: HeartbeatMonitor | null = null;
let timeoutPolicy: TimeoutPolicy | null = null;
let stellarLogger: StellarLogger | null = null;

/**
 * Initialize MPC services
 */
function initializeMPCServices(): void {
  if (!mpcNode) {
    const nodeId = process.env.MPC_NODE_ID || 'node-1';
    const threshold = parseInt(process.env.MPC_THRESHOLD || '2');
    const totalShares = parseInt(process.env.MPC_TOTAL_SHARES || '3');
    
    mpcNode = new MPCNode(nodeId, threshold, totalShares);
    transport = new SecureTransport(nodeId);
    syncWorker = new SyncWorker(mpcNode, transport);
    heartbeatMonitor = new HeartbeatMonitor(nodeId);
    timeoutPolicy = new TimeoutPolicy(nodeId);
    
    // Initialize Stellar logger
    stellarLogger = new StellarLogger({
      stellarServer: process.env.STELLAR_SERVER || 'https://horizon-testnet.stellar.org',
      networkPassphrase: process.env.STELLAR_NETWORK || 'Test SDF Network ; September 2015',
      masterKeypair: null, // In production, this would be a real keypair
      enabled: process.env.STELLAR_LOGGING !== 'false'
    });
    
    logger.info('MPC services initialized');
  }
}

/**
 * Middleware to initialize MPC services
 */
router.use((req, res, next) => {
  initializeMPCServices();
  next();
});

/**
 * POST /api/v1/mpc/session/init
 * Initialize a new MPC session
 */
router.post('/session/init', [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('participants').isArray({ min: 2 }).withMessage('At least 2 participants required'),
  body('operation').isIn(['SUM', 'AVG', 'COUNT']).withMessage('Invalid operation'),
  body('threshold').optional().isInt({ min: 2 }).withMessage('Threshold must be at least 2')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, participants, operation, threshold } = req.body;
    
    // Initialize session
    const session = await mpcNode!.initializeSession(sessionId, participants, operation as MPCOperation);
    
    // Log to Stellar
    let stellarTxId = '';
    try {
      stellarTxId = await stellarLogger!.logSessionStart(sessionId, participants, operation);
    } catch (stellarError) {
      logger.warn(`Failed to log to Stellar: ${stellarError.message}`);
    }
    
    res.status(201).json({
      success: true,
      session: {
        id: session.id,
        participants: session.participants,
        operation: session.operation,
        threshold: session.threshold,
        status: session.status,
        createdAt: session.createdAt,
        stellarTransactionId: stellarTxId
      }
    });
    
    logger.info(`MPC session initialized: ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to initialize MPC session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to initialize session',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/mpc/session/:sessionId/join
 * Join an existing MPC session
 */
router.post('/session/:sessionId/join', [
  body('initiatorId').notEmpty().withMessage('Initiator ID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;
    const { initiatorId } = req.body;
    
    await mpcNode!.joinSession(sessionId, initiatorId);
    
    // Log participant event
    try {
      await stellarLogger!.logParticipantEvent(sessionId, mpcNode!['nodeId'], 'join');
    } catch (stellarError) {
      logger.warn(`Failed to log to Stellar: ${stellarError.message}`);
    }
    
    res.json({
      success: true,
      message: `Joined session ${sessionId}`
    });
    
    logger.info(`Node joined MPC session: ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to join MPC session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to join session',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/mpc/session/:sessionId/data
 * Submit data for MPC computation
 */
router.post('/session/:sessionId/data', [
  body('data').notEmpty().withMessage('Data is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;
    const { data } = req.body;
    
    // Process data and create shares
    const shares = await mpcNode!.processData(sessionId, data);
    
    // Distribute shares to other participants
    await mpcNode!.distributeShares(sessionId, shares);
    
    res.json({
      success: true,
      sharesCreated: shares.length,
      message: 'Data processed and shares distributed'
    });
    
    logger.info(`Data processed for MPC session: ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to process data for MPC session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to process data',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/mpc/session/:sessionId
 * Get session information
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = mpcNode!.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        sessionId
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session.id,
        participants: session.participants,
        operation: session.operation,
        threshold: session.threshold,
        status: session.status,
        createdAt: session.createdAt,
        hasResult: !!session.result
      }
    });
  } catch (error) {
    logger.error(`Failed to get MPC session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/mpc/sessions
 * Get all MPC sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = mpcNode!.getAllSessions();
    
    res.json({
      success: true,
      sessions: sessions.map(session => ({
        id: session.id,
        participants: session.participants,
        operation: session.operation,
        threshold: session.threshold,
        status: session.status,
        createdAt: session.createdAt,
        hasResult: !!session.result
      })),
      total: sessions.length
    });
  } catch (error) {
    logger.error(`Failed to get MPC sessions: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/mpc/connect
 * Connect to another MPC node
 */
router.post('/connect', [
  body('nodeId').notEmpty().withMessage('Node ID is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('port').isInt({ min: 1, max: 65535 }).withMessage('Invalid port')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { nodeId, address, port } = req.body;
    
    await transport!.connectToNode(nodeId, address, port);
    
    // Start heartbeat monitoring for this node
    heartbeatMonitor!.addParticipant(nodeId);
    
    res.json({
      success: true,
      message: `Connected to node ${nodeId}`
    });
    
    logger.info(`Connected to MPC node: ${nodeId}`);
  } catch (error) {
    logger.error(`Failed to connect to MPC node: ${error.message}`);
    res.status(500).json({
      error: 'Failed to connect to node',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/mpc/nodes
 * Get connected nodes
 */
router.get('/nodes', async (req: Request, res: Response) => {
  try {
    const connectedNodes = transport!.getConnectedNodes();
    const nodeStatuses = connectedNodes.map(nodeId => ({
      nodeId,
      status: transport!.getConnectionStatus(nodeId),
      heartbeat: heartbeatMonitor!.getParticipantStatus(nodeId)
    }));
    
    res.json({
      success: true,
      nodes: nodeStatuses,
      total: connectedNodes.length
    });
  } catch (error) {
    logger.error(`Failed to get connected nodes: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get nodes',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/mpc/status
 * Get MPC system status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = {
      nodeId: mpcNode!['nodeId'],
      sessions: {
        total: mpcNode!.getAllSessions().length,
        active: mpcNode!.getAllSessions().filter(s => 
          s.status !== MPCSessionStatus.COMPLETED && 
          s.status !== MPCSessionStatus.FAILED
        ).length
      },
      connections: {
        total: transport!.getConnectedNodes().length,
        nodes: transport!.getConnectedNodes()
      },
      heartbeat: heartbeatMonitor!.getStatistics(),
      timeouts: timeoutPolicy!.getStatistics(),
      sync: syncWorker!.getSyncStatus(),
      stellar: stellarLogger!.getStatus()
    };
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error(`Failed to get MPC status: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/mpc/heartbeat
 * Send heartbeat to all connected nodes
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    transport!.sendHeartbeat();
    
    res.json({
      success: true,
      message: 'Heartbeat sent'
    });
  } catch (error) {
    logger.error(`Failed to send heartbeat: ${error.message}`);
    res.status(500).json({
      error: 'Failed to send heartbeat',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/mpc/transaction/:transactionId
 * Get Stellar transaction details
 */
router.get('/transaction/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const details = await stellarLogger!.getTransactionDetails(transactionId);
    const verified = await stellarLogger!.verifyTransaction(transactionId);
    
    res.json({
      success: true,
      transaction: {
        ...details,
        verified
      }
    });
  } catch (error) {
    logger.error(`Failed to get transaction details: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get transaction details',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/mpc/session/:sessionId
 * Cancel/delete an MPC session
 */
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = mpcNode!.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        sessionId
      });
    }
    
    // Log session cancellation
    try {
      await stellarLogger!.logSessionFailure(sessionId, 'Session cancelled by user', session.status);
    } catch (stellarError) {
      logger.warn(`Failed to log to Stellar: ${stellarError.message}`);
    }
    
    // Clear session-related timeouts
    timeoutPolicy!.clearSessionTimeouts(sessionId);
    
    // In a real implementation, we would properly clean up the session
    // For now, we'll just log the cancellation
    
    res.json({
      success: true,
      message: `Session ${sessionId} cancelled`
    });
    
    logger.info(`MPC session cancelled: ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to cancel MPC session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to cancel session',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/mpc/cleanup
 * Cleanup MPC resources
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    // Cleanup all services
    syncWorker!.cleanup();
    heartbeatMonitor!.cleanup();
    timeoutPolicy!.cleanup();
    transport!.cleanup();
    mpcNode!.cleanup();
    
    // Reset global instances
    mpcNode = null;
    transport = null;
    syncWorker = null;
    heartbeatMonitor = null;
    timeoutPolicy = null;
    stellarLogger = null;
    
    res.json({
      success: true,
      message: 'MPC resources cleaned up'
    });
    
    logger.info('MPC resources cleaned up');
  } catch (error) {
    logger.error(`Failed to cleanup MPC resources: ${error.message}`);
    res.status(500).json({
      error: 'Failed to cleanup resources',
      message: error.message
    });
  }
});

export { router as mpcRoutes };
