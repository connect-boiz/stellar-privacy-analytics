import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  Globe, 
  Search, 
  Download, 
  Upload, 
  Edit, 
  Save, 
  X, 
  CheckCircle, 
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { supportedLanguages } from '../i18n';

interface TranslationKey {
  key: string;
  value: string;
  isMissing?: boolean;
}

interface TranslationNamespace {
  [key: string]: string | TranslationNamespace;
}

export const TranslationManager: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);
  const [selectedNamespace, setSelectedNamespace] = useState('translation');
  const [searchTerm, setSearchTerm] = useState('');
  const [translations, setTranslations] = useState<TranslationKey[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const namespaces = ['translation', 'common', 'privacy'];

  useEffect(() => {
    loadTranslations();
  }, [selectedLanguage, selectedNamespace]);

  const loadTranslations = async () => {
    setIsLoading(true);
    try {
      const resources = i18n.getResourceBundle(selectedLanguage, selectedNamespace);
      const flatTranslations = flattenObject(resources || {});
      setTranslations(flatTranslations);
    } catch (error) {
      console.error('Failed to load translations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const flattenObject = (obj: any, prefix = ''): TranslationKey[] => {
    const result: TranslationKey[] = [];
    
    for (const key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        result.push(...flattenObject(obj[key], newKey));
      } else {
        result.push({
          key: newKey,
          value: obj[key] || '',
          isMissing: !obj[key] || obj[key] === ''
        });
      }
    }
    
    return result;
  };

  const unflattenObject = (flatTranslations: TranslationKey[]): TranslationNamespace => {
    const result: TranslationNamespace = {};
    
    flatTranslations.forEach(({ key, value }) => {
      const keys = key.split('.');
      let current = result;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as TranslationNamespace;
      }
      
      current[keys[keys.length - 1]] = value;
    });
    
    return result;
  };

  const filteredTranslations = translations.filter(item =>
    item.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditingValue(value);
  };

  const handleSave = () => {
    if (editingKey) {
      const updatedTranslations = translations.map(item =>
        item.key === editingKey ? { ...item, value: editingValue, isMissing: false } : item
      );
      setTranslations(updatedTranslations);
      setEditingKey(null);
      setEditingValue('');
      setHasChanges(true);
    }
  };

  const handleAddKey = () => {
    if (newKey && newValue) {
      const newTranslation: TranslationKey = {
        key: newKey,
        value: newValue,
        isMissing: false
      };
      setTranslations([...translations, newTranslation]);
      setNewKey('');
      setNewValue('');
      setShowAddKey(false);
      setHasChanges(true);
    }
  };

  const handleDelete = (key: string) => {
    const updatedTranslations = translations.filter(item => item.key !== key);
    setTranslations(updatedTranslations);
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    setIsLoading(true);
    try {
      const unflattened = unflattenObject(translations);
      i18n.addResourceBundle(selectedLanguage, selectedNamespace, unflattened, true, true);
      
      // In a real application, you would save this to your backend
      console.log('Saving translations:', unflattened);
      
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save translations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const unflattened = unflattenObject(translations);
    const dataStr = JSON.stringify(unflattened, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${selectedLanguage}_${selectedNamespace}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          const flatImported = flattenObject(imported);
          setTranslations(flatImported);
          setHasChanges(true);
        } catch (error) {
          console.error('Failed to import translations:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const missingCount = translations.filter(item => item.isMissing).length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Translation Manager</h1>
            <p className="text-gray-600 mt-1">Manage translations for privacy-related UI elements</p>
          </div>
          <div className="flex items-center space-x-4">
            {hasChanges && (
              <motion.button
                onClick={handleSaveAll}
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Save className="w-4 h-4" />
                <span>Save All</span>
              </motion.button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <label className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {supportedLanguages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namespace</label>
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {namespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search translations..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {missingCount > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                {missingCount} missing translation{missingCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add New Key */}
      {showAddKey && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Translation Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g., privacy.dashboard.title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Translation value"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleAddKey}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Add</span>
              </button>
              <button
                onClick={() => setShowAddKey(false)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Translations List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Translations ({filteredTranslations.length})
            </h2>
            <button
              onClick={() => setShowAddKey(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              <span>Add Key</span>
            </button>
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredTranslations.map((item) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 hover:bg-gray-50"
                >
                  {editingKey === item.key ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-900">{item.key}</div>
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSave}
                          className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="flex items-center space-x-1 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                          <X className="w-4 h-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{item.key}</div>
                        <div className={`text-sm ${item.isMissing ? 'text-red-600 italic' : 'text-gray-600'}`}>
                          {item.isMissing ? '[Missing]' : item.value}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(item.key, item.value)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.key)}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
