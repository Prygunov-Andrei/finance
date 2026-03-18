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


// Service Token для авторизации на hvac-backend из ERP
const HVAC_SERVICE_TOKEN = typeof process !== 'undefined'
  ? (process.env?.NEXT_PUBLIC_HVAC_SERVICE_TOKEN || '')
  : '';

// Request interceptor — ServiceToken + язык
apiClient.interceptors.request.use(
  (config) => {
    // ServiceToken для авторизации (staff-level доступ к hvac-backend)
    if (HVAC_SERVICE_TOKEN) {
      config.headers.Authorization = `ServiceToken ${HVAC_SERVICE_TOKEN}`;
    }

    // Язык
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

// Response interceptor — логирование ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status >= 500) {
      console.error('HVAC API Server Error:', {
        status: error.response.status,
        url: error.config?.url,
      });
    }
    return Promise.reject(error);
  }
);

export default apiClient;