import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACModelEditor from './ACModelEditor';
import type {
  ACBrand,
  EquipmentType,
  RegionChoice,
} from '../services/acRatingTypes';

const mockGetBrands = vi.fn();
const mockGetEquipmentTypes = vi.fn();
const mockGetRegions = vi.fn();
const mockGetModel = vi.fn();
const mockCreateModel = vi.fn();
const mockUpdateModel = vi.fn();
const mockGenerateProsCons = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getBrands: (...args: unknown[]) => mockGetBrands(...args),
    getEquipmentTypes: (...args: unknown[]) => mockGetEquipmentTypes(...args),
    getRegions: (...args: unknown[]) => mockGetRegions(...args),
    getModel: (...args: unknown[]) => mockGetModel(...args),
    createModel: (...args: unknown[]) => mockCreateModel(...args),
    updateModel: (...args: unknown[]) => mockUpdateModel(...args),
    generateModelProsCons: (...args: unknown[]) =>
      mockGenerateProsCons(...args),
  },
}));

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
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

// Radix Tabs не монтирует неактивные TabsContent — для тестов разворачиваем
// все табы сразу, чтобы можно было проверять элементы внутри них.
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div role="tablist">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
    ...rest
  }: {
    children: React.ReactNode;
    value: string;
  } & Record<string, unknown>) => (
    <button role="tab" data-tab-value={value} data-state="inactive" {...rest}>
      {children}
    </button>
  ),
  TabsContent: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <div role="tabpanel" data-tab-value={value}>
      {children}
    </div>
  ),
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
    models_count: 0,
    created_at: '',
    updated_at: '',
  },
];
const SAMPLE_ETYPES: EquipmentType[] = [{ id: 1, name: 'Сплит-система' }];
const SAMPLE_REGIONS: RegionChoice[] = [
  { code: 'ru', label: 'Россия' },
  { code: 'eu', label: 'Европа' },
];

beforeEach(() => {
  mockGetBrands.mockReset();
  mockGetEquipmentTypes.mockReset();
  mockGetRegions.mockReset();
  mockGetModel.mockReset();
  mockCreateModel.mockReset();
  mockUpdateModel.mockReset();
  mockGenerateProsCons.mockReset();
  mockNavigate.mockReset();
  mockUseParams.mockReset();

  mockGetBrands.mockResolvedValue({
    items: SAMPLE_BRANDS,
    next: null,
    count: 1,
  });
  mockGetEquipmentTypes.mockResolvedValue(SAMPLE_ETYPES);
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

describe('ACModelEditor — create mode', () => {
  it('рендерит шапку и обязательные поля', async () => {
    mockUseParams.mockReturnValue({});
    render(<ACModelEditor mode="create" />);
    await waitFor(() => {
      expect(screen.getByText(/Новая модель/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('ac-editor-inner')).toBeInTheDocument();
    // Tabs «Фото» и «Параметры» disabled в create.
    expect(screen.getByRole('tab', { name: /Фото/ })).toHaveAttribute(
      'data-state'
    );
  });

  it('валидация — без brand и inner_unit показывает ошибки и не шлёт create', async () => {
    mockUseParams.mockReturnValue({});
    render(<ACModelEditor mode="create" />);
    await waitFor(() => screen.getByTestId('ac-editor-inner'));

    fireEvent.click(
      screen.getByRole('button', { name: /Сохранить/ })
    );

    await waitFor(() => {
      expect(screen.getByTestId('ac-editor-inner-error')).toBeInTheDocument();
    });
    expect(mockCreateModel).not.toHaveBeenCalled();
  });
});

describe('ACModelEditor — edit mode', () => {
  it('подгружает модель и заполняет поля', async () => {
    mockUseParams.mockReturnValue({ id: '42' });
    mockGetModel.mockResolvedValue({
      id: 42,
      slug: 'daikin-ftxm35m',
      brand: 10,
      brand_detail: SAMPLE_BRANDS[0],
      series: 'FTXM',
      inner_unit: 'FTXM35M',
      outer_unit: 'RXM35M',
      nominal_capacity: 3500,
      equipment_type: null,
      publish_status: 'draft',
      total_index: 87.4,
      youtube_url: '',
      rutube_url: '',
      vk_url: '',
      price: '85000.00',
      pros_text: '',
      cons_text: '',
      is_ad: false,
      ad_position: null,
      editorial_lede: '',
      editorial_body: '',
      editorial_quote: '',
      editorial_quote_author: '',
      inner_unit_dimensions: '',
      inner_unit_weight_kg: null,
      outer_unit_dimensions: '',
      outer_unit_weight_kg: null,
      photos: [],
      suppliers: [],
      raw_values: [],
      region_codes: ['ru'],
      created_at: '',
      updated_at: '',
    });

    render(<ACModelEditor mode="edit" />);

    await waitFor(() => {
      const inner = screen.getByTestId('ac-editor-inner') as HTMLInputElement;
      expect(inner.value).toBe('FTXM35M');
    });
    // Total Index из загруженной модели виден (отображается в badge и под slug).
    expect(screen.getAllByText(/87\.4/).length).toBeGreaterThan(0);
  });
});

describe('ACModelEditor — AI pros/cons (Ф8B-1)', () => {
  const MODEL_WITH_RAW = {
    id: 42,
    slug: 'daikin-ftxm35m',
    brand: 10,
    brand_detail: SAMPLE_BRANDS[0],
    series: 'FTXM',
    inner_unit: 'FTXM35M',
    outer_unit: 'RXM35M',
    nominal_capacity: 3500,
    equipment_type: null,
    publish_status: 'draft' as const,
    total_index: 87.4,
    youtube_url: '',
    rutube_url: '',
    vk_url: '',
    price: '85000.00',
    pros_text: '',
    cons_text: '',
    is_ad: false,
    ad_position: null,
    editorial_lede: '',
    editorial_body: '',
    editorial_quote: '',
    editorial_quote_author: '',
    inner_unit_dimensions: '',
    inner_unit_weight_kg: null,
    outer_unit_dimensions: '',
    outer_unit_weight_kg: null,
    photos: [],
    suppliers: [],
    raw_values: [
      {
        criterion_code: 'noise_min',
        raw_value: '19',
        numeric_value: 19,
        compressor_model: '',
        source: '',
        source_url: '',
        comment: '',
        verification_status: 'unverified',
        lab_status: 'none',
      },
    ],
    region_codes: ['ru'],
    created_at: '',
    updated_at: '',
  };

  it('кнопка disabled в create mode', async () => {
    mockUseParams.mockReturnValue({});
    render(<ACModelEditor mode="create" />);
    await waitFor(() => screen.getByTestId('ac-editor-inner'));

    await waitFor(() => {
      const btn = screen.getByTestId('ac-model-ai-pros-cons') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it('кнопка disabled когда raw_values пустые', async () => {
    mockUseParams.mockReturnValue({ id: '42' });
    mockGetModel.mockResolvedValue({ ...MODEL_WITH_RAW, raw_values: [] });

    render(<ACModelEditor mode="edit" />);
    await waitFor(() => screen.getByTestId('ac-editor-inner'));

    await waitFor(() => {
      const btn = screen.getByTestId('ac-model-ai-pros-cons') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it('клик по кнопке (пустые pros/cons) → сразу POST → form-поля заполнены ответом', async () => {
    mockUseParams.mockReturnValue({ id: '42' });
    mockGetModel.mockResolvedValue(MODEL_WITH_RAW);
    mockGenerateProsCons.mockResolvedValue({
      model: { ...MODEL_WITH_RAW, pros_text: 'p1\np2', cons_text: 'c1' },
      generated: { pros: ['p1', 'p2', 'p3'], cons: ['c1', 'c2', 'c3'] },
      provider: 'OpenAIProvider: gpt-4o-mini',
    });

    render(<ACModelEditor mode="edit" />);
    await waitFor(() => screen.getByTestId('ac-editor-inner'));

    await waitFor(() => screen.getByTestId('ac-model-ai-pros-cons'));

    fireEvent.click(screen.getByTestId('ac-model-ai-pros-cons'));

    await waitFor(() => {
      expect(mockGenerateProsCons).toHaveBeenCalledWith(42);
    });

    await waitFor(() => {
      const pros = screen.getByTestId(
        'ac-model-pros-text'
      ) as HTMLTextAreaElement;
      expect(pros.value).toBe('p1\np2\np3');
      const cons = screen.getByTestId(
        'ac-model-cons-text'
      ) as HTMLTextAreaElement;
      expect(cons.value).toBe('c1\nc2\nc3');
    });
  });
});
