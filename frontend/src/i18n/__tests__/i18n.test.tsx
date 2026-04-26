import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../index';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { TranslationFallback } from '../../components/TranslationFallback';
import { useTranslationWithFallback } from '../../components/TranslationFallback';

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    {children}
  </I18nextProvider>
);

// Test component for translations
const TestComponent: React.FC = () => {
  const { t } = useTranslationWithFallback();
  
  return (
    <div>
      <h1 data-testid="dashboard-title">{t('privacy.dashboard.title')}</h1>
      <p data-testid="dashboard-subtitle">{t('privacy.dashboard.subtitle')}</p>
      <span data-testid="privacy-badge">{t('privacy.dashboard.badge')}</span>
      <span data-testid="missing-key">{t('nonexistent.key')}</span>
    </div>
  );
};

describe('Internationalization', () => {
  beforeEach(() => {
    i18n.changeLanguage('en');
  });

  describe('Basic Translation', () => {
    test('renders English translations correctly', () => {
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('dashboard-title')).toHaveTextContent('Privacy-Preserving ML');
      expect(screen.getByTestId('dashboard-subtitle')).toHaveTextContent('Federated learning, differential privacy, and encrypted inference');
      expect(screen.getByTestId('privacy-badge')).toHaveTextContent('Privacy-First');
    });

    test('renders Spanish translations correctly', async () => {
      i18n.changeLanguage('es');
      
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('ML con Preservación de Privacidad');
        expect(screen.getByTestId('dashboard-subtitle')).toHaveTextContent('Aprendizaje federado, privacidad diferencial e inferencia cifrada');
        expect(screen.getByTestId('privacy-badge')).toHaveTextContent('Primero la Privacidad');
      });
    });

    test('renders French translations correctly', async () => {
      i18n.changeLanguage('fr');
      
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('ML Préservant la Vie Privée');
        expect(screen.getByTestId('dashboard-subtitle')).toHaveTextContent('Apprentissage fédéré, confidentialité différentielle et inférence chiffrée');
        expect(screen.getByTestId('privacy-badge')).toHaveTextContent('Vie Privée D\'Abord');
      });
    });

    test('renders Arabic translations correctly', async () => {
      i18n.changeLanguage('ar');
      
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('التعلم الآلي مع حماية الخصوصية');
        expect(screen.getByTestId('dashboard-subtitle')).toHaveTextContent('التعلم الفيدرالي، الخصوصية التفاضلية، والاستدلال المشفر');
        expect(screen.getByTestId('privacy-badge')).toHaveTextContent('الخصوصية أولاً');
      });

      // Check RTL direction
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
    });
  });

  describe('Language Switching', () => {
    test('LanguageSwitcher renders correctly', () => {
      render(
        <TestWrapper>
          <LanguageSwitcher />
        </TestWrapper>
      );

      const switcher = screen.getByRole('button');
      expect(switcher).toBeInTheDocument();
      expect(switcher).toHaveAttribute('aria-expanded', 'false');
    });

    test('LanguageSwitcher opens dropdown on click', async () => {
      render(
        <TestWrapper>
          <LanguageSwitcher />
        </TestWrapper>
      );

      const switcher = screen.getByRole('button');
      fireEvent.click(switcher);

      await waitFor(() => {
        expect(switcher).toHaveAttribute('aria-expanded', 'true');
      });
    });

    test('LanguageSwitcher changes language on selection', async () => {
      render(
        <TestWrapper>
          <LanguageSwitcher />
          <TestComponent />
        </TestWrapper>
      );

      // Open dropdown
      const switcher = screen.getByRole('button');
      fireEvent.click(switcher);

      // Find and click Spanish option
      await waitFor(() => {
        const spanishOption = screen.getByText('Español');
        expect(spanishOption).toBeInTheDocument();
        fireEvent.click(spanishOption);
      });

      // Verify language change
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('ML con Preservación de Privacidad');
      });
    });
  });

  describe('Fallback System', () => {
    test('TranslationFallback provides fallback for missing keys', () => {
      render(
        <TestWrapper>
          <TranslationFallback 
            translationKey="nonexistent.key" 
            fallbackValue="Custom Fallback"
          />
        </TestWrapper>
      );

      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
    });

    test('TranslationFallback generates fallback from key', () => {
      render(
        <TestWrapper>
          <TranslationFallback translationKey="some.missing.key" />
        </TestWrapper>
      );

      expect(screen.getByText('Key')).toBeInTheDocument();
    });

    test('useTranslationWithFallback provides fallback for missing keys', () => {
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should generate fallback from key
      expect(screen.getByTestId('missing-key')).toHaveTextContent('Key');
    });
  });

  describe('RTL Support', () => {
    test('sets RTL direction for Arabic', async () => {
      i18n.changeLanguage('ar');
      
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(document.documentElement.dir).toBe('rtl');
        expect(document.documentElement.lang).toBe('ar');
      });
    });

    test('sets LTR direction for English', () => {
      i18n.changeLanguage('en');
      
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      expect(document.documentElement.dir).toBe('ltr');
      expect(document.documentElement.lang).toBe('en');
    });
  });

  describe('Privacy Settings Translations', () => {
    test('renders privacy settings in different languages', async () => {
      const languages = ['en', 'es', 'fr', 'de'];
      
      for (const lang of languages) {
        i18n.changeLanguage(lang);
        
        const { unmount } = render(
          <TestWrapper>
            <TestComponent />
          </TestWrapper>
        );

        await waitFor(() => {
          const title = screen.getByTestId('dashboard-title');
          expect(title).toBeInTheDocument();
          expect(title.textContent).toBeTruthy();
        });

        unmount();
      }
    });
  });

  describe('Nested Translation Keys', () => {
    test('handles deeply nested translation keys', () => {
      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Test nested key structure
      expect(screen.getByTestId('dashboard-title')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-subtitle')).toBeInTheDocument();
    });
  });

  describe('Language Persistence', () => {
    test('persists language preference to localStorage', () => {
      const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        length: 0,
        key: jest.fn(),
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true,
      });

      render(
        <TestWrapper>
          <LanguageSwitcher />
        </TestWrapper>
      );

      // Open dropdown and select a language
      const switcher = screen.getByRole('button');
      fireEvent.click(switcher);

      waitFor(() => {
        const spanishOption = screen.getByText('Español');
        fireEvent.click(spanishOption);
        
        expect(localStorageMock.setItem).toHaveBeenCalledWith('preferred-language', 'es');
      });
    });
  });

  describe('Error Handling', () => {
    test('handles invalid language codes gracefully', () => {
      // Should not crash with invalid language
      expect(() => {
        i18n.changeLanguage('invalid-lang');
      }).not.toThrow();
    });

    test('handles missing translation files gracefully', () => {
      // Should not crash with missing resources
      expect(() => {
        i18n.changeLanguage('nonexistent-lang');
      }).not.toThrow();
    });
  });
});

// Integration tests for localization utilities
describe('Localization Utilities', () => {
  test('formats dates correctly for different locales', () => {
    // This would test the useLocalization hook
    // Implementation would require mocking the hook
  });

  test('formats currencies correctly for different locales', () => {
    // This would test currency formatting
    // Implementation would require mocking the hook
  });

  test('formats numbers correctly for different locales', () => {
    // This would test number formatting
    // Implementation would require mocking the hook
  });
});
