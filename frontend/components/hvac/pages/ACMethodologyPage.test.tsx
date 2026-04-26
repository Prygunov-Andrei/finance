import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACMethodologyPage from './ACMethodologyPage';
import type {
  ACMethodology,
  ACMethodologyListItem,
} from '../services/acRatingTypes';

const mockGetMethodologies = vi.fn();
const mockGetMethodology = vi.fn();
const mockActivate = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getMethodologies: (...args: unknown[]) => mockGetMethodologies(...args),
    getMethodology: (...args: unknown[]) => mockGetMethodology(...args),
    activateMethodology: (...args: unknown[]) => mockActivate(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/methodology' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const SAMPLE: ACMethodologyListItem[] = [
  {
    id: 1,
    version: '1.0',
    name: 'Базовая методика',
    is_active: true,
    criteria_count: 12,
    weight_sum: 100,
    needs_recalculation: false,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
  {
    id: 2,
    version: '1.1-beta',
    name: 'Beta методика',
    is_active: false,
    criteria_count: 14,
    weight_sum: 95,
    needs_recalculation: true,
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
  },
];

const SAMPLE_DETAIL: ACMethodology = {
  id: 2,
  version: '1.1-beta',
  name: 'Beta методика',
  description: 'Тестовая версия с новым весом для шума',
  tab_description_index: '',
  tab_description_quiet: '',
  tab_description_custom: '',
  is_active: false,
  needs_recalculation: true,
  criteria_count: 1,
  weight_sum: 95,
  methodology_criteria: [
    {
      id: 11,
      criterion: {
        id: 1,
        code: 'noise_min',
        name_ru: 'Уровень шума',
        photo_url: '',
        unit: 'дБ',
        value_type: 'numeric',
        group: 'acoustics',
        is_active: true,
        is_key_measurement: true,
        methodologies_count: 2,
      },
      scoring_type: 'min_median_max',
      weight: 95,
      min_value: 19,
      median_value: 25,
      max_value: 40,
      is_inverted: true,
      median_by_capacity: null,
      custom_scale_json: null,
      formula_json: null,
      is_required_lab: false,
      is_required_checklist: false,
      is_required_catalog: true,
      use_in_lab: false,
      use_in_checklist: false,
      use_in_catalog: true,
      region_scope: 'global',
      is_public: true,
      display_order: 1,
      is_active: true,
    },
  ],
  created_at: '2026-04-10T00:00:00Z',
  updated_at: '2026-04-20T00:00:00Z',
};

beforeEach(() => {
  mockGetMethodologies.mockReset();
  mockGetMethodology.mockReset();
  mockActivate.mockReset();

  mockGetMethodologies.mockResolvedValue(SAMPLE);

  (
    globalThis as unknown as { ResizeObserver: typeof ResizeObserver }
  ).ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
  if (typeof window !== 'undefined') {
    window.matchMedia =
      window.matchMedia ||
      (vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia);
    Element.prototype.hasPointerCapture ||= () => false;
    Element.prototype.scrollIntoView ||= () => {};
  }
});

describe('ACMethodologyPage', () => {
  it('рендерит список версий с активным badge и предупреждением о весах', async () => {
    render(<ACMethodologyPage />);
    await waitFor(() => {
      expect(screen.getByTestId('ac-methodology-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('ac-methodology-card-2')).toBeInTheDocument();
    });
    expect(screen.getByText('Базовая методика')).toBeInTheDocument();
    expect(screen.getByText('Beta методика')).toBeInTheDocument();
    expect(screen.getByText(/Активна/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Сумма весов 95\.00% ≠ 100%/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Требуется пересчёт/i)).toBeInTheDocument();
  });

  it('кнопка «Активировать» (только у неактивной) → confirm → service.activateMethodology', async () => {
    mockActivate.mockResolvedValue(SAMPLE_DETAIL);
    render(<ACMethodologyPage />);
    await waitFor(() => screen.getByTestId('ac-methodology-card-2'));

    // У активной (id=1) кнопки быть не должно.
    expect(
      screen.queryByTestId('ac-methodology-activate-1')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ac-methodology-activate-2'));
    fireEvent.click(screen.getByTestId('ac-methodology-activate-confirm'));

    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledWith(2);
    });
  });

  it('expand карточки → загружает детали и показывает critteria-таблицу', async () => {
    mockGetMethodology.mockResolvedValue(SAMPLE_DETAIL);
    render(<ACMethodologyPage />);
    await waitFor(() => screen.getByTestId('ac-methodology-card-2'));

    fireEvent.click(screen.getByTestId('ac-methodology-toggle-2'));

    await waitFor(() => {
      expect(mockGetMethodology).toHaveBeenCalledWith(2);
    });
    await waitFor(() => {
      expect(screen.getByText('noise_min')).toBeInTheDocument();
      expect(screen.getByText(/Тестовая версия/)).toBeInTheDocument();
    });
  });
});
