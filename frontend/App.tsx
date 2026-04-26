import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

// i18n
import './i18n';
import { getDirection } from './i18n';

// Components
import { Layout } from './components/Layout';
import { ModalProvider } from './components/ui/Modal';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import PrivacyHealthDashboard from './pages/PrivacyHealthDashboard';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { DataManagement } from './pages/DataManagement';
import { PrivacySettings } from './pages/PrivacySettings';
import CertificationDashboard from './pages/CertificationDashboard';
import AuditExplorerPage from './pages/AuditExplorerPage';
import EncryptedUploadPage from './pages/EncryptedUploadPage';
import { Login } from './pages/Login';
import { WorkflowBuilder } from './pages/WorkflowBuilder';
import SearchPage from './pages/SearchPage';
import ConsentPage from './pages/ConsentPage';
import PerformancePage from './pages/PerformancePage';
import PrivacyBudgetPage from './pages/PrivacyBudgetPage';
import { NetworkTestPage } from './pages/NetworkTestPage';
import { PrivacyEducation } from './pages/PrivacyEducation';
import DataTableDemo from './pages/DataTableDemo';
import TrainingPage from './pages/TrainingPage';
import TrainingModulePage from './pages/TrainingModulePage';
import TrainingAdminPage from './pages/TrainingAdminPage';
import OnboardingPage from './pages/OnboardingPage';
import KeyManagementPage from './pages/KeyManagementPage';

// Hooks
import { useAuth } from './hooks/useAuth';

// Styles
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof Error) {
          if (error.message.includes('Network Error') && failureCount >= 2) {
            return false;
          }
          if (error.message.includes('5') && failureCount < 3) {
            return true;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: (failureCount, error) => {
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

  useEffect(() => {
    const savedLanguage = localStorage.getItem('preferred-language') || 'en';
    document.documentElement.dir = getDirection(savedLanguage);
    document.documentElement.lang = savedLanguage;
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <ErrorBoundary>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <Routes>
                <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} />
                <Route
                  element={
                    <ProtectedRoute isAuthenticated={isAuthenticated}>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<PrivacyHealthDashboard />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/data" element={<DataManagement />} />
                  <Route path="/privacy" element={<PrivacySettings />} />
                  <Route path="/audit" element={<AuditExplorerPage />} />
                  <Route path="/upload" element={<EncryptedUploadPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/consent" element={<ConsentPage />} />
                  <Route path="/performance" element={<PerformancePage />} />
                  <Route path="/budget" element={<PrivacyBudgetPage />} />
                  <Route path="/training" element={<TrainingPage />} />
                  <Route path="/training/module/:moduleId" element={<TrainingModulePage />} />
                  <Route path="/training/admin" element={<TrainingAdminPage />} />
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/network-test" element={<NetworkTestPage />} />
                  <Route path="/key-management" element={<KeyManagementPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Route>
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
        </ErrorBoundary>
      </ModalProvider>
    </QueryClientProvider>
  );
}

export default App;
