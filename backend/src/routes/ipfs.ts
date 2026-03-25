import express, { Request, Response } from 'express';
import ipfsService from '../services/ipfsService';
import { body, param, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { EncryptedBlobStorageAdapter, SimpleKeyManager } from '@stellar/shared';

const router = express.Router();

// Initialize encrypted storage adapter and key manager
const keyManager = new SimpleKeyManager();
const storageAdapter = new EncryptedBlobStorageAdapter(
  {
    nodeUrl: process.env.IPFS_NODE_URL || 'http://localhost:5001',
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretKey: process.env.PINATA_SECRET_KEY,
    timeout: parseInt(process.env.IPFS_TIMEOUT || '30000'),
  },
  keyManager
);

/**
 * POST /api/ipfs/upload
 * Upload and pin a file to IPFS
 */
router.post('/upload', [
  body('fileName').notEmpty().withMessage('File name is required'),
  body('encrypted').optional().isBoolean(),
  body('version').optional().isInt({ min: 0 }),
  body('uploader').optional().isString(),
  body('decryptionKeyHash').optional().isString()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { fileName, encrypted, version, uploader, decryptionKeyHash } = req.body;
    
    const result = await ipfsService.uploadAndPinFile(req.file.buffer, fileName, {
      encrypted: encrypted || false,
      version: version ? parseInt(version) : 1,
      uploader,
      decryptionKeyHash
    });

    res.json({
      success: true,
      cid: result.cid,
      size: result.size,
      gatewayUrl: ipfsService.getGatewayUrl(result.cid)
    });
  } catch (error) {
    logger.error('Error in IPFS upload:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /api/ipfs/pin/:cid
 * Pin an existing CID to Pinata
 */
router.post('/pin/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;
    const { fileName } = req.body;

    const result = await ipfsService.pinToPinata(cid, fileName);

    res.json({
      success: true,
      pinData: result,
      gatewayUrl: ipfsService.getGatewayUrl(cid)
    });
  } catch (error) {
    logger.error('Error pinning CID:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/ipfs/availability/:cid
 * Check data availability for a CID
 */
router.get('/availability/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;

    const availabilityRecord = await ipfsService.createDataAvailabilityRecord(cid);
    const pinInfo = await ipfsService.getPinInfo(cid);
    const filecoinDeals = await ipfsService.getFilecoinDeals(cid);

    res.json({
      success: true,
      availability: availabilityRecord,
      pinInfo,
      filecoinDeals,
      gatewayUrl: ipfsService.getGatewayUrl(cid)
    });
  } catch (error) {
    logger.error('Error checking availability:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/ipfs/retrieve/:cid
 * Retrieve file from IPFS
 */
router.get('/retrieve/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;

    // Check availability first
    const isAvailable = await ipfsService.checkAvailability(cid);
    if (!isAvailable) {
      return res.status(404).json({ error: 'CID not available on IPFS' });
    }

    const fileBuffer = await ipfsService.retrieveFile(cid);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${cid}"`
    });

    res.send(fileBuffer);
  } catch (error) {
    logger.error('Error retrieving file:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /api/ipfs/batch-pin
 * Pin multiple CIDs at once
 */
router.post('/batch-pin', [
  body('cids').isArray({ min: 1 }).withMessage('CIDs array is required'),
  body('cids.*').notEmpty().withMessage('Each CID must be non-empty')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cids } = req.body;

    const results = await ipfsService.batchPin(cids);

    res.json({
      success: true,
      pinnedCount: results.length,
      results: results.map(result => ({
        cid: result.ipfsHash,
        size: result.pinSize,
        timestamp: result.timestamp
      }))
    });
  } catch (error) {
    logger.error('Error in batch pinning:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * DELETE /api/ipfs/unpin/:cid
 * Unpin a CID from Pinata
 */
router.delete('/unpin/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;

    await ipfsService.unpinFromPinata(cid);

    res.json({
      success: true,
      message: `CID ${cid} unpinned successfully`
    });
  } catch (error) {
    logger.error('Error unpinning CID:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/ipfs/deals/:cid
 * Get Filecoin deals for a CID
 */
router.get('/deals/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;

    const deals = await ipfsService.getFilecoinDeals(cid);

    res.json({
      success: true,
      cid,
      deals,
      dealCount: deals.length
    });
  } catch (error) {
    logger.error('Error getting Filecoin deals:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /api/ipfs/verify-key
 * Verify decryption key against stored hash
 */
router.post('/verify-key', [
  body('decryptionKey').notEmpty().withMessage('Decryption key is required'),
  body('keyHash').notEmpty().withMessage('Key hash is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { decryptionKey, keyHash } = req.body;

    const isValid = ipfsService.verifyDecryptionKey(decryptionKey, keyHash);

    res.json({
      success: true,
      valid: isValid
    });
  } catch (error) {
    logger.error('Error verifying decryption key:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/ipfs/gateway/:cid
 * Get gateway URL for a CID
 */
router.get('/gateway/:cid', [
  param('cid').notEmpty().withMessage('CID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;

    const gatewayUrl = ipfsService.getGatewayUrl(cid);

    res.json({
      success: true,
      cid,
      gatewayUrl
    });
  } catch (error) {
    logger.error('Error getting gateway URL:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ============================================================================
// ENCRYPTED BLOB STORAGE ROUTES
// ============================================================================

/**
 * POST /api/ipfs/encrypted/upload
 * Upload and encrypt data to IPFS/Filecoin
 */
router.post('/encrypted/upload', [
  body('datasetId').notEmpty().withMessage('Dataset ID is required'),
  body('data').notEmpty().withMessage('Data is required'),
  body('encryptionKeyId').optional().isString(),
  body('storeOnLedger').optional().isBoolean(),
  body('metadata').optional().isObject()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { datasetId, data, encryptionKeyId, storeOnLedger = true, metadata } = req.body;
    
    logger.info(`Encrypting and uploading data for dataset: ${datasetId}`);
    
    const result = await storageAdapter.uploadEncrypted(
      Buffer.from(data, 'base64'),
      {
        datasetId,
        encryptionKeyId,
        storeOnLedger,
        metadata
      }
    );
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Data encrypted and uploaded successfully'
    });
  } catch (error) {
    logger.error('Failed to upload encrypted data:', error);
    res.status(500).json({ 
      error: 'Failed to upload encrypted data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ipfs/encrypted/download/:cid
 * Download and decrypt data from IPFS/Filecoin
 */
router.get('/encrypted/download/:cid', [
  param('cid').notEmpty().withMessage('CID is required'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;
    const { encryptionKeyId, validateIntegrity = true } = req.query;
    
    if (!encryptionKeyId) {
      return res.status(400).json({ error: 'Encryption key ID is required' });
    }
    
    logger.info(`Downloading and decrypting data for CID: ${cid}`);
    
    const result = await storageAdapter.downloadEncrypted(
      cid,
      encryptionKeyId as string,
      validateIntegrity === 'true'
    );
    
    res.json({
      success: true,
      data: {
        data: result.data.toString('base64'),
        integrity: result.integrity,
        metadata: result.metadata
      },
      message: 'Data downloaded and decrypted successfully'
    });
  } catch (error) {
    logger.error('Failed to download encrypted data:', error);
    res.status(500).json({ 
      error: 'Failed to download encrypted data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ipfs/encrypted/stream/:cid
 * Stream decryption for large files
 */
router.get('/encrypted/stream/:cid', [
  param('cid').notEmpty().withMessage('CID is required'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;
    const { encryptionKeyId, chunkSize = 1024 * 1024 } = req.query;
    
    if (!encryptionKeyId) {
      return res.status(400).json({ error: 'Encryption key ID is required' });
    }
    
    logger.info(`Streaming decryption for CID: ${cid}`);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    const stream = await storageAdapter.streamDecryption(
      cid,
      encryptionKeyId as string,
      parseInt(chunkSize as string)
    );
    
    for await (const chunk of stream) {
      res.write(chunk);
    }
    
    res.end();
  } catch (error) {
    logger.error('Failed to stream encrypted data:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to stream encrypted data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * POST /api/ipfs/encrypted/rotate/:datasetId
 * Rotate CID for updated dataset
 */
router.post('/encrypted/rotate/:datasetId', [
  param('datasetId').notEmpty().withMessage('Dataset ID is required'),
  body('data').notEmpty().withMessage('Data is required'),
  body('encryptionKeyId').optional().isString(),
  body('storeOnLedger').optional().isBoolean(),
  body('metadata').optional().isObject()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { datasetId } = req.params;
    const { data, encryptionKeyId, storeOnLedger = true, metadata } = req.body;
    
    logger.info(`Rotating CID for dataset: ${datasetId}`);
    
    const result = await storageAdapter.rotateCID(
      datasetId,
      Buffer.from(data, 'base64'),
      {
        encryptionKeyId,
        storeOnLedger,
        metadata
      }
    );
    
    res.json({
      success: true,
      data: result,
      message: 'CID rotated successfully'
    });
  } catch (error) {
    logger.error('Failed to rotate CID:', error);
    res.status(500).json({ 
      error: 'Failed to rotate CID',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ipfs/encrypted/versions/:datasetId
 * Get all versions for a dataset
 */
router.get('/encrypted/versions/:datasetId', [
  param('datasetId').notEmpty().withMessage('Dataset ID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { datasetId } = req.params;
    
    const versions = storageAdapter.getVersions(datasetId);
    
    res.json({
      success: true,
      data: versions,
      message: 'Versions retrieved successfully'
    });
  } catch (error) {
    logger.error('Failed to get versions:', error);
    res.status(500).json({ 
      error: 'Failed to get versions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ipfs/encrypted/key/generate
 * Generate new encryption key
 */
router.post('/encrypted/key/generate', [
  body('keyId').notEmpty().withMessage('Key ID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { keyId } = req.body;
    
    const key = keyManager.generateKey();
    await keyManager.storeKey(keyId, key);
    
    logger.info(`Generated new encryption key: ${keyId}`);
    
    res.json({
      success: true,
      data: { keyId },
      message: 'Encryption key generated successfully'
    });
  } catch (error) {
    logger.error('Failed to generate key:', error);
    res.status(500).json({ 
      error: 'Failed to generate key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ipfs/encrypted/key/rotate/:keyId
 * Rotate encryption key
 */
router.post('/encrypted/key/rotate/:keyId', [
  param('keyId').notEmpty().withMessage('Key ID is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { keyId } = req.params;
    
    const newKey = await keyManager.rotateKey(keyId);
    
    logger.info(`Rotated encryption key: ${keyId}`);
    
    res.json({
      success: true,
      data: { keyId },
      message: 'Encryption key rotated successfully'
    });
  } catch (error) {
    logger.error('Failed to rotate key:', error);
    res.status(500).json({ 
      error: 'Failed to rotate key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ipfs/encrypted/integrity/verify/:cid
 * Verify data integrity for a CID
 */
router.get('/encrypted/integrity/verify/:cid', [
  param('cid').notEmpty().withMessage('CID is required'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cid } = req.params;
    const { expectedHash } = req.query;
    
    if (!expectedHash) {
      return res.status(400).json({ error: 'Expected hash is required' });
    }
    
    // Download data from IPFS
    const encryptedData = await (storageAdapter as any).downloadFromIPFS(cid);
    
    // Verify integrity
    const crypto = require('crypto');
    const actualHash = crypto.createHash('sha256').update(encryptedData).digest('hex');
    const isValid = actualHash === expectedHash;
    
    res.json({
      success: true,
      data: {
        cid,
        expectedHash: expectedHash as string,
        actualHash,
        isValid
      },
      message: 'Integrity verification completed'
    });
  } catch (error) {
    logger.error('Failed to verify integrity:', error);
    res.status(500).json({ 
      error: 'Failed to verify integrity',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
