import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';

const router = Router();
const uploadManager = new UploadManager();

// Upload data
router.post('/upload', auditMiddleware('upload_dataset', 'data_modification'), asyncHandler(async (req, res) => {
  res.status(201).json({
    datasetId: 'temp-dataset-id',
    status: 'uploaded',
    message: 'Data uploaded and encrypted successfully'
  });
}));

// Get upload progress
router.get('/upload/:uploadId/progress', asyncHandler(async (req: Request, res: Response) => {
  const { uploadId } = req.params;
  const progress = uploadManager.getProgress(uploadId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  
  return res.json(progress);
}));

// Pause upload
router.post('/upload/:uploadId/pause', asyncHandler(async (req: Request, res: Response) => {
  const { uploadId } = req.params;
  const success = uploadManager.pauseUpload(uploadId);
  
  if (!success) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  
  return res.json({ message: 'Upload paused' });
}));

// Resume upload
router.post('/upload/:uploadId/resume', asyncHandler(async (req: Request, res: Response) => {
  const { uploadId } = req.params;
  const success = uploadManager.resumeUpload(uploadId);
  
  if (!success) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  
  return res.json({ message: 'Upload resumed' });
}));

// Cancel upload
router.delete('/upload/:uploadId', asyncHandler(async (req: Request, res: Response) => {
  const { uploadId } = req.params;
  const success = uploadManager.cancelUpload(uploadId);
  
  if (!success) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  
  return res.json({ message: 'Upload cancelled' });
}));

// Get datasets
router.get('/', auditMiddleware('list_datasets', 'data_access'), asyncHandler(async (req, res) => {
  res.json({
    datasets: [],
    message: 'Datasets retrieved successfully'
  });
}));

// Get dataset by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    dataset: {
      id: req.params.id,
      name: 'Sample Dataset',
      encrypted: true
    }
  });
}));

// Delete dataset
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    message: 'Dataset deleted successfully'
  });
}));

export { router as dataRoutes };

// Initialize WebSocket server for upload progress
export function initializeUploadSocket(server: any): any {
  const io = require('socket.io')(server, {
    cors: {
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    }
  });

  io.on('connection', (socket: any) => {
    console.log('Upload client connected:', socket.id);

    socket.on('join-upload', (uploadId: string) => {
      socket.join(`upload-${uploadId}`);
      console.log(`Client ${socket.id} joined upload room: ${uploadId}`);
    });

    socket.on('disconnect', () => {
      console.log('Upload client disconnected:', socket.id);
    });
  });

  // Set the socket.io instance in the upload manager
  uploadManager.setSocketIO(io);

  return io;
}
