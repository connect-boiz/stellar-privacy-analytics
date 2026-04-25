import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  Download, 
  Upload,
  Settings,
  FileText,
  Users,
  Database,
  Globe,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Info,
  Trash2,
  Edit
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format, subDays, addDays } from 'date-fns';

export interface ConsentCategory {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  required: boolean;
  purpose: string;
  legalBasis: string;
  dataTypes: string[];
  retentionPeriod: number;
  thirdPartySharing: boolean;
  gdprRelated: boolean;
  ccpaRelated: boolean;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  categoryId: string;
  categoryName: string;
  granted: boolean;
  grantedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  ipAddress: string;
  method: 'explicit' | 'implied' | 'auto';
}

export interface ConsentHistoryEntry {
  id: string;
  timestamp: string;
  action: 'granted' | 'revoked' | 'modified' | 'expired';
  categoryName: string;
  userId: string;
  details: string;
}

const defaultCategories: ConsentCategory[] = [
  {
    id: 'cat-1',
    name: 'Personal Data Processing',
    description: 'Allow processing of personal identifying information',
    enabled: false,
    required: true,
    purpose: 'To provide personalized services based on user preferences',
    legalBasis: 'Legitimate Interest',
    dataTypes: ['Name', 'Email', 'Phone', 'Address'],
    retentionPeriod: 365,
    thirdPartySharing: false,
    gdprRelated: true,
    ccpaRelated: true
  },
  {
    id: 'cat-2',
    name: 'Analytics & Performance',
    description: 'Collect usage data to improve our services',
    enabled: false,
    required: false,
    purpose: 'To analyze usage patterns and optimize service performance',
    legalBasis: 'Consent',
    dataTypes: ['Page views', 'Click patterns', 'Session duration'],
    retentionPeriod: 180,
    thirdPartySharing: false,
    gdprRelated: false,
    ccpaRelated: false
  },
  {
    id: 'cat-3',
    name: 'Marketing Communications',
    description: 'Receive promotional emails and offers',
    enabled: false,
    required: false,
    purpose: 'To send relevant marketing content and special offers',
    legalBasis: 'Consent',
    dataTypes: ['Email', 'Preferences', 'Purchase history'],
    retentionPeriod: 730,
    thirdPartySharing: true,
    gdprRelated: true,
    ccpaRelated: true
  },
  {
    id: 'cat-4',
    name: 'Data Sharing with Partners',
    description: 'Share anonymized data with trusted partners',
    enabled: false,
    required: false,
    purpose: 'To enable collaborative research and improved services',
    legalBasis: 'Consent',
    dataTypes: ['Anonymized identifiers', 'Aggregate data'],
    retentionPeriod: 365,
    thirdPartySharing: true,
    gdprRelated: true,
    ccpaRelated: false
  },
  {
    id: 'cat-5',
    name: 'Location Services',
    description: 'Access location data for personalized content',
    enabled: false,
    required: false,
    purpose: 'To provide location-based recommendations and services',
    legalBasis: 'Consent',
    dataTypes: ['GPS coordinates', 'IP-based location'],
    retentionPeriod: 30,
    thirdPartySharing: false,
    gdprRelated: false,
    ccpaRelated: false
  },
  {
    id: 'cat-6',
    name: 'AI/ML Training',
    description: 'Use data for training machine learning models',
    enabled: false,
    required: false,
    purpose: 'To improve AI-powered features and recommendations',
    legalBasis: 'Legitimate Interest',
    dataTypes: ['Behavioral patterns', 'Usage data'],
    retentionPeriod: 1095,
    thirdPartySharing: false,
    gdprRelated: true,
    ccpaRelated: false
  }
];

const sampleConsentHistory: ConsentHistoryEntry[] = [
  {
    id: 'hist-1',
    timestamp: new Date().toISOString(),
    action: 'granted',
    categoryName: 'Personal Data Processing',
    userId: 'user-123',
    details: 'User granted consent for personal data processing'
  },
  {
    id: 'hist-2',
    timestamp: subDays(new Date(), 1).toISOString(),
    action: 'granted',
    categoryName: 'Analytics & Performance',
    userId: 'user-123',
    details: 'User enabled analytics cookies'
  },
  {
    id: 'hist-3',
    timestamp: subDays(new Date(), 3).toISOString(),
    action: 'revoked',
    categoryName: 'Marketing Communications',
    userId: 'user-456',
    details: 'User opted out of marketing emails'
  },
  {
    id: 'hist-4',
    timestamp: subDays(new Date(), 5).toISOString(),
    action: 'expired',
    categoryName: 'Location Services',
    userId: 'user-789',
    details: 'Consent automatically expired per retention policy'
  }
];

interface ConsentManagementProps {
  userId?: string;
  onConsentChange?: (categoryId: string, granted: boolean) => void;
  onBulkAction?: (categoryIds: string[], action: 'grant' | 'revoke') => void;
}

const ConsentManagement: React.FC<ConsentManagementProps> = ({
  userId = 'current-user',
  onConsentChange,
  onBulkAction
}) => {
  const [categories, setCategories] = useState<ConsentCategory[]>(defaultCategories);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'individual' | 'bulk' | 'history' | 'compliance'>('individual');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [history, setHistory] = useState<ConsentHistoryEntry[]>(sampleConsentHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'gdpr' | 'ccpa'>('all');

  const toggleCategory = useCallback((categoryId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id === categoryId) {
        const newEnabled = !cat.enabled;
        
        if (onConsentChange) {
          onConsentChange(categoryId, newEnabled);
        }
        
        return { ...cat, enabled: newEnabled };
      }
      return cat;
    }));
  }, [onConsentChange]);

  const handleBulkGrant = useCallback(() => {
    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }
    
    setIsLoading(true);
    
    setTimeout(() => {
      setCategories(prev => prev.map(cat => 
        selectedCategories.includes(cat.id) 
          ? { ...cat, enabled: true }
          : cat
      ));
      
      if (onBulkAction) {
        onBulkAction(selectedCategories, 'grant');
      }
      
      toast.success(`Consent granted for ${selectedCategories.length} categories`);
      setIsLoading(false);
      setSelectedCategories([]);
    }, 500);
  }, [selectedCategories, onBulkAction]);

  const handleBulkRevoke = useCallback(() => {
    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }
    
    setIsLoading(true);
    
    setTimeout(() => {
      setCategories(prev => prev.map(cat => 
        selectedCategories.includes(cat.id) 
          ? { ...cat, enabled: false }
          : cat
      ));
      
      if (onBulkAction) {
        onBulkAction(selectedCategories, 'revoke');
      }
      
      toast.success(`Consent revoked for ${selectedCategories.length} categories`);
      setIsLoading(false);
      setSelectedCategories([]);
    }, 500);
  }, [selectedCategories, onBulkAction]);

  const toggleSelectCategory = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSelectAll = (enabled: boolean) => {
    if (enabled) {
      setSelectedCategories(categories.map(c => c.id));
    } else {
      setSelectedCategories([]);
    }
  };

  const exportConsentReport = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      userId,
      consentSummary: categories.map(cat => ({
        category: cat.name,
        enabled: cat.enabled,
        grantedAt: cat.enabled ? new Date().toISOString() : null
      }))
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consent-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Consent report exported');
  };

  const handleDataDeletion = (categoryId: string) => {
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1000)),
      {
        loading: 'Deleting data...',
        success: 'Data deleted successfully',
        error: 'Failed to delete data'
      }
    );
  };

  const filteredCategories = categories.filter(cat => {
    if (complianceFilter === 'gdpr') return cat.gdprRelated;
    if (complianceFilter === 'ccpa') return cat.ccpaRelated;
    return true;
  });

  const stats = {
    granted: categories.filter(c => c.enabled).length,
    total: categories.length,
    required: categories.filter(c => c.required && !c.enabled).length,
    gdpr: categories.filter(c => c.gdprRelated && c.enabled).length,
    ccpa: categories.filter(c => c.ccpaRelated && c.enabled).length
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Consent Management</h2>
              <p className="text-sm text-gray-600">Manage your data processing permissions</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportConsentReport}
              className="flex items-center space-x-2 px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.granted}</div>
            <div className="text-sm text-green-700">Granted</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.total - stats.granted}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.required}</div>
            <div className="text-sm text-red-700">Required</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.gdpr}</div>
            <div className="text-sm text-blue-700">GDPR</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.ccpa}</div>
            <div className="text-sm text-purple-700">CCPA</div>
          </div>
        </div>

        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-4">
            {[
              { id: 'individual', label: 'Granular Consent', icon: Settings },
              { id: 'bulk', label: 'Bulk Management', icon: Users },
              { id: 'history', label: 'History', icon: Clock },
              { id: 'compliance', label: 'Compliance', icon: FileText }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'individual' && (
          <div className="space-y-3">
            {filteredCategories.map(category => (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`border rounded-lg transition-all ${
                  category.enabled 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-gray-200'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className={`mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                          category.enabled
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-300'
                        }`}
                      >
                        {category.enabled && (
                          <CheckCircle className="h-4 w-4 text-white" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">{category.name}</h3>
                          {category.required && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                              Required
                            </span>
                          )}
                          {category.gdprRelated && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                              GDPR
                            </span>
                          )}
                          {category.ccpaRelated && (
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                              CCPA
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>Retention: {category.retentionPeriod} days</span>
                          <span>Legal: {category.legalBasis}</span>
                          {category.thirdPartySharing && (
                            <span className="text-yellow-600">Third-party sharing</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedCategory(
                        expandedCategory === category.id ? null : category.id
                      )}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedCategory === category.id ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedCategory === category.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 border-t border-gray-200 bg-white"
                    >
                      <div className="mt-4 space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Purpose</h4>
                          <p className="text-sm text-gray-600">{category.purpose}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Data Types</h4>
                          <div className="flex flex-wrap gap-2">
                            {category.dataTypes.map(type => (
                              <span key={type} className="px-2 py-1 bg-gray-100 rounded text-xs">
                                {type}
                              </span>
                            ))}
                          </div>
                        </div>
                        {category.enabled && (
                          <div className="pt-2">
                            <button
                              onClick={() => handleDataDeletion(category.id)}
                              className="flex items-center space-x-2 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="text-sm">Delete my data</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {activeTab === 'bulk' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedCategories.length === categories.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium">Select All</span>
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  {selectedCategories.length} selected
                </span>
                <button
                  onClick={handleBulkGrant}
                  disabled={isLoading || selectedCategories.length === 0}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Grant</span>
                </button>
                <button
                  onClick={handleBulkRevoke}
                  disabled={isLoading || selectedCategories.length === 0}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Revoke</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {categories.map(category => (
                <div
                  key={category.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    selectedCategories.includes(category.id)
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category.id)}
                      onChange={() => toggleSelectCategory(category.id)}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{category.name}</div>
                      <div className="text-sm text-gray-500">{category.description}</div>
                    </div>
                  </label>
                  <div className={`px-2 py-1 text-xs rounded ${
                    category.enabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {category.enabled ? 'Granted' : 'Pending'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {history.map(entry => (
              <div
                key={entry.id}
                className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg"
              >
                <div className={`mt-0.5 p-1 rounded ${
                  entry.action === 'granted' ? 'bg-green-100' :
                  entry.action === 'revoked' ? 'bg-red-100' :
                  'bg-yellow-100'
                }`}>
                  {entry.action === 'granted' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : entry.action === 'revoked' ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{entry.categoryName}</span>
                    <span className="text-sm text-gray-500">
                      {format(new Date(entry.timestamp), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{entry.details}</p>
                  <div className="text-xs text-gray-500 mt-1">
                    User: {entry.userId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="space-y-4">
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => setComplianceFilter('all')}
                className={`px-3 py-1.5 text-sm rounded ${
                  complianceFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setComplianceFilter('gdpr')}
                className={`px-3 py-1.5 text-sm rounded ${
                  complianceFilter === 'gdpr'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                GDPR Only
              </button>
              <button
                onClick={() => setComplianceFilter('ccpa')}
                className={`px-3 py-1.5 text-sm rounded ${
                  complianceFilter === 'ccpa'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                CCPA Only
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Legal Basis
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Retention
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Compliance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCategories.map(category => (
                    <tr key={category.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {category.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {category.purpose}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {category.legalBasis}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {category.retentionPeriod} days
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          category.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {category.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-1">
                          {category.gdprRelated && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                              GDPR
                            </span>
                          )}
                          {category.ccpaRelated && (
                            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
                              CCPA
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">Data Privacy Information</h4>
            <p className="text-sm text-blue-800 mt-1">
              Under GDPR and CCPA regulations, you have the right to access, rectify, 
              and delete your personal data. You can withdraw consent at any time. Contact our 
              privacy team for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentManagement;