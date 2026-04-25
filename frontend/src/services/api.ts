import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

/**
 * Enhanced API client with retry logic, exponential backoff, and CORS fallback
 */
class ApiClient {
  private instance: AxiosInstance;
  private retryCount = 3;
  private baseBackoff = 1000; // 1 second

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as AxiosRequestConfig & { _retry?: number };

        // Handle CORS errors (Network Error usually means CORS or server down)
        if (!error.response && error.message === 'Network Error') {
          return this.handleNetworkError(config);
        }

        // Handle rate limiting (429) or server errors (5xx) with retry
        if (error.response && (error.response.status === 429 || error.response.status >= 500)) {
          return this.handleRetry(config, error);
        }

        // Handle unauthorized (401)
        if (error.response?.status === 401) {
          localStorage.removeItem('authToken');
          // In a real app, redirect to login or refresh token
        }

        return Promise.reject(error);
      }
    );
  }

  private async handleNetworkError(config: AxiosRequestConfig & { _retry?: number }) {
    console.error('Network error detected - possible CORS issue or server unreachable');
    
    // Check if we can try a fallback endpoint
    if (process.env.REACT_APP_API_FALLBACK_URL && !config.url?.startsWith(process.env.REACT_APP_API_FALLBACK_URL)) {
      console.log('Trying fallback API endpoint...');
      const fallbackConfig = {
        ...config,
        baseURL: process.env.REACT_APP_API_FALLBACK_URL
      };
      return this.instance(fallbackConfig);
    }

    toast.error('Network error: Connection to the privacy server failed. Please check your connection or CORS settings.');
    return Promise.reject(new Error('Network error or CORS failure'));
  }

  private async handleRetry(config: AxiosRequestConfig & { _retry?: number }, error: AxiosError) {
    config._retry = config._retry || 0;

    if (config._retry < this.retryCount) {
      config._retry++;
      const delay = this.baseBackoff * Math.pow(2, config._retry - 1);
      
      console.log(`Retrying request (${config._retry}/${this.retryCount}) in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.instance(config);
    }

    return Promise.reject(error);
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }
}

export const api = new ApiClient();
export default api;
