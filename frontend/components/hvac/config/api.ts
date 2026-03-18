// Конфигурация HVAC API для единого портала
// HVAC API проксируется через Next.js/nginx на /api/hvac/

export const API_CONFIG = {
  get BASE_URL() {
    return '/api/hvac';
  },
  TIMEOUT: 30000,
  TUNNEL_HEADERS: {},
};

// Базовый URL сервера (без /api/hvac)
export const getServerBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://hvac-info.com';
};

// Полный URL для медиа файла
export const getMediaUrl = (path: string): string => {
  if (!path) return '';

  // Абсолютный URL — вернуть как есть (с https fix)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && path.startsWith('http://')) {
      return path.replace('http://', 'https://');
    }
    return path;
  }

  // Относительный путь — добавить origin
  const baseUrl = getServerBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

export const checkApiAvailability = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/hvac/news/', { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
};
