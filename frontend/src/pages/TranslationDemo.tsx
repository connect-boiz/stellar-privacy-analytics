import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  Globe, 
  Calendar, 
  DollarSign, 
  Ruler, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Eye,
  EyeOff,
  Settings,
  Database,
  Shield
} from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLocalization } from '../utils/localization';
import { TranslationFallback } from '../components/TranslationFallback';

export const TranslationDemo: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { 
    formatDate, 
    formatCurrency, 
    formatNumber, 
    formatPercentage, 
    formatDateTime,
    formatRelativeTime,
    formatFileSize,
    formatMeasurement,
    getMeasurementSystem
  } = useLocalization();
  
  const [showMissingDemo, setShowMissingDemo] = useState(false);
  const [testDate] = useState(new Date());
  const [testNumber] = useState(1234567.89);
  const [testCurrency] = useState(1234.56);
  const [testFileSize] = useState(1048576); // 1MB

  const currentDirection = i18n.dir();
  const isRTL = currentDirection === 'rtl';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t('privacy.dashboard.title')}
            </h1>
            <p className="text-gray-600 mt-2">
              {t('privacy.dashboard.subtitle')}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              {t('language.select')}: <span className="font-medium">{i18n.language}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </motion.div>

      {/* RTL Indicator */}
      {isRTL && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <div className="flex items-center space-x-2">
            <Globe className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800">
              RTL Mode Active: {currentDirection}
            </span>
          </div>
        </motion.div>
      )}

      {/* Privacy Dashboard Demo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('privacy.dashboard.tabs.federated')}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <Database className="h-8 w-8 text-blue-600" />
              <div>
                <h3 className="font-medium text-blue-900">
                  {t('privacy.dashboard.federated.trainingStatus')}
                </h3>
                <p className="text-sm text-blue-700">
                  {t('privacy.dashboard.federated.active')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-green-600" />
              <div>
                <h3 className="font-medium text-green-900">
                  {t('privacy.dashboard.privacy.privacyBudgetUsed')}
                </h3>
                <p className="text-sm text-green-700">
                  {formatNumber(2.5)} {t('privacy.dashboard.privacy.epsilon')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <Settings className="h-8 w-8 text-purple-600" />
              <div>
                <h3 className="font-medium text-purple-900">
                  {t('privacy.dashboard.encryption.encryptedModels')}
                </h3>
                <p className="text-sm text-purple-700">
                  {formatNumber(12)} {t('privacy.dashboard.encryption.models')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Localization Demo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Localization Examples
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Date & Time Formatting</span>
            </h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Short Date:</span>
                <span className="font-mono">{formatDate(testDate, 'short')}</span>
              </div>
              <div className="flex justify-between">
                <span>Medium Date:</span>
                <span className="font-mono">{formatDate(testDate, 'medium')}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="font-mono">{formatDateTime(testDate, 'medium')}</span>
              </div>
              <div className="flex justify-between">
                <span>Relative:</span>
                <span className="font-mono">{formatRelativeTime(testDate)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span>Number & Currency Formatting</span>
            </h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Number:</span>
                <span className="font-mono">{formatNumber(testNumber)}</span>
              </div>
              <div className="flex justify-between">
                <span>Percentage:</span>
                <span className="font-mono">{formatPercentage(0.2345)}</span>
              </div>
              <div className="flex justify-between">
                <span>Currency:</span>
                <span className="font-mono">{formatCurrency(testCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>File Size:</span>
                <span className="font-mono">{formatFileSize(testFileSize)}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Measurement Units Demo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Measurement Units ({getMeasurementSystem()})
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700 flex items-center space-x-2">
              <Ruler className="w-4 h-4" />
              <span>Length</span>
            </h4>
            <div className="text-sm space-y-1">
              <div>1000m = {formatMeasurement(1000, 'length')}</div>
              <div>1.5m = {formatMeasurement(1.5, 'length')}</div>
              <div>50cm = {formatMeasurement(0.5, 'length')}</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-gray-700">Weight</h4>
            <div className="text-sm space-y-1">
              <div>1000g = {formatMeasurement(1000, 'weight')}</div>
              <div>2.5kg = {formatMeasurement(2.5, 'weight')}</div>
              <div>500g = {formatMeasurement(0.5, 'weight')}</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-gray-700">Temperature</h4>
            <div className="text-sm space-y-1">
              <div>25°C = {formatMeasurement(25, 'temperature')}</div>
              <div>0°C = {formatMeasurement(0, 'temperature')}</div>
              <div>100°C = {formatMeasurement(100, 'temperature')}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Privacy Settings Demo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('privacy.settings.title')}
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">
                {t('privacy.settings.privacyLevel')}
              </h3>
              <p className="text-sm text-gray-600">
                {t('privacy.settings.subtitle')}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-600">
                {t('privacy.settings.badge')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('privacy.settings.dataRetentionPeriod')}
              </label>
              <input
                type="number"
                defaultValue="365"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('privacy.settings.privacyBudget')}
              </label>
              <input
                type="number"
                defaultValue="1.0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Fallback Demo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Translation Fallback Demo
          </h2>
          <button
            onClick={() => setShowMissingDemo(!showMissingDemo)}
            className="flex items-center space-x-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            {showMissingDemo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showMissingDemo ? 'Hide' : 'Show'} Missing Keys</span>
          </button>
        </div>

        {showMissingDemo && (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  Missing Translation Examples
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Missing key with fallback:</span>
                  <TranslationFallback 
                    translationKey="nonexistent.key" 
                    fallbackValue="Custom Fallback Value"
                  />
                </div>
                
                <div className="flex justify-between">
                  <span>Missing key with auto-fallback:</span>
                  <TranslationFallback translationKey="some.missing.key" />
                </div>
                
                <div className="flex justify-between">
                  <span>Missing key with warning:</span>
                  <TranslationFallback 
                    translationKey="another.missing.key" 
                    showWarning={true}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Implementation Status
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">✅ Completed Features</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Multi-language support (10 languages)</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Dynamic language switching</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>RTL support (Arabic)</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Date/number/currency formatting</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Measurement unit localization</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Translation fallback system</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Translation management interface</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">🔧 Technical Details</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>Framework: react-i18next</li>
              <li>Total translation keys: 150+</li>
              <li>Privacy-specific keys: 80+</li>
              <li>RTL languages: Arabic</li>
              <li>Measurement systems: Metric & Imperial</li>
              <li>Language persistence: localStorage</li>
              <li>Auto-detection: Browser & localStorage</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
