import { HSMConfig } from '../services/hsmService';
import { logger } from '../utils/logger';

export class HSMConfigManager {
  private static instance: HSMConfigManager;
  private config: HSMConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): HSMConfigManager {
    if (!HSMConfigManager.instance) {
      HSMConfigManager.instance = new HSMConfigManager();
    }
    return HSMConfigManager.instance;
  }

  private loadConfig(): HSMConfig {
    const config: HSMConfig = {
      endpoint: process.env.HSM_ENDPOINT || 'https://localhost:8443',
      apiKey: process.env.HSM_API_KEY || '',
      apiSecret: process.env.HSM_API_SECRET || '',
      clientId: process.env.HSM_CLIENT_ID || 'stellar-backend',
      clientCertPath: process.env.HSM_CLIENT_CERT_PATH,
      clientKeyPath: process.env.HSM_CLIENT_KEY_PATH,
      caCertPath: process.env.HSM_CA_CERT_PATH,
      keyRotationDays: parseInt(process.env.HSM_KEY_ROTATION_DAYS || '90'),
      connectionTimeout: parseInt(process.env.HSM_CONNECTION_TIMEOUT || '10000'),
      requestTimeout: parseInt(process.env.HSM_REQUEST_TIMEOUT || '30000')
    };

    this.validateConfig(config);
    return config;
  }

  private validateConfig(config: HSMConfig): void {
    const requiredFields = ['endpoint', 'apiKey', 'apiSecret', 'clientId'];
    const missingFields = requiredFields.filter(field => !config[field as keyof HSMConfig]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required HSM configuration: ${missingFields.join(', ')}`);
    }

    if (!config.endpoint.startsWith('https://')) {
      throw new Error('HSM endpoint must use HTTPS');
    }

    if (config.keyRotationDays && config.keyRotationDays < 1) {
      throw new Error('Key rotation days must be at least 1');
    }

    // Validate certificate paths if provided
    if (config.clientCertPath && !this.fileExists(config.clientCertPath)) {
      throw new Error(`Client certificate not found: ${config.clientCertPath}`);
    }

    if (config.clientKeyPath && !this.fileExists(config.clientKeyPath)) {
      throw new Error(`Client key not found: ${config.clientKeyPath}`);
    }

    if (config.caCertPath && !this.fileExists(config.caCertPath)) {
      throw new Error(`CA certificate not found: ${config.caCertPath}`);
    }
  }

  private fileExists(path: string): boolean {
    try {
      require('fs').accessSync(path);
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): HSMConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<HSMConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig(this.config);
    logger.info('HSM configuration updated');
  }

  isProductionMode(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }
}

export default HSMConfigManager;
