import { Language } from '../contexts/LanguageContext';

/**
 * Получить локализованное поле из объекта с фоллбэком на русский язык
 * @param obj - объект с мультиязычными полями
 * @param fieldName - базовое имя поля (без суффикса языка)
 * @param language - текущий язык
 * @returns локализованное значение или пустую строку
 * 
 * Пример: getLocalizedField(news, 'title', 'en') вернет news.title_en, 
 * если его нет - news.title_ru, если и его нет - ''
 */
export function getLocalizedField(
  obj: any,
  fieldName: string,
  language: Language
): string {
  if (!obj) return '';

  // 1. Пытаемся получить поле для текущего языка
  const localizedFieldName = `${fieldName}_${language}`;
  if (obj[localizedFieldName] && obj[localizedFieldName].trim()) {
    return obj[localizedFieldName];
  }

  // 2. Если нет, пробуем базовое поле без суффикса
  if (obj[fieldName] && typeof obj[fieldName] === 'string' && obj[fieldName].trim()) {
    return obj[fieldName];
  }

  // 3. Fallback на русский язык
  const fallbackFieldName = `${fieldName}_ru`;
  if (obj[fallbackFieldName] && obj[fallbackFieldName].trim()) {
    return obj[fallbackFieldName];
  }

  // 4. Если ничего не нашли, возвращаем пустую строку
  return '';
}

/**
 * Получить локализованную дату в формате для конкретного языка
 * @param dateString - строка с датой
 * @param language - текущий язык
 * @returns отформатированная дата
 */
export function getLocalizedDate(
  dateString: string,
  language: Language
): string {
  const date = new Date(dateString);
  
  const localeMap: Record<Language, string> = {
    ru: 'ru-RU',
    en: 'en-US',
    de: 'de-DE',
    pt: 'pt-PT'
  };

  return date.toLocaleDateString(localeMap[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Получить локализованные данные для массива объектов
 * @param items - массив объектов
 * @param fields - список полей для локализации
 * @param language - текущий язык
 * @returns массив объектов с локализованными полями
 */
export function localizeArray<T extends Record<string, any>>(
  items: T[],
  fields: string[],
  language: Language
): T[] {
  return items.map(item => {
    const localizedItem = { ...item };
    fields.forEach(field => {
      (localizedItem as any)[field] = getLocalizedField(item, field, language);
    });
    return localizedItem;
  });
}

/**
 * Проверить, доступен ли перевод для указанного языка
 * @param obj - объект с мультиязычными полями
 * @param fieldName - базовое имя поля
 * @param language - язык для проверки
 * @returns true если перевод доступен
 */
export function hasTranslation(
  obj: any,
  fieldName: string,
  language: Language
): boolean {
  if (!obj) return false;
  
  const localizedFieldName = `${fieldName}_${language}`;
  return Boolean(obj[localizedFieldName] && obj[localizedFieldName].trim());
}

/**
 * Получить список доступных языков для объекта
 * @param obj - объект с мультиязычными полями
 * @param fieldName - базовое имя поля
 * @returns массив доступных языков
 */
export function getAvailableLanguages(
  obj: any,
  fieldName: string
): Language[] {
  if (!obj) return [];
  
  const languages: Language[] = ['ru', 'en', 'de', 'pt'];
  return languages.filter(lang => {
    const localizedFieldName = `${fieldName}_${lang}`;
    return Boolean(obj[localizedFieldName] && obj[localizedFieldName].trim());
  });
}
