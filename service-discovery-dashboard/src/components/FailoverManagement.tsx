import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  Play, 
  Pause,
  Settings,
  RefreshCw
} from 'lucide-react';

interface FailoverPolicy {
  serviceName: string;
  maxFailures: number;
  recoveryTimeout: number;
  failoverStrategy: 'round_robin' | 'weighted' | 'priority' | 'geographic';
  backupInstances: string[];
  enableAutoFailover: boolean;
  healthCheckInterval: number;
}

interface FailoverStatus {
  serviceName: string;
  state: string;
  failureCount: number;
  hasDisasterRecoveryPlan: boolean;
}

const FailoverManagement: React.FC = () => {
  const [policies, setPolicies] = useState<FailoverPolicy[]>([]);
  const [status, setStatus] = useState<Record<string, FailoverStatus>>({});
  const [loading, setLoading] = useState(true);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [formData, setFormData] = useState<FailoverPolicy>({
    serviceName: '',
    maxFailures: 3,
    recoveryTimeout: 60000,
    failoverStrategy: 'round_robin',
    backupInstances: [],
    enableAutoFailover: true,
    healthCheckInterval: 30000
  });

  useEffect(() => {
    fetchFailoverData();
    const interval = setInterval(fetchFailoverData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchFailoverData = async () => {
    try {
      const [statusResponse] = await Promise.all([
        fetch('/api/v1/service-discovery/failover/status')
      ]);

      const statusData = await statusResponse.json();
      setStatus(statusData);

      // For demo purposes, we'll create some mock policies
      // In a real implementation, you'd fetch these from an API
      setPolicies([
        {
          serviceName: 'stellar-backend',
          maxFailures: 3,
          recoveryTimeout: 60000,
          failoverStrategy: 'round_robin',
          backupInstances: ['backup-1', 'backup-2'],
          enableAutoFailover: true,
          healthCheckInterval: 30000
        }
      ]);

    } catch (error) {
      console.error('Failed to fetch failover data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/v1/service-discovery/failover/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowPolicyForm(false);
        setFormData({
          serviceName: '',
          maxFailures: 3,
          recoveryTimeout: 60000,
          failoverStrategy: 'round_robin',
          backupInstances: [],
          enableAutoFailover: true,
          healthCheckInterval: 30000
        });
        fetchFailoverData();
      }
    } catch (error) {
      console.error('Failed to create failover policy:', error);
    }
  };

  const handleManualFailover = async (serviceName: string) => {
    if (!confirm(`Are you sure you want to initiate manual failover for ${serviceName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/service-discovery/failover/manual/${serviceName}`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchFailoverData();
      }
    } catch (error) {
      console.error('Failed to initiate manual failover:', error);
    }
  };

  const handleManualFailback = async (serviceName: string) => {
    if (!confirm(`Are you sure you want to initiate manual failback for ${serviceName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/service-discovery/failback/manual/${serviceName}`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchFailoverData();
      }
    } catch (error) {
      console.error('Failed to initiate manual failback:', error);
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'normal': return 'text-green-600 bg-green-100';
      case 'failed_over': return 'text-orange-600 bg-orange-100';
      case 'recovering': return 'text-blue-600 bg-blue-100';
      case 'disaster_recovery': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'normal': return <CheckCircle className="h-5 w-5" />;
      case 'failed_over': return <AlertTriangle className="h-5 w-5" />;
      case 'recovering': return <RefreshCw className="h-5 w-5" />;
      case 'disaster_recovery': return <AlertTriangle className="h-5 w-5" />;
      default: return <Settings className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Failover Management</h2>
        <div className="flex space-x-3">
          <button 
            onClick={fetchFailoverData}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button 
            onClick={() => setShowPolicyForm(true)}
            className="btn-primary flex items-center"
          >
            <Settings className="h-4 w-4 mr-2" />
            Add Policy
          </button>
        </div>
      </div>

      {/* Policy Form Modal */}
      {showPolicyForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create Failover Policy</h3>
              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Service Name</label>
                  <input
                    type="text"
                    required
                    value={formData.serviceName}
                    onChange={(e) => setFormData({...formData, serviceName: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max Failures</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxFailures}
                    onChange={(e) => setFormData({...formData, maxFailures: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Recovery Timeout (ms)</label>
                  <input
                    type="number"
                    min="1000"
                    value={formData.recoveryTimeout}
                    onChange={(e) => setFormData({...formData, recoveryTimeout: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Failover Strategy</label>
                  <select
                    value={formData.failoverStrategy}
                    onChange={(e) => setFormData({...formData, failoverStrategy: e.target.value as any})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="round_robin">Round Robin</option>
                    <option value="weighted">Weighted</option>
                    <option value="priority">Priority</option>
                    <option value="geographic">Geographic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Backup Instances (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.backupInstances.join(', ')}
                    onChange={(e) => setFormData({...formData, backupInstances: e.target.value.split(',').map(id => id.trim()).filter(Boolean)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enableAutoFailover"
                    checked={formData.enableAutoFailover}
                    onChange={(e) => setFormData({...formData, enableAutoFailover: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enableAutoFailover" className="ml-2 block text-sm text-gray-900">
                    Enable Auto Failover
                  </label>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPolicyForm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Create Policy
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Failover Status */}
      <div className="metric-card">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Failover Status</h3>
          <p className="text-sm text-gray-500">
            Current status of all services with failover policies
          </p>
        </div>

        {Object.keys(status).length === 0 ? (
          <div className="text-center py-12">
            <Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Failover Policies</h3>
            <p className="text-gray-500 mb-4">
              Create failover policies to enable automatic service recovery.
            </p>
            <button 
              onClick={() => setShowPolicyForm(true)}
              className="btn-primary"
            >
              Create Policy
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(status).map(([serviceName, serviceStatus]) => (
              <div key={serviceName} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${getStateColor(serviceStatus.state)}`}>
                      {getStateIcon(serviceStatus.state)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{serviceName}</h4>
                      <p className="text-sm text-gray-500">
                        State: <span className="font-medium">{serviceStatus.state}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Failure Count</p>
                      <p className="font-semibold">{serviceStatus.failureCount}</p>
                    </div>
                    <div className="flex space-x-2">
                      {serviceStatus.state !== 'normal' && (
                        <button
                          onClick={() => handleManualFailback(serviceName)}
                          className="btn-secondary flex items-center text-sm"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Failback
                        </button>
                      )}
                      <button
                        onClick={() => handleManualFailover(serviceName)}
                        className="btn-danger flex items-center text-sm"
                      >
                        <Pause className="h-3 w-3 mr-1" />
                        Failover
                      </button>
                    </div>
                  </div>
                </div>
                
                {serviceStatus.hasDisasterRecoveryPlan && (
                  <div className="mt-3 flex items-center text-sm text-green-600">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Disaster recovery plan configured
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Failover Policies */}
      {policies.length > 0 && (
        <div className="metric-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Failover Policies</h3>
            <p className="text-sm text-gray-500">
              Configuration for automatic failover behavior
            </p>
          </div>
          <div className="space-y-4">
            {policies.map((policy) => (
              <div key={policy.serviceName} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">{policy.serviceName}</h4>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    policy.enableAutoFailover ? 'status-healthy' : 'status-unhealthy'
                  }`}>
                    {policy.enableAutoFailover ? 'Auto' : 'Manual'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Strategy:</span>
                    <span className="ml-2 font-medium">{policy.failoverStrategy}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Max Failures:</span>
                    <span className="ml-2 font-medium">{policy.maxFailures}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Recovery Timeout:</span>
                    <span className="ml-2 font-medium">{policy.recoveryTimeout}ms</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Backup Instances:</span>
                    <span className="ml-2 font-medium">{policy.backupInstances.length}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FailoverManagement;
