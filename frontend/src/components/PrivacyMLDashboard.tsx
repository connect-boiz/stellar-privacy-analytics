import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Shield, 
  Network, 
  Lock, 
  Play, 
  Pause, 
  BarChart3,
  Users,
  Key,
  Eye,
  Activity
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface FederatedLearningStatus {
  isTraining: boolean;
  currentRound: number;
  config: {
    minClients: number;
    maxClients: number;
    rounds: number;
    targetAccuracy: number;
    privacyBudget: number;
  };
  metrics: Array<{
    round: number;
    accuracy: number;
    loss: number;
    participatingClients: number;
  }>;
  clients: Array<{
    id: string;
    dataSamples: number;
    status: string;
  }>;
}

interface PrivacyMetrics {
  totalQueries: number;
  totalEpsilonUsed: number;
  privacyBudgetRemaining: number;
  queryHistory: Array<{
    timestamp: string;
    type: string;
    epsilon: number;
  }>;
}

interface EncryptionStatus {
  totalModels: number;
  totalInferences: number;
  keyPairs: number;
  encryptionSchemes: Record<string, number>;
}

export const PrivacyMLDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'federated' | 'privacy' | 'encryption'>('federated');
  const [federatedStatus, setFederatedStatus] = useState<FederatedLearningStatus | null>(null);
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');
    setSocket(newSocket);

    // Listen for federated learning updates
    newSocket.on('training-status', (status: FederatedLearningStatus) => {
      setFederatedStatus(status);
    });

    newSocket.on('round-completed', (metrics: any) => {
      if (federatedStatus) {
        setFederatedStatus(prev => prev ? {
          ...prev,
          metrics: [...prev.metrics, metrics]
        } : null);
      }
    });

    // Fetch initial data
    fetchInitialData();

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const [federatedRes, privacyRes, encryptionRes] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/federated/status`),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/privacy/metrics`),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/audit`)
      ]);

      const [federatedData, privacyData, auditData] = await Promise.all([
        federatedRes.json(),
        privacyRes.json(),
        auditRes.json()
      ]);

      setFederatedStatus(federatedData);
      setPrivacyMetrics(privacyData);
      setEncryptionStatus(auditData.homomorphicEncryption);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const startFederatedTraining = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/federated/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialModel: Array(100).fill(0).map(() => Math.random()),
          config: {
            rounds: 50,
            targetAccuracy: 0.9
          }
        })
      });

      if (response.ok) {
        console.log('Federated training started');
      }
    } catch (error) {
      console.error('Failed to start federated training:', error);
    }
  };

  const stopFederatedTraining = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/federated/stop`, {
        method: 'POST'
      });

      if (response.ok) {
        console.log('Federated training stopped');
      }
    } catch (error) {
      console.error('Failed to stop federated training:', error);
    }
  };

  const initializePrivacyBudget = async (userId: string, epsilon: number = 5.0) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/privacy/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, epsilon })
      });

      if (response.ok) {
        console.log('Privacy budget initialized');
        fetchInitialData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to initialize privacy budget:', error);
    }
  };

  const generateEncryptionKeys = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/v1/ml/encryption/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: `key-${Date.now()}`,
          keySize: 2048
        })
      });

      if (response.ok) {
        console.log('Encryption keys generated');
        fetchInitialData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to generate encryption keys:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Privacy-Preserving ML</h1>
            <p className="text-gray-600 mt-1">Federated learning, differential privacy, and encrypted inference</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Privacy-First</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'federated', name: 'Federated Learning', icon: Network },
              { id: 'privacy', name: 'Differential Privacy', icon: Shield },
              { id: 'encryption', name: 'Homomorphic Encryption', icon: Lock }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'federated' && (
              <motion.div
                key="federated"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Federated Learning Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Brain className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-blue-900">Training Status</h3>
                        <p className="text-sm text-blue-700">
                          {federatedStatus?.isTraining ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Users className="h-8 w-8 text-green-600" />
                      <div>
                        <h3 className="font-medium text-green-900">Connected Clients</h3>
                        <p className="text-sm text-green-700">
                          {federatedStatus?.clients.length || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="h-8 w-8 text-purple-600" />
                      <div>
                        <h3 className="font-medium text-purple-900">Current Round</h3>
                        <p className="text-sm text-purple-700">
                          {federatedStatus?.currentRound || 0} / {federatedStatus?.config.rounds || 100}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Training Controls */}
                <div className="flex space-x-4">
                  <button
                    onClick={startFederatedTraining}
                    disabled={federatedStatus?.isTraining}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    <span>Start Training</span>
                  </button>
                  <button
                    onClick={stopFederatedTraining}
                    disabled={!federatedStatus?.isTraining}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Pause className="h-4 w-4" />
                    <span>Stop Training</span>
                  </button>
                </div>

                {/* Training Progress */}
                {federatedStatus?.metrics && federatedStatus.metrics.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Training Progress</h3>
                    <div className="space-y-3">
                      {federatedStatus.metrics.slice(-5).map((metric, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Round {metric.round}</span>
                          <div className="flex items-center space-x-4">
                            <span className="text-gray-900">Accuracy: {metric.accuracy.toFixed(3)}</span>
                            <span className="text-gray-500">Loss: {metric.loss.toFixed(3)}</span>
                            <span className="text-blue-600">{metric.participatingClients} clients</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connected Clients */}
                {federatedStatus?.clients && federatedStatus.clients.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Connected Clients</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {federatedStatus.clients.map((client, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${
                              client.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
                            }`} />
                            <span className="text-sm font-medium">Client {index + 1}</span>
                          </div>
                          <span className="text-sm text-gray-500">{client.dataSamples} samples</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'privacy' && (
              <motion.div
                key="privacy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Privacy Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Shield className="h-8 w-8 text-yellow-600" />
                      <div>
                        <h3 className="font-medium text-yellow-900">Privacy Budget Used</h3>
                        <p className="text-sm text-yellow-700">
                          {privacyMetrics?.totalEpsilonUsed.toFixed(2) || 0} ε
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Eye className="h-8 w-8 text-green-600" />
                      <div>
                        <h3 className="font-medium text-green-900">Budget Remaining</h3>
                        <p className="text-sm text-green-700">
                          {privacyMetrics?.privacyBudgetRemaining.toFixed(2) || 10.0} ε
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Activity className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-blue-900">Total Queries</h3>
                        <p className="text-sm text-blue-700">
                          {privacyMetrics?.totalQueries || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Privacy Controls */}
                <div className="space-y-4">
                  <button
                    onClick={() => initializePrivacyBudget('demo-user', 5.0)}
                    className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Initialize Privacy Budget</span>
                  </button>
                </div>

                {/* Query History */}
                {privacyMetrics?.queryHistory && privacyMetrics.queryHistory.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Recent Queries</h3>
                    <div className="space-y-2">
                      {privacyMetrics.queryHistory.slice(-5).map((query, index) => (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-white rounded">
                          <span className="text-gray-600">{query.type}</span>
                          <div className="flex items-center space-x-4">
                            <span className="text-gray-900">ε = {query.epsilon}</span>
                            <span className="text-gray-500">{new Date(query.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'encryption' && (
              <motion.div
                key="encryption"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Encryption Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Lock className="h-8 w-8 text-purple-600" />
                      <div>
                        <h3 className="font-medium text-purple-900">Encrypted Models</h3>
                        <p className="text-sm text-purple-700">
                          {encryptionStatus?.totalModels || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Key className="h-8 w-8 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-blue-900">Key Pairs</h3>
                        <p className="text-sm text-blue-700">
                          {encryptionStatus?.keyPairs || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Activity className="h-8 w-8 text-green-600" />
                      <div>
                        <h3 className="font-medium text-green-900">Encrypted Inferences</h3>
                        <p className="text-sm text-green-700">
                          {encryptionStatus?.totalInferences || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Encryption Controls */}
                <div className="space-y-4">
                  <button
                    onClick={generateEncryptionKeys}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Key className="h-4 w-4" />
                    <span>Generate Encryption Keys</span>
                  </button>
                </div>

                {/* Encryption Schemes */}
                {encryptionStatus?.encryptionSchemes && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-4">Encryption Schemes</h3>
                    <div className="space-y-2">
                      {Object.entries(encryptionStatus.encryptionSchemes).map(([scheme, count]) => (
                        <div key={scheme} className="flex items-center justify-between text-sm p-2 bg-white rounded">
                          <span className="text-gray-900 capitalize">{scheme}</span>
                          <span className="text-gray-600">{count} models</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
