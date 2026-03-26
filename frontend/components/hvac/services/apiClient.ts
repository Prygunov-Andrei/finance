import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_CONFIG } from '../config/api';

const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: API_CONFIG.TIMEOUT,
  withCredentials: false,
});

// Token refresh state
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const tryRefreshToken = async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/erp/auth/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    localStorage.setItem('access_token', data.access);
    return true;
  } catch {
    return false;
  }
};

// Request interceptor — ERP JWT + язык.
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = typeof localStorage !== 'undefined'
      ? localStorage.getItem('access_token')
      : null;

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    const language = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('language') || 'ru')
      : 'ru';
    config.headers['Accept-Language'] = language;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — token refresh на 401 + логирование ошибок
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            apiClient(originalRequest).then(resolve).catch(reject);
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshed = await tryRefreshToken();
      isRefreshing = false;

      if (refreshed) {
        const newToken = localStorage.getItem('access_token') || '';
        onTokenRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    if (error.response?.status && error.response.status >= 500) {
      console.error('HVAC API Server Error:', {
        status: error.response.status,
        url: error.config?.url,
      });
    }
    return Promise.reject(error);
  }
);

export default apiClient;