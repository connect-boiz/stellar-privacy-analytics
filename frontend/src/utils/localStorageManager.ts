import { SchemaConfig } from '../components/SchemaBuilder/SchemaBuilder';

export interface StorageKey {
  SCHEMA: string;
  SCHEMA_LIST: string;
  USER_PREFERENCES: string;
  AUTO_SAVE: string;
}

export interface StoredSchema {
  id: string;
  name: string;
  description?: string;
  schema: SchemaConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  autoSave: boolean;
  autoSaveDelay: number; // milliseconds
  maxStoredSchemas: number;
  defaultFieldType: 'string' | 'integer' | 'boolean' | 'enum';
  showFieldIds: boolean;
  showGrid: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface AutoSaveData {
  schema: SchemaConfig;
  timestamp: number;
  version: string;
}

export class LocalStorageManager {
  private static readonly STORAGE_KEYS: StorageKey = {
    SCHEMA: 'schema-builder-current-schema',
    SCHEMA_LIST: 'schema-builder-schema-list',
    USER_PREFERENCES: 'schema-builder-user-preferences',
    AUTO_SAVE: 'schema-builder-auto-save'
  };

  private static readonly DEFAULT_PREFERENCES: UserPreferences = {
    autoSave: true,
    autoSaveDelay: 2000, // 2 seconds
    maxStoredSchemas: 50,
    defaultFieldType: 'string',
    showFieldIds: false,
    showGrid: true,
    theme: 'auto'
  };

  /**
   * Save schema to local storage
   */
  static saveSchema(schema: SchemaConfig): boolean {
    try {
      const storedSchema: StoredSchema = {
        id: this.generateSchemaId(),
        name: schema.name,
        description: schema.description,
        schema,
        createdAt: schema.metadata.createdAt,
        updatedAt: new Date()
      };

      // Save current schema
      localStorage.setItem(this.STORAGE_KEYS.SCHEMA, JSON.stringify(storedSchema));

      // Update schema list
      this.updateSchemaList(storedSchema);

      // Trigger auto-save
      this.triggerAutoSave(schema);

      return true;
    } catch (error) {
      console.error('Failed to save schema to local storage:', error);
      return false;
    }
  }

  /**
   * Load schema from local storage
   */
  static loadSchema(): StoredSchema | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.SCHEMA);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load schema from local storage:', error);
      return null;
    }
  }

  /**
   * Update schema list
   */
  private static updateSchemaList(storedSchema: StoredSchema): void {
    try {
      const schemaList = this.getSchemaList();
      
      // Remove existing entry with same ID
      const filteredList = schemaList.filter(s => s.id !== storedSchema.id);
      
      // Add or update the schema
      filteredList.push(storedSchema);
      
      // Sort by updated date (newest first)
      filteredList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      // Keep only the maximum number of schemas
      const preferences = this.getUserPreferences();
      const limitedList = filteredList.slice(0, preferences.maxStoredSchemas);
      
      localStorage.setItem(this.STORAGE_KEYS.SCHEMA_LIST, JSON.stringify(limitedList));
    } catch (error) {
      console.error('Failed to update schema list:', error);
    }
  }

  /**
   * Get all stored schemas
   */
  static getSchemaList(): StoredSchema[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.SCHEMA_LIST);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get schema list:', error);
      return [];
    }
  }

  /**
   * Delete schema from storage
   */
  static deleteSchema(schemaId: string): boolean {
    try {
      // Remove from schema list
      const schemaList = this.getSchemaList();
      const filteredList = schemaList.filter(s => s.id !== schemaId);
      localStorage.setItem(this.STORAGE_KEYS.SCHEMA_LIST, JSON.stringify(filteredList));

      // Remove current schema if it's the one being deleted
      const currentSchema = this.loadSchema();
      if (currentSchema && currentSchema.id === schemaId) {
        localStorage.removeItem(this.STORAGE_KEYS.SCHEMA);
        localStorage.removeItem(this.STORAGE_KEYS.AUTO_SAVE);
      }

      return true;
    } catch (error) {
      console.error('Failed to delete schema:', error);
      return false;
    }
  }

  /**
   * Clear all schemas
   */
  static clearAllSchemas(): boolean {
    try {
      localStorage.removeItem(this.STORAGE_KEYS.SCHEMA);
      localStorage.removeItem(this.STORAGE_KEYS.SCHEMA_LIST);
      localStorage.removeItem(this.STORAGE_KEYS.AUTO_SAVE);
      return true;
    } catch (error) {
      console.error('Failed to clear schemas:', error);
      return false;
    }
  }

  /**
   * Auto-save functionality
   */
  static triggerAutoSave(schema: SchemaConfig): void {
    const preferences = this.getUserPreferences();
    
    if (!preferences.autoSave) {
      return;
    }

    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Set new timeout
    this.autoSaveTimeout = setTimeout(() => {
      this.performAutoSave(schema);
    }, preferences.autoSaveDelay);
  }

  private static autoSaveTimeout: NodeJS.Timeout | null = null;

  private static performAutoSave(schema: SchemaConfig): void {
    try {
      const autoSaveData: AutoSaveData = {
        schema,
        timestamp: Date.now(),
        version: schema.metadata.version
      };

      localStorage.setItem(this.STORAGE_KEYS.AUTO_SAVE, JSON.stringify(autoSaveData));
      console.log('Schema auto-saved', { schemaName: schema.name, timestamp: autoSaveData.timestamp });
    } catch (error) {
      console.error('Failed to auto-save schema:', error);
    }
  }

  /**
   * Get auto-save data
   */
  static getAutoSave(): AutoSaveData | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.AUTO_SAVE);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to get auto-save data:', error);
      return null;
    }
  }

  /**
   * Restore from auto-save
   */
  static restoreFromAutoSave(): SchemaConfig | null {
    const autoSaveData = this.getAutoSave();
    return autoSaveData ? autoSaveData.schema : null;
  }

  /**
   * Clear auto-save
   */
  static clearAutoSave(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEYS.AUTO_SAVE);
      if (this.autoSaveTimeout) {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = null;
      }
    } catch (error) {
      console.error('Failed to clear auto-save:', error);
    }
  }

  /**
   * User preferences management
   */
  static getUserPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.USER_PREFERENCES);
      const preferences = stored ? JSON.parse(stored) : {};
      
      // Merge with defaults
      return { ...this.DEFAULT_PREFERENCES, ...preferences };
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return this.DEFAULT_PREFERENCES;
    }
  }

  static saveUserPreferences(preferences: Partial<UserPreferences>): boolean {
    try {
      const currentPreferences = this.getUserPreferences();
      const updatedPreferences = { ...currentPreferences, ...preferences };
      
      localStorage.setItem(this.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(updatedPreferences));
      return true;
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      return false;
    }
  }

  static resetUserPreferences(): boolean {
    try {
      localStorage.setItem(this.STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(this.DEFAULT_PREFERENCES));
      return true;
    } catch (error) {
      console.error('Failed to reset user preferences:', error);
      return false;
    }
  }

  /**
   * Storage utility methods
   */
  static getStorageUsage(): {
    used: number;
    available: number;
    percentage: number;
    details: Record<string, number>;
  } {
    const details: Record<string, number> = {};
    let totalUsed = 0;

    // Calculate usage for each key
    Object.values(this.STORAGE_KEYS).forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const size = this.getStringSize(value);
          details[key] = size;
          totalUsed += size;
        }
      } catch (error) {
        console.error(`Failed to calculate size for key ${key}:`, error);
      }
    });

    // Estimate available space (localStorage typically has 5-10MB limit)
    const estimatedLimit = 5 * 1024 * 1024; // 5MB
    const percentage = (totalUsed / estimatedLimit) * 100;

    return {
      used: totalUsed,
      available: estimatedLimit - totalUsed,
      percentage,
      details
    };
  }

  /**
   * Clear old schemas based on age and count
   */
  static cleanupOldSchemas(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    try {
      const schemaList = this.getSchemaList();
      const now = Date.now();
      const cutoffDate = new Date(now - maxAge);
      
      // Filter out old schemas
      const recentSchemas = schemaList.filter(schema => 
        new Date(schema.updatedAt) > cutoffDate
      );

      // Keep only the most recent schemas up to the limit
      const preferences = this.getUserPreferences();
      const limitedSchemas = recentSchemas.slice(0, preferences.maxStoredSchemas);

      localStorage.setItem(this.STORAGE_KEYS.SCHEMA_LIST, JSON.stringify(limitedSchemas));

      const removedCount = schemaList.length - limitedSchemas.length;
      
      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} old schemas`);
      }

      return removedCount;
    } catch (error) {
      console.error('Failed to cleanup old schemas:', error);
      return 0;
    }
  }

  /**
   * Export schemas as JSON
   */
  static exportSchemas(): string {
    try {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        schemas: this.getSchemaList(),
        preferences: this.getUserPreferences()
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export schemas:', error);
      return '{}';
    }
  }

  /**
   * Import schemas from JSON
   */
  static importSchemas(jsonData: string): {
    success: boolean;
    imported: number;
    errors: string[];
  } {
    try {
      const importData = JSON.parse(jsonData);
      const errors: string[] = [];
      let imported = 0;

      // Validate import data structure
      if (!importData.schemas || !Array.isArray(importData.schemas)) {
        errors.push('Invalid import data format');
        return { success: false, imported: 0, errors };
      }

      // Import each schema
      for (const schemaData of importData.schemas) {
        try {
          // Validate schema structure
          if (!schemaData.schema || !schemaData.name) {
            errors.push(`Invalid schema data: ${schemaData.name || 'unnamed'}`);
            continue;
          }

          // Generate new ID to avoid conflicts
          const storedSchema: StoredSchema = {
            ...schemaData,
            id: this.generateSchemaId(),
            createdAt: new Date(schemaData.createdAt),
            updatedAt: new Date()
          };

          this.updateSchemaList(storedSchema);
          imported++;
        } catch (error) {
          errors.push(`Failed to import schema: ${schemaData.name || 'unnamed'}`);
        }
      }

      // Import preferences if available
      if (importData.preferences) {
        this.saveUserPreferences(importData.preferences);
      }

      return { success: true, imported, errors };
    } catch (error) {
      console.error('Failed to import schemas:', error);
      return {
        success: false,
        imported: 0,
        errors: ['Invalid JSON format']
      };
    }
  }

  /**
   * Helper method to generate schema ID
   */
  private static generateSchemaId(): string {
    return `schema_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Helper method to calculate string size in bytes
   */
  private static getStringSize(str: string): number {
    return new Blob([str]).size;
  }

  /**
   * Check if localStorage is available
   */
  static isLocalStorageAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      console.error('LocalStorage is not available:', error);
      return false;
    }
  }

  /**
   * Get storage quota information (if available)
   */
  static getStorageQuota(): Promise<{
    quota: number;
    usage: number;
    available: number;
  }> {
    return new Promise((resolve, reject) => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        navigator.storage.estimate().then((estimate) => {
          resolve({
            quota: estimate.quota || 0,
            usage: estimate.usage || 0,
            available: (estimate.quota || 0) - (estimate.usage || 0)
          });
        }).catch(reject);
      } else {
        // Fallback to localStorage estimation
        const usage = this.getStorageUsage();
        resolve({
          quota: 5 * 1024 * 1024, // 5MB estimate
          usage: usage.used,
          available: usage.available
        });
      }
    });
  }
}

export default LocalStorageManager;
