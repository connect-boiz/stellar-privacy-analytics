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

// New pages
import SearchPage from './pages/SearchPage';
import ConsentPage from './pages/ConsentPage';
import PerformancePage from './pages/PerformancePage';
import PrivacyBudgetPage from './pages/PrivacyBudgetPage';

// Hooks
import { useAuth } from './hooks/useAuth';

// Styles
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
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
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
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
  );
}

export default App;
