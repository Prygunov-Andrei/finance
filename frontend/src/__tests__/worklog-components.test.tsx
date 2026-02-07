import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// ── Мокаем api-модуль ──
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api') as any;
  return {
    ...actual,
    api: {
      getWorkJournalSummary: vi.fn(),
      getWorklogShifts: vi.fn(),
      getWorklogMedia: vi.fn(),
      getWorklogReports: vi.fn(),
      getWorklogReportDetail: vi.fn(),
      getWorklogQuestions: vi.fn(),
      createWorklogQuestion: vi.fn(),
      answerWorklogQuestion: vi.fn(),
      updateObjectGeo: vi.fn(),
      getWorklogSupergroups: vi.fn(),
      getConstructionObjectById: vi.fn(),
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

// Мокаем recharts чтобы не упал рендер
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  LineChart: () => null,
  BarChart: () => null,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import { api } from '../lib/api';
import type { WorklogShift, WorklogMedia, WorklogReport, WorklogSupergroup, PaginatedResponse, WorkJournalSummary } from '../lib/api';

// Отложенный импорт компонентов (после мока)
let WorkJournalTab: any;
let SummaryCard: any;
let OverviewSection: any;
let ShiftsSection: any;
let MediaSection: any;
let MediaCard: any;
let PaginationBar: any;
let ReportsSection: any;
let ReportDetailDialog: any;
let GeoSettingsSection: any;
let SupergroupSection: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../components/ObjectDetail');
  WorkJournalTab = mod.WorkJournalTab;
  SummaryCard = mod.SummaryCard;
  OverviewSection = mod.OverviewSection;
  ShiftsSection = mod.ShiftsSection;
  MediaSection = mod.MediaSection;
  MediaCard = mod.MediaCard;
  PaginationBar = mod.PaginationBar;
  ReportsSection = mod.ReportsSection;
  ReportDetailDialog = mod.ReportDetailDialog;
  GeoSettingsSection = mod.GeoSettingsSection;
  SupergroupSection = mod.SupergroupSection;
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

// ── Тестовые данные ──

const mockSummary: WorkJournalSummary = {
  total_shifts: 12,
  active_shifts: 3,
  total_teams: 5,
  total_media: 150,
  total_reports: 8,
  total_workers: 20,
  recent_shifts: [
    {
      id: 'shift-1',
      object: 1,
      object_name: 'Объект 1',
      contractor: 1,
      contractor_name: 'Исполнитель 1',
      date: '2026-02-07',
      shift_type: 'day',
      start_time: '08:00:00',
      end_time: '17:00:00',
      status: 'active',
      registrations_count: 5,
      teams_count: 2,
    },
  ],
};

const mockEmptySummary: WorkJournalSummary = {
  total_shifts: 0,
  active_shifts: 0,
  total_teams: 0,
  total_media: 0,
  total_reports: 0,
  total_workers: 0,
  recent_shifts: [],
};

const mockShifts: PaginatedResponse<WorklogShift> = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 'shift-1',
      object: 1,
      object_name: 'Объект 1',
      contractor: 1,
      contractor_name: 'ООО Монтаж',
      date: '2026-02-07',
      shift_type: 'day',
      start_time: '08:00:00',
      end_time: '17:00:00',
      status: 'active',
      registrations_count: 5,
      teams_count: 2,
    },
    {
      id: 'shift-2',
      object: 1,
      object_name: 'Объект 1',
      contractor: 1,
      contractor_name: 'ООО Монтаж',
      date: '2026-02-06',
      shift_type: 'night',
      start_time: '22:00:00',
      end_time: '06:00:00',
      status: 'closed',
      registrations_count: 3,
      teams_count: 1,
    },
  ],
};

const mockMedia: PaginatedResponse<WorklogMedia> = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 'media-1',
      team: 'team-1',
      team_name: 'Звено 1',
      author_name: 'Иванов',
      media_type: 'photo',
      tag: 'progress',
      file_url: 'https://minio/photo.jpg',
      thumbnail_url: 'https://minio/thumb.jpg',
      text_content: 'Уложен кабель',
      status: 'downloaded',
      created_at: '2026-02-07T10:30:00Z',
    },
    {
      id: 'media-2',
      team: 'team-1',
      team_name: 'Звено 1',
      author_name: 'Петров',
      media_type: 'voice',
      tag: 'problem',
      file_url: 'https://minio/voice.ogg',
      thumbnail_url: '',
      text_content: 'Трещина на стене',
      status: 'downloaded',
      created_at: '2026-02-07T11:00:00Z',
    },
  ],
};

const mockReports: PaginatedResponse<WorklogReport> = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 'report-1',
      team: 'team-1',
      team_name: 'Звено 1',
      shift: 'shift-1',
      report_number: 1,
      report_type: 'final',
      media_count: 10,
      status: 'completed',
      created_at: '2026-02-07T16:00:00Z',
    },
  ],
};

const mockSupergroups: PaginatedResponse<WorklogSupergroup> = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 'sg-1',
      object: 1,
      object_name: 'Объект 1',
      contractor: 1,
      contractor_name: 'ООО Монтаж',
      telegram_chat_id: -1001234567890,
      chat_title: 'Объект 1 — Рабочий чат',
      invite_link: 'https://t.me/+abc123',
      is_active: true,
      created_at: '2026-02-01T08:00:00Z',
    },
  ],
};

// =============================================================================
// T4-c-1: WorkJournalTab — рендер с данными + summary cards
// =============================================================================

describe('WorkJournalTab', () => {
  it('T4-c-1: renders summary cards with data', async () => {
    (api.getWorkJournalSummary as any).mockResolvedValue(mockSummary);
    (api.getWorklogShifts as any).mockResolvedValue(mockShifts);

    renderWithProviders(<WorkJournalTab objectId={1} />);

    // Ожидаем загрузку summary
    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    // Проверяем все summary cards (некоторые лейблы дублируются в nav)
    expect(screen.getAllByText('Смены').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Звенья').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Медиа').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Отчёты').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Монтажники')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // media
    expect(screen.getByText('20')).toBeInTheDocument();  // workers
    expect(screen.getByText('3 активных')).toBeInTheDocument();
  });

  // T4-c-2: Пустое состояние
  it('T4-c-2: renders empty state when no data', async () => {
    (api.getWorkJournalSummary as any).mockResolvedValue(mockEmptySummary);

    renderWithProviders(<WorkJournalTab objectId={99} />);

    await waitFor(() => {
      expect(screen.getByText('Журнал работ')).toBeInTheDocument();
    });

    expect(screen.getByText(/будет доступен после подключения/)).toBeInTheDocument();
  });

  // T4-c-3: Навигация по секциям
  it('T4-c-3: navigates between sections', async () => {
    (api.getWorkJournalSummary as any).mockResolvedValue(mockSummary);
    (api.getWorklogShifts as any).mockResolvedValue(mockShifts);
    (api.getWorklogMedia as any).mockResolvedValue(mockMedia);
    (api.getWorklogReports as any).mockResolvedValue(mockReports);
    (api.getWorklogSupergroups as any).mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    (api.getConstructionObjectById as any).mockResolvedValue({ id: 1, name: 'Объект 1' });

    renderWithProviders(<WorkJournalTab objectId={1} />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    // По умолчанию — Обзор
    const overviewBtn = screen.getByRole('button', { name: /Раздел Обзор/ });
    expect(overviewBtn).toHaveClass('border-blue-500');

    // Переключаемся на Смены
    const shiftsBtn = screen.getByRole('button', { name: /Раздел Смены/ });
    await userEvent.click(shiftsBtn);

    await waitFor(() => {
      // Фильтр «Все статусы» виден
      expect(screen.getByLabelText('Фильтр по статусу')).toBeInTheDocument();
    });

    // Переключаемся на Медиа
    const mediaBtn = screen.getByRole('button', { name: /Раздел Медиа/ });
    await userEvent.click(mediaBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Фильтр по типу медиа')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// T4-c-4: OverviewSection — таблица последних смен
// =============================================================================

describe('OverviewSection', () => {
  it('T4-c-4: renders recent shifts table', () => {
    renderWithProviders(
      <OverviewSection shifts={mockSummary.recent_shifts} />
    );

    expect(screen.getByText('Последние смены')).toBeInTheDocument();
    expect(screen.getByText('Дневная')).toBeInTheDocument();
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText('Исполнитель 1')).toBeInTheDocument();
  });

  it('T4-c-4b: renders empty state when no shifts', () => {
    renderWithProviders(<OverviewSection shifts={[]} />);
    expect(screen.getByText('Нет недавних смен')).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-5: ShiftsSection — фильтр и таблица
// =============================================================================

describe('ShiftsSection', () => {
  it('T4-c-5: renders shifts with filter', () => {
    const onPageChange = vi.fn();
    const onStatusFilterChange = vi.fn();

    renderWithProviders(
      <ShiftsSection
        data={mockShifts}
        isLoading={false}
        page={1}
        onPageChange={onPageChange}
        statusFilter=""
        onStatusFilterChange={onStatusFilterChange}
      />
    );

    // Фильтр существует
    expect(screen.getByLabelText('Фильтр по статусу')).toBeInTheDocument();

    // Строки смен отображены (ООО Монтаж дублируется в 2 строках)
    expect(screen.getAllByText('ООО Монтаж').length).toBe(2);
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText('Закрыта')).toBeInTheDocument();
  });

  it('T4-c-5b: renders loading state', () => {
    renderWithProviders(
      <ShiftsSection
        data={undefined}
        isLoading={true}
        page={1}
        onPageChange={vi.fn()}
        statusFilter=""
        onStatusFilterChange={vi.fn()}
      />
    );

    // Спиннер загрузки
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('T4-c-5c: renders empty state', () => {
    renderWithProviders(
      <ShiftsSection
        data={{ count: 0, next: null, previous: null, results: [] }}
        isLoading={false}
        page={1}
        onPageChange={vi.fn()}
        statusFilter=""
        onStatusFilterChange={vi.fn()}
      />
    );

    expect(screen.getByText('Нет смен')).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-6: MediaSection — фильтры и карточки
// =============================================================================

describe('MediaSection', () => {
  it('T4-c-6: renders media cards with filters', () => {
    renderWithProviders(
      <MediaSection
        data={mockMedia}
        isLoading={false}
        page={1}
        onPageChange={vi.fn()}
        typeFilter=""
        onTypeFilterChange={vi.fn()}
        tagFilter=""
        onTagFilterChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Фильтр по типу медиа')).toBeInTheDocument();
    expect(screen.getByLabelText('Фильтр по тегу')).toBeInTheDocument();
    expect(screen.getByText('Иванов')).toBeInTheDocument();
    expect(screen.getByText('Петров')).toBeInTheDocument();
    expect(screen.getByText('Уложен кабель')).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-7: MediaCard — отображение карточки медиа
// =============================================================================

describe('MediaCard', () => {
  it('T4-c-7: renders photo media card with thumbnail', () => {
    const photoMedia = mockMedia.results[0];
    renderWithProviders(<MediaCard media={photoMedia} />);

    const img = screen.getByAltText('Уложен кабель');
    expect(img).toHaveAttribute('src', 'https://minio/thumb.jpg');
    expect(screen.getByText('Иванов')).toBeInTheDocument();
    expect(screen.getByText('Фото')).toBeInTheDocument();
    expect(screen.getByText('Прогресс')).toBeInTheDocument(); // tag badge
  });

  it('T4-c-7b: renders voice media card with icon', () => {
    const voiceMedia = mockMedia.results[1];
    renderWithProviders(<MediaCard media={voiceMedia} />);

    expect(screen.getByText('Петров')).toBeInTheDocument();
    expect(screen.getByText('Голосовое')).toBeInTheDocument();
    expect(screen.getByText('Проблема')).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-8: PaginationBar — пагинация
// =============================================================================

describe('PaginationBar', () => {
  it('T4-c-8: renders pagination with controls', () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <PaginationBar count={25} page={2} pageSize={10} onPageChange={onPageChange} />
    );

    expect(screen.getByText('Всего: 25')).toBeInTheDocument();
    expect(screen.getByText('2 из 3')).toBeInTheDocument();

    // Кнопки prev/next
    const prevBtn = screen.getByLabelText('Предыдущая страница');
    const nextBtn = screen.getByLabelText('Следующая страница');
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
  });

  it('T4-c-8b: disables prev on first page', () => {
    renderWithProviders(
      <PaginationBar count={20} page={1} pageSize={10} onPageChange={vi.fn()} />
    );

    expect(screen.getByLabelText('Предыдущая страница')).toBeDisabled();
  });

  it('T4-c-8c: disables next on last page', () => {
    renderWithProviders(
      <PaginationBar count={20} page={2} pageSize={10} onPageChange={vi.fn()} />
    );

    expect(screen.getByLabelText('Следующая страница')).toBeDisabled();
  });

  it('T4-c-8d: calls onPageChange when clicking next', async () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <PaginationBar count={30} page={1} pageSize={10} onPageChange={onPageChange} />
    );

    await userEvent.click(screen.getByLabelText('Следующая страница'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('T4-c-8e: does not render when single page', () => {
    const { container } = renderWithProviders(
      <PaginationBar count={5} page={1} pageSize={10} onPageChange={vi.fn()} />
    );

    expect(container.querySelector('.flex')).toBeNull();
  });
});

// =============================================================================
// T4-c-9: ReportsSection — таблица и фильтр отчётов
// =============================================================================

describe('ReportsSection', () => {
  it('T4-c-9: renders reports table with type filter', () => {
    renderWithProviders(
      <ReportsSection
        data={mockReports}
        isLoading={false}
        page={1}
        onPageChange={vi.fn()}
        typeFilter=""
        onTypeFilterChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Фильтр по типу отчёта')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Итоговый')).toBeInTheDocument();
    expect(screen.getByText('Звено 1')).toBeInTheDocument();
  });

  it('T4-c-9b: calls onReportClick when clicking a row', async () => {
    const onReportClick = vi.fn();
    renderWithProviders(
      <ReportsSection
        data={mockReports}
        isLoading={false}
        page={1}
        onPageChange={vi.fn()}
        typeFilter=""
        onTypeFilterChange={vi.fn()}
        onReportClick={onReportClick}
      />
    );

    const row = screen.getByRole('button', { name: /Открыть отчёт #1/ });
    await userEvent.click(row);
    expect(onReportClick).toHaveBeenCalledWith('report-1');
  });
});

// =============================================================================
// T4-c-10: ReportDetailDialog — диалог деталей
// =============================================================================

describe('ReportDetailDialog', () => {
  it('T4-c-10: renders report detail when open', async () => {
    const mockDetail = {
      id: 'report-1',
      team: 'team-1',
      team_name: 'Звено 1',
      shift: 'shift-1',
      report_number: 1,
      report_type: 'final',
      media_count: 2,
      status: 'completed',
      created_at: '2026-02-07T16:00:00Z',
      trigger: 'manual',
      media_items: [
        {
          id: 'm1',
          media_type: 'photo',
          author_name: 'Иванов',
          tag: 'progress',
          file_url: '',
          thumbnail_url: 'https://thumb.jpg',
          text_content: 'Уложен кабель',
          status: 'downloaded',
          team: 'team-1',
          team_name: 'Звено 1',
          created_at: '2026-02-07T10:00:00Z',
        },
      ],
      questions: [
        {
          id: 'q1',
          report: 'report-1',
          author: 'u1',
          author_name: 'Офис',
          text: 'Какой тип кабеля?',
          status: 'pending',
          created_at: '2026-02-07T17:00:00Z',
          answers: [],
        },
      ],
    };

    (api.getWorklogReportDetail as any).mockResolvedValue(mockDetail);

    renderWithProviders(
      <ReportDetailDialog
        reportId="report-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Итоговый отчёт #1/)).toBeInTheDocument();
    });

    // Медиа-счётчик
    expect(screen.getByText('2')).toBeInTheDocument();
    // Вопросы
    expect(screen.getByText('Какой тип кабеля?')).toBeInTheDocument();
    // Форма вопроса
    expect(screen.getByLabelText('Задать новый вопрос')).toBeInTheDocument();
    // Форма ответа
    expect(screen.getByLabelText(/Ответ на вопрос: Какой тип кабеля/)).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-11: GeoSettingsSection — форма гео-настроек
// =============================================================================

describe('GeoSettingsSection', () => {
  it('T4-c-11: renders geo settings form', async () => {
    (api.getConstructionObjectById as any).mockResolvedValue({
      id: 1,
      name: 'Объект 1',
      latitude: '55.7558',
      longitude: '37.6173',
      geo_radius: 300,
    });

    renderWithProviders(<GeoSettingsSection objectId={1} />);

    expect(screen.getByText('Гео-настройки объекта')).toBeInTheDocument();
    expect(screen.getByLabelText('Широта объекта')).toBeInTheDocument();
    expect(screen.getByLabelText('Долгота объекта')).toBeInTheDocument();
    expect(screen.getByLabelText('Радиус гео-зоны')).toBeInTheDocument();

    // Кнопка сохранения
    expect(screen.getByText('Сохранить гео-настройки')).toBeInTheDocument();
  });
});

// =============================================================================
// T4-c-12: SupergroupSection — список супергрупп
// =============================================================================

describe('SupergroupSection', () => {
  it('T4-c-12: renders supergroups list', async () => {
    (api.getWorklogSupergroups as any).mockResolvedValue(mockSupergroups);

    renderWithProviders(<SupergroupSection objectId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Объект 1 — Рабочий чат')).toBeInTheDocument();
    });

    expect(screen.getByText('Telegram-супергруппы')).toBeInTheDocument();
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText(/ООО Монтаж/)).toBeInTheDocument();
  });

  it('T4-c-12b: renders empty supergroups state', async () => {
    (api.getWorklogSupergroups as any).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    renderWithProviders(<SupergroupSection objectId={99} />);

    await waitFor(() => {
      expect(screen.getByText('Нет привязанных супергрупп')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// T4-c-13: SummaryCard — отдельная карточка
// =============================================================================

describe('SummaryCard', () => {
  it('T4-c-13: renders label, value, and optional extra', () => {
    // Нужна иконка — возьмём простую заглушку
    const MockIcon = ({ className }: { className?: string }) => <svg className={className} data-testid="icon" />;

    renderWithProviders(
      <SummaryCard
        icon={MockIcon as any}
        label="Смены"
        value={42}
        extra="5 активных"
        extraColor="text-green-600"
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Смены')).toBeInTheDocument();
    expect(screen.getByText('5 активных')).toBeInTheDocument();
  });

  it('T4-c-13b: renders without extra text', () => {
    const MockIcon = ({ className }: { className?: string }) => <svg className={className} data-testid="icon" />;

    renderWithProviders(
      <SummaryCard
        icon={MockIcon as any}
        label="Медиа"
        value={99}
      />
    );

    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('Медиа')).toBeInTheDocument();
  });
});
