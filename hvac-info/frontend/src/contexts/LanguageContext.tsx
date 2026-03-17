import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import i18n from '../config/i18n';

export type Language = 'ru' | 'en' | 'de' | 'pt';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  getLocalizedField: (obj: any, fieldName: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Загружаем сохраненный язык из localStorage
    const saved = localStorage.getItem('language');
    if (saved && ['ru', 'en', 'de', 'pt'].includes(saved)) {
      return saved as Language;
    }
    
    // Пытаемся определить язык браузера
    const browserLang = navigator.language.split('-')[0];
    if (['ru', 'en', 'de', 'pt'].includes(browserLang)) {
      return browserLang as Language;
    }
    
    return 'ru'; // fallback
  });

  useEffect(() => {
    // Синхронизируем язык с i18next
    i18n.changeLanguage(language);
    // Сохраняем язык в localStorage при изменении
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  // Вспомогательная функция для получения локализованного поля
  const getLocalizedField = (obj: any, fieldName: string): string => {
    if (!obj) return '';
    
    // Сначала пробуем получить поле с суффиксом языка
    const localizedFieldName = `${fieldName}_${language}`;
    if (obj[localizedFieldName]) {
      return obj[localizedFieldName];
    }
    
    // Если нет, пробуем базовое поле
    if (obj[fieldName]) {
      return obj[fieldName];
    }
    
    // Fallback на русский
    const fallbackFieldName = `${fieldName}_ru`;
    if (obj[fallbackFieldName]) {
      return obj[fallbackFieldName];
    }
    
    return '';
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    getLocalizedField,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
