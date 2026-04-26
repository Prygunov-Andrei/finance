import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACBrandsPage from './ACBrandsPage';
import type { ACBrand } from '../services/acRatingTypes';

const mockGetBrands = vi.fn();
const mockNormalize = vi.fn();
const mockGenerateDark = vi.fn();
const mockDeleteBrand = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getBrands: (...args: unknown[]) => mockGetBrands(...args),
    normalizeBrandLogos: (...args: unknown[]) => mockNormalize(...args),
    generateDarkLogos: (...args: unknown[]) => mockGenerateDark(...args),
    deleteBrand: (...args: unknown[]) => mockDeleteBrand(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/brands' }),
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

const SAMPLE: ACBrand[] = [
  {
    id: 1,
    name: 'Daikin',
    logo: 'logo.png',
    logo_dark: 'logo_dark.png',
    logo_url: '/m/logo.png',
    logo_dark_url: '/m/logo_dark.png',
    is_active: true,
    origin_class: 1,
    origin_class_name: 'Premium',
    sales_start_year_ru: 2003,
    models_count: 12,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
  {
    id: 2,
    name: 'Generic',
    logo: 'logo2.png',
    logo_dark: null,
    logo_url: '/m/logo2.png',
    logo_dark_url: '',
    is_active: false,
    origin_class: null,
    origin_class_name: null,
    sales_start_year_ru: null,
    models_count: 0,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
  },
];

beforeEach(() => {
  mockGetBrands.mockReset();
  mockNormalize.mockReset();
  mockGenerateDark.mockReset();
  mockDeleteBrand.mockReset();
  mockNavigate.mockReset();

  mockGetBrands.mockResolvedValue({
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

describe('ACBrandsPage', () => {
  it('рендерит список и счётчики моделей', async () => {
    render(<ACBrandsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('ac-brand-row-1')).toBeInTheDocument();
    });
    expect(screen.getByText('Daikin')).toBeInTheDocument();
    expect(screen.getByText('Generic')).toBeInTheDocument();
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('кнопка «Нормализовать» — confirm → POST /normalize-logos', async () => {
    mockNormalize.mockResolvedValue({ normalized: 5, errors: [] });
    render(<ACBrandsPage />);
    await waitFor(() => screen.getByTestId('ac-brand-row-1'));

    fireEvent.click(screen.getByTestId('ac-brands-normalize-btn'));
    fireEvent.click(screen.getByTestId('ac-brands-normalize-confirm'));

    await waitFor(() => {
      expect(mockNormalize).toHaveBeenCalledTimes(1);
    });
  });

  it('кнопка «Сгенерировать тёмные» → POST /generate-dark-logos', async () => {
    mockGenerateDark.mockResolvedValue({
      generated: 3,
      skipped_colored: 1,
      errors: [],
    });
    render(<ACBrandsPage />);
    await waitFor(() => screen.getByTestId('ac-brand-row-1'));

    fireEvent.click(screen.getByTestId('ac-brands-generate-dark-btn'));
    fireEvent.click(screen.getByTestId('ac-brands-generate-dark-confirm'));

    await waitFor(() => {
      expect(mockGenerateDark).toHaveBeenCalledTimes(1);
    });
  });
});
