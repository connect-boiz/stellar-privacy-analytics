import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface SearchContextType {
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchResults: SearchResult[]
  isSearching: boolean
  searchHistory: string[]
  addToHistory: (query: string) => void
  clearHistory: () => void
}

interface SearchResult {
  id: string
  title: string
  content: string
  url: string
  category: string
  highlights: string[]
}

const SearchContext = createContext<SearchContextType | undefined>(undefined)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // Load search history from localStorage
  useEffect(() => {
    const history = localStorage.getItem('search-history')
    if (history) {
      setSearchHistory(JSON.parse(history))
    }
  }, [])

  // Save search history to localStorage
  useEffect(() => {
    if (searchHistory.length > 0) {
      localStorage.setItem('search-history', JSON.stringify(searchHistory))
    }
  }, [searchHistory])

  const addToHistory = (query: string) => {
    if (!query.trim()) return
    
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== query)
      return [query, ...filtered].slice(0, 10) // Keep last 10 searches
    })
  }

  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('search-history')
  }

  // Mock search function - in production, this would use Lunr.js or Algolia
  const performSearch = async (query: string) => {
    setIsSearching(true)
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))
    
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    // Mock search results
    const mockResults: SearchResult[] = [
      {
        id: '1',
        title: 'Differential Privacy Basics',
        content: 'Differential privacy is a system for publicly sharing information about a dataset by describing patterns within the dataset while withholding information about individuals in the dataset.',
        url: '/docs/beginner/differential-privacy-basics',
        category: 'Beginner',
        highlights: ['Differential privacy', 'publicly sharing information', 'patterns within dataset']
      },
      {
        id: '2',
        title: 'Secure Multi-Party Computation',
        content: 'SMPC allows multiple parties to jointly compute a function over their inputs without revealing those inputs to each other.',
        url: '/docs/beginner/smpc-overview',
        category: 'Beginner',
        highlights: ['Secure Multi-Party Computation', 'jointly compute', 'without revealing inputs']
      },
      {
        id: '3',
        title: 'Zero-Knowledge Proofs',
        content: 'A zero-knowledge proof is a method by which one party can prove to another party that they know a value x, without conveying any information apart from the fact that they know the value x.',
        url: '/docs/beginner/zk-proofs-introduction',
        category: 'Beginner',
        highlights: ['Zero-knowledge proof', 'prove to another party', 'without conveying information']
      },
      {
        id: '4',
        title: 'Privacy Query Language (PQL)',
        content: 'PQL is a domain-specific language for writing privacy-preserving queries that automatically apply differential privacy mechanisms.',
        url: '/docs/provider/pql-guide',
        category: 'Data Provider',
        highlights: ['Privacy Query Language', 'domain-specific language', 'privacy-preserving queries']
      },
      {
        id: '5',
        title: 'Epsilon Budget Management',
        content: 'Learn how to manage and allocate epsilon budgets across different queries and datasets to maintain overall privacy guarantees.',
        url: '/docs/provider/epsilon-budget',
        category: 'Data Provider',
        highlights: ['Epsilon budget management', 'allocate epsilon budgets', 'privacy guarantees']
      }
    ].filter(result => 
      result.title.toLowerCase().includes(query.toLowerCase()) ||
      result.content.toLowerCase().includes(query.toLowerCase()) ||
      result.category.toLowerCase().includes(query.toLowerCase())
    )

    setSearchResults(mockResults)
    setIsSearching(false)
  }

  // Perform search when query changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [searchQuery])

  return (
    <SearchContext.Provider value={{
      searchQuery,
      setSearchQuery,
      searchResults,
      isSearching,
      searchHistory,
      addToHistory,
      clearHistory
    }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  const context = useContext(SearchContext)
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider')
  }
  return context
}
