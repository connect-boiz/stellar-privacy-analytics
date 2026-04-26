import axios from 'axios';
import { secureSettingsStorage } from './secureSettingsStorage';
import { toast } from 'react-hot-toast';

interface SyncResult {
  success: boolean;
  synced: string[];
  conflicts: string[];
  errors: string[];
}

interface RemoteSettings {
  userId: string;
  settings: { [key: string]: any };
  version: string;
  lastModified: string;
}

interface SyncConflict {
  key: string;
  localValue: any;
  remoteValue: any;
  localTimestamp: number;
  remoteTimestamp: string;
}

/**
 * Settings synchronization service
 * Handles bidirectional sync between local storage and backend
 */
class SettingsSyncService {
  private syncEndpoint: string = '/api/v1/settings/sync';
  private syncInterval: number = 5 * 60 * 1000; // 5 minutes
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private autoSyncEnabled: boolean = true;

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(() => {
      if (this.autoSyncEnabled) {
        this.syncSettings();
      }
    }, this.syncInterval);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Enable or disable auto-sync
   */
  setAutoSync(enabled: boolean): void {
    this.autoSyncEnabled = enabled;
  }

  /**
   * Upload local settings to backend
   */
  async uploadSettings(keys?: string[]): Promise<SyncResult> {
    try {
      const keysToUpload = keys || secureSettingsStorage.getAllKeys();
      const settings: { [key: string]: any } = {};
      
      for (const key of keysToUpload) {
        const value = secureSettingsStorage.get(key);
        if (value !== null) {
          settings[key] = {
            value,
            metadata: secureSettingsStorage.getMetadata(key)
          };
        }
      }
      
      const response = await axios.post(`${this.syncEndpoint}/upload`, {
        settings,
        timestamp: new Date().toISOString()
      });
      
      if (response.data.success) {
        await secureSettingsStorage.addAuditLogEntry({
          action: 'sync',
          settingKey: 'all',
          newValue: keysToUpload,
          source: 'remote'
        });
        
        return {
          success: true,
          synced: keysToUpload,
          conflicts: [],
          errors: []
        };
      }
      
      return {
        success: false,
        synced: [],
        conflicts: [],
        errors: ['Upload failed']
      };
    } catch (error) {
      console.error('Failed to upload settings:', error);
      return {
        success: false,
        synced: [],
        conflicts: [],
        errors: [error instanceof Error ? error.message : 'Upload failed']
      };
    }
  }

  /**
   * Download settings from backend
   */
  async downloadSettings(keys?: string[]): Promise<SyncResult> {
    try {
      const response = await axios.post(`${this.syncEndpoint}/download`, {
        keys: keys || secureSettingsStorage.getAllKeys()
      });
      
      if (!response.data.success || !response.data.settings) {
        return {
          success: false,
          synced: [],
          conflicts: [],
          errors: ['Download failed']
        };
      }
      
      const remoteSettings: RemoteSettings = response.data.settings;
      const synced: string[] = [];
      const conflicts: string[] = [];
      const errors: string[] = [];
      
      for (const [key, remoteData] of Object.entries(remoteSettings.settings)) {
        try {
          const localValue = secureSettingsStorage.get(key);
          const localMetadata = secureSettingsStorage.getMetadata(key);
          
          if (localValue === null) {
            // No local value, use remote
            await secureSettingsStorage.set(key, remoteData.value, 'remote');
            synced.push(key);
          } else {
            // Check for conflict
            const remoteTimestamp = new Date(remoteData.lastModified).getTime();
            const localTimestamp = localMetadata?.timestamp || 0;
            
            if (remoteTimestamp > localTimestamp) {
              // Remote is newer, use remote
              await secureSettingsStorage.set(key, remoteData.value, 'remote');
              synced.push(key);
            } else if (remoteTimestamp < localTimestamp) {
              // Local is newer, keep local
              synced.push(key);
            } else {
              // Same timestamp, potential conflict
              if (JSON.stringify(localValue) !== JSON.stringify(remoteData.value)) {
                conflicts.push(key);
              } else {
                synced.push(key);
              }
            }
          }
        } catch (error) {
          errors.push(key);
          console.error(`Failed to sync setting ${key}:`, error);
        }
      }
      
      if (synced.length > 0) {
        await secureSettingsStorage.addAuditLogEntry({
          action: 'sync',
          settingKey: 'all',
          newValue: synced,
          source: 'remote'
        });
      }
      
      return {
        success: true,
        synced,
        conflicts,
        errors
      };
    } catch (error) {
      console.error('Failed to download settings:', error);
      return {
        success: false,
        synced: [],
        conflicts: [],
        errors: [error instanceof Error ? error.message : 'Download failed']
      };
    }
  }

  /**
   * Bidirectional sync with conflict detection
   */
  async syncSettings(keys?: string[]): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        synced: [],
        conflicts: [],
        errors: ['Sync already in progress']
      };
    }
    
    this.isSyncing = true;
    
    try {
      // First, download from remote
      const downloadResult = await this.downloadSettings(keys);
      
      if (!downloadResult.success && downloadResult.errors.length > 0) {
        // If download fails, try to upload local changes
        const uploadResult = await this.uploadSettings(keys);
        this.isSyncing = false;
        return uploadResult;
      }
      
      // Then, upload local changes
      const uploadResult = await this.uploadSettings(keys);
      
      this.isSyncing = false;
      
      // Combine results
      return {
        success: downloadResult.success && uploadResult.success,
        synced: [...new Set([...downloadResult.synced, ...uploadResult.synced])],
        conflicts: downloadResult.conflicts,
        errors: [...downloadResult.errors, ...uploadResult.errors]
      };
    } catch (error) {
      this.isSyncing = false;
      console.error('Sync failed:', error);
      return {
        success: false,
        synced: [],
        conflicts: [],
        errors: [error instanceof Error ? error.message : 'Sync failed']
      };
    }
  }

  /**
   * Detect conflicts between local and remote settings
   */
  async detectConflicts(keys?: string[]): Promise<SyncConflict[]> {
    try {
      const response = await axios.post(`${this.syncEndpoint}/download`, {
        keys: keys || secureSettingsStorage.getAllKeys()
      });
      
      if (!response.data.success || !response.data.settings) {
        return [];
      }
      
      const remoteSettings: RemoteSettings = response.data.settings;
      const conflicts: SyncConflict[] = [];
      
      for (const [key, remoteData] of Object.entries(remoteSettings.settings)) {
        const localValue = secureSettingsStorage.get(key);
        const localMetadata = secureSettingsStorage.getMetadata(key);
        
        if (localValue !== null) {
          const remoteTimestamp = new Date(remoteData.lastModified).getTime();
          const localTimestamp = localMetadata?.timestamp || 0;
          
          if (JSON.stringify(localValue) !== JSON.stringify(remoteData.value)) {
            conflicts.push({
              key,
              localValue,
              remoteValue: remoteData.value,
              localTimestamp,
              remoteTimestamp: remoteData.lastModified
            });
          }
        }
      }
      
      return conflicts;
    } catch (error) {
      console.error('Failed to detect conflicts:', error);
      return [];
    }
  }

  /**
   * Resolve conflict with specified strategy
   */
  async resolveConflict(
    key: string,
    strategy: 'local' | 'remote' | 'merge',
    customValue?: any
  ): Promise<boolean> {
    try {
      switch (strategy) {
        case 'local':
          // Keep local, upload to remote
          const localValue = secureSettingsStorage.get(key);
          if (localValue !== null) {
            await this.uploadSettings([key]);
          }
          break;
          
        case 'remote':
          // Use remote, download from remote
          await this.downloadSettings([key]);
          break;
          
        case 'merge':
          // Merge values (if objects)
          const local = secureSettingsStorage.get(key);
          const remote = (await this.downloadSettings([key])).synced.includes(key) 
            ? secureSettingsStorage.get(key) 
            : null;
          
          if (local && remote && typeof local === 'object' && typeof remote === 'object') {
            const merged = { ...local, ...remote, ...customValue };
            await secureSettingsStorage.set(key, merged, 'remote');
            await this.uploadSettings([key]);
          }
          break;
      }
      
      await secureSettingsStorage.addAuditLogEntry({
        action: 'conflict',
        settingKey: key,
        source: 'remote'
      });
      
      return true;
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      return false;
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isSyncing: boolean;
    autoSyncEnabled: boolean;
    lastSync?: number;
  } {
    const lastSyncData = localStorage.getItem('last_sync_timestamp');
    return {
      isSyncing: this.isSyncing,
      autoSyncEnabled: this.autoSyncEnabled,
      lastSync: lastSyncData ? parseInt(lastSyncData) : undefined
    };
  }

  /**
   * Force immediate sync
   */
  async forceSync(keys?: string[]): Promise<SyncResult> {
    const result = await this.syncSettings(keys);
    
    if (result.success) {
      localStorage.setItem('last_sync_timestamp', Date.now().toString());
      toast.success('Settings synced successfully');
    } else {
      toast.error('Failed to sync settings');
    }
    
    return result;
  }
}

// Export singleton instance
export const settingsSyncService = new SettingsSyncService();
export default SettingsSyncService;
