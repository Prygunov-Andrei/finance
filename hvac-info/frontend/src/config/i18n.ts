import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import translationRU from '../locales/ru';
import translationEN from '../locales/en';
import translationDE from '../locales/de';
import translationPT from '../locales/pt';

const resources = {
  ru: {
    translation: translationRU
  },
  en: {
    translation: translationEN
  },
  de: {
    translation: translationDE
  },
  pt: {
    translation: translationPT
  }
};

i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: 'ru', // Fallback language
    lng: localStorage.getItem('language') || undefined, // Use stored language or detect
    debug: false,
    
    interpolation: {
      escapeValue: false // React already safes from xss
    },
    
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
