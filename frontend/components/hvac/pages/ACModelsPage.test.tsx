import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACModelsPage from './ACModelsPage';
import type {
  ACBrand,
  ACModelListItem,
  RegionChoice,
} from '../services/acRatingTypes';

const mockGetModels = vi.fn();
const mockGetBrands = vi.fn();
const mockGetRegions = vi.fn();
const mockUpdateModel = vi.fn();
const mockDeleteModel = vi.fn();
const mockRecalculateModel = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getModels: (...args: unknown[]) => mockGetModels(...args),
    getBrands: (...args: unknown[]) => mockGetBrands(...args),
    getRegions: (...args: unknown[]) => mockGetRegions(...args),
    updateModel: (...args: unknown[]) => mockUpdateModel(...args),
    deleteModel: (...args: unknown[]) => mockDeleteModel(...args),
    recalculateModel: (...args: unknown[]) => mockRecalculateModel(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/models' }),
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

const SAMPLE_MODELS: ACModelListItem[] = [
  {
    id: 1,
    brand_id: 10,
    brand_name: 'Daikin',
    series: 'FTXM',
    inner_unit: 'FTXM35M',
    outer_unit: 'RXM35M',
    nominal_capacity: 3500,
    total_index: 87.4,
    publish_status: 'published',
    is_ad: false,
    ad_position: null,
    primary_photo_url: '',
    photos_count: 2,
    region_codes: ['ru'],
    price: '85000.00',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
  {
    id: 2,
    brand_id: 11,
    brand_name: 'Mitsubishi',
    series: 'MSZ',
    inner_unit: 'MSZ-AP25',
    outer_unit: 'MUZ-AP25',
    nominal_capacity: 2500,
    total_index: 81.2,
    publish_status: 'draft',
    is_ad: true,
    ad_position: 1,
    primary_photo_url: '',
    photos_count: 0,
    region_codes: ['ru', 'eu'],
    price: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
];

const SAMPLE_BRANDS: ACBrand[] = [
  {
    id: 10,
    name: 'Daikin',
    logo: '',
    logo_dark: null,
    logo_url: '',
    logo_dark_url: '',
    is_active: true,
    origin_class: null,
    origin_class_name: null,
    sales_start_year_ru: null,
    models_count: 5,
    created_at: '',
    updated_at: '',
  },
];

const SAMPLE_REGIONS: RegionChoice[] = [
  { code: 'ru', label: 'Россия' },
  { code: 'eu', label: 'Европа' },
];

beforeEach(() => {
  mockGetModels.mockReset();
  mockGetBrands.mockReset();
  mockGetRegions.mockReset();
  mockUpdateModel.mockReset();
  mockDeleteModel.mockReset();
  mockRecalculateModel.mockReset();
  mockNavigate.mockReset();

  mockGetModels.mockResolvedValue({
    items: SAMPLE_MODELS,
    next: null,
    count: SAMPLE_MODELS.length,
  });
  mockGetBrands.mockResolvedValue({
    items: SAMPLE_BRANDS,
    next: null,
    count: SAMPLE_BRANDS.length,
  });
  mockGetRegions.mockResolvedValue(SAMPLE_REGIONS);

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

describe('ACModelsPage', () => {
  it('рендерит список моделей с brand/inner_unit/Index', async () => {
    render(<ACModelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('ac-model-row-1')).toBeInTheDocument();
    });
    expect(screen.getByText('FTXM35M')).toBeInTheDocument();
    expect(screen.getByText('Mitsubishi')).toBeInTheDocument();
    expect(screen.getByText('87.4')).toBeInTheDocument();
  });

  it('фильтр по бренду шлёт brand=id в запрос', async () => {
    render(<ACModelsPage />);
    await waitFor(() => screen.getByTestId('ac-model-row-1'));

    fireEvent.click(screen.getByTestId('ac-models-brand-chip-10'));

    await waitFor(() => {
      const calls = mockGetModels.mock.calls;
      const last = calls[calls.length - 1]?.[0];
      expect(last).toMatchObject({ brand: [10] });
    });
  });

  it('bulk-action «Опубликовать» шлёт PATCH publish_status=published каждой выбранной', async () => {
    mockUpdateModel.mockResolvedValue({});
    render(<ACModelsPage />);
    await waitFor(() => screen.getByTestId('ac-model-row-1'));

    // Выделяем обе строки.
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // первая модель
    fireEvent.click(checkboxes[2]); // вторая модель

    fireEvent.click(screen.getByTestId('ac-models-bulk-publish'));

    await waitFor(() => {
      expect(mockUpdateModel).toHaveBeenCalledTimes(2);
      expect(mockUpdateModel).toHaveBeenCalledWith(1, {
        publish_status: 'published',
      });
      expect(mockUpdateModel).toHaveBeenCalledWith(2, {
        publish_status: 'published',
      });
    });
  });

  it('recalc — вызывает recalculateModel и обновляет total_index в строке', async () => {
    mockRecalculateModel.mockResolvedValue({
      recalculated: true,
      model: { ...SAMPLE_MODELS[0], total_index: 90.2 },
    });
    render(<ACModelsPage />);
    await waitFor(() => screen.getByTestId('ac-model-row-1'));

    fireEvent.click(screen.getByTestId('ac-model-recalc-1'));

    await waitFor(() => {
      expect(mockRecalculateModel).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText('90.2')).toBeInTheDocument();
    });
  });
});
