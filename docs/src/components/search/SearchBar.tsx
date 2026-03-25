import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearch } from '@/components/providers/SearchProvider'
import { Search, Clock, X } from 'lucide-react'

export function SearchBar() {
  const { searchQuery, setSearchQuery, searchResults, isSearching, searchHistory, addToHistory, clearHistory } = useSearch()
  const [isOpen, setIsOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    setIsOpen(searchQuery.length > 0 || showHistory)
  }, [searchQuery, showHistory])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      addToHistory(query)
    }
  }

  const handleResultClick = (result: any) => {
    addToHistory(searchQuery)
    setSearchQuery('')
    setShowHistory(false)
    // Navigate to result URL
    window.location.href = result.url
  }

  const handleHistoryClick = (query: string) => {
    setSearchQuery(query)
    setShowHistory(false)
  }

  return (
    <div className="relative max-w-2xl mx-auto">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          placeholder="Search documentation..."
          className="search-input"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Results & History */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden"
          >
            {/* Search History */}
            {showHistory && searchHistory.length > 0 && searchQuery.length === 0 && (
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">Recent Searches</h3>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {searchHistory.map((query, index) => (
                    <button
                      key={index}
                      onClick={() => handleHistoryClick(query)}
                      className="flex items-center w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md"
                    >
                      <Clock className="w-4 h-4 mr-2 text-gray-400" />
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {searchQuery.length > 0 && (
              <div className="p-4">
                {isSearching ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="text-sm text-gray-500 mt-2">Searching...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleResultClick(result)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{result.title}</h4>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{result.content}</p>
                            <div className="flex items-center mt-2 space-x-2">
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {result.category}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">No results found for "{searchQuery}"</p>
                    <p className="text-xs text-gray-400 mt-1">Try searching for differential privacy, SMPC, or ZK proofs</p>
                  </div>
                )}
              </div>
            )}

            {/* Search Tips */}
            {searchQuery.length === 0 && searchHistory.length === 0 && (
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Popular Searches</h3>
                <div className="flex flex-wrap gap-2">
                  {['Differential Privacy', 'SMPC', 'ZK Proofs', 'PQL', 'Epsilon'].map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSearch(term)}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
