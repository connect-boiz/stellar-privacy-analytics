import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Database, Activity, Lock, Eye, AlertCircle } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const stats = [
    {
      name: 'Privacy Score',
      value: '95%',
      icon: Shield,
      color: 'bg-green-500',
      description: 'Excellent privacy protection'
    },
    {
      name: 'Encrypted Datasets',
      value: '12',
      icon: Database,
      color: 'bg-blue-500',
      description: 'Securely stored data'
    },
    {
      name: 'Active Analyses',
      value: '3',
      icon: Activity,
      color: 'bg-purple-500',
      description: 'Privacy-preserving analytics'
    },
    {
      name: 'Data Requests',
      value: '247',
      icon: Eye,
      color: 'bg-indigo-500',
      description: 'Total access requests'
    }
  ];

  const recentActivity = [
    {
      id: 1,
      action: 'X-Ray Analysis Completed',
      resource: 'Customer Behavior Dataset',
      time: '2 hours ago',
      privacy: 'High',
      status: 'success'
    },
    {
      id: 2,
      action: 'Data Encryption Applied',
      resource: 'Sales Q4 2023',
      time: '4 hours ago',
      privacy: 'Maximum',
      status: 'success'
    },
    {
      id: 3,
      action: 'Privacy Settings Updated',
      resource: 'User Preferences',
      time: '6 hours ago',
      privacy: 'High',
      status: 'info'
    },
    {
      id: 4,
      action: 'New Dataset Uploaded',
      resource: 'Marketing Campaign Data',
      time: '1 day ago',
      privacy: 'Standard',
      status: 'warning'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stellar Dashboard</h1>
            <p className="text-gray-600 mt-1">Privacy-first analytics at a glance</p>
          </div>
          <div className="flex items-center space-x-2">
            <Lock className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Privacy Mode Active</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-lg shadow p-6"
            >
              <div className="flex items-center">
                <div className={`flex-shrink-0 p-3 rounded-lg ${stat.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">{stat.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Privacy Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Status</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <Shield className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-green-900">Data Encryption</p>
                <p className="text-xs text-green-700">All datasets are end-to-end encrypted</p>
              </div>
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">Active</span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center">
              <Eye className="h-5 w-5 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-blue-900">Differential Privacy</p>
                <p className="text-xs text-blue-700">Statistical noise applied to queries</p>
              </div>
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">Enabled</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center">
              <Lock className="h-5 w-5 text-purple-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-purple-900">Access Control</p>
                <p className="text-xs text-purple-700">Role-based permissions enforced</p>
              </div>
            </div>
            <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-1 rounded">Enforced</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {recentActivity.map((activity) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-3 ${
                  activity.status === 'success' ? 'bg-green-500' :
                  activity.status === 'warning' ? 'bg-yellow-500' :
                  activity.status === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                  <p className="text-xs text-gray-500">{activity.resource}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{activity.time}</p>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  activity.privacy === 'Maximum' ? 'bg-purple-100 text-purple-700' :
                  activity.privacy === 'High' ? 'bg-green-100 text-green-700' :
                  activity.privacy === 'Standard' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {activity.privacy}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Activity className="h-5 w-5 mr-2" />
            Start X-Ray Analysis
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Database className="h-5 w-5 mr-2" />
            Upload New Dataset
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            <Shield className="h-5 w-5 mr-2" />
            Review Privacy Settings
          </button>
        </div>
      </div>
    </div>
  );
};
