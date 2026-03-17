// Конфигурация API
// Поддерживает локальную разработку и продакшн (ngrok/контейнеры)

// Определяем среду разработки
const isDevelopment = import.meta.env.DEV;

// Функция для получения базового URL (с поддержкой переопределения из localStorage)
const getBaseUrl = (): string => {
  // ВАЖНО: localStorage override полезен в dev, но в продакшне он часто остается
  // от старых тестов (ngrok/localtunnel) и ломает загрузку медиа (Mixed Content).
  if (isDevelopment) {
    const savedUrl = localStorage.getItem('api_base_url');
    if (savedUrl) {
      return savedUrl;
    }
  }
  
  // Для локальной разработки используем localhost
  if (isDevelopment) {
    return 'http://localhost:8000/api/hvac';
  }

  // Для продакшн/тестирования используем боевой домен или env переменную
  // Предпочитаем текущий origin, чтобы не было рассинхрона доменов/HTTPS.
  const origin = window.location?.origin;
  if (origin) {
    // На всякий случай принудительно HTTPS, если страница открыта по HTTPS.
    const safeOrigin = window.location.protocol === 'https:' ? origin.replace('http://', 'https://') : origin;
    return `${safeOrigin}/api/hvac`;
  }

  return import.meta.env.VITE_API_URL || 'https://hvac-info.com/api/hvac';
};

export const API_CONFIG = {
  // Backend URL - можно переопределить через localStorage
  get BASE_URL() {
    return getBaseUrl();
  },
  
  // Варианты URL:
  // Локальная разработка: 'http://localhost:8000/api'
  // Ngrok туннель: 'https://hvac-news.ngrok.io/api'
  // Docker контейнер: 'http://backend:8000/api' (внутри Docker сети)
  
  // Таймаут запросов (мс) - увеличен для медленных туннелей
  TIMEOUT: 30000, // 30 секунд
  
  // Заголовки (не нужны для localhost)
  TUNNEL_HEADERS: {},
};

// Получить базовый URL сервера (без /api)
export const getServerBaseUrl = (): string => {
  return API_CONFIG.BASE_URL.replace('/api/hvac', '');
};

// Получить полный URL для медиа файла
export const getMediaUrl = (path: string): string => {
  if (!path) return '';
  
  // Если путь уже абсолютный URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    let url = path;

    // Если страница открыта по HTTPS, не тянем http:// ресурсы (иначе Mixed Content warnings).
    if (window.location?.protocol === 'https:' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }
    
    // Получаем текущий домен (для localhost оставляем http)
    const currentBaseUrl = getServerBaseUrl();
    const currentDomain = currentBaseUrl.replace('https://', '').replace('http://', '');
    
    // Список старых доменов для замены на текущий
    const oldDomains = [
      'hvac-news.ngrok.io',
      'finance.ngrok.app',
      'cold-pugs-press.loca.lt',
    ];
    
    // Заменяем любой старый домен на текущий
    for (const oldDomain of oldDomains) {
      if (url.includes(oldDomain)) {
        // Извлекаем путь после домена
        const pathMatch = url.match(new RegExp(`https?://${oldDomain.replace('.', '\\.')}(.*)$`));
        if (pathMatch) {
          url = `${currentBaseUrl.replace('/api/hvac', '')}${pathMatch[1]}`;
        }
        break;
      }
    }
    
    return url;
  }
  
  // Если относительный путь, добавляем базовый URL
  const baseUrl = getServerBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

// Проверка доступности API
export const checkApiAvailability = async (): Promise<boolean> => {
  try {
    const response = await fetch(API_CONFIG.BASE_URL.replace('/api/hvac', ''), {
      method: 'HEAD',
      headers: API_CONFIG.TUNNEL_HEADERS,
    });
    return response.ok;
  } catch {
    return false;
  }
};