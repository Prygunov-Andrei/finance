'use client';

import { ReactNode, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { PermissionsContext, buildPermissionsValue } from '@/hooks/usePermissions';
import { BreadcrumbProvider } from '@/hooks/useBreadcrumb';
import { ERPAuthProvider, useERPAuth } from '@/hooks/useERPAuth';
import { Layout } from '@/components/erp/components/Layout';

// Initialize HVAC i18n
import '@/components/hvac/config/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const msg = error instanceof Error ? error.message : String(error);
        const isNetwork =
          msg.includes('Сетевая ошибка') ||
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError');
        return isNetwork ? failureCount < 1 : failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
    },
  },
});

function ERPContent({ children }: { children: ReactNode }) {
  const { user, isLoading, handleLogout } = useERPAuth();
  const permissionsValue = useMemo(() => buildPermissionsValue(user as any), [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <PermissionsContext.Provider value={permissionsValue}>
      <BreadcrumbProvider>
        <Layout onLogout={handleLogout} user={user ?? undefined}>
          {children}
        </Layout>
        <Toaster position="top-right" />
      </BreadcrumbProvider>
    </PermissionsContext.Provider>
  );
}

export default function ERPLayout({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ERPAuthProvider>
        <ERPContent>{children}</ERPContent>
      </ERPAuthProvider>
    </QueryClientProvider>
  );
}
