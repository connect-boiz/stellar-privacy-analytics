import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProcessingStats {
  memoryUsageMB: number;
  itemsProcessed: number;
  isProcessing: boolean;
}

export interface DataProcessorOptions {
  chunkSize?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Memory-safe data processing hook.
 * Fixes: useEffect cleanup, chunked processing to avoid large allocations,
 * and proper abort/cancellation to prevent state updates on unmounted components.
 */
export function useDataProcessor<T, R>(
  processFn: (chunk: T[]) => R[],
  options: DataProcessorOptions = {}
) {
  const { chunkSize = 500, onProgress } = options;

  const [results, setResults] = useState<R[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({
    memoryUsageMB: 0,
    itemsProcessed: 0,
    isProcessing: false,
  });
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Memory monitoring
  useEffect(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    if (!perf.memory) return;

    intervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const mb = perf.memory!.usedJSHeapSize / 1024 / 1024;
      setStats(prev => ({ ...prev, memoryUsageMB: Math.round(mb * 10) / 10 }));
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current = true;
    };
  }, []);

  const process = useCallback(
    async (data: T[]) => {
      abortRef.current = false;
      if (!mountedRef.current) return;

      setError(null);
      setResults([]);
      setStats(prev => ({ ...prev, isProcessing: true, itemsProcessed: 0 }));

      const accumulated: R[] = [];
      const total = data.length;

      try {
        for (let i = 0; i < total; i += chunkSize) {
          if (abortRef.current) break;

          const chunk = data.slice(i, i + chunkSize);
          const chunkResults = processFn(chunk);
          accumulated.push(...chunkResults);

          const processed = Math.min(i + chunkSize, total);
          const progress = Math.round((processed / total) * 100);

          if (mountedRef.current) {
            setStats(prev => ({ ...prev, itemsProcessed: processed }));
            onProgress?.(progress);
          }

          // Yield to event loop between chunks to avoid blocking UI
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }

        if (mountedRef.current && !abortRef.current) {
          setResults(accumulated);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Processing failed');
        }
      } finally {
        if (mountedRef.current) {
          setStats(prev => ({ ...prev, isProcessing: false }));
        }
      }
    },
    [processFn, chunkSize, onProgress]
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (mountedRef.current) {
      setStats(prev => ({ ...prev, isProcessing: false }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    if (mountedRef.current) {
      setResults([]);
      setError(null);
      setStats(prev => ({ ...prev, isProcessing: false, itemsProcessed: 0 }));
    }
  }, []);

  return { results, stats, error, process, cancel, reset };
}
