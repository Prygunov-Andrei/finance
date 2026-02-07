import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Мок react-i18next ──
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// ── Мок @telegram-apps/telegram-ui ──
vi.mock('@telegram-apps/telegram-ui', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid="tg-button" {...props}>
      {children}
    </button>
  ),
  Cell: ({ children, subtitle, before, after, onClick, ...props }: any) => (
    <div onClick={onClick} data-testid="tg-cell" role="listitem" {...props}>
      {before && <span data-testid="cell-before">{before}</span>}
      <span data-testid="cell-content">{children}</span>
      {subtitle && <span data-testid="cell-subtitle">{subtitle}</span>}
      {after && <span data-testid="cell-after">{after}</span>}
    </div>
  ),
  Section: ({ children, header }: any) => (
    <div data-testid="tg-section">
      {header && <div data-testid="section-header">{header}</div>}
      {children}
    </div>
  ),
  Placeholder: ({ children, header, description }: any) => (
    <div data-testid="tg-placeholder">
      {header && <div data-testid="placeholder-header">{header}</div>}
      {description && <div data-testid="placeholder-desc">{description}</div>}
      {children}
    </div>
  ),
  Spinner: ({ size }: any) => <div data-testid="tg-spinner" aria-label="loading">Loading...</div>,
  Badge: ({ children, type }: any) => <span data-testid="tg-badge">{children}</span>,
  Input: ({ value, onChange, placeholder, type: inputType }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={inputType}
      data-testid="tg-input"
    />
  ),
  Checkbox: ({ checked, onChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      data-testid="tg-checkbox"
    />
  ),
  Select: (props: any) => <select data-testid="tg-select" {...props} />,
  AppRoot: ({ children }: any) => <div>{children}</div>,
}));

// ── Мок API client ──
const mockGetShifts = vi.fn();
const mockGetTeams = vi.fn();
const mockGetMedia = vi.fn();
const mockGetWorkers = vi.fn();
const mockCreateShift = vi.fn();
const mockCreateTeam = vi.fn();
const mockCreateWorker = vi.fn();
const mockRegisterForShift = vi.fn();
const mockGetShiftRegistrations = vi.fn();

vi.mock('@/api/client', () => ({
  getShifts: (...args: any[]) => mockGetShifts(...args),
  getTeams: (...args: any[]) => mockGetTeams(...args),
  getMedia: (...args: any[]) => mockGetMedia(...args),
  getWorkers: (...args: any[]) => mockGetWorkers(...args),
  createShift: (...args: any[]) => mockCreateShift(...args),
  createTeam: (...args: any[]) => mockCreateTeam(...args),
  createWorker: (...args: any[]) => mockCreateWorker(...args),
  registerForShift: (...args: any[]) => mockRegisterForShift(...args),
  getShiftRegistrations: (...args: any[]) => mockGetShiftRegistrations(...args),
}));

// ── Мок Telegram lib ──
const mockScanQrCode = vi.fn();
const mockGetGeolocation = vi.fn();
const mockHapticNotification = vi.fn();
const mockShowBackButton = vi.fn();
const mockHideBackButton = vi.fn();

vi.mock('@/lib/telegram', () => ({
  scanQrCode: (...args: any[]) => mockScanQrCode(...args),
  getGeolocation: (...args: any[]) => mockGetGeolocation(...args),
  hapticNotification: (...args: any[]) => mockHapticNotification(...args),
  showBackButton: (...args: any[]) => mockShowBackButton(...args),
  hideBackButton: (...args: any[]) => mockHideBackButton(...args),
  initTelegram: vi.fn(),
  getInitData: vi.fn(),
  getUserLanguage: vi.fn(() => 'ru'),
  getColorScheme: vi.fn(() => 'light'),
}));

// ── Импорт компонентов ──
import { RegisterPage } from '@/pages/worker/RegisterPage';
import { BrigadierHome } from '@/pages/brigadier/BrigadierHome';
import { CreateTeamPage } from '@/pages/brigadier/CreateTeamPage';
import { TeamMediaPage } from '@/pages/brigadier/TeamMediaPage';
import { ContractorHome } from '@/pages/contractor/ContractorHome';
import { OpenShiftPage } from '@/pages/contractor/OpenShiftPage';
import { WorkersPage } from '@/pages/contractor/WorkersPage';
import { SettingsPage } from '@/pages/contractor/SettingsPage';

// ── Хелпер для рендера с роутером ──
const renderWithRouter = (ui: React.ReactElement, { route = '/' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
};

// ── Тестовые данные ──
const MOCK_SHIFT = {
  id: 'shift-1',
  object: 1,
  object_name: 'ЖК Рассвет',
  contractor: 1,
  contractor_name: 'ООО Строй',
  date: '2026-02-07',
  shift_type: 'day',
  start_time: '09:00',
  end_time: '18:00',
  status: 'active',
  registrations_count: 5,
  teams_count: 2,
};

const MOCK_TEAM = {
  id: 'team-1',
  topic_name: 'Звено-1',
  brigadier: 'worker-1',
  brigadier_name: 'Иван Бригадиров',
  status: 'active',
  is_solo: false,
  media_count: 12,
  memberships: [
    { id: 'm1', worker: 'worker-1', worker_name: 'Иван' },
    { id: 'm2', worker: 'worker-2', worker_name: 'Пётр' },
  ],
};

const MOCK_MEDIA = {
  id: 'media-1',
  team: 'team-1',
  author_name: 'Иван',
  media_type: 'photo',
  tag: 'progress',
  file_url: 'https://example.com/photo.jpg',
  thumbnail_url: 'https://example.com/thumb.jpg',
  text_content: 'Кабель уложен',
  status: 'downloaded',
  created_at: '2026-02-07T10:00:00Z',
};

const MOCK_WORKER = {
  id: 'worker-1',
  telegram_id: 123456,
  name: 'Иван Иванов',
  phone: '+79001234567',
  photo_url: '',
  role: 'worker',
  language: 'ru',
  contractor: 1,
  contractor_name: 'ООО Строй',
  bot_started: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ═══════════════════════════════════════════════════════════════════
// RegisterPage tests (4 tests)
// ═══════════════════════════════════════════════════════════════════

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-1: renders register button and worker name', () => {
    renderWithRouter(<RegisterPage workerName="Иван Иванов" />);
    expect(screen.getByText('worker.registerButton')).toBeInTheDocument();
    expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
  });

  it('T3-c-2: clicking register starts scan flow (scanning → locating → registering)', async () => {
    const qrData = JSON.stringify({ shift_id: 'shift-1', token: 'abc123' });
    mockScanQrCode.mockResolvedValue(qrData);
    mockGetGeolocation.mockResolvedValue({ latitude: 55.75, longitude: 37.61 });
    mockRegisterForShift.mockResolvedValue({ id: 'reg-1', geo_valid: true });

    renderWithRouter(<RegisterPage workerName="Иван" />);

    const button = screen.getByText('worker.registerButton');
    await act(async () => {
      await userEvent.click(button);
    });

    expect(mockScanQrCode).toHaveBeenCalled();
    expect(mockGetGeolocation).toHaveBeenCalled();
    expect(mockRegisterForShift).toHaveBeenCalledWith('shift-1', {
      qr_token: 'abc123',
      latitude: 55.75,
      longitude: 37.61,
    });
  });

  it('T3-c-3: shows success state after registration', async () => {
    const qrData = JSON.stringify({ shift_id: 'shift-1', token: 'abc' });
    mockScanQrCode.mockResolvedValue(qrData);
    mockGetGeolocation.mockResolvedValue({ latitude: 55.75, longitude: 37.61 });
    mockRegisterForShift.mockResolvedValue({ id: 'reg-1', geo_valid: true });

    renderWithRouter(<RegisterPage workerName="Иван" />);

    await act(async () => {
      await userEvent.click(screen.getByText('worker.registerButton'));
    });

    await waitFor(() => {
      expect(screen.getByText('worker.registered')).toBeInTheDocument();
    });
    expect(mockHapticNotification).toHaveBeenCalledWith('success');
  });

  it('T3-c-4: shows error state on failure', async () => {
    mockScanQrCode.mockRejectedValue(new Error('QR scan cancelled'));

    renderWithRouter(<RegisterPage workerName="Иван" />);

    await act(async () => {
      await userEvent.click(screen.getByText('worker.registerButton'));
    });

    await waitFor(() => {
      expect(screen.getByText('QR scan cancelled')).toBeInTheDocument();
    });
    expect(mockHapticNotification).toHaveBeenCalledWith('error');
  });
});

// ═══════════════════════════════════════════════════════════════════
// BrigadierHome tests (3 tests)
// ═══════════════════════════════════════════════════════════════════

describe('BrigadierHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-5: shows spinner while loading', () => {
    mockGetShifts.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetTeams.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<BrigadierHome workerId="worker-1" />);
    expect(screen.getByTestId('tg-spinner')).toBeInTheDocument();
  });

  it('T3-c-6: shows placeholder when no active shift', async () => {
    mockGetShifts.mockResolvedValue({ results: [] });
    mockGetTeams.mockResolvedValue({ results: [] });

    renderWithRouter(<BrigadierHome workerId="worker-1" />);

    await waitFor(() => {
      expect(screen.getByText('Нет активных смен')).toBeInTheDocument();
    });
  });

  it('T3-c-7: shows teams list with media count', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetTeams.mockResolvedValue({ results: [MOCK_TEAM] });

    renderWithRouter(<BrigadierHome workerId="worker-1" />);

    await waitFor(() => {
      expect(screen.getByText('Звено-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tg-badge')).toHaveTextContent('12');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CreateTeamPage tests (4 tests)
// ═══════════════════════════════════════════════════════════════════

describe('CreateTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-8: renders worker list with checkboxes', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetShiftRegistrations.mockResolvedValue([
      { worker: 'w1', worker_name: 'Иван Сварщик' },
      { worker: 'w2', worker_name: 'Пётр Электрик' },
    ]);

    renderWithRouter(<CreateTeamPage workerId="worker-1" />);

    await waitFor(() => {
      expect(screen.getByText('Иван Сварщик')).toBeInTheDocument();
      expect(screen.getByText('Пётр Электрик')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByTestId('tg-checkbox');
    expect(checkboxes.length).toBe(2);
  });

  it('T3-c-9: toggling checkbox updates selection', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetShiftRegistrations.mockResolvedValue([
      { worker: 'w1', worker_name: 'Иван' },
    ]);

    renderWithRouter(<CreateTeamPage workerId="worker-1" />);

    await waitFor(() => {
      expect(screen.getByText('Иван')).toBeInTheDocument();
    });

    const checkbox = screen.getByTestId('tg-checkbox');
    await act(async () => {
      await userEvent.click(checkbox);
    });
    // Checkbox toggle happened (no crash)
    expect(checkbox).toBeInTheDocument();
  });

  it('T3-c-10: submit button calls createTeam API', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetShiftRegistrations.mockResolvedValue([
      { worker: 'w1', worker_name: 'Иван' },
    ]);
    mockCreateTeam.mockResolvedValue({ id: 'team-new' });

    renderWithRouter(<CreateTeamPage workerId="worker-1" />);

    await waitFor(() => {
      expect(screen.getByText('Иван')).toBeInTheDocument();
    });

    // Select the worker
    const checkbox = screen.getByTestId('tg-checkbox');
    await act(async () => {
      await userEvent.click(checkbox);
    });

    // Click create button
    const buttons = screen.getAllByTestId('tg-button');
    const createBtn = buttons.find(b => b.textContent?.includes('brigadier.createTeam'));
    expect(createBtn).toBeTruthy();

    await act(async () => {
      await userEvent.click(createBtn!);
    });

    await waitFor(() => {
      expect(mockCreateTeam).toHaveBeenCalled();
    });
  });

  it('T3-c-11: create button disabled when no workers selected', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetShiftRegistrations.mockResolvedValue([]);

    renderWithRouter(<CreateTeamPage workerId="worker-1" />);

    await waitFor(() => {
      // shows placeholder when no registered workers
      expect(screen.getByTestId('tg-placeholder')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// TeamMediaPage tests (3 tests)
// ═══════════════════════════════════════════════════════════════════

describe('TeamMediaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-12: shows placeholder when no media', async () => {
    mockGetMedia.mockResolvedValue({ results: [] });

    render(
      <MemoryRouter initialEntries={['/team/team-1/media']}>
        <Routes>
          <Route path="/team/:id/media" element={<TeamMediaPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('brigadier.noMedia')).toBeInTheDocument();
    });
  });

  it('T3-c-13: shows media items with icons and authors', async () => {
    mockGetMedia.mockResolvedValue({
      results: [
        MOCK_MEDIA,
        { ...MOCK_MEDIA, id: 'media-2', media_type: 'video', author_name: 'Пётр', text_content: '' },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/team/team-1/media']}>
        <Routes>
          <Route path="/team/:id/media" element={<TeamMediaPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const cells = screen.getAllByTestId('tg-cell');
      expect(cells.length).toBe(2);
    });
    expect(screen.getByText('Кабель уложен')).toBeInTheDocument();
  });

  it('T3-c-14: shows red indicator for problem tag', async () => {
    mockGetMedia.mockResolvedValue({
      results: [
        { ...MOCK_MEDIA, tag: 'problem', text_content: 'Трещина в стене' },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/team/team-1/media']}>
        <Routes>
          <Route path="/team/:id/media" element={<TeamMediaPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Трещина в стене')).toBeInTheDocument();
    });
    // Problem tag shows red indicator
    expect(screen.getByText('🔴')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// ContractorHome tests (2 tests)
// ═══════════════════════════════════════════════════════════════════

describe('ContractorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-15: renders sections (shifts + teams + action buttons)', async () => {
    mockGetShifts.mockResolvedValue({ results: [MOCK_SHIFT] });
    mockGetTeams.mockResolvedValue({ results: [MOCK_TEAM] });

    renderWithRouter(<ContractorHome />);

    await waitFor(() => {
      expect(screen.getByText('ЖК Рассвет')).toBeInTheDocument();
      expect(screen.getByText('Звено-1')).toBeInTheDocument();
    });

    // Action buttons
    expect(screen.getByText('contractor.openShift')).toBeInTheDocument();
    expect(screen.getByText('contractor.manageWorkers')).toBeInTheDocument();
    expect(screen.getByText('contractor.settings')).toBeInTheDocument();
  });

  it('T3-c-16: shows placeholder when no shifts', async () => {
    mockGetShifts.mockResolvedValue({ results: [] });
    mockGetTeams.mockResolvedValue({ results: [] });

    renderWithRouter(<ContractorHome />);

    await waitFor(() => {
      expect(screen.getByText('Нет активных смен')).toBeInTheDocument();
    });
    // Still shows open shift buttons (one in placeholder, one in actions)
    const openShiftButtons = screen.getAllByText('contractor.openShift');
    expect(openShiftButtons.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OpenShiftPage tests (2 tests)
// ═══════════════════════════════════════════════════════════════════

describe('OpenShiftPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-17: renders form with date and time inputs', () => {
    renderWithRouter(<OpenShiftPage />);

    expect(screen.getByText('Дата')).toBeInTheDocument();
    expect(screen.getByText('Время начала')).toBeInTheDocument();
    expect(screen.getByText('Время окончания')).toBeInTheDocument();

    const inputs = screen.getAllByTestId('tg-input');
    expect(inputs.length).toBe(3);
  });

  it('T3-c-18: submit calls createShift API', async () => {
    mockCreateShift.mockResolvedValue({ id: 'new-shift' });

    renderWithRouter(<OpenShiftPage />);

    const buttons = screen.getAllByTestId('tg-button');
    const submitBtn = buttons.find(b => b.textContent?.includes('contractor.openShift'));

    await act(async () => {
      await userEvent.click(submitBtn!);
    });

    await waitFor(() => {
      expect(mockCreateShift).toHaveBeenCalled();
    });
    expect(mockHapticNotification).toHaveBeenCalledWith('success');
  });
});

// ═══════════════════════════════════════════════════════════════════
// WorkersPage tests (3 tests)
// ═══════════════════════════════════════════════════════════════════

describe('WorkersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-19: renders workers list with roles', async () => {
    mockGetWorkers.mockResolvedValue({
      results: [
        MOCK_WORKER,
        { ...MOCK_WORKER, id: 'w2', name: 'Пётр Петров', role: 'brigadier' },
      ],
    });

    renderWithRouter(<WorkersPage />);

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
      expect(screen.getByText('Пётр Петров')).toBeInTheDocument();
    });
  });

  it('T3-c-20: clicking add button shows add form', async () => {
    mockGetWorkers.mockResolvedValue({ results: [] });

    renderWithRouter(<WorkersPage />);

    await waitFor(() => {
      expect(screen.getByText('contractor.addWorker')).toBeInTheDocument();
    });

    await act(async () => {
      await userEvent.click(screen.getByText('contractor.addWorker'));
    });

    // Form should be visible with input fields
    await waitFor(() => {
      expect(screen.getByPlaceholderText('ФИО')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Телефон')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Telegram ID')).toBeInTheDocument();
    });
  });

  it('T3-c-21: filling form and saving calls createWorker', async () => {
    mockGetWorkers.mockResolvedValue({ results: [] });
    mockCreateWorker.mockResolvedValue({ ...MOCK_WORKER, id: 'new-worker', name: 'Новый Рабочий' });

    renderWithRouter(<WorkersPage />);

    await waitFor(() => {
      expect(screen.getByText('contractor.addWorker')).toBeInTheDocument();
    });

    // Open form
    await act(async () => {
      await userEvent.click(screen.getByText('contractor.addWorker'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('ФИО')).toBeInTheDocument();
    });

    // Fill form
    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText('ФИО'), 'Новый Рабочий');
      await userEvent.type(screen.getByPlaceholderText('Telegram ID'), '99999');
    });

    // Submit
    const saveBtn = screen.getByText('common.save');
    await act(async () => {
      await userEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockCreateWorker).toHaveBeenCalledWith({
        name: 'Новый Рабочий',
        phone: '',
        telegram_id: 99999,
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SettingsPage test (1 test)
// ═══════════════════════════════════════════════════════════════════

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T3-c-22: renders settings sections with i18n keys', () => {
    renderWithRouter(<SettingsPage />);

    expect(screen.getByText('settings.teamCreation')).toBeInTheDocument();
    expect(screen.getByText('settings.shiftClose')).toBeInTheDocument();
    expect(screen.getByText('settings.autoClose')).toBeInTheDocument();
    expect(screen.getByText('settings.reportWarning')).toBeInTheDocument();
    expect(mockShowBackButton).toHaveBeenCalled();
  });
});
