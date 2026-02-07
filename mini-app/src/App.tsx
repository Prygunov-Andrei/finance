import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import { useTranslation } from 'react-i18next';
import { initTelegram, getColorScheme } from '@/lib/telegram';
import { useAuth } from '@/hooks/useAuth';
import '@/i18n';

// Pages
import { RegisterPage } from '@/pages/worker/RegisterPage';
import { BrigadierHome } from '@/pages/brigadier/BrigadierHome';
import { CreateTeamPage } from '@/pages/brigadier/CreateTeamPage';
import { TeamMediaPage } from '@/pages/brigadier/TeamMediaPage';
import { TeamDetailPage } from '@/pages/brigadier/TeamDetailPage';
import { ReportCreatePage } from '@/pages/brigadier/ReportCreatePage';
import { TeamManagePage } from '@/pages/brigadier/TeamManagePage';
import { ContractorHome } from '@/pages/contractor/ContractorHome';
import { OpenShiftPage } from '@/pages/contractor/OpenShiftPage';
import { WorkersPage } from '@/pages/contractor/WorkersPage';
import { SettingsPage } from '@/pages/contractor/SettingsPage';
import { SupplementReportPage } from '@/pages/contractor/SupplementReportPage';
import { AskQuestionPage } from '@/pages/contractor/AskQuestionPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const AppContent = () => {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, worker, isContractor, error } = useAuth();

  useEffect(() => {
    initTelegram();
  }, []);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: 'var(--tg-theme-hint-color)',
      }}>
        {t('common.loading')}
      </div>
    );
  }

  if (!isAuthenticated || !worker) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--tg-theme-text-color)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2>{t('auth.notRegistered')}</h2>
        <p style={{ color: 'var(--tg-theme-hint-color)' }}>
          {error || t('auth.contactContractor')}
        </p>
      </div>
    );
  }

  // Роутинг по роли
  const isBrigadier = worker.role === 'brigadier';

  return (
    <Routes>
      {/* Home: зависит от роли */}
      <Route
        path="/"
        element={
          isContractor ? (
            <ContractorHome />
          ) : isBrigadier ? (
            <BrigadierHome workerId={worker.id} />
          ) : (
            <RegisterPage workerName={worker.name} />
          )
        }
      />

      {/* Shift registration (Worker) */}
      <Route path="/register" element={<RegisterPage workerName={worker.name} />} />

      {/* Team (Brigadier) */}
      <Route path="/team/create" element={<CreateTeamPage workerId={worker.id} />} />
      <Route path="/team/:id" element={<TeamDetailPage />} />
      <Route path="/team/:id/media" element={<TeamMediaPage />} />
      <Route path="/team/:id/report" element={<ReportCreatePage />} />
      <Route path="/team/:id/manage" element={<TeamManagePage />} />

      {/* Contractor */}
      <Route path="/shift/open" element={<OpenShiftPage />} />
      <Route path="/workers" element={<WorkersPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/report/:reportId/supplement" element={<SupplementReportPage />} />
      <Route path="/report/:reportId/question" element={<AskQuestionPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => {
  const appearance = getColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AppRoot appearance={appearance === 'dark' ? 'dark' : 'light'}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AppRoot>
    </QueryClientProvider>
  );
};

export default App;
