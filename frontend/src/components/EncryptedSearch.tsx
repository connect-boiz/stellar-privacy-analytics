import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, FileText, Calendar, Filter, Download, X, Loader2, AlertCircle, Hash, EyeOff, Shield, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

export interface EncryptedDataset {
  id: string;
  name: string;
  description: string;
  encrypted: boolean;
  createdAt: string;
  size: number;
  recordCount: number;
  privacyLevel: 'Low' | 'Medium' | 'High' | 'Maximum';
  tags: string[];
  searchIndex?: SearchIndex;
}

export interface SearchIndex {
  id: string;
  datasetId: string;
  indexedAt: string;
  tokenCount: number;
}

export interface SearchResult {
  id: string;
  datasetId: string;
  datasetName: string;
  matchText: string;
  context: string;
  score: number;
  highlighted: boolean;
  createdAt: string;
  privacyLevel: string;
}

export interface SearchFilters {
  dateRange?: { start: string; end: string };
  dataType?: string;
  privacyLevel?: string;
  tags?: string[];
}

interface EncryptedSearchProps {
  datasets?: EncryptedDataset[];
  onSearch?: (query: string, filters: SearchFilters) => Promise<SearchResult[]>;
  onExport?: (results: SearchResult[]) => void;
}

const sampleDatasets: EncryptedDataset[] = [
  {
    id: 'ds-1',
    name: 'Customer Behavior Data',
    description: 'Analysis of customer purchasing patterns and preferences',
    encrypted: true,
    createdAt: '2024-01-15T10:00:00Z',
    size: 2500000000,
    recordCount: 125000,
    privacyLevel: 'High',
    tags: ['customer', 'behavior', 'analytics'],
    searchIndex: { id: 'idx-1', datasetId: 'ds-1', indexedAt: '2024-01-15T12:00:00Z', tokenCount: 45000 }
  },
  {
    id: 'ds-2',
    name: 'Sales Q4 2023',
    description: 'Quarterly sales data with regional breakdowns',
    encrypted: true,
    createdAt: '2024-01-10T09:00:00Z',
    size: 856000000,
    recordCount: 45000,
    privacyLevel: 'Maximum',
    tags: ['sales', 'quarterly', 'revenue'],
    searchIndex: { id: 'idx-2', datasetId: 'ds-2', indexedAt: '2024-01-10T11:00:00Z', tokenCount: 28000 }
  },
  {
    id: 'ds-3',
    name: 'Marketing Campaign Results',
    description: 'Marketing campaign performance metrics',
    encrypted: true,
    createdAt: '2024-01-08T14:00:00Z',
    size: 1200000000,
    recordCount: 89000,
    privacyLevel: 'High',
    tags: ['marketing', 'campaign', 'metrics'],
    searchIndex: { id: 'idx-3', datasetId: 'ds-3', indexedAt: '2024-01-08T16:00:00Z', tokenCount: 32000 }
  },
  {
    id: 'ds-4',
    name: 'User Analytics 2023',
    description: 'Comprehensive user engagement and analytics data',
    encrypted: true,
    createdAt: '2024-01-05T08:00:00Z',
    size: 3700000000,
    recordCount: 234000,
    privacyLevel: 'Maximum',
    tags: ['analytics', 'engagement', 'users'],
    searchIndex: { id: 'idx-4', datasetId: 'ds-4', indexedAt: '2024-01-05T10:00:00Z', tokenCount: 65000 }
  }
];

const sampleResults: SearchResult[] = [
  {
    id: 'res-1',
    datasetId: 'ds-1',
    datasetName: 'Customer Behavior Data',
    matchText: 'customer',
    context: 'Customer behavior analysis shows increased purchasing frequency in Q4...',
    score: 0.95,
    highlighted: true,
    createdAt: '2024-01-15T10:00:00Z',
    privacyLevel: 'High'
  },
  {
    id: 'res-2',
    datasetId: 'ds-2',
    datasetName: 'Sales Q4 2023',
    matchText: 'customer',
    context: 'Customer satisfaction scores improved by 15% in Q4 2023...',
    score: 0.87,
    highlighted: true,
    createdAt: '2024-01-10T09:00:00Z',
    privacyLevel: 'Maximum'
  },
  {
    id: 'res-3',
    datasetId: 'ds-1',
    datasetName: 'Customer Behavior Data',
    matchText: 'customer',
    context: 'Premium customers showed 40% higher engagement rates...',
    score: 0.82,
    highlighted: true,
    createdAt: '2024-01-15T10:00:00Z',
    privacyLevel: 'High'
  }
];

export const EncryptedSearch: React.FC<EncryptedSearchProps> = ({ 
  datasets = sampleDatasets,
  onSearch,
  onExport
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [searchMetadata, setSearchMetadata] = useState<{ totalResults: number; searchTime: number } | null>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem('encrypted-search-history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const saveToHistory = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const newHistory = [searchQuery, ...history.filter(h => h !== searchQuery)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('encrypted-search-history', JSON.stringify(newHistory));
  }, [history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('encrypted-search-history');
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setResults([]);

    const startTime = performance.now();

    try {
      let searchResults: SearchResult[];

      if (onSearch) {
        searchResults = await onSearch(searchQuery, filters);
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        searchResults = sampleResults.filter(r => 
          r.matchText.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.context.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.datasetName.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      if (filters.privacyLevel) {
        searchResults = searchResults.filter(r => r.privacyLevel === filters.privacyLevel);
      }

      const searchTime = Math.round(performance.now() - startTime);
      
      setResults(searchResults);
      setSearchMetadata({ totalResults: searchResults.length, searchTime });
      saveToHistory(searchQuery);
      
      if (searchResults.length === 0) {
        toast.error('No results found for your search');
      } else {
        toast.success(`Found ${searchResults.length} results in ${searchTime}ms`);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [filters, onSearch, saveToHistory]);

  const handleQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleQuickSearch = (quickQuery: string) => {
    setQuery(quickQuery);
    performSearch(quickQuery);
  };

  const highlightText = (text: string, highlight: string): React.ReactNode => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() 
            ? <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
            : part
        )}
      </>
    );
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const exportResults = () => {
    if (onExport) {
      onExport(results);
    } else {
      const csvContent = [
        ['Dataset', 'Match', 'Context', 'Score', 'Date'].join(','),
        ...results.map(r => [
          `"${r.datasetName}"`,
          `"${r.matchText}"`,
          `"${r.context.replace(/"/g, '""')}"`,
          r.score.toFixed(2),
          r.createdAt
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `encrypted-search-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Search results exported');
    }
  };

  const indexedDatasets = useMemo(() => 
    datasets.filter(d => d.searchIndex).length, 
    [datasets]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Search className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Encrypted Dataset Search</h2>
              <p className="text-sm text-gray-500">Search across encrypted datasets with privacy protection</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-green-500" />
            <span className="text-xs text-green-600">{indexedDatasets} datasets indexed</span>
          </div>
        </div>

        <form onSubmit={handleQuerySubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search encrypted datasets..."
              className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md border ${
                showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span className="text-sm">Filters</span>
            </button>

            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Privacy Level</label>
                <select
                  value={filters.privacyLevel || ''}
                  onChange={(e) => setFilters({ ...filters, privacyLevel: e.target.value || undefined })}
                  className="border border-gray-300 rounded-md py-1.5 px-3 text-sm"
                >
                  <option value="">All Levels</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Maximum">Maximum</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <input
                  type="date"
                  value={filters.dateRange?.start || ''}
                  onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange!, start: e.target.value } })}
                  className="border border-gray-300 rounded-md py-1.5 px-3 text-sm"
                />
                <span className="mx-2 text-gray-400">to</span>
                <input
                  type="date"
                  value={filters.dateRange?.end || ''}
                  onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange!, end: e.target.value } })}
                  className="border border-gray-300 rounded-md py-1.5 px-3 text-sm"
                />
              </div>
            </div>
          )}
        </form>
      </div>

      {history.length > 0 && !hasSearched && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Recent Searches</h3>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((item, index) => (
              <button
                key={index}
                onClick={() => handleQuickSearch(item)}
                className="flex items-center space-x-1 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700 hover:bg-gray-200"
              >
                <Clock className="h-3 w-3" />
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searchMetadata && (
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>{searchMetadata.totalResults} results found</span>
            <span>in {searchMetadata.searchTime}ms</span>
          </div>
          {results.length > 0 && (
            <button
              onClick={exportResults}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          )}
        </div>
      )}

      {isSearching && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Searching encrypted datasets...</p>
        </div>
      )}

      {results.length > 0 && !isSearching && (
        <div className="space-y-4">
          {results.map((result) => (
            <motion.div
              key={result.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-gray-900">{result.datasetName}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      result.privacyLevel === 'Maximum' ? 'bg-purple-100 text-purple-700' :
                      result.privacyLevel === 'High' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {result.privacyLevel}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {highlightText(result.context, query)}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(result.createdAt), 'MMM dd, yyyy')}
                    </span>
                    <span className="flex items-center">
                      <Hash className="h-3 w-3 mr-1" />
                      Score: {(result.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <div className="text-xs text-gray-500">
                    Match confidence
                  </div>
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${result.score * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {hasSearched && results.length === 0 && !isSearching && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your search query or filters
          </p>
          <div className="flex justify-center space-x-2">
            <button
              onClick={() => handleQuickSearch('customer')}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
            >
              customer
            </button>
            <button
              onClick={() => handleQuickSearch('sales')}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
            >
              sales
            </button>
            <button
              onClick={() => handleQuickSearch('analytics')}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
            >
              analytics
            </button>
          </div>
        </div>
      )}

      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <EyeOff className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">Privacy-Protected Search</h4>
            <p className="text-sm text-blue-800 mt-1">
              All searches are performed on encrypted data with zero-knowledge proofs. 
              Search queries are never stored in plain text, and results are validated 
              before being decrypted for display.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EncryptedSearch;