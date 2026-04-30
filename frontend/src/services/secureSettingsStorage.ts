import CryptoJS from 'crypto-js';

interface SettingsEntry<T> {
  data: T;
  timestamp: number;
  version: string;
  checksum: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'sync' | 'conflict';
  settingKey: string;
  oldValue?: any;
  newValue?: any;
  source: 'local' | 'remote' | 'import' | 'export';
  userId?: string;
  ipAddress?: string;
}

interface ConflictResolution {
  strategy: 'local' | 'remote' | 'merge' | 'manual';
  timestamp: number;
  resolved: boolean;
}

/**
 * Secure encrypted storage service for privacy settings
 * Provides AES encryption for sensitive data and audit trail logging
 */
class SecureSettingsStorage {
  private encryptionKey: string;
  private storagePrefix: string = 'secure_settings_';
  private auditLogKey: string = 'settings_audit_log';
  private version: string = '1.0.0';

  constructor() {
    // Get or generate encryption key from session
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  /**
   * Get or create encryption key from session storage
   */
  private getOrCreateEncryptionKey(): string {
    let key = sessionStorage.getItem('settings_encryption_key');
    if (!key) {
      key = this.generateEncryptionKey();
      sessionStorage.setItem('settings_encryption_key', key);
    }
    return key;
  }

  /**
   * Generate a cryptographically secure encryption key
   */
  private generateEncryptionKey(): string {
    const array = new Uint32Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Encrypt data using AES
   */
  private encrypt(data: string): string {
    try {
      return CryptoJS.AES.encrypt(data, this.encryptionKey).toString();
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt settings data');
    }
  }

  /**
   * Decrypt data using AES
   */
  private decrypt(encryptedData: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt settings data');
    }
  }

  /**
   * Generate checksum for data integrity verification
   */
  private generateChecksum(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }

  /**
   * Verify checksum for data integrity
   */
  private verifyChecksum(data: string, checksum: string): boolean {
    const computedChecksum = this.generateChecksum(data);
    return computedChecksum === checksum;
  }

  /**
   * Add entry to audit log
   */
  private async addAuditLogEntry(entry: Omit<AuditLogEntry, 'id'>): Promise<void> {
    try {
      const logs = this.getAuditLog();
      const newEntry: AuditLogEntry = {
        ...entry,
        id: this.generateId(),
        timestamp: new Date().toISOString()
      };
      
      logs.push(newEntry);
      
      // Keep only last 1000 entries
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      localStorage.setItem(this.auditLogKey, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to add audit log entry:', error);
    }
  }

  /**
   * Get audit log
   */
  getAuditLog(): AuditLogEntry[] {
    try {
      const logData = localStorage.getItem(this.auditLogKey);
      return logData ? JSON.parse(logData) : [];
    } catch (error) {
      console.error('Failed to retrieve audit log:', error);
      return [];
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store settings with encryption and audit logging
   */
  async set<T>(key: string, value: T, source: 'local' | 'remote' | 'import' = 'local'): Promise<void> {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      
      // Get old value for audit log
      const oldValue = this.getWithoutAudit<T>(key);
      
      // Create settings entry
      const entry: SettingsEntry<T> = {
        data: value,
        timestamp: Date.now(),
        version: this.version,
        checksum: this.generateChecksum(JSON.stringify(value))
      };
      
      // Encrypt and store
      const encryptedData = this.encrypt(JSON.stringify(entry));
      localStorage.setItem(storageKey, encryptedData);
      
      // Log to audit trail
      await this.addAuditLogEntry({
        action: oldValue ? 'update' : 'create',
        settingKey: key,
        oldValue,
        newValue: value,
        source
      });
      
      console.log(`Settings stored successfully for key: ${key}`);
    } catch (error) {
      console.error('Failed to store settings:', error);
      throw new Error('Failed to store settings securely');
    }
  }

  /**
   * Get settings with decryption and integrity verification
   */
  get<T>(key: string): T | null {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      const encryptedData = localStorage.getItem(storageKey);
      
      if (!encryptedData) {
        return null;
      }
      
      // Decrypt
      const decryptedData = this.decrypt(encryptedData);
      const entry: SettingsEntry<T> = JSON.parse(decryptedData);
      
      // Verify checksum
      const dataString = JSON.stringify(entry.data);
      if (!this.verifyChecksum(dataString, entry.checksum)) {
        console.error('Checksum verification failed for key:', key);
        throw new Error('Data integrity check failed');
      }
      
      return entry.data;
    } catch (error) {
      console.error('Failed to retrieve settings:', error);
      return null;
    }
  }

  /**
   * Get settings without audit logging (internal use)
   */
  private getWithoutAudit<T>(key: string): T | null {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      const encryptedData = localStorage.getItem(storageKey);
      
      if (!encryptedData) {
        return null;
      }
      
      const decryptedData = this.decrypt(encryptedData);
      const entry: SettingsEntry<T> = JSON.parse(decryptedData);
      return entry.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Remove settings with audit logging
   */
  async remove(key: string): Promise<void> {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      const oldValue = this.getWithoutAudit(key);
      
      localStorage.removeItem(storageKey);
      
      await this.addAuditLogEntry({
        action: 'delete',
        settingKey: key,
        oldValue,
        source: 'local'
      });
    } catch (error) {
      console.error('Failed to remove settings:', error);
      throw new Error('Failed to remove settings');
    }
  }

  /**
   * Clear all settings with audit logging
   */
  async clear(): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.storagePrefix)
      );
      
      for (const key of keys) {
        await this.remove(key.replace(this.storagePrefix, ''));
      }
    } catch (error) {
      console.error('Failed to clear settings:', error);
      throw new Error('Failed to clear settings');
    }
  }

  /**
   * Export all settings as encrypted JSON
   */
  async exportSettings(keys?: string[]): Promise<string> {
    try {
      const settings: { [key: string]: any } = {};
      const keysToExport = keys || Object.keys(localStorage).filter(key => 
        key.startsWith(this.storagePrefix)
      ).map(key => key.replace(this.storagePrefix, ''));
      
      for (const key of keysToExport) {
        const value = this.get(key);
        if (value !== null) {
          settings[key] = value;
        }
      }
      
      const exportData = {
        version: this.version,
        timestamp: new Date().toISOString(),
        settings
      };
      
      const encryptedExport = this.encrypt(JSON.stringify(exportData));
      
      await this.addAuditLogEntry({
        action: 'export',
        settingKey: 'all',
        newValue: keysToExport,
        source: 'export'
      });
      
      return encryptedExport;
    } catch (error) {
      console.error('Failed to export settings:', error);
      throw new Error('Failed to export settings');
    }
  }

  /**
   * Import settings from encrypted JSON
   */
  async importSettings(encryptedData: string, strategy: ConflictResolution['strategy'] = 'merge'): Promise<void> {
    try {
      // Decrypt
      const decryptedData = this.decrypt(encryptedData);
      const importData = JSON.parse(decryptedData);
      
      if (!importData.settings) {
        throw new Error('Invalid import data format');
      }
      
      // Import each setting
      for (const [key, value] of Object.entries(importData.settings)) {
        const existingValue = this.getWithoutAudit(key);
        
        if (existingValue !== null) {
          // Handle conflict
          switch (strategy) {
            case 'local':
              // Keep existing, skip import
              await this.addAuditLogEntry({
                action: 'conflict',
                settingKey: key,
                oldValue: existingValue,
                newValue: value,
                source: 'import'
              });
              break;
            case 'remote':
              // Overwrite with imported
              await this.set(key, value, 'import');
              break;
            case 'merge':
              // Merge objects if possible
              if (typeof existingValue === 'object' && typeof value === 'object') {
                const merged = { ...existingValue, ...value };
                await this.set(key, merged, 'import');
              } else {
                await this.set(key, value, 'import');
              }
              break;
            case 'manual':
              // Log conflict for manual resolution
              await this.addAuditLogEntry({
                action: 'conflict',
                settingKey: key,
                oldValue: existingValue,
                newValue: value,
                source: 'import'
              });
              break;
          }
        } else {
          // No conflict, import directly
          await this.set(key, value, 'import');
        }
      }
      
      await this.addAuditLogEntry({
        action: 'import',
        settingKey: 'all',
        newValue: Object.keys(importData.settings),
        source: 'import'
      });
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw new Error('Failed to import settings');
    }
  }

  /**
   * Get settings metadata
   */
  getMetadata(key: string): { timestamp: number; version: string } | null {
    try {
      const storageKey = `${this.storagePrefix}${key}`;
      const encryptedData = localStorage.getItem(storageKey);
      
      if (!encryptedData) {
        return null;
      }
      
      const decryptedData = this.decrypt(encryptedData);
      const entry: SettingsEntry<any> = JSON.parse(decryptedData);
      
      return {
        timestamp: entry.timestamp,
        version: entry.version
      };
    } catch (error) {
      console.error('Failed to get metadata:', error);
      return null;
    }
  }

  /**
   * Get all settings keys
   */
  getAllKeys(): string[] {
    return Object.keys(localStorage).filter(key => 
      key.startsWith(this.storagePrefix)
    ).map(key => key.replace(this.storagePrefix, ''));
  }

  /**
   * Validate settings against schema
   */
  validateSettings<T>(key: string, schema: any): boolean {
    try {
      const value = this.get<T>(key);
      if (!value) return false;
      
      // Basic validation (can be extended with a schema validator like Zod)
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in value)) {
            return false;
          }
        }
      }
      
      if (schema.types) {
        for (const [field, type] of Object.entries(schema.types)) {
          if (value[field] !== undefined && typeof value[field] !== type) {
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Validation failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const secureSettingsStorage = new SecureSettingsStorage();
export default SecureSettingsStorage;
