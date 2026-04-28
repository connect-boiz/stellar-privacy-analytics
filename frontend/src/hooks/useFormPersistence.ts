import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash';

export interface FormPersistenceOptions<T> {
  /** Unique key for storing form data */
  storageKey: string;
  /** Storage type - 'localStorage' persists across sessions, 'sessionStorage' only within session */
  storageType?: 'localStorage' | 'sessionStorage';
  /** Auto-save debounce delay in milliseconds */
  autoSaveDelay?: number;
  /** Initial/default form values */
  defaultValues: T;
  /** Validation function for form data */
  validate?: (data: T) => Record<string, string> | null;
  /** Callback when form is recovered from storage */
  onRecover?: (data: T) => void;
  /** Callback when form is auto-saved */
  onAutoSave?: (data: T) => void;
  /** Expiry time in milliseconds - form data older than this will be discarded */
  expiryMs?: number;
  /** Whether to track abandonment (beforeunload event) */
  trackAbandonment?: boolean;
}

export interface FormPersistenceState<T> {
  /** Current form values */
  values: T;
  /** Validation errors */
  errors: Record<string, string>;
  /** Whether form has been modified from defaults */
  isDirty: boolean;
  /** Whether form data was recovered from storage */
  wasRecovered: boolean;
  /** Timestamp of last auto-save */
  lastSavedAt: Date | null;
  /** Whether currently saving */
  isSaving: boolean;
  /** Whether form is marked as abandoned */
  isAbandoned: boolean;
  /** Recovery data if form was abandoned */
  recoveryData: { savedAt: Date; step: number } | null;
}

export interface FormPersistenceActions<T> {
  /** Update form values */
  setValues: (values: T | ((prev: T) => T)) => void;
  /** Update single field */
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Manually save form data */
  save: () => void;
  /** Clear saved form data */
  clear: () => void;
  /** Reset form to default values */
  reset: () => void;
  /** Validate form and return errors */
  validate: () => Record<string, string> | null;
  /** Mark form as submitted (clears abandonment flag) */
  markSubmitted: () => void;
}

interface StoredFormData<T> {
  values: T;
  savedAt: string;
  step?: number;
  isAbandoned?: boolean;
}

export function useFormPersistence<T extends Record<string, unknown>>(
  options: FormPersistenceOptions<T>
): [FormPersistenceState<T>, FormPersistenceActions<T>] {
  const {
    storageKey,
    storageType = 'localStorage',
    autoSaveDelay = 1000,
    defaultValues,
    validate: validateFn,
    onRecover,
    onAutoSave,
    expiryMs = 7 * 24 * 60 * 60 * 1000, // 7 days default
    trackAbandonment = true
  } = options;

  const storage = storageType === 'localStorage' ? localStorage : sessionStorage;

  const [values, setValuesState] = useState<T>(() => {
    // Try to recover from storage on init
    try {
      const stored = storage.getItem(storageKey);
      if (stored) {
        const parsed: StoredFormData<T> = JSON.parse(stored);
        const savedAt = new Date(parsed.savedAt);
        
        // Check if data has expired
        if (Date.now() - savedAt.getTime() < expiryMs) {
          if (onRecover) {
            onRecover(parsed.values);
          }
          return parsed.values;
        } else {
          // Clear expired data
          storage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('Failed to recover form data:', error);
    }
    return defaultValues;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasRecovered, setWasRecovered] = useState(() => {
    try {
      return storage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  });
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [recoveryData, setRecoveryData] = useState<{ savedAt: Date; step: number } | null>(() => {
    try {
      const stored = storage.getItem(storageKey);
      if (stored) {
        const parsed: StoredFormData<T> = JSON.parse(stored);
        return {
          savedAt: new Date(parsed.savedAt),
          step: parsed.step || 0
        };
      }
    } catch {}
    return null;
  });
  const [isAbandoned, setIsAbandoned] = useState(() => {
    try {
      const stored = storage.getItem(storageKey);
      if (stored) {
        const parsed: StoredFormData<T> = JSON.parse(stored);
        return parsed.isAbandoned || false;
      }
    } catch {}
    return false;
  });

  const defaultValuesRef = useRef(defaultValues);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Check if form is dirty (modified from defaults)
  const isDirty = JSON.stringify(values) !== JSON.stringify(defaultValuesRef.current);

  // Save to storage
  const saveToStorage = useCallback((data: T, step?: number, abandoned?: boolean) => {
    const toStore: StoredFormData<T> = {
      values: data,
      savedAt: new Date().toISOString(),
      step,
      isAbandoned: abandoned
    };
    storage.setItem(storageKey, JSON.stringify(toStore));
    setLastSavedAt(new Date());
    if (onAutoSave) {
      onAutoSave(data);
    }
  }, [storage, storageKey, onAutoSave]);

  // Debounced auto-save
  const debouncedSave = useCallback(
    debounce((data: T) => {
      setIsSaving(true);
      try {
        saveToStorage(data);
      } finally {
        setIsSaving(false);
      }
    }, autoSaveDelay),
    [saveToStorage, autoSaveDelay]
  );

  // Auto-save when values change
  useEffect(() => {
    if (isDirty) {
      debouncedSave(values);
    }
  }, [values, isDirty, debouncedSave]);

  // Track abandonment
  useEffect(() => {
    if (!trackAbandonment) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        // Mark as abandoned in storage
        saveToStorage(valuesRef.current, undefined, true);
        setIsAbandoned(true);
        
        // Show confirmation dialog
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, trackAbandonment, saveToStorage]);

  // Actions
  const setValues = useCallback((newValues: T | ((prev: T) => T)) => {
    setValuesState(prev => {
      const next = typeof newValues === 'function' ? (newValues as (prev: T) => T)(prev) : newValues;
      return next;
    });
    setWasRecovered(false);
  }, []);

  const setFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValuesState(prev => ({ ...prev, [field]: value }));
    setWasRecovered(false);
    // Clear error for this field
    setErrors(prev => {
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  }, []);

  const save = useCallback(() => {
    setIsSaving(true);
    try {
      saveToStorage(values);
    } finally {
      setIsSaving(false);
    }
  }, [values, saveToStorage]);

  const clear = useCallback(() => {
    storage.removeItem(storageKey);
    setLastSavedAt(null);
    setRecoveryData(null);
    setIsAbandoned(false);
  }, [storage, storageKey]);

  const reset = useCallback(() => {
    setValuesState(defaultValuesRef.current);
    setErrors({});
    setWasRecovered(false);
    clear();
  }, [clear]);

  const validate = useCallback(() => {
    if (!validateFn) return null;
    const validationErrors = validateFn(values);
    if (validationErrors && Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return validationErrors;
    }
    setErrors({});
    return null;
  }, [values, validateFn]);

  const markSubmitted = useCallback(() => {
    setIsAbandoned(false);
    clear();
  }, [clear]);

  const state: FormPersistenceState<T> = {
    values,
    errors,
    isDirty,
    wasRecovered,
    lastSavedAt,
    isSaving,
    isAbandoned,
    recoveryData
  };

  const actions: FormPersistenceActions<T> = {
    setValues,
    setFieldValue,
    save,
    clear,
    reset,
    validate,
    markSubmitted
  };

  return [state, actions];
}

// Utility to pre-fill form from user profile
export function prefillFromProfile<T extends Record<string, unknown>>(
  defaultValues: T,
  profile: Partial<T>,
  fields: (keyof T)[]
): T {
  const prefilled = { ...defaultValues };
  for (const field of fields) {
    if (profile[field] !== undefined && profile[field] !== null && profile[field] !== '') {
      prefilled[field] = profile[field];
    }
  }
  return prefilled;
}

// Hook for managing multiple form drafts
export function useFormDrafts<T extends Record<string, unknown>>(prefix: string) {
  const getDraftKeys = useCallback(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }, [prefix]);

  const getDrafts = useCallback(() => {
    const keys = getDraftKeys();
    return keys.map(key => {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          key,
          savedAt: new Date(parsed.savedAt),
          step: parsed.step,
          isAbandoned: parsed.isAbandoned,
          values: parsed.values as T
        };
      }
      return null;
    }).filter((draft): draft is NonNullable<typeof draft> => draft !== null);
  }, [getDraftKeys]);

  const clearDraft = useCallback((key: string) => {
    localStorage.removeItem(key);
  }, []);

  const clearAllDrafts = useCallback(() => {
    const keys = getDraftKeys();
    keys.forEach(key => localStorage.removeItem(key));
  }, [getDraftKeys]);

  return {
    getDrafts,
    clearDraft,
    clearAllDrafts
  };
}

export default useFormPersistence;
