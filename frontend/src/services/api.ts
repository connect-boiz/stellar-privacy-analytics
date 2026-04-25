import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

// Error types for better handling
type ErrorType = 'network' | 'server' | 'client' | 'timeout' | 'cors';

interface NetworkError extends Error {
  type: ErrorType;
  statusCode?: number;
  retryable: boolean;
  originalError?: AxiosError;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Simple in-memory cache for offline mode
class OfflineCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Enhanced API client with comprehensive error handling, retry logic, offline mode, and network status monitoring
 */
class ApiClient {
  private instance: AxiosInstance;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };
  private offlineCache = new OfflineCache();
  private isOnline = navigator.onLine;
  private networkStatusListeners: ((online: boolean) => void)[] = [];
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      withCredentials: true,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.setupNetworkMonitoring();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add request metadata for offline handling
        config.metadata = { startTime: Date.now() };
        
        return config;
      },
      (error) => {
        const networkError = this.createNetworkError(error, 'client');
        return Promise.reject(networkError);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => {
        // Cache successful GET requests for offline access
        if (response.config.method?.toLowerCase() === 'get') {
          const cacheKey = this.getCacheKey(response.config);
          this.offlineCache.set(cacheKey, response.data);
        }
        return response;
      },
      async (error: AxiosError) => {
        const networkError = this.handleNetworkError(error);
        
        // If offline and it's a GET request, try cache
        if (!this.isOnline && error.config?.method?.toLowerCase() === 'get') {
          return this.handleOfflineRequest(error.config);
        }
        
        // Queue request if offline
        if (!this.isOnline) {
          return this.queueRequest(() => this.instance(error.config!));
        }
        
        // Handle retry for retryable errors
        if (networkError.retryable) {
          return this.handleRetry(error.config, networkError);
        }
        
        return Promise.reject(networkError);
      }
    );
  }

  private setupNetworkMonitoring(): void {
    const updateNetworkStatus = () => {
      const wasOnline = this.isOnline;
      this.isOnline = navigator.onLine;
      
      if (wasOnline !== this.isOnline) {
        this.notifyNetworkStatusChange(this.isOnline);
        
        if (this.isOnline) {
          this.processRequestQueue();
          toast.success('Connection restored');
        } else {
          toast.error('Connection lost - working in offline mode');
        }
      }
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
  }

  private notifyNetworkStatusChange(online: boolean): void {
    this.networkStatusListeners.forEach(listener => listener(online));
  }

  private createNetworkError(error: any, type: ErrorType): NetworkError {
    const networkError = {
      name: 'NetworkError',
      message: error.message || 'Network error occurred',
      type,
      statusCode: error.response?.status,
      retryable: this.isRetryableError(error, type),
      originalError: error,
      stack: error.stack,
    } as NetworkError;
    return networkError;
  }

  private isRetryableError(error: AxiosError, type: ErrorType): boolean {
    if (type === 'network' || type === 'timeout') return true;
    if (error.response?.status === 429) return true; // Rate limit
    if (error.response?.status && error.response.status >= 500) return true; // Server errors
    return false;
  }

  private handleNetworkError(error: AxiosError): NetworkError {
    let errorType: ErrorType;
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorType = 'timeout';
    } else if (!error.response) {
      errorType = error.message === 'Network Error' ? 'cors' : 'network';
    } else if (error.response.status >= 500) {
      errorType = 'server';
    } else {
      errorType = 'client';
    }

    const networkError = this.createNetworkError(error, errorType);
    this.showUserFriendlyError(networkError);
    
    return networkError;
  }

  private showUserFriendlyError(error: NetworkError): void {
    const errorMessages = {
      network: 'Network connection failed. Please check your internet connection.',
      server: 'Server is temporarily unavailable. Please try again later.',
      timeout: 'Request timed out. Please check your connection and try again.',
      cors: 'Connection blocked by security policy. Please contact support.',
      client: 'Request failed. Please try again.'
    };

    const message = errorMessages[error.type] || 'An unexpected error occurred.';
    toast.error(message, { duration: 5000 });
  }

  private getCacheKey(config: AxiosRequestConfig): string {
    return `${config.method}-${config.url}-${JSON.stringify(config.params)}`;
  }

  private handleOfflineRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
    const cacheKey = this.getCacheKey(config);
    const cachedData = this.offlineCache.get(cacheKey);
    
    if (cachedData) {
      toast.success('Showing cached data (offline mode)', { duration: 3000 });
      return Promise.resolve({
        data: cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as AxiosResponse);
    }
    
    const error = this.createNetworkError(new Error('No cached data available'), 'network');
    toast.error('No cached data available for this request');
    return Promise.reject(error);
  }

  private queueRequest(request: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error('Failed to process queued request:', error);
        }
      }
    }
    
    this.isProcessingQueue = false;
  }

  private async handleRetry(config: AxiosRequestConfig | undefined, error: NetworkError): Promise<any> {
    if (!config) return Promise.reject(error);
    
    const retryConfig = config as AxiosRequestConfig & { _retry?: number; _retryCount?: number };
    retryConfig._retry = retryConfig._retry || 0;
    retryConfig._retryCount = retryConfig._retryCount || 0;

    if (retryConfig._retryCount < this.retryConfig.maxRetries) {
      retryConfig._retryCount++;
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryConfig._retryCount - 1),
        this.retryConfig.maxDelay
      );
      
      console.log(`Retrying request (${retryConfig._retryCount}/${this.retryConfig.maxRetries}) in ${delay}ms...`);
      toast.loading(`Retrying... (${retryConfig._retryCount}/${this.retryConfig.maxRetries})`, { id: 'retry' });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const result = await this.instance(retryConfig);
        toast.success('Request succeeded after retry', { id: 'retry' });
        return result;
      } catch (retryError) {
        if (retryConfig._retryCount >= this.retryConfig.maxRetries) {
          toast.error('Request failed after maximum retries', { id: 'retry' });
        }
        throw retryError;
      }
    }

    return Promise.reject(error);
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.instance.get<T>(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.instance.post<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.instance.put<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.instance.delete<T>(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Public methods for network status and cache management
  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  public onNetworkStatusChange(callback: (online: boolean) => void): void {
    this.networkStatusListeners.push(callback);
  }

  public clearCache(): void {
    this.offlineCache.clear();
  }

  public getCacheSize(): number {
    return this.offlineCache.size();
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }

  public getErrorDiagnostics(): {
    isOnline: boolean;
    cacheSize: number;
    queuedRequests: number;
    lastError?: NetworkError;
  } {
    return {
      isOnline: this.isOnline,
      cacheSize: this.offlineCache.size(),
      queuedRequests: this.requestQueue.length,
    };
  }

  // Fallback method for critical functionality
  public async getWithFallback<T>(url: string, fallbackData: T, config?: AxiosRequestConfig): Promise<T> {
    try {
      return await this.get<T>(url, config);
    } catch (error) {
      console.warn('Primary request failed, using fallback data:', error);
      toast.error('Using offline data - some features may be limited');
      return fallbackData;
    }
  }
}

export const api = new ApiClient();
export default api;
