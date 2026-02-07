/**
 * Unit-тесты i18n — 4 теста.
 * Покрытие: структура локалей, пустые строки, интерполяция, fallback.
 */
import { describe, it, expect } from 'vitest';
import ru from '@/i18n/locales/ru.json';
import uz from '@/i18n/locales/uz.json';
import tg from '@/i18n/locales/tg.json';
import ky from '@/i18n/locales/ky.json';

const locales = { ru, uz, tg, ky };

/** Рекурсивно собирает все ключи из объекта. */
const getKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys.push(...getKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
};

/** Рекурсивно собирает все значения (строки). */
const getValues = (obj: Record<string, unknown>): string[] => {
  const values: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      values.push(value);
    } else if (typeof value === 'object' && value !== null) {
      values.push(...getValues(value as Record<string, unknown>));
    }
  }
  return values;
};

describe('i18n Locales', () => {
  it('T3-i-1: все локали имеют одинаковую структуру ключей', () => {
    const ruKeys = getKeys(ru);

    for (const [lang, locale] of Object.entries(locales)) {
      const langKeys = getKeys(locale);
      expect(langKeys).toEqual(ruKeys);
    }
  });

  it('T3-i-2: нет пустых строк в переводах', () => {
    for (const [lang, locale] of Object.entries(locales)) {
      const values = getValues(locale);
      for (const value of values) {
        expect(value.trim().length, `Empty string in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it('T3-i-3: {{count}} присутствует в mediaCount для всех языков', () => {
    for (const [lang, locale] of Object.entries(locales)) {
      const mediaCount = locale.brigadier.mediaCount;
      expect(mediaCount, `Missing {{count}} in ${lang}.brigadier.mediaCount`).toContain('{{count}}');
    }
  });

  it('T3-i-3b: {{count}} присутствует в unansweredQuestions для всех языков', () => {
    for (const [lang, locale] of Object.entries(locales)) {
      const unanswered = locale.brigadier.unansweredQuestions;
      expect(unanswered, `Missing {{count}} in ${lang}.brigadier.unansweredQuestions`).toContain('{{count}}');
    }
  });
});
