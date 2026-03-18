import { LOCALE, COLORS, STATUS_LABELS, TYPE_LABELS, CONSTANTS } from '../constants';

// ==================== КЛАССЫ ====================

/**
 * Объединение классов (для cn утилиты)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ==================== ФОРМАТИРОВАНИЕ ДАТ ====================

/**
 * Форматирование даты в формате DD.MM.YYYY
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(LOCALE, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Форматирование даты и времени
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString(LOCALE, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Форматирование даты в коротком формате (DD.MM)
 */
export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(LOCALE, {
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Форматирование даты для месяца (Январь 2024)
 */
export function formatMonth(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(LOCALE, {
      year: 'numeric',
      month: 'long',
    });
  } catch {
    return '—';
  }
}

// ==================== ФОРМАТИРОВАНИЕ ЧИСЕЛ ====================

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  CNY: '¥',
};

/**
 * Форматирование суммы с валютой
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'RUB'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (numAmount == null || isNaN(numAmount)) return '—';
  
  const formatted = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);

  return `${formatted} ${CURRENCY_SYMBOLS[currency] || currency}`;
}

/**
 * Форматирование суммы без валюты
 */
export function formatAmount(amount: number | string | null | undefined): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (numAmount == null || isNaN(numAmount)) return '0.00';
  
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

/**
 * Форматирование целого числа
 */
export function formatInteger(value: number | string | null | undefined): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (numValue == null || isNaN(numValue)) return '0';
  
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue);
}

/**
 * Форматирование числа в тысячах (для графиков)
 */
export function formatThousands(value: number | string | null | undefined): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (numValue == null || isNaN(numValue)) return '0';
  
  const thousands = numValue / CONSTANTS.THOUSAND_DIVISOR;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(thousands);
}

/**
 * Форматирование процентов
 */
export function formatPercent(value: number | string | null | undefined): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (numValue == null || isNaN(numValue)) return '0%';
  
  return `${numValue.toFixed(CONSTANTS.PERCENT_DECIMAL_PLACES)}%`;
}

// ==================== СТАТУСЫ И БЕЙДЖИ ====================

/**
 * Получение класса бейджа для статуса
 */
export function getStatusBadgeClass(status: string): string {
  return COLORS.STATUS[status] || COLORS.STATUS.draft;
}

/**
 * Получение лейбла статуса
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

/**
 * Получение класса бейджа для типа платежа
 */
export function getPaymentTypeBadgeClass(type: string): string {
  return COLORS.PAYMENT_TYPE[type] || COLORS.PAYMENT_TYPE.expense;
}

/**
 * Получение класса бейджа для статуса платежа
 */
export function getPaymentStatusBadgeClass(status: string): string {
  return COLORS.PAYMENT_STATUS[status] || COLORS.PAYMENT_STATUS.pending;
}

/**
 * Получение лейбла типа
 */
export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

// ==================== РАСЧЁТЫ ====================

/**
 * Расчёт суммы без НДС
 */
export function calculateAmountWithoutVat(
  amountWithVat: number | string,
  vatMultiplier: number = CONSTANTS.VAT_RATE_MULTIPLIER
): number {
  const amount = typeof amountWithVat === 'string' ? parseFloat(amountWithVat) : amountWithVat;
  if (isNaN(amount)) return 0;
  return amount / vatMultiplier;
}

/**
 * Расчёт суммы НДС
 */
export function calculateVatAmount(
  amountWithVat: number | string,
  vatMultiplier: number = CONSTANTS.VAT_RATE_MULTIPLIER
): number {
  const amount = typeof amountWithVat === 'string' ? parseFloat(amountWithVat) : amountWithVat;
  if (isNaN(amount)) return 0;
  return amount - (amount / vatMultiplier);
}

// ==================== СКЛОНЕНИЕ СЛОВ ====================

/**
 * Склонение слова в зависимости от числа
 * @param count - число
 * @param forms - формы слова [для 1, для 2-4, для 5-20]
 * @example pluralize(5, ['день', 'дня', 'дней']) => 'дней'
 */
export function pluralize(count: number, forms: [string, string, string]): string {
  const absCount = Math.abs(count);
  const mod10 = absCount % 10;
  const mod100 = absCount % 100;
  
  if (mod100 >= 11 && mod100 <= 14) {
    return forms[2];
  }
  
  if (mod10 === 1) {
    return forms[0];
  }
  
  if (mod10 >= 2 && mod10 <= 4) {
    return forms[1];
  }
  
  return forms[2];
}

/**
 * Склонение дней
 */
export function pluralizeDays(days: number): string {
  return pluralize(days, ['день', 'дня', 'дней']);
}

// ==================== ВАЛИДАЦИЯ ====================

/**
 * Проверка на пустое значение
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Безопасный парсинг числа
 */
export function safeParseFloat(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Безопасный парсинг целого числа
 */
export function safeParseInt(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
  return isNaN(parsed) ? 0 : parsed;
}

// ==================== URL И QUERY ПАРАМЕТРЫ ====================

/**
 * Создание строки query параметров
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

// ==================== DEBOUNCE ====================

/**
 * Debounce функция
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number = CONSTANTS.DEBOUNCE_DELAY_MS
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), wait);
  };
}
