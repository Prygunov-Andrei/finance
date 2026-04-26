import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Отдельный axios-клиент для AC Rating admin (Ф8A).
// Бэкенд `/api/hvac/rating/...` живёт вне `/api/v1/hvac/{public,admin}`,
// существующий hvac apiClient ходит через другой proxy (см. apiClient.ts).
// Поэтому здесь свой клиент с baseURL = '/api/ac-rating-admin'.
//
// Авторизация — Bearer JWT из localStorage; на 401 пробуем refresh-token.

const acRatingApiClient = axios.create({
  baseURL: '/api/ac-rating-admin',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: false,
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

const tryRefreshToken = async (): Promise<boolean> => {
  if (typeof localStorage === 'undefined') return false;
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

acRatingApiClient.interceptors.request.use((config) => {
  const accessToken =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('access_token')
      : null;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

acRatingApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            acRatingApiClient(originalRequest).then(resolve).catch(reject);
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
        return acRatingApiClient(originalRequest);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default acRatingApiClient;
