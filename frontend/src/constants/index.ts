/**
 * Централизованные константы приложения
 */

// ==================== ENUMS ====================

/** Статусы договоров */
export enum ContractStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  CANCELLED = 'cancelled',
}

/** Типы договоров */
export enum ContractType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

/** Статусы платежей */
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

/** Типы платежей */
export enum PaymentType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

/** Статусы объектов */
export enum ObjectStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  SUSPENDED = 'suspended',
}

/** Статусы рамочных договоров */
export enum FrameworkContractStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
}

/** Статусы смет */
export enum EstimateStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  CHECKING = 'checking',
  APPROVED = 'approved',
  SENT = 'sent',
  AGREED = 'agreed',
  REJECTED = 'rejected',
}

/** Статусы ТКП */
export enum TKPStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  CHECKING = 'checking',
  APPROVED = 'approved',
  SENT = 'sent',
}

/** Статусы МП */
export enum MPStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  SENT = 'sent',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Статусы прайс-листов */
export enum PriceListStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/** Ставки НДС */
export enum VatRate {
  ZERO = '0',
  TEN = '10',
  TWENTY = '20',
  NO_VAT = 'no_vat',
}

/** Валюты */
export enum Currency {
  RUB = 'RUB',
  USD = 'USD',
  EUR = 'EUR',
  CNY = 'CNY',
}

/** Единицы измерения */
export enum Unit {
  PIECE = 'шт',
  LINEAR_METER = 'м.п.',
  SQUARE_METER = 'м²',
  CUBIC_METER = 'м³',
  SET = 'компл',
  UNIT = 'ед',
  HOUR = 'ч',
  KILOGRAM = 'кг',
  TON = 'т',
  POINT = 'точка',
}

/** Типы периодов для графиков */
export enum PeriodType {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/** Типы графиков */
export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
}

/** Типы корреспонденции */
export enum CorrespondenceType {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

/** Категории корреспонденции */
export enum CorrespondenceCategory {
  NOTIFICATION = 'уведомление',
  CLAIM = 'претензия',
  REQUEST = 'запрос',
  RESPONSE = 'ответ',
  OTHER = 'прочее',
}

// ==================== ЧИСЛОВЫЕ КОНСТАНТЫ ====================

export const CONSTANTS = {
  // НДС
  VAT_RATE_MULTIPLIER: 1.20,
  DEFAULT_VAT_RATE: 0.20,
  
  // Размеры страниц
  DEFAULT_PAGE_SIZE: 50,
  API_PAGE_SIZE: 20,
  SEARCH_PAGE_SIZE: 10,
  RECENT_ITEMS_COUNT: 10,
  MAX_PAGE_SIZE: 1000,
  SEARCH_RESULTS_LIMIT: 5,
  PAGE_SIZE_OPTIONS: [25, 50, 100, 200] as const,
  
  // Время
  CONTRACT_EXPIRY_WARNING_DAYS: 30,
  QUERY_STALE_TIME_MS: 5 * 60 * 1000, // 5 минут
  QUERY_GC_TIME_MS: 30 * 60 * 1000, // 30 минут
  REFERENCE_STALE_TIME_MS: 15 * 60 * 1000, // 15 минут для справочников
  TOAST_DURATION_MS: 5000,
  DEBOUNCE_DELAY_MS: 300,
  REFETCH_INTERVAL_MS: 5 * 60 * 1000, // 5 минут
  QUERY_UPDATE_DELAY_MS: 100,
  
  // Сетевые настройки
  NETWORK_RETRY_COUNT: 1,
  DEFAULT_RETRY_COUNT: 2,
  
  // Форматирование
  THOUSAND_DIVISOR: 1000,
  DECIMAL_PLACES: 2,
  PERCENT_DECIMAL_PLACES: 0,
  AMOUNT_INPUT_STEP: 0.01,
  
  // Графики
  CHART_HEIGHT: 400,
  DASHBOARD_CHART_HEIGHT: 300,
  PIE_CHART_RADIUS: 100,
  CHART_WIDTH: '100%',
} as const;

// ==================== ЦВЕТА ====================

export const COLORS = {
  // Графики
  CHART_INCOME: '#10b981',
  CHART_EXPENSE: '#ef4444',
  CHART_NET: '#3b82f6',
  CHART_DEFAULT: '#8884d8',
  
  // Статусы (для Tailwind-классов)
  STATUS: {
    active: 'bg-green-100 text-green-800',
    draft: 'bg-gray-100 text-gray-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    suspended: 'bg-orange-100 text-orange-800',
    terminated: 'bg-gray-100 text-gray-800',
    expired: 'bg-gray-100 text-gray-800',
    planned: 'bg-purple-100 text-purple-800',
    in_progress: 'bg-blue-100 text-blue-800',
    checking: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-indigo-100 text-indigo-800',
    agreed: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
    archived: 'bg-gray-100 text-gray-800',
  } as Record<string, string>,
  
  // Типы платежей
  PAYMENT_TYPE: {
    income: 'bg-green-100 text-green-700',
    expense: 'bg-red-100 text-red-700',
  } as Record<string, string>,
  
  // Статусы платежей
  PAYMENT_STATUS: {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  } as Record<string, string>,
} as const;

// ==================== ЛОКАЛИЗАЦИЯ ====================

export const LOCALE = 'ru-RU';

export const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export const DATETIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export const CURRENCY_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export const INTEGER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
};

// ==================== МАРШРУТЫ ====================

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  OBJECTS: '/objects',
  CONTRACTS: '/contracts',
  PAYMENTS: '/payments',
  PAYMENT_REGISTRY: '/payment-registry',
  ESTIMATES: '/estimates',
  PROPOSALS: '/proposals',
  PRICELISTS: '/pricelists',
  SETTINGS: '/settings',
  CATALOG: '/catalog',
  COMMUNICATIONS: '/communications',
} as const;

// ==================== ЛЕЙБЛЫ СТАТУСОВ ====================

export const STATUS_LABELS: Record<string, string> = {
  // Договоры
  draft: 'Черновик',
  planned: 'Планируется',
  active: 'Активный',
  completed: 'Завершён',
  suspended: 'Приостановлен',
  terminated: 'Расторгнут',
  cancelled: 'Отменён',
  
  // Платежи
  pending: 'Ожидает',
  paid: 'Оплачен',
  
  // Сметы/ТКП/МП
  in_progress: 'В работе',
  checking: 'На проверке',
  approved: 'Согласован',
  sent: 'Отправлен',
  agreed: 'Согласован исполнителем',
  rejected: 'Отклонён',
  published: 'Опубликован',
  
  // Прайс-листы
  archived: 'Архив',
  
  // Рамочные договоры
  expired: 'Истёк',
};

export const TYPE_LABELS: Record<string, string> = {
  income: 'Доход',
  expense: 'Расход',
  incoming: 'Входящее',
  outgoing: 'Исходящее',
};

// ==================== СООБЩЕНИЯ ====================

export const MESSAGES = {
  // Ошибки
  SERVER_UNAVAILABLE: 'Сервер временно недоступен',
  LOADING_ERROR: 'Ошибка загрузки данных',
  SAVE_ERROR: 'Ошибка сохранения',
  DELETE_ERROR: 'Ошибка удаления',
  NOT_FOUND: 'Не найдено',
  
  // Валидация
  REQUIRED_FIELD: 'Обязательное поле',
  PAYMENT_FILE_REQUIRED: 'Документ обязателен для всех платежей',
  PAYMENT_PDF_REQUIRED: 'Документ (PDF) обязателен для всех платежей',
  CONTRACT_REQUIRED_FOR_CATEGORY: 'Для данной категории требуется указать договор',
  
  // Успех
  SAVE_SUCCESS: 'Сохранено успешно',
  DELETE_SUCCESS: 'Удалено успешно',
  CREATE_SUCCESS: 'Создано успешно',
  UPDATE_SUCCESS: 'Обновлено успешно',
  
  // Предупреждения
  CONTRACTS_EXPIRING_SOON: 'Истекают в ближайшие 30 дней',
  CONFIRM_DELETE: 'Вы уверены, что хотите удалить?',
} as const;

// ==================== API НАСТРОЙКИ ====================

export const API = {
  PREFIX: '/api/v1',
  NGROK_SKIP_WARNING: '69420',
  CONTENT_TYPE_JSON: 'application/json',
} as const;

// ==================== РАЗМЕРЫ ИКОНОК (Tailwind) ====================

export const ICON_SIZES = {
  XS: 'w-3 h-3',
  SM: 'w-4 h-4',
  MD: 'w-6 h-6',
  LG: 'w-8 h-8',
  XL: 'w-12 h-12',
} as const;

// ==================== СТИЛИ ТАБЛИЦ (Tailwind) ====================

export const TABLE_STYLES = {
  HEADER: 'bg-gray-50 border-b border-gray-200',
  HEADER_CELL: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
  BODY: 'divide-y divide-gray-200',
  ROW: 'hover:bg-gray-50',
  ROW_CLICKABLE: 'hover:bg-gray-50 cursor-pointer',
  CELL: 'px-6 py-4 text-sm text-gray-900',
  CELL_MUTED: 'px-6 py-4 text-sm text-gray-500',
} as const;

// ==================== СТИЛИ КАРТОЧЕК (Tailwind) ====================

export const CARD_STYLES = {
  BASE: 'bg-white rounded-lg shadow-sm border border-gray-200 p-6',
  HEADER: 'flex items-center justify-between mb-4',
  TITLE: 'text-lg font-semibold text-gray-900',
} as const;

// ==================== СТИЛИ ОШИБОК/ЗАГРУЗКИ (Tailwind) ====================

export const STATE_STYLES = {
  LOADING: 'flex items-center justify-center py-12',
  LOADING_SPINNER: 'w-8 h-8 animate-spin text-blue-500',
  ERROR: 'bg-red-50 text-red-600 p-4 rounded-xl',
  EMPTY: 'text-center py-12 text-gray-500',
} as const;

// ==================== ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ ====================

export const DEFAULTS = {
  AMOUNT: '0.00',
  AMOUNT_PLACEHOLDER: '0.00',
  CURRENCY: 'RUB',
  VAT_RATE: '20',
} as const;
