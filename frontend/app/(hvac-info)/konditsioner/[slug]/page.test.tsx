import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};308;`;
    throw err;
  }),
  notFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND');
    (err as { digest?: string }).digest = 'NEXT_NOT_FOUND';
    throw err;
  }),
}));

vi.mock('@/lib/api/services/rating', () => ({
  getRatingModelBySlug: vi.fn(),
  getRatingModels: vi.fn(),
  getRatingMethodology: vi.fn(),
}));

// Sub-компоненты не нужны в early-redirect тесте — заглушки, чтобы импорт страницы
// не падал на side-effect рендере (jsdom + browser-only зависимости).
vi.mock('@/components/hvac-info/HvacInfoHeader', () => ({
  default: () => null,
}));
vi.mock('../../rating-split-system/_components/BackToRating', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailHero', () => ({
  default: () => null,
  DetailHeroCollapsed: () => null,
}));
vi.mock('../../rating-split-system/_components/DetailMedia', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailAnchorNav', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/StickyCollapseHero', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailOverview', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailCriteria', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailIndexViz', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailSpecs', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailBuy', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailReviews', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/ModelJsonLd', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/BreadcrumbJsonLd', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/DetailBreadcrumb', () => ({ default: () => null }));
vi.mock('../../_components/SectionFooter', () => ({ default: () => null }));
vi.mock('../../rating-split-system/_components/detailHelpers', () => ({
  fallbackLede: () => '',
}));

import RatingDetailPage from './page';
import { permanentRedirect, notFound } from 'next/navigation';
import {
  getRatingModelBySlug,
  getRatingModels,
  getRatingMethodology,
} from '@/lib/api/services/rating';
import type { RatingModelDetail } from '@/lib/api/types/rating';

const mockedBySlug = vi.mocked(getRatingModelBySlug);
const mockedModels = vi.mocked(getRatingModels);
const mockedMethodology = vi.mocked(getRatingMethodology);
const mockedRedirect = vi.mocked(permanentRedirect);
const mockedNotFound = vi.mocked(notFound);

function makeDetail(overrides: Partial<RatingModelDetail> = {}): RatingModelDetail {
  return {
    id: 1,
    slug: 'mdv-aurora-mdoa-09hrfn8',
    brand: { id: 1, name: 'MDV', logo: '' },
    series: 'Aurora',
    inner_unit: 'MDSA-09HRFN8',
    outer_unit: 'MDOA-09HRFN8',
    nominal_capacity: 2.6,
    total_index: 75,
    index_max: 100,
    publish_status: 'published',
    region_availability: [],
    price: null,
    pros_text: '',
    cons_text: '',
    youtube_url: '',
    rutube_url: '',
    vk_url: '',
    photos: [],
    suppliers: [],
    parameter_scores: [],
    raw_values: [],
    methodology_version: 'v1',
    rank: 1,
    median_total_index: 50,
    editorial_lede: '',
    editorial_body: '',
    editorial_quote: '',
    editorial_quote_author: '',
    inner_unit_dimensions: '',
    inner_unit_weight_kg: null,
    outer_unit_dimensions: '',
    outer_unit_weight_kg: null,
    ...overrides,
  };
}

describe('/konditsioner/[slug] — Wave 12 legacy match redirect', () => {
  beforeEach(() => {
    mockedBySlug.mockReset();
    mockedModels.mockReset();
    mockedMethodology.mockReset();
    mockedRedirect.mockClear();
    mockedNotFound.mockClear();
  });

  it('редиректит на канонический /konditsioner/<lower> когда backend вернул is_legacy_match=true', async () => {
    mockedBySlug.mockResolvedValue(
      makeDetail({ slug: 'mdv-aurora-mdoa-09hrfn8', is_legacy_match: true }),
    );

    await expect(
      RatingDetailPage({
        params: Promise.resolve({ slug: 'MDV-AURORA-MDOA-09HRFN8' }),
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockedRedirect).toHaveBeenCalledWith('/konditsioner/mdv-aurora-mdoa-09hrfn8');
    // редирект сработал ДО загрузки списка / методики — экономия RTT
    expect(mockedModels).not.toHaveBeenCalled();
    expect(mockedMethodology).not.toHaveBeenCalled();
  });

  it('safety-net: не редиректит если is_legacy_match=true но slug уже канонический', async () => {
    mockedBySlug.mockResolvedValue(
      makeDetail({ slug: 'mdv-aurora-mdoa-09hrfn8', is_legacy_match: true }),
    );
    mockedModels.mockResolvedValue([]);
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'm',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 0, median_total_index: 50 },
      presets: [],
    });

    // slug в URL уже канонический — редирект не должен сработать, страница рендерится
    await RatingDetailPage({
      params: Promise.resolve({ slug: 'mdv-aurora-mdoa-09hrfn8' }),
    });

    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it('обычный путь: is_legacy_match отсутствует/false → рендер без редиректа', async () => {
    mockedBySlug.mockResolvedValue(makeDetail({ slug: 'mdv-aurora-mdoa-09hrfn8' }));
    mockedModels.mockResolvedValue([]);
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'm',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 0, median_total_index: 50 },
      presets: [],
    });

    await RatingDetailPage({
      params: Promise.resolve({ slug: 'mdv-aurora-mdoa-09hrfn8' }),
    });

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedNotFound).not.toHaveBeenCalled();
  });

  it('404 если backend вернул ошибку (slug не существует ни в slug, ни в legacy_slug)', async () => {
    mockedBySlug.mockRejectedValue(new Error('not found'));

    await expect(
      RatingDetailPage({
        params: Promise.resolve({ slug: 'NOT-A-REAL-SLUG' }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);

    expect(mockedNotFound).toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
