import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { 
  Activity, 
  Server, 
  AlertTriangle, 
  Settings, 
  BarChart3, 
  Shield,
  Zap,
  Globe
} from 'lucide-react';
import ServiceOverview from './components/ServiceOverview';
import ServiceHealth from './components/ServiceHealth';
import FailoverManagement from './components/FailoverManagement';
import MetricsDashboard from './components/MetricsDashboard';
import ServiceRegistry from './components/ServiceRegistry';
import './App.css';

function App() {
  const [activeServices, setActiveServices] = useState(0);
  const [healthyServices, setHealthyServices] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  useEffect(() => {
    // Fetch initial metrics
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/v1/service-discovery/health');
      const data = await response.json();
      setActiveServices(data.total || 0);
      setHealthyServices(data.healthy || 0);
      setActiveAlerts(data.alerts?.length || 0);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const navigation = [
    { name: 'Overview', href: '/', icon: Activity },
    { name: 'Services', href: '/services', icon: Server },
    { name: 'Health', href: '/health', icon: Shield },
    { name: 'Registry', href: '/registry', icon: Globe },
    { name: 'Failover', href: '/failover', icon: Zap },
    { name: 'Metrics', href: '/metrics', icon: BarChart3 },
  ];

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Settings className="h-8 w-8 text-blue-600" />
                <h1 className="ml-3 text-xl font-semibold text-gray-900">
                  Service Discovery Dashboard
                </h1>
              </div>
              <div className="flex items-center space-x-6">
                <div className="text-sm">
                  <span className="text-gray-500">Services:</span>
                  <span className="ml-2 font-semibold text-gray-900">
                    {healthyServices}/{activeServices}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Alerts:</span>
                  <span className={`ml-2 font-semibold ${activeAlerts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {activeAlerts}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="flex items-center px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 hover:border-blue-600 border-b-2 border-transparent transition-colors"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<ServiceOverview />} />
            <Route path="/services" element={<ServiceHealth />} />
            <Route path="/health" element={<ServiceHealth />} />
            <Route path="/registry" element={<ServiceRegistry />} />
            <Route path="/failover" element={<FailoverManagement />} />
            <Route path="/metrics" element={<MetricsDashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
