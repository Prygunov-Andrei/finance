'use client';

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface ERPUser {
  username: string;
  photo_url?: string;
  [key: string]: unknown;
}

interface ERPAuthContextValue {
  user: ERPUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  handleLogout: () => void;
}

const ERPAuthContext = createContext<ERPAuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  handleLogout: () => {},
});

export function ERPAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ERPUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await api.getCurrentUser();
          setUser(userData as ERPUser);
          setIsAuthenticated(true);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isNetworkError =
            msg.includes('Сетевая ошибка') ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError');

          if (isNetworkError) {
            setIsAuthenticated(true);
            toast.warning('Сервер временно недоступен', {
              description: 'Некоторые функции могут быть ограничены.',
              duration: 5000,
            });
          } else {
            api.logout();
            setIsAuthenticated(false);
            setUser(null);
            router.replace('/login');
          }
        }
      } else {
        router.replace('/login');
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    api.logout();
    document.cookie = 'access_token=; path=/; max-age=0';
    window.location.href = '/';
  };

  const value = useMemo(
    () => ({ user, isAuthenticated, isLoading, handleLogout }),
    [user, isAuthenticated, isLoading] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <ERPAuthContext.Provider value={value}>{children}</ERPAuthContext.Provider>;
}

export function useERPAuth() {
  return useContext(ERPAuthContext);
}
