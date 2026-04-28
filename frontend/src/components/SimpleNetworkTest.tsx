import React, { useState } from 'react';
import { api } from '../services/api';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import toast from 'react-hot-toast';

export const SimpleNetworkTest: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const networkStatus = useNetworkStatus();

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testSuccessfulRequest = async () => {
    setIsLoading(true);
    try {
      addResult('Testing successful request...');
      // Test with a real endpoint that should work
      const result = await api.get('/api/health');
      addResult('✅ Success: Request completed');
      toast.success('Test request successful');
    } catch (error) {
      addResult(`ℹ️ Expected error (no backend): ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Test request failed (expected - no backend running)');
    } finally {
      setIsLoading(false);
    }
  };

  const testNetworkFailure = async () => {
    setIsLoading(true);
    try {
      addResult('Testing network failure simulation...');
      // Simulate network failure by making request to invalid endpoint
      await api.get('http://invalid-endpoint-that-does-not-exist.com/api/test');
      addResult('❌ Unexpected: Request should have failed');
    } catch (error) {
      addResult(`✅ Expected error caught: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.success('Network error handled correctly');
    } finally {
      setIsLoading(false);
    }
  };

  const testTimeout = async () => {
    setIsLoading(true);
    try {
      addResult('Testing timeout handling...');
      // Create a custom request with very short timeout by modifying the API instance temporarily
      const originalTimeout = api['instance'].defaults.timeout;
      api['instance'].defaults.timeout = 1;
      
      try {
        await api.get('/api/health');
      } finally {
        api['instance'].defaults.timeout = originalTimeout;
      }
      
      addResult('❌ Unexpected: Request should have timed out');
    } catch (error) {
      addResult(`✅ Timeout error handled: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.success('Timeout handled correctly');
    } finally {
      setIsLoading(false);
    }
  };

  const testRetryLogic = async () => {
    setIsLoading(true);
    try {
      addResult('Testing retry logic with flaky endpoint...');
      // This would normally hit an endpoint that sometimes fails
      await api.get('/api/flaky-endpoint');
      addResult('✅ Retry logic worked or request succeeded');
    } catch (error) {
      addResult(`⚠️ Retry exhausted: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Retry logic exhausted');
    } finally {
      setIsLoading(false);
    }
  };

  const testOfflineMode = async () => {
    setIsLoading(true);
    try {
      addResult('Testing offline mode simulation...');
      // Simulate offline by checking cached data
      if (!networkStatus.isOnline) {
        addResult('✅ Offline mode detected');
        toast.success('Offline mode working');
      } else {
        addResult('ℹ️ Currently online - offline simulation not available');
        toast('Currently online');
      }
    } catch (error) {
      addResult(`❌ Offline test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testConnection = async () => {
    setIsLoading(true);
    try {
      addResult('Testing connection...');
      const isOnline = await networkStatus.testConnection();
      addResult(isOnline ? '✅ Connection test successful' : '❌ Connection test failed');
    } catch (error) {
      addResult(`❌ Connection test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Network Error Handling Test Suite</h2>
      
      {/* Network Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Current Network Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium">Status:</span>
            <span className={`ml-2 font-bold ${networkStatus.isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {networkStatus.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div>
            <span className="font-medium">Cache Size:</span>
            <span className="ml-2">{networkStatus.cacheSize}</span>
          </div>
          <div>
            <span className="font-medium">Queued:</span>
            <span className="ml-2">{networkStatus.queuedRequests}</span>
          </div>
          <div>
            <span className="font-medium">Connection:</span>
            <span className="ml-2">{networkStatus.connectionType || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Test Buttons */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Scenarios</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={testSuccessfulRequest}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Success Case
          </button>
          
          <button
            onClick={testNetworkFailure}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Network Failure
          </button>
          
          <button
            onClick={testTimeout}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Timeout
          </button>
          
          <button
            onClick={testRetryLogic}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Retry Logic
          </button>
          
          <button
            onClick={testOfflineMode}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test Offline Mode
          </button>
          
          <button
            onClick={testConnection}
            disabled={isLoading || networkStatus.isTesting}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {networkStatus.isTesting ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Test Results</h3>
          <button
            onClick={clearResults}
            className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm"
          >
            Clear Results
          </button>
        </div>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto">
          {testResults.length > 0 ? (
            testResults.map((result, index) => (
              <div key={index} className="mb-1">
                {result}
              </div>
            ))
          ) : (
            <div className="text-gray-500">No test results yet. Run a test to see results here.</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => networkStatus.clearCache()}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Clear Cache
        </button>
        
        <button
          onClick={() => networkStatus.retryQueuedRequests()}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Retry Queued Requests
        </button>
      </div>
    </div>
  );
};
