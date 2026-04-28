import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showClearButton?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  size = 'md',
  showClearButton = true
}) => {
  const sizeClasses = {
    sm: {
      wrapper: 'h-8',
      icon: 'w-3 h-3 left-2',
      input: 'pl-7 pr-6 text-sm',
      clearBtn: 'right-1'
    },
    md: {
      wrapper: 'h-10',
      icon: 'w-4 h-4 left-3',
      input: 'pl-10 pr-10 text-sm',
      clearBtn: 'right-2'
    },
    lg: {
      wrapper: 'h-12',
      icon: 'w-5 h-5 left-4',
      input: 'pl-12 pr-12 text-base',
      clearBtn: 'right-3'
    }
  };

  const classes = sizeClasses[size];

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className={`relative ${classes.wrapper} ${className}`}>
      <Search className={`absolute top-1/2 transform -translate-y-1/2 text-gray-400 ${classes.icon}`} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${classes.input}`}
      />
      {showClearButton && value && (
        <button
          onClick={handleClear}
          className={`absolute top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors ${classes.clearBtn}`}
          aria-label="Clear search"
        >
          <X className={`${size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 w-4'} text-gray-400`} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
