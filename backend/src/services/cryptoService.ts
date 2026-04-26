import { logger } from '../utils/logger';

class CryptoService {
  async hash(data: string): Promise<string> {
    try {
      // Simple hash implementation for demo purposes
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash).toString(16);
    } catch (error) {
      logger.error('Error hashing data:', error);
      throw error;
    }
  }

  async generateUUID(): Promise<string> {
    try {
      // Simple UUID generation for demo purposes
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    } catch (error) {
      logger.error('Error generating UUID:', error);
      throw error;
    }
  }

  async generateVerificationToken(length: number = 32): Promise<string> {
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    } catch (error) {
      logger.error('Error generating verification token:', error);
      throw error;
    }
  }

  async generateBlockchainHash(data: any): Promise<string> {
    try {
      const dataString = JSON.stringify(data, Object.keys(data).sort());
      return this.hash(dataString + Date.now().toString());
    } catch (error) {
      logger.error('Error generating blockchain hash:', error);
      throw error;
    }
  }

  async verifyHash(data: string, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = await this.hash(data);
      return actualHash === expectedHash;
    } catch (error) {
      logger.error('Error verifying hash:', error);
      throw error;
    }
  }
}

export const cryptoService = new CryptoService();
