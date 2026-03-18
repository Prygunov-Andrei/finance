import React from 'react';
import { useHvacLanguage as useLanguage, Language } from '../hooks/useHvacLanguage';

const languages: { code: Language; label: string; flag: string }[] = [
  { 
    code: 'ru', 
    label: 'Русский',
    flag: '🇷🇺'
  },
  { 
    code: 'en', 
    label: 'English',
    flag: '🇬🇧'
  },
  { 
    code: 'de', 
    label: 'Deutsch',
    flag: '🇩🇪'
  },
  { 
    code: 'pt', 
    label: 'Português',
    flag: '🇵🇹'
  },
];

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          title={lang.label}
          className={`
            w-10 h-10 text-2xl flex items-center justify-center rounded transition-all
            ${
              language === lang.code
                ? 'bg-primary/10 ring-2 ring-primary'
                : 'hover:bg-muted'
            }
          `}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  );
}
