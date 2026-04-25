import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

// Components
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { DataManagement } from './pages/DataManagement';
import { PrivacySettings } from './pages/PrivacySettings';
import AuditExplorerPage from './pages/AuditExplorerPage';
import EncryptedUploadPage from './pages/EncryptedUploadPage';
import { Login } from './pages/Login';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';

// New pages
import SearchPage from './pages/SearchPage';
import ConsentPage from './pages/ConsentPage';
import PerformancePage from './pages/PerformancePage';
import PrivacyBudgetPage from './pages/PrivacyBudgetPage';
import { NetworkTestPage } from './pages/NetworkTestPage';
import { PrivacyEducation } from './pages/PrivacyEducation';
import DataTableDemo from './pages/DataTableDemo';

// Hooks
import { useAuth } from './hooks/useAuth';

// Styles
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Custom retry logic based on error type
        if (error instanceof Error) {
          // Don't retry network errors more than 2 times
          if (error.message.includes('Network Error') && failureCount >= 2) {
            return false;
          }
          // Retry server errors up to 3 times
          if (error.message.includes('5') && failureCount < 3) {
            return true;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: (failureCount, error) => {
        // Retry mutations up to 2 times for network errors
        if (error instanceof Error && error.message.includes('Network Error')) {
          return failureCount < 2;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="min-h-screen bg-gray-50">
            {/* Network Status Indicator */}
            <div className="fixed top-4 right-4 z-50">
              <NetworkStatusIndicator />
            </div>
            
            <Routes>
              <Route 
                path="/login" 
                element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />} 
              />
              <Route
                path="/*"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Layout>
                      <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/data" element={<DataManagement />} />
                        <Route path="/privacy" element={<PrivacySettings />} />
                        <Route path="/audit" element={<AuditExplorerPage />} />
                        <Route path="/upload" element={<EncryptedUploadPage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/consent" element={<ConsentPage />} />
                        <Route path="/performance" element={<PerformancePage />} />
                        <Route path="/budget" element={<PrivacyBudgetPage />} />
                        <Route path="/network-test" element={<NetworkTestPage />} />
                        <Route path="/education" element={<PrivacyEducation />} />
                        <Route path="/data-table" element={<DataTableDemo />} />
                        <Route path="/" element={<Navigate to="/dashboard" />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </div>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
