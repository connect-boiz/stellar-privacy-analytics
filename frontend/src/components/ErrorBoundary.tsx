import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'app_errors';
const MAX_TRACE_FRAMES = 3;
const MAX_STORED_ERRORS = 10;

function getEncryptionKey(): string {
  let key = sessionStorage.getItem('error_encryption_key');
  if (!key) {
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    key = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('error_encryption_key', key);
  }
  return key;
}

function encryptPayload(data: string): string {
  return CryptoJS.AES.encrypt(data, getEncryptionKey()).toString();
}

function decryptPayload(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}

function truncateStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack.split('\n');
  return frames.slice(0, MAX_TRACE_FRAMES).join('\n');
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: Math.random().toString(36).substr(2, 9),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      errorInfo,
      errorId: Math.random().toString(36).substr(2, 9),
    });

    // Log error to console
    console.error('Error caught by boundary:', error, errorInfo);

    // Show toast notification
    toast.error('Something went wrong. Please try refreshing the page.', {
      duration: 5000,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Store error for debugging (in a real app, send to error reporting service)
    this.storeErrorForDebugging(error, errorInfo);
  }

  private storeErrorForDebugging = (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorData = {
        errorId: this.state.errorId,
        message: error.message,
        stack: truncateStack(error.stack),
        componentStack: truncateStack(errorInfo.componentStack),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      let existing: unknown[] = [];
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          existing = JSON.parse(decryptPayload(raw));
        } catch {
          existing = [];
        }
      }

      existing.push(errorData);

      if (existing.length > MAX_STORED_ERRORS) {
        existing = existing.slice(-MAX_STORED_ERRORS);
      }

      localStorage.setItem(STORAGE_KEY, encryptPayload(JSON.stringify(existing)));
    } catch (e) {
      console.warn('Failed to store error for debugging:', e);
    }
  };

  static clearStoredErrors(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // silently ignore
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  private handleReportError = () => {
    const errorReport = {
      errorId: this.state.errorId,
      error: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };

    // Copy to clipboard
    navigator.clipboard
      .writeText(JSON.stringify(errorReport, null, 2))
      .then(() => {
        toast.success('Error report copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy error report');
      });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-white rounded-lg shadow-lg p-6"
          >
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>

            <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Something went wrong
            </h1>

            <p className="text-gray-600 text-center mb-6">
              We're sorry, but something unexpected happened. The error has been logged for
              debugging.
            </p>

            <div className="bg-gray-50 rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-500 mb-1">Error ID: {this.state.errorId}</p>
              <p className="text-sm text-gray-700 font-mono break-all">
                {this.state.error?.message}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={this.handleRefresh}
                  className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  <span>Home</span>
                </button>
              </div>

              <button
                onClick={this.handleReportError}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Bug className="w-4 h-4" />
                <span>Copy Error Report</span>
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">Technical Details</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <strong>Stack Trace:</strong>
                    <pre className="mt-1 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                      {this.state.error?.stack}
                    </pre>
                  </div>
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap font-mono bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
