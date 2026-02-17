import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';

// ── Мокаем api-модуль ──
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api') as any;
  return {
    ...actual,
    api: {
      getConstructionObjects: vi.fn(),
      getConstructionObjectById: vi.fn(),
      createConstructionObject: vi.fn(),
      updateConstructionObject: vi.fn(),
      uploadObjectPhoto: vi.fn(),
      deleteConstructionObject: vi.fn(),
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
let ConstructionObjects: any;
let ObjectDetail: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const coMod = await import('../components/ConstructionObjects');
  ConstructionObjects = coMod.ConstructionObjects;
  const odMod = await import('../components/ObjectDetail');
  ObjectDetail = odMod.ObjectDetail;
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

const renderWithRoute = (path: string, route: string, element: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

// ── Тестовые данные ──

const mockObjects = [
  {
    id: 1,
    name: 'Test Object',
    address: 'Test Address',
    status: 'in_progress',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    contracts_count: 3,
  },
];

const mockObjectDetail = {
  id: 1,
  name: 'Test Object',
  address: 'Test Address',
  status: 'in_progress',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  description: 'Test desc',
  created_at: '2025-01-01',
  updated_at: '2025-01-15',
  contracts_count: 3,
};

// =============================================================================
// ConstructionObjects — список объектов
// =============================================================================

describe('ConstructionObjects', () => {
  beforeEach(() => {
    (api.getConstructionObjects as any).mockResolvedValue(mockObjects);
  });

  it('renders table view by default', async () => {
    renderWithProviders(<ConstructionObjects />);

    await screen.findByText('Test Object');

    // Таблица отображается — видим заголовки столбцов
    expect(screen.getByText('Название')).toBeInTheDocument();
    expect(screen.getByText('Адрес')).toBeInTheDocument();
    expect(screen.getByText('Статус')).toBeInTheDocument();

    // Кнопка табличного вида активна (синий фон)
    const tableBtn = screen.getByLabelText('Табличный вид');
    expect(tableBtn).toHaveClass('bg-blue-100');
  });

  it('can switch to grid view', async () => {
    renderWithProviders(<ConstructionObjects />);

    await screen.findByText('Test Object');

    const gridBtn = screen.getByLabelText('Вид мозаикой');
    await userEvent.click(gridBtn);

    // После переключения кнопка мозаики активна
    expect(gridBtn).toHaveClass('bg-blue-100');

    // Табличный вид неактивен
    const tableBtn = screen.getByLabelText('Табличный вид');
    expect(tableBtn).not.toHaveClass('bg-blue-100');
  });

  it('shows status filter tabs', async () => {
    renderWithProviders(<ConstructionObjects />);

    await screen.findByText('Test Object');

    expect(screen.getByRole('tab', { name: 'Все' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Планируются' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'В работе' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Завершённые' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Приостановлены' })).toBeInTheDocument();
  });

  it('default filter is in_progress when defaultStatusFilter prop is passed', async () => {
    renderWithProviders(<ConstructionObjects defaultStatusFilter="in_progress" />);

    await screen.findByText('Test Object');

    // Таб «В работе» активен
    const inProgressTab = screen.getByRole('tab', { name: 'В работе' });
    expect(inProgressTab).toHaveAttribute('data-state', 'active');

    // Таб «Все» неактивен
    const allTab = screen.getByRole('tab', { name: 'Все' });
    expect(allTab).toHaveAttribute('data-state', 'inactive');
  });

  it('shows "Новый объект" button', async () => {
    renderWithProviders(<ConstructionObjects />);

    await screen.findByText('Test Object');

    expect(screen.getByRole('button', { name: /Новый объект/ })).toBeInTheDocument();
  });

  it('does NOT show three-dots dropdown menu', async () => {
    renderWithProviders(<ConstructionObjects />);

    await screen.findByText('Test Object');

    // Нет кнопки с тремя точками / меню
    expect(screen.queryByLabelText(/меню/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/more/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /⋮|\.\.\./ })).not.toBeInTheDocument();
  });
});

// =============================================================================
// ObjectDetail — детальная страница объекта
// =============================================================================

describe('ObjectDetail', () => {
  beforeEach(() => {
    (api.getConstructionObjectById as any).mockResolvedValue(mockObjectDetail);
  });

  it('renders object header with name, address, status', async () => {
    renderWithRoute('/objects/1', '/objects/:id', <ObjectDetail />);

    // Ожидаем загрузку данных
    await screen.findByText('Test Object');

    expect(screen.getByText('Test Address')).toBeInTheDocument();
    // Статус «В работе» отображается в хедере
    expect(screen.getByText('В работе')).toBeInTheDocument();
  });

  it('shows 4 root tabs: Основное, Заказчик, Исполнители, Настройки', async () => {
    renderWithRoute('/objects/1', '/objects/:id', <ObjectDetail />);

    await screen.findByText('Test Object');

    expect(screen.getByRole('tab', { name: /Основное/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Заказчик/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Исполнители/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Настройки/ })).toBeInTheDocument();
  });

  it('does NOT show old "Основное" tab with duplicated info', async () => {
    renderWithRoute('/objects/1', '/objects/:id', <ObjectDetail />);

    await screen.findByText('Test Object');

    // Берём корневой tablist (первый на странице) — он содержит 4 root-таба
    const allTabLists = screen.getAllByRole('tablist');
    const rootTabList = allTabLists[0];
    const rootTabs = within(rootTabList).getAllByRole('tab');
    expect(rootTabs).toHaveLength(4);

    // «Основное» встречается только один раз среди root-табов
    const osnovnoeTabs = rootTabs.filter((tab) => tab.textContent?.includes('Основное'));
    expect(osnovnoeTabs).toHaveLength(1);
  });

  it('does NOT show "Редактировать" or "Удалить" buttons in header', async () => {
    renderWithRoute('/objects/1', '/objects/:id', <ObjectDetail />);

    await screen.findByText('Test Object');

    expect(screen.queryByRole('button', { name: /Редактировать/ })).not.toBeInTheDocument();
    // Кнопка «Удалить» может быть внутри вкладки Настройки, но не в хедере
    // Проверяем, что в видимой области хедера нет кнопки Удалить
    const deleteButtons = screen.queryAllByRole('button', { name: /Удалить/ });
    expect(deleteButtons).toHaveLength(0);
  });
});
