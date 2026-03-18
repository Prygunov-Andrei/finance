/**
 * Адаптер языка для hvac-admin страниц.
 * ERP работает только на русском, поэтому язык всегда 'ru'.
 */

export type Language = 'ru' | 'en' | 'de' | 'pt';

export function useHvacLanguage() {
  return {
    language: 'ru' as Language,
    setLanguage: (_lang: Language) => {},
    getLocalizedField: (obj: any, field: string) => {
      if (!obj) return '';
      // Пробуем ru-версию поля, затем базовое
      return obj[`${field}_ru`] || obj[field] || '';
    },
  };
}
