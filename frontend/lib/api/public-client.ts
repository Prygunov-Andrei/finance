/**
 * Public API клиент для портала сметчика.
 *
 * Аналогичен ERP api.estimates, но:
 * - Base URL: /api/public/v1/cabinet/
 * - Auth: Authorization: Token <session_token> (из localStorage)
 * - Скоупирован на ExternalUser — видит только свою смету
 */
import { createEstimatesService } from './services/estimates';
import type { RequestFn } from './services/types';

const PUBLIC_API_BASE = '/api/public/v1/cabinet';

function getPublicToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('public_session_token');
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getPublicToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  };

  // Remove Content-Type for FormData
  if (init?.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(`${PUBLIC_API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> || {}),
    },
  });

  if (res.status === 401) {
    // Session expired
    localStorage.removeItem('public_session_token');
    window.location.href = '/smeta';
    throw new Error('Сессия истекла');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) return {} as T;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  // Blob для Excel downloads
  return res.blob() as unknown as T;
}

/**
 * Public estimates service — тот же интерфейс что api.estimates,
 * но ходит на /api/public/v1/cabinet/ с ExternalUser токеном.
 */
export const publicEstimatesApi = createEstimatesService(publicRequest as RequestFn);

/**
 * Auth-specific endpoints для портала.
 */
export const publicAuthApi = {
  async register(data: { email: string; phone?: string; company_name?: string; contact_name?: string }) {
    const res = await fetch('/api/public/v1/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async login(email: string, otp: string) {
    const res = await fetch('/api/public/v1/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.session_token) {
      localStorage.setItem('public_session_token', data.session_token);
    }
    return data;
  },

  async getMe() {
    const token = getPublicToken();
    if (!token) return null;
    const res = await fetch('/api/public/v1/me/', {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  },

  logout() {
    localStorage.removeItem('public_session_token');
  },

  isLoggedIn(): boolean {
    return !!getPublicToken();
  },
};
