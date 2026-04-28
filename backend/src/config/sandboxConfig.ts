import { logger } from '../utils/logger';

export interface SandboxConfig {
  enabled: boolean;
  environment: 'mainnet' | 'testnet' | 'sandbox';
  stellarNetwork: {
    rpcUrl: string;
    networkPassphrase: string;
    horizonUrl: string;
  };
  database: {
    schemaPrefix: string;
    isolationEnabled: boolean;
  };
  features: {
    mockPayments: boolean;
    failureSimulation: boolean;
    zeroValueTokens: boolean;
    enhancedLogging: boolean;
  };
  mockData: {
    subscriptionBilledEvents: boolean;
    gracePeriods: boolean;
    dunningProcesses: boolean;
    webhookDelays: boolean;
  };
}

class SandboxConfiguration {
  private config: SandboxConfig;

  constructor() {
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): SandboxConfig {
    const isSandboxEnabled = process.env.SANDBOX_ENABLED === 'true';
    const environment = (process.env.STELLAR_ENVIRONMENT || 'mainnet') as 'mainnet' | 'testnet' | 'sandbox';
    
    logger.info('Loading sandbox configuration', { 
      sandboxEnabled: isSandboxEnabled, 
      environment 
    });

    const baseConfig: SandboxConfig = {
      enabled: isSandboxEnabled,
      environment,
      stellarNetwork: this.getStellarNetworkConfig(environment),
      database: {
        schemaPrefix: isSandboxEnabled ? 'sandbox_' : '',
        isolationEnabled: isSandboxEnabled
      },
      features: {
        mockPayments: isSandboxEnabled,
        failureSimulation: isSandboxEnabled,
        zeroValueTokens: isSandboxEnabled,
        enhancedLogging: isSandboxEnabled || process.env.NODE_ENV === 'development'
      },
      mockData: {
        subscriptionBilledEvents: isSandboxEnabled,
        gracePeriods: isSandboxEnabled,
        dunningProcesses: isSandboxEnabled,
        webhookDelays: isSandboxEnabled
      }
    };

    logger.info('Sandbox configuration loaded', { 
      ...baseConfig,
      stellarNetwork: { ...baseConfig.stellarNetwork, networkPassphrase: '[REDACTED]' }
    });

    return baseConfig;
  }

  private getStellarNetworkConfig(environment: string) {
    switch (environment) {
      case 'testnet':
        return {
          rpcUrl: process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org',
          networkPassphrase: process.env.STELLAR_TESTNET_PASSPHRASE || 'Test SDF Network ; September 2015',
          horizonUrl: process.env.STELLAR_TESTNET_HORIZON_URL || 'https://horizon-testnet.stellar.org'
        };
      case 'sandbox':
        return {
          rpcUrl: process.env.STELLAR_SANDBOX_RPC_URL || 'https://soroban-testnet.stellar.org',
          networkPassphrase: process.env.STELLAR_SANDBOX_PASSPHRASE || 'Test SDF Network ; September 2015',
          horizonUrl: process.env.STELLAR_SANDBOX_HORIZON_URL || 'https://horizon-testnet.stellar.org'
        };
      case 'mainnet':
      default:
        return {
          rpcUrl: process.env.STELLAR_MAINNET_RPC_URL || 'https://soroban-mainnet.stellar.org',
          networkPassphrase: process.env.STELLAR_MAINNET_PASSPHRASE || 'Public Global Stellar Network ; September 2015',
          horizonUrl: process.env.STELLAR_MAINNET_HORIZON_URL || 'https://horizon.stellar.org'
        };
    }
  }

  public getConfig(): SandboxConfig {
    return { ...this.config };
  }

  public isSandboxMode(): boolean {
    return this.config.enabled;
  }

  public isTestnetMode(): boolean {
    return this.config.environment === 'testnet' || this.config.environment === 'sandbox';
  }

  public getDatabaseSchema(): string {
    return this.config.database.schemaPrefix + 'stellar';
  }

  public getStellarConfig() {
    return this.config.stellarNetwork;
  }

  public isFeatureEnabled(feature: keyof SandboxConfig['features']): boolean {
    return this.config.features[feature];
  }

  public isMockDataEnabled(mockType: keyof SandboxConfig['mockData']): boolean {
    return this.config.mockData[mockType];
  }

  public updateEnvironment(newEnvironment: 'mainnet' | 'testnet' | 'sandbox'): void {
    logger.warn('Updating Stellar environment', { 
      from: this.config.environment, 
      to: newEnvironment 
    });
    
    this.config.environment = newEnvironment;
    this.config.stellarNetwork = this.getStellarNetworkConfig(newEnvironment);
    
    if (newEnvironment === 'sandbox') {
      this.config.enabled = true;
      this.config.database.schemaPrefix = 'sandbox_';
      this.config.database.isolationEnabled = true;
    }
    
    logger.info('Environment updated successfully', { 
      environment: this.config.environment,
      sandboxEnabled: this.config.enabled
    });
  }

  public toggleSandboxMode(enabled: boolean): void {
    logger.warn('Toggling sandbox mode', { 
      from: this.config.enabled, 
      to: enabled 
    });
    
    this.config.enabled = enabled;
    
    if (enabled) {
      this.config.database.schemaPrefix = 'sandbox_';
      this.config.database.isolationEnabled = true;
      this.config.features.mockPayments = true;
      this.config.features.failureSimulation = true;
      this.config.features.zeroValueTokens = true;
    } else {
      this.config.database.schemaPrefix = '';
      this.config.database.isolationEnabled = false;
      this.config.features.mockPayments = false;
      this.config.features.failureSimulation = false;
      this.config.features.zeroValueTokens = false;
    }
    
    logger.info('Sandbox mode toggled', { 
      enabled: this.config.enabled,
      schemaPrefix: this.config.database.schemaPrefix
    });
  }
}

// Singleton instance
export const sandboxConfig = new SandboxConfiguration();

// Export types for use in other modules
export type { SandboxConfig };
