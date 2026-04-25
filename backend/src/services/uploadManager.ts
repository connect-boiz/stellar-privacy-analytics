import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { Server as SocketIOServer } from 'socket.io';

export interface UploadProgress {
  uploadId: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  timeRemaining: number; // seconds
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
  chunksCompleted: number;
  totalChunks: number;
  startTime: number;
  lastUpdateTime: number;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ChunkData {
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkData: Buffer;
  chunkIndex: number;
  totalChunks: number;
}

export class UploadManager extends EventEmitter {
  public readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  private uploads: Map<string, UploadProgress> = new Map();
  private io: SocketIOServer | null = null;
  private uploadTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.setupCleanupInterval();
  }

  setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  initializeUpload(fileName: string, fileSize: number): string {
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    
    const progress: UploadProgress = {
      uploadId,
      fileName,
      fileSize,
      uploadedBytes: 0,
      percentage: 0,
      speed: 0,
      timeRemaining: 0,
      status: 'pending',
      chunksCompleted: 0,
      totalChunks,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      networkQuality: 'excellent'
    };

    this.uploads.set(uploadId, progress);
    logger.info(`Upload initialized: ${uploadId} for file: ${fileName} (${fileSize} bytes)`);
    
    return uploadId;
  }

  async processChunk(chunkData: ChunkData): Promise<UploadProgress> {
    const upload = this.uploads.get(chunkData.uploadId);
    
    if (!upload) {
      throw new Error(`Upload not found: ${chunkData.uploadId}`);
    }

    if (upload.status === 'cancelled') {
      throw new Error('Upload has been cancelled');
    }

    if (upload.status === 'paused') {
      throw new Error('Upload is paused');
    }

    // Update status to uploading if this is the first chunk
    if (upload.status === 'pending') {
      upload.status = 'uploading';
      upload.startTime = Date.now();
    }

    // Simulate processing the chunk (in real implementation, this would save to storage)
    await this.simulateChunkProcessing(chunkData);

    // Update progress
    upload.uploadedBytes += chunkData.chunkData.length;
    upload.chunksCompleted = chunkData.chunkIndex + 1;
    upload.percentage = Math.round((upload.uploadedBytes / upload.fileSize) * 100);
    
    // Calculate speed and time remaining
    const currentTime = Date.now();
    const timeDiff = (currentTime - upload.lastUpdateTime) / 1000; // seconds
    upload.speed = chunkData.chunkData.length / timeDiff;
    upload.lastUpdateTime = currentTime;
    
    const remainingBytes = upload.fileSize - upload.uploadedBytes;
    upload.timeRemaining = upload.speed > 0 ? remainingBytes / upload.speed : 0;
    
    // Determine network quality based on speed
    upload.networkQuality = this.calculateNetworkQuality(upload.speed);
    
    // Check if upload is complete
    if (upload.chunksCompleted >= upload.totalChunks || upload.uploadedBytes >= upload.fileSize) {
      upload.status = 'completed';
      upload.percentage = 100;
      upload.timeRemaining = 0;
      this.emit('upload-complete', upload);
      logger.info(`Upload completed: ${upload.uploadId}`);
    }

    // Broadcast progress update
    this.broadcastProgress(upload);
    
    return upload;
  }

  getProgress(uploadId: string): UploadProgress | null {
    return this.uploads.get(uploadId) || null;
  }

  pauseUpload(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    
    if (!upload || upload.status !== 'uploading') {
      return false;
    }

    upload.status = 'paused';
    this.broadcastProgress(upload);
    logger.info(`Upload paused: ${uploadId}`);
    
    return true;
  }

  resumeUpload(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    
    if (!upload || upload.status !== 'paused') {
      return false;
    }

    upload.status = 'uploading';
    upload.lastUpdateTime = Date.now();
    this.broadcastProgress(upload);
    logger.info(`Upload resumed: ${uploadId}`);
    
    return true;
  }

  cancelUpload(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    
    if (!upload) {
      return false;
    }

    upload.status = 'cancelled';
    this.broadcastProgress(upload);
    
    // Clean up after a delay
    this.scheduleCleanup(uploadId);
    logger.info(`Upload cancelled: ${uploadId}`);
    
    return true;
  }

  private async simulateChunkProcessing(chunkData: ChunkData): Promise<void> {
    // Simulate network latency and processing time
    return new Promise(resolve => {
      const processingTime = Math.random() * 100 + 50; // 50-150ms
      setTimeout(resolve, processingTime);
    });
  }

  private calculateNetworkQuality(speed: number): 'excellent' | 'good' | 'fair' | 'poor' {
    const mbps = speed / (1024 * 1024); // Convert to MB/s
    
    if (mbps >= 10) return 'excellent';
    if (mbps >= 5) return 'good';
    if (mbps >= 1) return 'fair';
    return 'poor';
  }

  private broadcastProgress(progress: UploadProgress) {
    if (this.io) {
      this.io.to(`upload-${progress.uploadId}`).emit('upload-progress', progress);
    }
    
    this.emit('progress-update', progress);
  }

  private scheduleCleanup(uploadId: string) {
    // Clean up cancelled uploads after 5 minutes
    const timer = setTimeout(() => {
      this.uploads.delete(uploadId);
      this.uploadTimers.delete(uploadId);
      logger.info(`Cleaned up upload: ${uploadId}`);
    }, 5 * 60 * 1000);
    
    this.uploadTimers.set(uploadId, timer);
  }

  private setupCleanupInterval() {
    // Clean up old uploads every hour
    setInterval(() => {
      const now = Date.now();
      const oldUploads: string[] = [];
      
      this.uploads.forEach((upload, uploadId) => {
        const age = now - upload.startTime;
        // Clean up uploads older than 24 hours that are completed or error
        if (age > 24 * 60 * 60 * 1000 && (upload.status === 'completed' || upload.status === 'error')) {
          oldUploads.push(uploadId);
        }
      });
      
      oldUploads.forEach(uploadId => {
        this.uploads.delete(uploadId);
        logger.info(`Cleaned up old upload: ${uploadId}`);
      });
    }, 60 * 60 * 1000); // Run every hour
  }

  // Utility method to get all active uploads
  getActiveUploads(): UploadProgress[] {
    return Array.from(this.uploads.values()).filter(
      upload => upload.status === 'uploading' || upload.status === 'paused'
    );
  }

  // Get upload statistics
  getStatistics() {
    const uploads = Array.from(this.uploads.values());
    
    return {
      total: uploads.length,
      uploading: uploads.filter(u => u.status === 'uploading').length,
      paused: uploads.filter(u => u.status === 'paused').length,
      completed: uploads.filter(u => u.status === 'completed').length,
      failed: uploads.filter(u => u.status === 'error').length,
      cancelled: uploads.filter(u => u.status === 'cancelled').length,
      averageSpeed: uploads.reduce((sum, u) => sum + u.speed, 0) / uploads.length || 0
    };
  }
}
