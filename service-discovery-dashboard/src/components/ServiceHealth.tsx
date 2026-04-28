import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock,
  RefreshCw,
  Activity
} from 'lucide-react';

interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  health: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: string;
  version: string;
  tags: string[];
  responseTime?: number;
}

const ServiceHealth: React.FC = () => {
  const [services, setServices] = useState<ServiceInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/v1/service-discovery/services');
      const data = await response.json();
      setServices(data.services || []);
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'status-healthy';
      case 'unhealthy': return 'status-unhealthy';
      default: return 'status-unknown';
    }
  };

  const groupedServices = services.reduce((acc, service) => {
    if (!acc[service.name]) {
      acc[service.name] = [];
    }
    acc[service.name].push(service);
    return acc;
  }, {} as Record<string, ServiceInstance[]>);

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
        <h2 className="text-2xl font-bold text-gray-900">Service Health</h2>
        <button 
          onClick={fetchServices}
          className="btn-secondary flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Service Groups */}
      <div className="space-y-6">
        {Object.entries(groupedServices).map(([serviceName, instances]) => (
          <div key={serviceName} className="metric-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Activity className="h-6 w-6 text-blue-600 mr-3" />
                <h3 className="text-lg font-semibold text-gray-900">{serviceName}</h3>
                <span className="ml-3 text-sm text-gray-500">
                  {instances.length} instance{instances.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setSelectedService(selectedService === serviceName ? null : serviceName)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedService === serviceName ? 'Hide' : 'Show'} Details
              </button>
            </div>

            {/* Instance Status Bar */}
            <div className="flex items-center space-x-2 mb-4">
              {instances.map((instance) => (
                <div
                  key={instance.id}
                  className="flex items-center p-2 rounded-lg border border-gray-200"
                >
                  {getHealthIcon(instance.health)}
                  <span className="ml-2 text-sm font-medium">
                    {instance.host}:{instance.port}
                  </span>
                  {instance.responseTime && (
                    <span className="ml-2 text-xs text-gray-500">
                      {instance.responseTime}ms
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Detailed Instance Information */}
            {selectedService === serviceName && (
              <div className="border-t border-gray-200 pt-4">
                <div className="space-y-3">
                  {instances.map((instance) => (
                    <div key={instance.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getHealthIcon(instance.health)}
                          <div>
                            <p className="font-medium text-gray-900">
                              {instance.host}:{instance.port}
                            </p>
                            <p className="text-sm text-gray-500">
                              Version: {instance.version}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(instance.health)}`}>
                            {instance.health}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            Last check: {new Date(instance.lastHealthCheck).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      
                      {instance.tags.length > 0 && (
                        <div className="mt-3 flex items-center space-x-2">
                          <span className="text-sm text-gray-500">Tags:</span>
                          <div className="flex flex-wrap gap-1">
                            {instance.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {services.length === 0 && (
        <div className="metric-card text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Services Found</h3>
          <p className="text-gray-500">
            No services are currently registered in the service discovery system.
          </p>
        </div>
      )}
    </div>
  );
};

export default ServiceHealth;
