import { useTranslation } from 'react-i18next';

// Locale configurations for different languages
const localeConfigs = {
  en: { 
    locale: 'en-US', 
    currency: 'USD', 
    dateFormat: { 
      short: 'MM/dd/yyyy', 
      medium: 'MMM d, yyyy', 
      long: 'MMMM d, yyyy' 
    },
    timeFormat: { 
      short: 'h:mm a', 
      medium: 'h:mm:ss a' 
    }
  },
  es: { 
    locale: 'es-ES', 
    currency: 'EUR', 
    dateFormat: { 
      short: 'dd/MM/yyyy', 
      medium: 'd MMM yyyy', 
      long: 'd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  fr: { 
    locale: 'fr-FR', 
    currency: 'EUR', 
    dateFormat: { 
      short: 'dd/MM/yyyy', 
      medium: 'd MMM yyyy', 
      long: 'd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  de: { 
    locale: 'de-DE', 
    currency: 'EUR', 
    dateFormat: { 
      short: 'dd.MM.yyyy', 
      medium: 'd. MMM yyyy', 
      long: 'd. MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  zh: { 
    locale: 'zh-CN', 
    currency: 'CNY', 
    dateFormat: { 
      short: 'yyyy/MM/dd', 
      medium: 'yyyy年M月d日', 
      long: 'yyyy年M月d日' 
    },
    timeFormat: { 
      short: 'HH:mm', 
      medium: 'HH:mm:ss' 
    }
  },
  ar: { 
    locale: 'ar-SA', 
    currency: 'SAR', 
    dateFormat: { 
      short: 'dd/MM/yyyy', 
      medium: 'dd MMMM yyyy', 
      long: 'dd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  ja: { 
    locale: 'ja-JP', 
    currency: 'JPY', 
    dateFormat: { 
      short: 'yyyy/MM/dd', 
      medium: 'yyyy年M月d日', 
      long: 'yyyy年M月d日' 
    },
    timeFormat: { 
      short: 'HH:mm', 
      medium: 'HH:mm:ss' 
    }
  },
  hi: { 
    locale: 'hi-IN', 
    currency: 'INR', 
    dateFormat: { 
      short: 'dd/MM/yyyy', 
      medium: 'd MMM yyyy', 
      long: 'd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  pt: { 
    locale: 'pt-BR', 
    currency: 'BRL', 
    dateFormat: { 
      short: 'dd/MM/yyyy', 
      medium: 'd MMM yyyy', 
      long: 'd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  },
  ru: { 
    locale: 'ru-RU', 
    currency: 'RUB', 
    dateFormat: { 
      short: 'dd.MM.yyyy', 
      medium: 'd MMM yyyy', 
      long: 'd MMMM yyyy' 
    },
    timeFormat: { 
      short: 'H:mm', 
      medium: 'H:mm:ss' 
    }
  }
};

// Measurement unit configurations
const measurementUnits = {
  metric: {
    length: { base: 'km', small: 'm', tiny: 'cm' },
    weight: { base: 'kg', small: 'g' },
    volume: { base: 'l', small: 'ml' },
    temperature: { unit: '°C' }
  },
  imperial: {
    length: { base: 'mi', small: 'ft', tiny: 'in' },
    weight: { base: 'lb', small: 'oz' },
    volume: { base: 'gal', small: 'fl oz' },
    temperature: { unit: '°F' }
  }
};

// Hook for localization utilities
export const useLocalization = () => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;
  const config = localeConfigs[currentLang as keyof typeof localeConfigs] || localeConfigs.en;

  // Format numbers
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    try {
      return new Intl.NumberFormat(config.locale, options).format(value);
    } catch (error) {
      console.warn('Number formatting error:', error);
      return value.toString();
    }
  };

  // Format currency
  const formatCurrency = (value: number, currency?: string) => {
    try {
      return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: currency || config.currency,
      }).format(value);
    } catch (error) {
      console.warn('Currency formatting error:', error);
      return `${currency || config.currency} ${value}`;
    }
  };

  // Format percentage
  const formatPercentage = (value: number, decimals = 1) => {
    return formatNumber(value, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Format date
  const formatDate = (date: Date | string | number, format: 'short' | 'medium' | 'long' = 'medium') => {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      
      return new Intl.DateTimeFormat(config.locale, {
        dateStyle: format,
      }).format(dateObj);
    } catch (error) {
      console.warn('Date formatting error:', error);
      return date.toString();
    }
  };

  // Format time
  const formatTime = (date: Date | string | number, format: 'short' | 'medium' = 'short') => {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      
      return new Intl.DateTimeFormat(config.locale, {
        timeStyle: format,
      }).format(dateObj);
    } catch (error) {
      console.warn('Time formatting error:', error);
      return date.toString();
    }
  };

  // Format date and time
  const formatDateTime = (date: Date | string | number, dateFormat: 'short' | 'medium' | 'long' = 'medium') => {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      
      return new Intl.DateTimeFormat(config.locale, {
        dateStyle: dateFormat,
        timeStyle: 'short',
      }).format(dateObj);
    } catch (error) {
      console.warn('DateTime formatting error:', error);
      return date.toString();
    }
  };

  // Format relative time (e.g., "2 hours ago")
  const formatRelativeTime = (date: Date | string | number) => {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      
      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      const rtf = new Intl.RelativeTimeFormat(config.locale, { numeric: 'auto' });

      if (Math.abs(diffSeconds) < 60) {
        return rtf.format(-diffSeconds, 'second');
      } else if (Math.abs(diffMinutes) < 60) {
        return rtf.format(-diffMinutes, 'minute');
      } else if (Math.abs(diffHours) < 24) {
        return rtf.format(-diffHours, 'hour');
      } else {
        return rtf.format(-diffDays, 'day');
      }
    } catch (error) {
      console.warn('Relative time formatting error:', error);
      return date.toString();
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${formatNumber(size, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
  };

  // Get measurement system (some countries use imperial)
  const getMeasurementSystem = (): 'metric' | 'imperial' => {
    const imperialCountries = ['en-US'];
    return imperialCountries.includes(config.locale) ? 'imperial' : 'metric';
  };

  // Format measurement value
  const formatMeasurement = (value: number, type: 'length' | 'weight' | 'volume' | 'temperature') => {
    const system = getMeasurementSystem();
    const units = measurementUnits[system][type];
    
    switch (type) {
      case 'length':
        if (system === 'imperial') {
          const miles = value / 1609.34;
          if (miles >= 1) {
            return `${formatNumber(miles, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          const feet = value / 0.3048;
          if (feet >= 1) {
            return `${formatNumber(feet, { maximumFractionDigits: 0 })} ${units.small}`;
          }
          const inches = value / 0.0254;
          return `${formatNumber(inches, { maximumFractionDigits: 0 })} ${units.tiny}`;
        } else {
          const km = value / 1000;
          if (km >= 1) {
            return `${formatNumber(km, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          if (value >= 1) {
            return `${formatNumber(value, { maximumFractionDigits: 0 })} ${units.small}`;
          }
          return `${formatNumber(value * 100, { maximumFractionDigits: 0 })} ${units.tiny}`;
        }
      
      case 'weight':
        if (system === 'imperial') {
          const pounds = value / 0.453592;
          if (pounds >= 1) {
            return `${formatNumber(pounds, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          const ounces = value / 0.0283495;
          return `${formatNumber(ounces, { maximumFractionDigits: 0 })} ${units.small}`;
        } else {
          const kg = value / 1000;
          if (kg >= 1) {
            return `${formatNumber(kg, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          return `${formatNumber(value, { maximumFractionDigits: 0 })} ${units.small}`;
        }
      
      case 'volume':
        if (system === 'imperial') {
          const gallons = value / 3.78541;
          if (gallons >= 1) {
            return `${formatNumber(gallons, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          const ounces = value / 29.5735;
          return `${formatNumber(ounces, { maximumFractionDigits: 0 })} ${units.small}`;
        } else {
          const liters = value / 1000;
          if (liters >= 1) {
            return `${formatNumber(liters, { maximumFractionDigits: 1 })} ${units.base}`;
          }
          return `${formatNumber(value, { maximumFractionDigits: 0 })} ${units.small}`;
        }
      
      case 'temperature':
        if (system === 'imperial') {
          const fahrenheit = (value * 9/5) + 32;
          return `${formatNumber(fahrenheit, { maximumFractionDigits: 0 })}${units.unit}`;
        } else {
          return `${formatNumber(value, { maximumFractionDigits: 0 })}${units.unit}`;
        }
      
      default:
        return formatNumber(value);
    }
  };

  return {
    formatNumber,
    formatCurrency,
    formatPercentage,
    formatDate,
    formatTime,
    formatDateTime,
    formatRelativeTime,
    formatFileSize,
    formatMeasurement,
    getMeasurementSystem,
    locale: config.locale,
    currency: config.currency,
  };
};
