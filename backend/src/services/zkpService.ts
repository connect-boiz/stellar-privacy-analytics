import { EventEmitter } from 'events';
import * as os from 'os';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { MemoryMonitorService } from './memoryMonitorService';

export enum ZKProofSystem {
  GROTH16 = 'Groth16',
  PLONK = 'PLONK',
  BULLETPROOFS = 'Bulletproofs'
}

export interface ZKPRequest {
  id: string;
  system: ZKProofSystem;
  inputs: any;
  circuitId: string;
  priority: number;
  timestamp: number;
}

export interface ZKPResult {
  requestId: string;
  proof: string;
  publicInputs: any;
  generationTime: number;
  system: ZKProofSystem;
}

/**
 * High-performance ZK Proof Generation Service
 */
export class ZKPService extends EventEmitter {
  private queue: ZKPRequest[] = [];
  private workerPool: Map<string, boolean> = new Map(); // workerId -> isBusy
  private maxWorkers: number = os.cpus().length;
  private proofCache: Map<string, ZKPResult> = new Map();
  private memoryMonitor: MemoryMonitorService;

  constructor(memoryMonitor: MemoryMonitorService) {
    super();
    this.memoryMonitor = memoryMonitor;
    this.initializeWorkerPool();
    
    // Listen for memory alerts to throttle proof generation
    this.memoryMonitor.on('memory-alert', (alert) => {
      if (alert.level === 'critical' || alert.level === 'emergency') {
        logger.warn('Memory critical, reducing ZKP worker pool size');
        this.maxWorkers = Math.max(1, Math.floor(os.cpus().length / 2));
      } else {
        this.maxWorkers = os.cpus().length;
      }
    });
  }

  private initializeWorkerPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.workerPool.set(`worker-${i}`, false);
    }
  }

  /**
   * Submit a ZK proof generation request
   */
  async submitRequest(request: Omit<ZKPRequest, 'timestamp' | 'id'>): Promise<string> {
    const requestId = `zkp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRequest: ZKPRequest = {
      ...request,
      id: requestId,
      timestamp: Date.now()
    };

    // Check cache
    const cacheKey = this.getCacheKey(fullRequest);
    if (this.proofCache.has(cacheKey)) {
      logger.info(`ZKP Cache hit for request ${requestId}`);
      this.emit('proofReady', requestId, this.proofCache.get(cacheKey));
      return requestId;
    }

    // Add to priority queue
    this.queue.push(fullRequest);
    this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
    
    logger.info(`ZKP Request submitted: ${requestId} (Priority: ${fullRequest.priority})`);
    
    // Try to process next in queue
    this.processQueue();
    
    return requestId;
  }

  private async processQueue() {
    if (this.queue.length === 0) return;

    // Find available worker
    let availableWorkerId: string | null = null;
    for (const [id, isBusy] of this.workerPool) {
      if (!isBusy) {
        availableWorkerId = id;
        break;
      }
    }

    if (!availableWorkerId) {
      logger.debug('No available ZKP workers, waiting...');
      return;
    }

    const request = this.queue.shift()!;
    this.workerPool.set(availableWorkerId, true);

    try {
      logger.info(`Starting proof generation for ${request.id} on ${availableWorkerId}`);
      const result = await this.generateProof(request);
      
      // Cache result
      this.proofCache.set(this.getCacheKey(request), result);
      
      this.emit('proofReady', request.id, result);
    } catch (error) {
      logger.error(`Proof generation failed for ${request.id}: ${error.message}`);
      this.emit('proofFailed', request.id, error);
    } finally {
      this.workerPool.set(availableWorkerId, false);
      this.processQueue(); // Check for more work
    }
  }

  private async generateProof(request: ZKPRequest): Promise<ZKPResult> {
    const startTime = Date.now();
    
    // Simulate complex ZK proof generation
    // In production, this would call WASM modules or native libraries (snarkjs, etc.)
    const delay = request.system === ZKProofSystem.GROTH16 ? 2000 : 
                  request.system === ZKProofSystem.PLONK ? 3500 : 5000;
    
    await new Promise(resolve => setTimeout(resolve, delay));

    return {
      requestId: request.id,
      proof: `zk_proof_${crypto.randomBytes(32).toString('hex')}`,
      publicInputs: request.inputs,
      generationTime: Date.now() - startTime,
      system: request.system
    };
  }

  private getCacheKey(request: ZKPRequest): string {
    const inputHash = crypto.createHash('sha256')
      .update(JSON.stringify(request.inputs))
      .digest('hex');
    return `${request.system}_${request.circuitId}_${inputHash}`;
  }

  /**
   * Verify a ZK proof
   */
  async verifyProof(system: ZKProofSystem, proof: string, publicInputs: any): Promise<boolean> {
    logger.info(`Verifying ${system} proof...`);
    // Simulate verification
    await new Promise(resolve => setTimeout(resolve, 200));
    return true;
  }

  getStatistics() {
    return {
      queueLength: this.queue.length,
      activeWorkers: Array.from(this.workerPool.values()).filter(v => v).length,
      totalWorkers: this.workerPool.size,
      cacheSize: this.proofCache.size
    };
  }
}
