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
}));

import LegacyRatingSlugRedirect from './page';
import { permanentRedirect, notFound } from 'next/navigation';
import { getRatingModelBySlug } from '@/lib/api/services/rating';
import type { RatingModelDetail } from '@/lib/api/types/rating';

const mockedBySlug = vi.mocked(getRatingModelBySlug);
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

describe('/rating-split-system/[slug] — Wave 12 legacy redirect', () => {
  beforeEach(() => {
    mockedBySlug.mockReset();
    mockedRedirect.mockClear();
    mockedNotFound.mockClear();
  });

  it('резолвит UPPERCASE legacy slug через backend и редиректит на /konditsioner/<canonical-lowercase>', async () => {
    mockedBySlug.mockResolvedValue(
      makeDetail({ slug: 'mdv-aurora-mdoa-09hrfn8', is_legacy_match: true }),
    );

    await expect(
      LegacyRatingSlugRedirect({
        params: Promise.resolve({ slug: 'MDV-AURORA-MDOA-09HRFN8' }),
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockedBySlug).toHaveBeenCalledWith('MDV-AURORA-MDOA-09HRFN8');
    expect(mockedRedirect).toHaveBeenCalledWith('/konditsioner/mdv-aurora-mdoa-09hrfn8');
  });

  it('редиректит на каноничный slug даже если backend нашёл по текущему slug (is_legacy_match=false)', async () => {
    mockedBySlug.mockResolvedValue(
      makeDetail({ slug: 'mdv-aurora-mdoa-09hrfn8', is_legacy_match: false }),
    );

    await expect(
      LegacyRatingSlugRedirect({
        params: Promise.resolve({ slug: 'mdv-aurora-mdoa-09hrfn8' }),
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockedRedirect).toHaveBeenCalledWith('/konditsioner/mdv-aurora-mdoa-09hrfn8');
  });

  it('если backend ответил ошибкой — отдаёт notFound() (404 на несуществующий slug)', async () => {
    mockedBySlug.mockRejectedValue(new Error('404'));

    await expect(
      LegacyRatingSlugRedirect({
        params: Promise.resolve({ slug: 'NOT-A-REAL-SLUG' }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);

    expect(mockedNotFound).toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
