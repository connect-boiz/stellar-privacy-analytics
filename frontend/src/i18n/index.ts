import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import zh from './locales/zh.json';
import ar from './locales/ar.json';
import ja from './locales/ja.json';
import hi from './locales/hi.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  zh: { translation: zh },
  ar: { translation: ar },
  ja: { translation: ja },
  hi: { translation: hi },
  pt: { translation: pt },
  ru: { translation: ru },
};

// RTL languages
const rtlLanguages = ['ar', 'he', 'fa'];

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false,
    },

    // Format configuration for numbers and dates
    lng: 'en',
    ns: ['translation'],
    defaultNS: 'translation',

    // Pluralization
    pluralSeparator: '_',
    contextSeparator: '_',

    // Key separator
    keySeparator: '.',
    nsSeparator: ':',
  });

// Export helper functions
export const isRTL = (lng: string): boolean => rtlLanguages.includes(lng);
export const getDirection = (lng: string): 'ltr' | 'rtl' => isRTL(lng) ? 'rtl' : 'ltr';

// Export supported languages
export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
];

export default i18n;
