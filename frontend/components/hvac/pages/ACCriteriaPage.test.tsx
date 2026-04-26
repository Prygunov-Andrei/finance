import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACCriteriaPage from './ACCriteriaPage';
import type { ACCriterionListItem } from '../services/acRatingTypes';

const mockGetCriteria = vi.fn();
const mockDeleteCriterion = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getCriteria: (...args: unknown[]) => mockGetCriteria(...args),
    deleteCriterion: (...args: unknown[]) => mockDeleteCriterion(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/criteria' }),
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/common/ImageWithFallback', () => ({
  ImageWithFallback: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const SAMPLE: ACCriterionListItem[] = [
  {
    id: 1,
    code: 'noise_min',
    name_ru: 'Уровень шума (мин)',
    photo_url: '/m/noise.jpg',
    unit: 'дБ',
    value_type: 'numeric',
    group: 'acoustics',
    is_active: true,
    is_key_measurement: true,
    methodologies_count: 2,
  },
  {
    id: 2,
    code: 'wifi',
    name_ru: 'Wi-Fi управление',
    photo_url: '',
    unit: '',
    value_type: 'binary',
    group: 'control',
    is_active: false,
    is_key_measurement: false,
    methodologies_count: 0,
  },
];

beforeEach(() => {
  mockGetCriteria.mockReset();
  mockDeleteCriterion.mockReset();
  mockNavigate.mockReset();

  mockGetCriteria.mockResolvedValue({
    items: SAMPLE,
    next: null,
    count: SAMPLE.length,
  });

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

describe('ACCriteriaPage', () => {
  it('рендерит таблицу критериев с code, name, group, methodologies_count', async () => {
    render(<ACCriteriaPage />);
    await waitFor(() => {
      expect(screen.getByTestId('ac-criterion-row-1')).toBeInTheDocument();
    });
    expect(screen.getByText('noise_min')).toBeInTheDocument();
    expect(screen.getByText('Уровень шума (мин)')).toBeInTheDocument();
    expect(screen.getByText('Wi-Fi управление')).toBeInTheDocument();
    expect(screen.getByText('Акустика')).toBeInTheDocument();
    expect(screen.getByText('Управление')).toBeInTheDocument();
    expect(screen.getByTestId('ac-criterion-key-1')).toBeInTheDocument();
  });

  it('включает фильтр «только ключевые» — POST с is_key_measurement=true', async () => {
    render(<ACCriteriaPage />);
    await waitFor(() => screen.getByTestId('ac-criterion-row-1'));

    fireEvent.click(screen.getByTestId('ac-criteria-key-only'));

    await waitFor(() => {
      // последний вызов должен содержать is_key_measurement: 'true'
      const lastCall = mockGetCriteria.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ is_key_measurement: 'true' });
    });
  });

  it('удаление критерия через AlertDialog → service.deleteCriterion', async () => {
    mockDeleteCriterion.mockResolvedValue(undefined);
    render(<ACCriteriaPage />);
    await waitFor(() => screen.getByTestId('ac-criterion-row-1'));

    fireEvent.click(screen.getByTestId('ac-criterion-delete-1'));
    fireEvent.click(screen.getByTestId('ac-criterion-delete-confirm'));

    await waitFor(() => {
      expect(mockDeleteCriterion).toHaveBeenCalledWith(1);
    });
  });
});
