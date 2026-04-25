# Internationalization (i18n) Implementation

This directory contains the internationalization setup for the Stellar Privacy Analytics frontend, providing comprehensive translation support for privacy-related UI elements.

## Overview

The i18n implementation includes:

- **10 languages**: English, Spanish, French, German, Chinese, Arabic, Japanese, Hindi, Portuguese, Russian
- **RTL support**: Right-to-left language support for Arabic
- **Dynamic language switching**: Change languages without page reload
- **Localization**: Date, number, currency, and measurement unit formatting
- **Fallback system**: Automatic fallback for missing translations
- **Translation management**: Interface for managing translations

## File Structure

```
src/i18n/
├── index.ts              # Main i18n configuration
├── locales/              # Translation files
│   ├── en.json          # English
│   ├── es.json          # Spanish
│   ├── fr.json          # French
│   ├── de.json          # German
│   ├── zh.json          # Chinese
│   ├── ar.json          # Arabic (RTL)
│   ├── ja.json          # Japanese
│   ├── hi.json          # Hindi
│   ├── pt.json          # Portuguese
│   └── ru.json          # Russian
└── README.md            # This file
```

## Supported Languages

| Code | Language | Native Name | Flag | RTL |
|------|----------|-------------|------|-----|
| en | English | English | 🇺🇸 | No |
| es | Spanish | Español | 🇪🇸 | No |
| fr | French | Français | 🇫🇷 | No |
| de | German | Deutsch | 🇩🇪 | No |
| zh | Chinese | 中文 | 🇨🇳 | No |
| ar | Arabic | العربية | 🇸🇦 | Yes |
| ja | Japanese | 日本語 | 🇯🇵 | No |
| hi | Hindi | हिन्दी | 🇮🇳 | No |
| pt | Portuguese | Português | 🇵🇹 | No |
| ru | Russian | Русский | 🇷🇺 | No |

## Translation Keys Structure

Translations are organized by namespace and nested keys:

```json
{
  "privacy": {
    "dashboard": {
      "title": "Privacy-Preserving ML",
      "subtitle": "Federated learning, differential privacy, and encrypted inference",
      "tabs": {
        "federated": "Federated Learning",
        "privacy": "Differential Privacy",
        "encryption": "Homomorphic Encryption"
      }
    },
    "settings": {
      "title": "Privacy Settings",
      "subtitle": "Manage your privacy and security preferences"
    }
  },
  "navigation": {
    "dashboard": "Dashboard",
    "privacy": "Privacy"
  }
}
```

## Usage

### Basic Translation

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return <h1>{t('privacy.dashboard.title')}</h1>;
}
```

### With Fallback

```tsx
import { useTranslationWithFallback } from '../components/TranslationFallback';

function MyComponent() {
  const { t } = useTranslationWithFallback();
  
  // Automatic fallback if translation is missing
  return <h1>{t('privacy.dashboard.title')}</h1>;
}
```

### Localization

```tsx
import { useLocalization } from '../utils/localization';

function MyComponent() {
  const { formatDate, formatCurrency, formatNumber } = useLocalization();
  
  return (
    <div>
      <p>{formatDate(new Date(), 'medium')}</p>
      <p>{formatCurrency(1234.56)}</p>
      <p>{formatNumber(1234567.89)}</p>
    </div>
  );
}
```

## Language Switcher

The `LanguageSwitcher` component provides a dropdown for changing languages:

```tsx
import { LanguageSwitcher } from '../components/LanguageSwitcher';

function Header() {
  return (
    <header>
      <LanguageSwitcher className="ml-4" />
    </header>
  );
}
```

## RTL Support

RTL (Right-to-Left) support is automatically handled for Arabic:

- Document direction is set to `rtl` for Arabic
- CSS classes and layouts adapt automatically
- Tailwind CSS RTL utilities are supported

## Translation Management

The `TranslationManager` component provides an interface for managing translations:

```tsx
import { TranslationManager } from '../components/TranslationManager';

function AdminPage() {
  return <TranslationManager />;
}
```

Features:
- View and edit translations
- Add new translation keys
- Import/export translation files
- Search and filter translations
- Visual indicators for missing translations

## Fallback System

The fallback system ensures the UI remains functional even when translations are missing:

### Automatic Fallback

Missing translations automatically fall back to:
1. The provided fallback value
2. A generated human-readable version of the key
3. The key itself as last resort

### Development Warnings

In development mode, missing translations are logged to the console with warnings.

## Adding New Languages

1. Create a new translation file in `src/i18n/locales/`
2. Add the language to the `supportedLanguages` array in `src/i18n/index.ts`
3. Add locale configuration to `src/utils/localization.ts`
4. Update the language switcher if needed

## Adding New Translation Keys

1. Add the key to all language files
2. Use the key in components with `t('your.new.key')`
3. Test with different languages to ensure consistency

## Best Practices

### Key Naming

- Use nested objects for logical grouping
- Use camelCase for keys
- Be descriptive but concise
- Group related translations under namespaces

### Translation Content

- Keep translations concise but clear
- Consider character length differences between languages
- Use gender-neutral language where possible
- Avoid cultural-specific references

### Performance

- Lazy load translation files for large applications
- Use translation keys efficiently
- Consider splitting large translation files

## Testing

### Manual Testing

1. Test all supported languages
2. Verify RTL behavior for Arabic
3. Check date/number formatting
4. Test language switching without reload

### Automated Testing

```tsx
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';

function renderWithI18n(component: React.ReactElement, language = 'en') {
  i18n.changeLanguage(language);
  return render(
    <I18nextProvider i18n={i18n}>
      {component}
    </I18nextProvider>
  );
}

test('renders translated text', () => {
  renderWithI18n(<MyComponent />, 'es');
  expect(screen.getByText('Aprendizaje Federado')).toBeInTheDocument();
});
```

## Troubleshooting

### Common Issues

1. **Missing translations**: Check the console for warnings in development
2. **RTL not working**: Ensure document direction is set correctly
3. **Date formatting issues**: Verify locale configuration
4. **Language not switching**: Check localStorage and i18n configuration

### Debug Tools

Use the browser dev tools to inspect:
- `localStorage.getItem('preferred-language')`
- `document.documentElement.dir`
- `document.documentElement.lang`
- `i18n.language`

## Dependencies

The i18n implementation uses these packages:

- `react-i18next`: React integration
- `i18next`: Core i18n library
- `i18next-browser-languagedetector`: Language detection
- `i18next-http-backend`: Backend loading (for future use)

## Future Enhancements

- Backend translation management
- Real-time translation updates
- Translation memory and suggestions
- Pluralization and gender support
- Advanced RTL layout optimizations
- Translation analytics and usage tracking
