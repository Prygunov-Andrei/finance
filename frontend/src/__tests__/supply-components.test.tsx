import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// ── Мокаем api-модуль ──
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api') as any;
  return {
    ...actual,
    api: {
      getBitrixIntegrations: vi.fn().mockResolvedValue([]),
      createBitrixIntegration: vi.fn().mockResolvedValue({}),
      updateBitrixIntegration: vi.fn().mockResolvedValue({}),
      deleteBitrixIntegration: vi.fn().mockResolvedValue(undefined),
      getInvoiceDashboard: vi.fn().mockResolvedValue({
        account_balances: [],
        registry_summary: {
          total_count: 0,
          total_amount: '0',
          overdue_count: 0,
          overdue_amount: '0',
          today_count: 0,
          today_amount: '0',
          this_week_count: 0,
          this_week_amount: '0',
          this_month_count: 0,
          this_month_amount: '0',
        },
        by_object: [],
        by_category: [],
      }),
      getInvoices: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
      getSupplyRequests: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
      getRecurringPayments: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
      getIncomeRecords: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
      getNotifications: vi.fn().mockResolvedValue([]),
      getUnreadNotificationCount: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
});

// Мокаем sonner (toast)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { api } from '../lib/api';

// Отложенный импорт компонентов (после мока)
let HelpPanel: any;
let BitrixSettingsPage: any;
let SupplyDashboardPage: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const helpMod = await import('../components/supply/HelpPanel');
  HelpPanel = helpMod.HelpPanel;
  const bitrixMod = await import('../components/supply/BitrixSettingsPage');
  BitrixSettingsPage = bitrixMod.BitrixSettingsPage;
  const dashMod = await import('../components/supply/SupplyDashboardPage');
  SupplyDashboardPage = dashMod.SupplyDashboardPage;
});

// ── Утилиты ──

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

// =============================================================================
// HelpPanel — справочная панель
// =============================================================================

describe('HelpPanel', () => {
  it('renders help button with label', () => {
    renderWithProviders(<HelpPanel />);

    const button = screen.getByRole('button', { name: /Открыть справку/ });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Справка')).toBeInTheDocument();
  });

  it('opens panel on click and shows instructions header', async () => {
    renderWithProviders(<HelpPanel />);

    const button = screen.getByRole('button', { name: /Открыть справку/ });
    await userEvent.click(button);

    expect(screen.getByText('Инструкции')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Закрыть справку/ })).toBeInTheDocument();
  });

  it('shows role guides when panel is open', async () => {
    renderWithProviders(<HelpPanel />);

    await userEvent.click(screen.getByRole('button', { name: /Открыть справку/ }));

    // Все три роли отображаются
    expect(screen.getByText('Оператор-Снабженец')).toBeInTheDocument();
    expect(screen.getByText('Линейный бухгалтер')).toBeInTheDocument();
    expect(screen.getByText('Директор-контролёр')).toBeInTheDocument();
  });

  it('expands role sections on click', async () => {
    renderWithProviders(<HelpPanel />);

    await userEvent.click(screen.getByRole('button', { name: /Открыть справку/ }));

    // Кликаем на роль «Оператор-Снабженец»
    await userEvent.click(screen.getByText('Оператор-Снабженец'));

    // Появляются секции для этой роли
    expect(screen.getByText('Как работать со счетами')).toBeInTheDocument();
    expect(screen.getByText('Запросы из Битрикс')).toBeInTheDocument();
    expect(screen.getByText('Модерация товаров')).toBeInTheDocument();
  });

  it('closes panel on close button click', async () => {
    renderWithProviders(<HelpPanel />);

    await userEvent.click(screen.getByRole('button', { name: /Открыть справку/ }));
    expect(screen.getByText('Инструкции')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Закрыть справку/ }));

    // Панель закрыта — снова видим кнопку «Справка»
    expect(screen.getByRole('button', { name: /Открыть справку/ })).toBeInTheDocument();
    expect(screen.queryByText('Инструкции')).not.toBeInTheDocument();
  });
});

// =============================================================================
// BitrixSettingsPage — страница настроек Битрикс
// =============================================================================

describe('BitrixSettingsPage', () => {
  it('renders page title', async () => {
    renderWithProviders(<BitrixSettingsPage />);

    expect(screen.getByText('Интеграция с Битрикс24')).toBeInTheDocument();
  });

  it('renders add button', () => {
    renderWithProviders(<BitrixSettingsPage />);

    expect(screen.getByText('Новая интеграция')).toBeInTheDocument();
  });

  it('shows empty state when no integrations', async () => {
    renderWithProviders(<BitrixSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Нет интеграций')).toBeInTheDocument();
    });

    expect(screen.getByText('Создайте подключение к порталу Битрикс24')).toBeInTheDocument();
  });

  it('renders webhook URL info card', () => {
    renderWithProviders(<BitrixSettingsPage />);

    expect(screen.getByText('URL для входящего вебхука в Битрикс24')).toBeInTheDocument();
    expect(screen.getByText('Копировать')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    // Заставляем запрос висеть
    (api.getBitrixIntegrations as any).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<BitrixSettingsPage />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

// =============================================================================
// SupplyDashboardPage — дашборд снабжения
// =============================================================================

describe('SupplyDashboardPage', () => {
  it('renders loading state', () => {
    // Заставляем запрос висеть
    (api.getInvoiceDashboard as any).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<SupplyDashboardPage />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders dashboard title after loading', async () => {
    (api.getInvoiceDashboard as any).mockResolvedValue({
      account_balances: [],
      registry_summary: {
        total_count: 5,
        total_amount: '100000.00',
        overdue_count: 1,
        overdue_amount: '20000.00',
        today_count: 2,
        today_amount: '50000.00',
        this_week_count: 3,
        this_week_amount: '70000.00',
        this_month_count: 5,
        this_month_amount: '100000.00',
      },
      by_object: [],
      by_category: [],
    });

    renderWithProviders(<SupplyDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Дашборд снабжения')).toBeInTheDocument();
    });
  });

  it('renders summary cards with data', async () => {
    (api.getInvoiceDashboard as any).mockResolvedValue({
      account_balances: [],
      registry_summary: {
        total_count: 15,
        total_amount: '500000.00',
        overdue_count: 2,
        overdue_amount: '80000.00',
        today_count: 3,
        today_amount: '120000.00',
        this_week_count: 5,
        this_week_amount: '200000.00',
        this_month_count: 10,
        this_month_amount: '400000.00',
      },
      by_object: [],
      by_category: [],
    });

    renderWithProviders(<SupplyDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Всего в реестре')).toBeInTheDocument();
    });

    expect(screen.getByText('Просрочено')).toBeInTheDocument();
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByText('Эта неделя')).toBeInTheDocument();
    expect(screen.getByText('15 счетов')).toBeInTheDocument();
  });

  it('renders error state when api fails', async () => {
    (api.getInvoiceDashboard as any).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<SupplyDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Не удалось загрузить дашборд')).toBeInTheDocument();
    });
  });
});
