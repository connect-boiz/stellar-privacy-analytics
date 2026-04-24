import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';

export interface FederatedClient {
  id: string;
  endpoint: string;
  publicKey: string; // For encrypted model updates
  dataSamples: number;
  lastUpdate: Date;
  status: 'active' | 'inactive' | 'training';
}

export interface ModelUpdate {
  clientId: string;
  modelWeights: number[];
  gradientUpdates: number[];
  timestamp: Date;
  sampleCount: number;
  encryptedUpdate?: string; // Homomorphic encrypted update
  epsilon?: number; // Differential privacy budget
}

export interface FederatedConfig {
  aggregationStrategy: 'fedavg' | 'fedprox' | 'scaffold';
  minClients: number;
  maxClients: number;
  rounds: number;
  targetAccuracy: number;
  privacyBudget: number; // Epsilon for differential privacy
  noiseScale: number; // For differential privacy
  clippingBound: number; // Gradient clipping
  encryptionEnabled: boolean;
}

export interface TrainingMetrics {
  round: number;
  accuracy: number;
  loss: number;
  participatingClients: number;
  totalSamples: number;
  privacyBudgetUsed: number;
  convergenceThreshold: number;
}

export class FederatedLearningService extends EventEmitter {
  private clients: Map<string, FederatedClient> = new Map();
  private currentModel: number[] = [];
  private trainingHistory: TrainingMetrics[] = [];
  private io: SocketIOServer | null = null;
  private config: FederatedConfig;
  private isTraining: boolean = false;
  private currentRound: number = 0;

  constructor(config: Partial<FederatedConfig> = {}) {
    super();
    this.config = {
      aggregationStrategy: 'fedavg',
      minClients: 3,
      maxClients: 10,
      rounds: 100,
      targetAccuracy: 0.95,
      privacyBudget: 1.0,
      noiseScale: 0.1,
      clippingBound: 1.0,
      encryptionEnabled: true,
      ...config
    };
  }

  setSocketIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      logger.info(`ML client connected: ${socket.id}`);

      // Client registration
      socket.on('register-client', async (data: { endpoint: string; publicKey: string; dataSamples: number }) => {
        const client: FederatedClient = {
          id: socket.id,
          endpoint: data.endpoint,
          publicKey: data.publicKey,
          dataSamples: data.dataSamples,
          lastUpdate: new Date(),
          status: 'active'
        };

        this.clients.set(socket.id, client);
        logger.info(`Client registered: ${socket.id} with ${data.dataSamples} samples`);

        socket.emit('client-registered', { clientId: socket.id, config: this.config });
        
        // Notify all clients about the updated client list
        this.broadcastClientList();
      });

      // Model update from client
      socket.on('model-update', async (update: ModelUpdate) => {
        try {
          await this.processModelUpdate(update);
          socket.emit('update-received', { status: 'success' });
        } catch (error) {
          logger.error('Error processing model update:', error);
          socket.emit('update-received', { status: 'error', message: 'Failed to process update' });
        }
      });

      // Training status requests
      socket.on('get-training-status', () => {
        socket.emit('training-status', {
          isTraining: this.isTraining,
          currentRound: this.currentRound,
          config: this.config,
          metrics: this.trainingHistory
        });
      });

      socket.on('disconnect', () => {
        this.clients.delete(socket.id);
        logger.info(`Client disconnected: ${socket.id}`);
        this.broadcastClientList();
      });
    });
  }

  private broadcastClientList() {
    if (!this.io) return;

    const clientList = Array.from(this.clients.values()).map(client => ({
      id: client.id,
      dataSamples: client.dataSamples,
      status: client.status,
      lastUpdate: client.lastUpdate
    }));

    this.io.emit('clients-updated', clientList);
  }

  async startFederatedTraining(initialModel?: number[]): Promise<void> {
    if (this.isTraining) {
      throw new Error('Training is already in progress');
    }

    if (this.clients.size < this.config.minClients) {
      throw new Error(`Insufficient clients. Need at least ${this.config.minClients}, have ${this.clients.size}`);
    }

    this.isTraining = true;
    this.currentRound = 0;
    this.currentModel = initialModel || this.generateRandomModel();

    logger.info('Starting federated learning training');
    this.emit('training-started');

    try {
      for (let round = 0; round < this.config.rounds; round++) {
        this.currentRound = round;
        await this.runTrainingRound(round);

        // Check convergence
        const latestMetrics = this.trainingHistory[this.trainingHistory.length - 1];
        if (latestMetrics && latestMetrics.accuracy >= this.config.targetAccuracy) {
          logger.info(`Target accuracy reached at round ${round}`);
          break;
        }
      }

      this.isTraining = false;
      this.emit('training-completed', { finalModel: this.currentModel, history: this.trainingHistory });
      
    } catch (error) {
      this.isTraining = false;
      this.emit('training-error', error);
      throw error;
    }
  }

  private async runTrainingRound(round: number): Promise<void> {
    logger.info(`Starting training round ${round}`);

    // Select clients for this round
    const selectedClients = this.selectClients();
    
    // Send current model to selected clients
    await this.sendModelToClients(selectedClients);

    // Wait for model updates (with timeout)
    const updates = await this.collectModelUpdates(selectedClients);

    // Aggregate updates
    const aggregatedUpdate = await this.aggregateUpdates(updates);

    // Update global model
    this.currentModel = aggregatedUpdate;

    // Calculate metrics
    const metrics: TrainingMetrics = {
      round,
      accuracy: this.calculateAccuracy(),
      loss: this.calculateLoss(),
      participatingClients: updates.length,
      totalSamples: updates.reduce((sum, update) => sum + update.sampleCount, 0),
      privacyBudgetUsed: updates.reduce((sum, update) => sum + (update.epsilon || 0), 0),
      convergenceThreshold: this.calculateConvergenceThreshold()
    };

    this.trainingHistory.push(metrics);
    this.emit('round-completed', metrics);

    // Broadcast results
    if (this.io) {
      this.io.emit('round-results', {
        round,
        model: this.currentModel,
        metrics
      });
    }

    logger.info(`Round ${round} completed with ${updates.length} client updates`);
  }

  private selectClients(): FederatedClient[] {
    const activeClients = Array.from(this.clients.values()).filter(c => c.status === 'active');
    const numClients = Math.min(this.config.maxClients, activeClients.length);
    
    // Randomly select clients (in practice, this could be based on data availability, latency, etc.)
    const shuffled = activeClients.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, numClients);
  }

  private async sendModelToClients(clients: FederatedClient[]): Promise<void> {
    const modelData = {
      model: this.currentModel,
      round: this.currentRound,
      config: this.config
    };

    if (this.io) {
      clients.forEach(client => {
        this.io!.to(client.id).emit('start-training', modelData);
        client.status = 'training';
      });
    }
  }

  private async collectModelUpdates(clients: FederatedClient[]): Promise<ModelUpdate[]> {
    return new Promise((resolve, reject) => {
      const updates: ModelUpdate[] = [];
      const clientIds = new Set(clients.map(c => c.id));
      let timeout: NodeJS.Timeout;

      const checkComplete = () => {
        if (updates.length >= this.config.minClients || 
            (clientIds.size === updates.length && updates.length > 0)) {
          clearTimeout(timeout);
          resolve(updates);
        }
      };

      // Set up update listener
      if (this.io) {
        const updateHandler = (update: ModelUpdate) => {
          if (clientIds.has(update.clientId)) {
            updates.push(update);
            clientIds.delete(update.clientId);
            checkComplete();
          }
        };

        this.io.once('model-update', updateHandler);

        // Set timeout (30 seconds per round)
        timeout = setTimeout(() => {
          this.io!.off('model-update', updateHandler);
          resolve(updates); // Return whatever we have
        }, 30000);
      }
    });
  }

  private async aggregateUpdates(updates: ModelUpdate[]): Promise<number[]> {
    if (updates.length === 0) {
      return this.currentModel;
    }

    switch (this.config.aggregationStrategy) {
      case 'fedavg':
        return this.federatedAveraging(updates);
      case 'fedprox':
        return this.federatedProximal(updates);
      case 'scaffold':
        return this.scaffoldAggregation(updates);
      default:
        return this.federatedAveraging(updates);
    }
  }

  private federatedAveraging(updates: ModelUpdate[]): number[] {
    const totalSamples = updates.reduce((sum, update) => sum + update.sampleCount, 0);
    const weightedSum = new Array(this.currentModel.length).fill(0);

    updates.forEach(update => {
      const weight = update.sampleCount / totalSamples;
      update.modelWeights.forEach((weight_val, index) => {
        weightedSum[index] += weight_val * weight;
      });
    });

    return weightedSum;
  }

  private federatedProximal(updates: ModelUpdate[]): number[] {
    // FedProx adds a proximal term to prevent client drift
    const fedAvg = this.federatedAveraging(updates);
    const mu = 0.01; // Proximal term coefficient

    return fedAvg.map((weight, index) => {
      const proximalTerm = mu * (weight - this.currentModel[index]);
      return weight - proximalTerm;
    });
  }

  private scaffoldAggregation(updates: ModelUpdate[]): number[] {
    // SCAFFOLD adds control variates to reduce client drift
    const fedAvg = this.federatedAveraging(updates);
    
    // Simplified SCAFFOLD implementation
    const controlVariates = new Array(this.currentModel.length).fill(0);
    return fedAvg.map((weight, index) => {
      return weight + controlVariates[index];
    });
  }

  private async processModelUpdate(update: ModelUpdate): Promise<void> {
    // Apply differential privacy noise if enabled
    if (update.epsilon && update.epsilon > 0) {
      update.modelWeights = this.addDifferentialPrivacyNoise(update.modelWeights, update.epsilon);
    }

    // Decrypt update if encrypted
    if (update.encryptedUpdate && this.config.encryptionEnabled) {
      update.modelWeights = await this.decryptModelUpdate(update.encryptedUpdate);
    }

    // Update client status
    const client = this.clients.get(update.clientId);
    if (client) {
      client.lastUpdate = new Date();
      client.status = 'active';
    }
  }

  private addDifferentialPrivacyNoise(weights: number[], epsilon: number): number[] {
    const sensitivity = this.config.clippingBound;
    const scale = sensitivity / epsilon;
    
    return weights.map(weight => {
      const noise = this.generateLaplaceNoise(0, scale);
      return weight + noise;
    });
  }

  private generateLaplaceNoise(mean: number, scale: number): number {
    const u = Math.random() - 0.5;
    return mean - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private async decryptModelUpdate(encryptedUpdate: string): Promise<number[]> {
    // Simplified decryption - in practice, this would use homomorphic encryption
    // For now, return a mock decrypted update
    const decrypted = Buffer.from(encryptedUpdate, 'base64');
    return Array.from(decrypted).map(b => b / 255.0);
  }

  private generateRandomModel(): number[] {
    // Generate a simple neural network model (mock)
    const size = 100; // Model size
    return Array.from({ length: size }, () => Math.random() * 2 - 1);
  }

  private calculateAccuracy(): number {
    // Mock accuracy calculation
    const baseAccuracy = 0.5;
    const improvement = this.currentRound * 0.01;
    const noise = (Math.random() - 0.5) * 0.05;
    return Math.min(0.99, baseAccuracy + improvement + noise);
  }

  private calculateLoss(): number {
    // Mock loss calculation
    return Math.max(0.01, 1.0 - this.calculateAccuracy());
  }

  private calculateConvergenceThreshold(): number {
    if (this.trainingHistory.length < 2) return 1.0;
    
    const current = this.trainingHistory[this.trainingHistory.length - 1];
    const previous = this.trainingHistory[this.trainingHistory.length - 2];
    return Math.abs(current.accuracy - previous.accuracy);
  }

  // Public API methods
  getTrainingStatus(): any {
    return {
      isTraining: this.isTraining,
      currentRound: this.currentRound,
      config: this.config,
      metrics: this.trainingHistory,
      clients: Array.from(this.clients.values())
    };
  }

  async stopTraining(): Promise<void> {
    this.isTraining = false;
    this.emit('training-stopped');
    logger.info('Federated learning training stopped');
  }

  getClientMetrics(): any {
    return {
      totalClients: this.clients.size,
      activeClients: Array.from(this.clients.values()).filter(c => c.status === 'active').length,
      totalSamples: Array.from(this.clients.values()).reduce((sum, c) => sum + c.dataSamples, 0),
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        dataSamples: c.dataSamples,
        status: c.status,
        lastUpdate: c.lastUpdate
      }))
    };
  }
}
