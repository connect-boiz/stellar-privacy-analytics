import { create } from 'ipfs-http-client';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import logger from '../utils/logger';

export interface IPFSDataset {
  cid: string;
  datasetHash: string;
  uploader: string;
  timestamp: number;
  sizeBytes: number;
  encrypted: boolean;
  version: number;
  pinned: boolean;
  decryptionKeyHash?: string;
}

export interface DataAvailability {
  cid: string;
  available: boolean;
  lastChecked: number;
  pinCount: number;
  filecoinDealId?: number;
}

export interface PinataResponse {
  ipfsHash: string;
  pinSize: number;
  timestamp: string;
}

export interface FilecoinDeal {
  dealId: number;
  status: string;
  pieceCid: string;
  provider: string;
  startEpoch: number;
  endEpoch: number;
}

class IPFSService {
  private ipfsClient: any;
  private pinataApiKey: string;
  private pinataSecretKey: string;
  private pinataBaseUrl: string;

  constructor() {
    // Initialize IPFS client (local or remote)
    this.ipfsClient = create({
      url: process.env.IPFS_GATEWAY_URL || 'http://localhost:5001',
    });

    // Pinata configuration
    this.pinataApiKey = process.env.PINATA_API_KEY || '';
    this.pinataSecretKey = process.env.PINATA_SECRET_KEY || '';
    this.pinataBaseUrl = 'https://api.pinata.cloud';

    if (!this.pinataApiKey || !this.pinataSecretKey) {
      logger.warn('Pinata credentials not configured. IPFS pinning will not work.');
    }
  }

  /**
   * Upload file to IPFS and automatically pin it to Pinata
   */
  async uploadAndPinFile(
    file: Buffer,
    fileName: string,
    options: {
      encrypted?: boolean;
      version?: number;
      uploader?: string;
      decryptionKeyHash?: string;
    } = {}
  ): Promise<{ cid: string; size: number }> {
    try {
      // Upload to local IPFS node
      const result = await this.ipfsClient.add(file, {
        pin: false, // We'll pin via Pinata instead
      });

      const cid = result.cid.toString();
      const size = result.size;

      // Pin to Pinata for persistence
      await this.pinToPinata(cid, fileName);

      logger.info(`File uploaded to IPFS: ${cid} (${size} bytes)`);
      return { cid, size };
    } catch (error) {
      logger.error('Error uploading file to IPFS:', error);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  /**
   * Pin a CID to Pinata for persistence
   */
  async pinToPinata(cid: string, fileName?: string): Promise<PinataResponse> {
    try {
      const url = `${this.pinataBaseUrl}/pinning/pinFileToIPFS`;
      
      const formData = new FormData();
      
      // If we have the file content, upload it directly
      if (fileName) {
        // For direct file upload, we would need the file buffer
        // This is a simplified version that pins by CID
      }

      // Pin by hash
      const pinByHashUrl = `${this.pinataBaseUrl}/pinning/pinByHash`;
      const pinByHashResponse = await axios.post(
        pinByHashUrl,
        {
          hashToPin: cid,
          pinataMetadata: {
            name: fileName || `dataset-${cid}`,
            keyvalues: {
              timestamp: Date.now().toString(),
              source: 'stellar-privacy-analytics'
            }
          }
        },
        {
          headers: {
            'pinata_api_key': this.pinataApiKey,
            'pinata_secret_api_key': this.pinataSecretKey,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`CID pinned to Pinata: ${cid}`);
      return pinByHashResponse.data;
    } catch (error) {
      logger.error('Error pinning to Pinata:', error);
      throw new Error(`Pinata pinning failed: ${error.message}`);
    }
  }

  /**
   * Check if a CID is available on IPFS
   */
  async checkAvailability(cid: string): Promise<boolean> {
    try {
      // Try to fetch the object from IPFS
      const stat = await this.ipfsClient.object.stat(cid);
      return !!stat;
    } catch (error) {
      logger.warn(`CID ${cid} not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Get pin information from Pinata
   */
  async getPinInfo(cid: string): Promise<any> {
    try {
      const url = `${this.pinataBaseUrl}/pinning/pinList?hashContains=${cid}`;
      const response = await axios.get(url, {
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        }
      });

      return response.data.rows?.[0] || null;
    } catch (error) {
      logger.error('Error getting pin info:', error);
      return null;
    }
  }

  /**
   * Check Filecoin deal status for a CID
   */
  async getFilecoinDeals(cid: string): Promise<FilecoinDeal[]> {
    try {
      const url = `${this.pinataBaseUrl}/data/filecoinDeals?cid=${cid}`;
      const response = await axios.get(url, {
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        }
      });

      return response.data.deals || [];
    } catch (error) {
      logger.error('Error getting Filecoin deals:', error);
      return [];
    }
  }

  /**
   * Unpin a CID from Pinata
   */
  async unpinFromPinata(cid: string): Promise<void> {
    try {
      const url = `${this.pinataBaseUrl}/pinning/unpin/${cid}`;
      await axios.delete(url, {
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        }
      });

      logger.info(`CID unpinned from Pinata: ${cid}`);
    } catch (error) {
      logger.error('Error unpinning from Pinata:', error);
      throw new Error(`Pinata unpinning failed: ${error.message}`);
    }
  }

  /**
   * Retrieve file from IPFS
   */
  async retrieveFile(cid: string): Promise<Buffer> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(cid)) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Error retrieving file from IPFS:', error);
      throw new Error(`IPFS retrieval failed: ${error.message}`);
    }
  }

  /**
   * Generate decryption key hash for secure key storage
   */
  generateDecryptionKeyHash(decryptionKey: string): string {
    return crypto.createHash('sha256').update(decryptionKey).digest('hex');
  }

  /**
   * Verify decryption key against stored hash
   */
  verifyDecryptionKey(decryptionKey: string, keyHash: string): boolean {
    const computedHash = this.generateDecryptionKeyHash(decryptionKey);
    return computedHash === keyHash;
  }

  /**
   * Create data availability record
   */
  async createDataAvailabilityRecord(
    cid: string,
    filecoinDealId?: number
  ): Promise<DataAvailability> {
    const isAvailable = await this.checkAvailability(cid);
    const pinInfo = await this.getPinInfo(cid);
    const deals = await this.getFilecoinDeals(cid);

    return {
      cid,
      available: isAvailable,
      lastChecked: Date.now(),
      pinCount: pinInfo ? 1 : 0,
      filecoinDealId: filecoinDealId || deals[0]?.dealId
    };
  }

  /**
   * Batch pin multiple CIDs
   */
  async batchPin(cids: string[]): Promise<PinataResponse[]> {
    const results = await Promise.allSettled(
      cids.map(cid => this.pinToPinata(cid))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<PinataResponse> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  /**
   * Get IPFS gateway URL for a CID
   */
  getGatewayUrl(cid: string): string {
    return `${process.env.IPFS_PUBLIC_GATEWAY || 'https://gateway.pinata.cloud'}/ipfs/${cid}`;
  }
}

export default new IPFSService();
