import axios from 'axios';
import { API_CONFIG } from '../config/api';

const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // Специальные заголовки больше не нужны
  },
  timeout: API_CONFIG.TIMEOUT,
  withCredentials: false,
});

// Флаг для предотвращения множественных одновременных запросов на обновление токена
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Request interceptor для добавления токена и языка
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Добавляем язык из localStorage
    const language = localStorage.getItem('language') || 'ru';
    config.headers['Accept-Language'] = language;
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor для обработки 401 и обновления токена
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Если это Network Error (нет response), пробрасываем дальше
    if (!error.response) {
      console.error('Network Error - API недоступен:', {
        message: error.message,
        code: error.code,
        config: {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          headers: error.config?.headers,
        }
      });
      return Promise.reject(error);
    }

    // Логирование ошибок сервера (500, 502, 503, 504)
    if (error.response?.status >= 500) {
      console.error('Server Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
        method: error.config?.method,
        data: error.response.data,
        headers: error.config?.headers,
      });
    }

    const originalRequest = error.config;

    // Если получили 401 и это не повторный запрос
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Если уже идет обновление токена, добавляем запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        // Нет refresh токена - просто отклоняем запрос
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        // Пытаемся обновить токен
        const response = await axios.post(`${API_CONFIG.BASE_URL}/auth/jwt/refresh/`, {
          refresh: refreshToken,
        }, {
          headers: {
            'Content-Type': 'application/json',
            ...API_CONFIG.TUNNEL_HEADERS,
          },
        });

        const { access } = response.data;
        localStorage.setItem('access_token', access);

        // Обновляем токен для всех запросов в очереди
        processQueue(null, access);

        // Повторяем оригинальный запрос с новым токеном
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Не удалось обновить токен - разлогиниваем
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        isRefreshing = false;
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;