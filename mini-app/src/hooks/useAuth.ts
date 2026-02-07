import { useState, useEffect, useCallback } from 'react';
import { authenticateWithTelegram, setAccessToken, type Worker } from '@/api/client';
import { getInitData, getUserLanguage } from '@/lib/telegram';
import i18n from '@/i18n';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  worker: Worker | null;
  isContractor: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    worker: null,
    isContractor: false,
    error: null,
  });

  const authenticate = useCallback(async () => {
    const initData = getInitData();

    if (!initData) {
      setState({
        isLoading: false,
        isAuthenticated: false,
        worker: null,
        isContractor: false,
        error: 'Not running inside Telegram',
      });
      return;
    }

    try {
      const response = await authenticateWithTelegram(initData);
      setAccessToken(response.access_token);

      // Устанавливаем язык из профиля worker
      const lang = response.worker.language || getUserLanguage();
      i18n.changeLanguage(lang);

      setState({
        isLoading: false,
        isAuthenticated: true,
        worker: response.worker,
        isContractor: response.is_contractor ?? false,
        error: null,
      });
    } catch (error) {
      setState({
        isLoading: false,
        isAuthenticated: false,
        worker: null,
        isContractor: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  }, []);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  return state;
};
