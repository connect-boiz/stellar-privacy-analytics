import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Lock,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Settings,
  Sun,
  Moon,
  Database,
  Activity,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { secureSettingsStorage } from '../services/secureSettingsStorage';

interface PrivacyBudget {
  totalEpsilon: number;
  usedEpsilon: number;
  remainingEpsilon: number;
  percentageUsed: number;
  lastUpdated: string;
  status: 'healthy' | 'warning' | 'critical';
}

interface ZKProofVerification {
  id: string;
  statement: string;
  status: 'pending' | 'verifying' | 'verified' | 'failed';
  progress: number;
  timestamp: string;
  verifierCount: number;
}

interface SMPCSession {
  id: string;
  name: string;
  participantCount: number;
  requiredParticipants: number;
  status: 'initializing' | 'active' | 'computing' | 'completed' | 'failed';
  progress: number;
  startTime: string;
  estimatedCompletion?: string;
}

interface DataRetentionPolicy {
  policyName: string;
  retentionDays: number;
  dataCategories: string[];
  autoDelete: boolean;
  lastReviewDate: string;
}

interface PrivacyLevel {
  id: string;
  name: string;
  description: string;
  epsilonLimit: number;
  deltaLimit: number;
  features: string[];
}

const PRIVACY_LEVELS: PrivacyLevel[] = [
  {
    id: 'strict',
    name: 'Strict Privacy',
    description: 'Maximum privacy protection with minimal data access',
    epsilonLimit: 0.5,
    deltaLimit: 1e-6,
    features: ['ZK proofs required', 'SMPC for all computations', 'Auto-delete after 30 days']
  },
  {
    id: 'standard',
    name: 'Standard Privacy',
    description: 'Balanced privacy and utility for general use',
    epsilonLimit: 2.0,
    deltaLimit: 1e-5,
    features: ['ZK proofs for sensitive queries', 'Selective SMPC', 'Auto-delete after 90 days']
  },
  {
    id: 'relaxed',
    name: 'Relaxed Privacy',
    description: 'Lower privacy for improved data utility',
    epsilonLimit: 5.0,
    deltaLimit: 1e-4,
    features: ['Optional ZK proofs', 'On-demand SMPC', 'Auto-delete after 365 days']
  }
];

const PrivacyDashboard: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [privacyBudget, setPrivacyBudget] = useState<PrivacyBudget | null>(null);
  const [zkProofs, setZkProofs] = useState<ZKProofVerification[]>([]);
  const [smpcSessions, setSmpcSessions] = useState<SMPCSession[]>([]);
  const [retentionPolicy, setRetentionPolicy] = useState<DataRetentionPolicy | null>(null);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState<string>('standard');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Load settings from secure storage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load dark mode setting
        const savedDarkMode = secureSettingsStorage.get<boolean>('privacy_dashboard_dark_mode');
        if (savedDarkMode !== null) {
          setDarkMode(savedDarkMode);
          if (savedDarkMode) {
            document.documentElement.classList.add('dark');
          }
        }

        // Load privacy level setting
        const savedPrivacyLevel = secureSettingsStorage.get<string>('privacy_dashboard_level');
        if (savedPrivacyLevel) {
          setSelectedPrivacyLevel(savedPrivacyLevel);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, []);

  // Save dark mode setting when it changes
  useEffect(() => {
    const saveDarkMode = async () => {
      try {
        await secureSettingsStorage.set('privacy_dashboard_dark_mode', darkMode);
      } catch (error) {
        console.error('Failed to save dark mode setting:', error);
      }
    };

    saveDarkMode();
  }, [darkMode]);

  // Save privacy level setting when it changes
  useEffect(() => {
    const savePrivacyLevel = async () => {
      try {
        await secureSettingsStorage.set('privacy_dashboard_level', selectedPrivacyLevel);
      } catch (error) {
        console.error('Failed to save privacy level setting:', error);
      }
    };

    savePrivacyLevel();
  }, [selectedPrivacyLevel]);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  }, [darkMode]);

  // Fetch privacy budget data
  const fetchPrivacyBudget = useCallback(async () => {
    try {
      const response = await axios.get('/api/v1/privacy/budget/overview');
      if (response.data.success) {
        setPrivacyBudget(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch privacy budget:', error);
      // Set mock data for demo
      setPrivacyBudget({
        totalEpsilon: 3.0,
        usedEpsilon: 1.8,
        remainingEpsilon: 1.2,
        percentageUsed: 60,
        lastUpdated: new Date().toISOString(),
        status: 'healthy'
      });
    }
  }, []);

  // Fetch ZK proof verifications
  const fetchZKProofs = useCallback(async () => {
    try {
      const response = await axios.get('/api/v1/zk/verifications');
      if (response.data.success) {
        setZkProofs(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch ZK proofs:', error);
      // Set mock data for demo
      setZkProofs([
        {
          id: 'zk-1',
          statement: 'Age range query verification',
          status: 'verified',
          progress: 100,
          timestamp: new Date(Date.now() - 300000).toISOString(),
          verifierCount: 5
        },
        {
          id: 'zk-2',
          statement: 'Income bracket verification',
          status: 'verifying',
          progress: 65,
          timestamp: new Date(Date.now() - 120000).toISOString(),
          verifierCount: 3
        },
        {
          id: 'zk-3',
          statement: 'Location data proof',
          status: 'pending',
          progress: 0,
          timestamp: new Date().toISOString(),
          verifierCount: 0
        }
      ]);
    }
  }, []);

  // Fetch SMPC sessions
  const fetchSMPCSessions = useCallback(async () => {
    try {
      const response = await axios.get('/api/v1/smpc/sessions');
      if (response.data.success) {
        setSmpcSessions(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch SMPC sessions:', error);
      // Set mock data for demo
      setSmpcSessions([
        {
          id: 'smpc-1',
          name: 'Joint Statistics Computation',
          participantCount: 4,
          requiredParticipants: 5,
          status: 'computing',
          progress: 45,
          startTime: new Date(Date.now() - 600000).toISOString(),
          estimatedCompletion: new Date(Date.now() + 300000).toISOString()
        },
        {
          id: 'smpc-2',
          name: 'Aggregate Analysis',
          participantCount: 3,
          requiredParticipants: 3,
          status: 'active',
          progress: 0,
          startTime: new Date(Date.now() - 180000).toISOString()
        },
        {
          id: 'smpc-3',
          name: 'Privacy-Preserving ML Training',
          participantCount: 5,
          requiredParticipants: 5,
          status: 'completed',
          progress: 100,
          startTime: new Date(Date.now() - 3600000).toISOString()
        }
      ]);
    }
  }, []);

  // Fetch data retention policy
  const fetchRetentionPolicy = useCallback(async () => {
    try {
      const response = await axios.get('/api/v1/privacy/retention-policy');
      if (response.data.success) {
        setRetentionPolicy(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch retention policy:', error);
      // Set mock data for demo
      setRetentionPolicy({
        policyName: 'Standard Data Retention',
        retentionDays: 90,
        dataCategories: ['User Analytics', 'Query Logs', 'Audit Trails'],
        autoDelete: true,
        lastReviewDate: new Date(Date.now() - 86400000 * 7).toISOString()
      });
    }
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchPrivacyBudget(),
        fetchZKProofs(),
        fetchSMPCSessions(),
        fetchRetentionPolicy()
      ]);
      setLoading(false);
    };

    loadData();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchPrivacyBudget();
      fetchZKProofs();
      fetchSMPCSessions();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [fetchPrivacyBudget, fetchZKProofs, fetchSMPCSessions, fetchRetentionPolicy]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'verified':
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
      case 'verifying':
      case 'computing':
      case 'active':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'pending':
      case 'initializing':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'verified':
      case 'completed':
        return <CheckCircle className="w-5 h-5" />;
      case 'warning':
      case 'verifying':
      case 'computing':
      case 'active':
        return <Activity className="w-5 h-5" />;
      case 'critical':
      case 'failed':
        return <XCircle className="w-5 h-5" />;
      case 'pending':
      case 'initializing':
        return <Clock className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Privacy Dashboard
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Real-time privacy monitoring and control
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-colors`}
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-colors`}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Privacy Budget Section */}
        {privacyBudget && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Privacy Budget Usage
                </h2>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(privacyBudget.status)}`}>
                {privacyBudget.status.toUpperCase()}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Epsilon</div>
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {privacyBudget.totalEpsilon.toFixed(2)}
                </div>
              </div>
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Used</div>
                <div className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  {privacyBudget.usedEpsilon.toFixed(2)}
                </div>
              </div>
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Remaining</div>
                <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                  {privacyBudget.remainingEpsilon.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className={`w-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-4`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${privacyBudget.percentageUsed}%` }}
                  transition={{ duration: 1 }}
                  className={`h-4 rounded-full ${privacyBudget.percentageUsed >= 90
                    ? 'bg-red-500'
                    : privacyBudget.percentageUsed >= 70
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                    }`}
                />
              </div>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-2`}>
                {privacyBudget.percentageUsed.toFixed(1)}% used • Last updated: {new Date(privacyBudget.lastUpdated).toLocaleString()}
              </div>
            </div>
          </motion.div>
        )}

        {/* ZK Proof Verification Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}
        >
          <div className="flex items-center space-x-2 mb-4">
            <Lock className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              ZK Proof Verifications
            </h2>
          </div>

          <div className="space-y-4">
            {zkProofs.map((proof) => (
              <div
                key={proof.id}
                className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(proof.status)}
                    <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {proof.statement}
                    </span>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(proof.status)}`}>
                    {proof.status.toUpperCase()}
                  </div>
                </div>

                <div className="mb-2">
                  <div className={`w-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'} rounded-full h-2`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${proof.progress}%` }}
                      transition={{ duration: 0.5 }}
                      className={`h-2 rounded-full ${proof.status === 'verified' || proof.status === 'completed'
                        ? 'bg-green-500'
                        : proof.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                        }`}
                    />
                  </div>
                </div>

                <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span>Progress: {proof.progress}%</span>
                  <span>Verifiers: {proof.verifierCount}</span>
                  <span>{new Date(proof.timestamp).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* SMPC Sessions Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}
        >
          <div className="flex items-center space-x-2 mb-4">
            <Users className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              SMPC Sessions
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {smpcSessions.map((session) => (
              <div
                key={session.id}
                className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {session.name}
                  </div>
                  {getStatusIcon(session.status)}
                </div>

                <div className={`mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div className="flex items-center space-x-2 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">
                      {session.participantCount}/{session.requiredParticipants} participants
                    </span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Started: {new Date(session.startTime).toLocaleString()}
                  </div>
                  {session.estimatedCompletion && (
                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Est. completion: {new Date(session.estimatedCompletion).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="mb-2">
                  <div className={`w-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'} rounded-full h-2`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${session.progress}%` }}
                      transition={{ duration: 0.5 }}
                      className={`h-2 rounded-full ${session.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                    />
                  </div>
                </div>

                <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span>{session.progress}% complete</span>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(session.status)}`}>
                    {session.status.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Privacy Level Configuration */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}
          >
            <div className="flex items-center space-x-2 mb-4">
              <Settings className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Privacy Level Configuration
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PRIVACY_LEVELS.map((level) => (
                <motion.div
                  key={level.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedPrivacyLevel(level.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedPrivacyLevel === level.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                      ? 'border-gray-600 hover:border-gray-500'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    {selectedPrivacyLevel === level.id ? (
                      <Eye className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    ) : (
                      <EyeOff className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
                    )}
                    <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {level.name}
                    </h3>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    {level.description}
                  </p>
                  <div className="space-y-1">
                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      ε limit: {level.epsilonLimit}
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      δ limit: {level.deltaLimit.toExponential(1)}
                    </div>
                    {level.features.map((feature, index) => (
                      <div key={index} className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        • {feature}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  toast.success('Privacy level updated');
                  setShowSettings(false);
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply Changes
              </button>
            </div>
          </motion.div>
        )}

        {/* Data Retention Policy */}
        {retentionPolicy && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-6 mb-6`}
          >
            <div className="flex items-center space-x-2 mb-4">
              <Database className={`w-5 h-5 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Data Retention Policy
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  Policy Name
                </div>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {retentionPolicy.policyName}
                </div>
              </div>
              <div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  Retention Period
                </div>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {retentionPolicy.retentionDays} days
                </div>
              </div>
              <div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  Auto-Delete
                </div>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {retentionPolicy.autoDelete ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  Last Review
                </div>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {new Date(retentionPolicy.lastReviewDate).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                Data Categories
              </div>
              <div className="flex flex-wrap gap-2">
                {retentionPolicy.dataCategories.map((category, index) => (
                  <span
                    key={index}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${darkMode
                      ? 'bg-gray-700 text-gray-300'
                      : 'bg-gray-100 text-gray-700'
                      }`}
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-4`}
          >
            <div className="flex items-center space-x-2">
              <Zap className={`w-5 h-5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Active Proofs
              </div>
            </div>
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
              {zkProofs.filter(p => p.status === 'verifying').length}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-4`}
          >
            <div className="flex items-center space-x-2">
              <Activity className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Active Sessions
              </div>
            </div>
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
              {smpcSessions.filter(s => s.status === 'active' || s.status === 'computing').length}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-4`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Completed Today
              </div>
            </div>
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
              {zkProofs.filter(p => p.status === 'verified').length +
                smpcSessions.filter(s => s.status === 'completed').length}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} p-4`}
          >
            <div className="flex items-center space-x-2">
              <Shield className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Privacy Score
              </div>
            </div>
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
              {privacyBudget ? Math.max(0, 100 - privacyBudget.percentageUsed).toFixed(0) : '--'}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyDashboard;
