import { describe, expect, it } from 'vitest';
import type { RatingModelListItem } from '@/lib/api/types/rating';
import { filterQuietModels } from './quietHelpers';

const mk = (
  id: number,
  partial: Partial<RatingModelListItem> = {},
): RatingModelListItem => ({
  id,
  slug: `m-${id}`,
  brand: 'B',
  brand_logo: '',
  inner_unit: 'U',
  series: 'S',
  nominal_capacity: 3.5,
  total_index: 70,
  index_max: 100,
  publish_status: 'published',
  region_availability: [],
  price: '50000',
  noise_score: 80,
  has_noise_measurement: true,
  scores: {},
  is_ad: false,
  ad_position: null,
  rank: id,
  ...partial,
});

describe('filterQuietModels', () => {
  it('исключает модели без замера шума', () => {
    const data = [
      mk(1, { has_noise_measurement: true, noise_score: 80 }),
      mk(2, { has_noise_measurement: false, noise_score: 90 }),
      mk(3, { has_noise_measurement: true, noise_score: null }),
    ];
    const out = filterQuietModels(data);
    expect(out.map((m) => m.id)).toEqual([1]);
  });

  it('исключает неопубликованные модели', () => {
    const data = [
      mk(1, { publish_status: 'published' }),
      mk(2, { publish_status: 'draft' }),
      mk(3, { publish_status: 'archived' }),
    ];
    const out = filterQuietModels(data);
    expect(out.map((m) => m.id)).toEqual([1]);
  });

  it('сортирует по убыванию noise_score (больше = тише, балл «Август-климат»)', () => {
    const data = [
      mk(1, { noise_score: 60 }),
      mk(2, { noise_score: 95 }),
      mk(3, { noise_score: 75 }),
    ];
    const out = filterQuietModels(data);
    expect(out.map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it('пустой вход → пустой результат', () => {
    expect(filterQuietModels([])).toEqual([]);
  });
});
