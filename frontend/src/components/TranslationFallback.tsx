import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Globe } from 'lucide-react';

interface TranslationFallbackProps {
  translationKey: string;
  fallbackValue?: string;
  showWarning?: boolean;
  className?: string;
}

export const TranslationFallback: React.FC<TranslationFallbackProps> = ({
  translationKey,
  fallbackValue,
  showWarning = false,
  className = ''
}) => {
  const { t, i18n } = useTranslation();

  // Try to get the translation
  const translation = t(translationKey, { defaultValue: '' });

  // If translation exists and is not the key itself, use it
  if (translation && translation !== translationKey) {
    return <span className={className}>{translation}</span>;
  }

  // Generate fallback value if not provided
  const generateFallback = () => {
    if (fallbackValue) return fallbackValue;
    
    // Convert key to readable format
    return translationKey
      .split('.')
      .pop()
      ?.replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase()) || translationKey;
  };

  const fallbackText = generateFallback();

  // Log missing translation for debugging
  if (process.env.NODE_ENV === 'development') {
    console.warn(`Missing translation for key "${translationKey}" in language "${i18n.language}"`);
  }

  if (showWarning) {
    return (
      <span className={`inline-flex items-center space-x-1 ${className}`}>
        <AlertTriangle className="w-4 h-4 text-yellow-500" />
        <span className="text-yellow-700">{fallbackText}</span>
        <Globe className="w-3 h-3 text-gray-400" />
      </span>
    );
  }

  return <span className={className}>{fallbackText}</span>;
};

// Higher-order component for automatic fallback
export const withTranslationFallback = <P extends object>(
  WrappedComponent: React.ComponentType<P>
) => {
  const WithFallbackComponent = (props: P) => {
    const { t, i18n } = useTranslation();

    // Override the t function to include fallback logic
    const tWithFallback = (key: string, options?: any) => {
      const translation = t(key, { ...options, defaultValue: '' });
      
      if (translation && translation !== key) {
        return translation;
      }

      // Generate fallback
      const fallback = key
        .split('.')
        .pop()
        ?.replace(/([A-Z])/g, ' $1')
        ?.replace(/^./, (str) => str.toUpperCase()) || key;

      // Log in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Missing translation for key "${key}" in language "${i18n.language}"`);
      }

      return options?.defaultValue || fallback;
    };

    return <WrappedComponent {...props} t={tWithFallback} />;
  };

  WithFallbackComponent.displayName = `withTranslationFallback(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithFallbackComponent;
};

// Hook for translation with automatic fallback
export const useTranslationWithFallback = () => {
  const { t, i18n, ready } = useTranslation();

  const tWithFallback = (key: string, options?: any) => {
    const translation = t(key, { ...options, defaultValue: '' });
    
    if (translation && translation !== key) {
      return translation;
    }

    // Generate fallback
    const fallback = key
      .split('.')
      .pop()
      ?.replace(/([A-Z])/g, ' $1')
      ?.replace(/^./, (str) => str.toUpperCase()) || key;

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Missing translation for key "${key}" in language "${i18n.language}"`);
    }

    return options?.defaultValue || fallback;
  };

  return {
    t: tWithFallback,
    i18n,
    ready,
    hasTranslation: (key: string) => {
      const translation = t(key, { defaultValue: '' });
      return translation && translation !== key;
    }
  };
};
