import { describe, expect, it } from 'vitest';
import type { RatingModelListItem } from '@/lib/api/types/rating';
import { pickRelated } from './related';

const mk = (
  id: number,
  rank: number | null,
  extra: Partial<RatingModelListItem> = {},
): RatingModelListItem => ({
  id,
  slug: `m-${id}`,
  brand: 'B',
  brand_logo: '',
  inner_unit: `U-${id}`,
  series: '',
  nominal_capacity: null,
  total_index: 70,
  index_max: 100,
  publish_status: 'published',
  region_availability: [],
  price: null,
  noise_score: null,
  has_noise_measurement: false,
  scores: {},
  is_ad: false,
  ad_position: null,
  rank,
  ...extra,
});

describe('pickRelated', () => {
  it('возвращает top-4 ближайших по |Δrank|, исключая currentId', () => {
    const models = [
      mk(1, 1),
      mk(2, 2),
      mk(3, 3),
      mk(4, 4),
      mk(5, 5),
      mk(6, 6),
      mk(7, 7),
    ];
    const rel = pickRelated(models, 4, 4);
    expect(rel.map((m) => m.id)).toEqual([3, 5, 2, 6]);
    expect(rel).toHaveLength(4);
  });

  it('отсекает модели без rank', () => {
    const models = [mk(1, 1), mk(2, null), mk(3, 3), mk(4, null), mk(5, 5)];
    expect(pickRelated(models, 3, 3).map((m) => m.id)).toEqual([1, 5]);
  });

  it('отсекает не-published', () => {
    const models = [
      mk(1, 1, { publish_status: 'draft' }),
      mk(2, 2),
      mk(3, 3, { publish_status: 'archived' }),
    ];
    expect(pickRelated(models, 2, 2).map((m) => m.id)).toEqual([]);
  });

  it('currentRank=null → пустой массив', () => {
    const models = [mk(1, 1), mk(2, 2)];
    expect(pickRelated(models, 99, null)).toEqual([]);
  });

  it('меньше limit моделей — возвращает всё что есть', () => {
    const models = [mk(1, 1), mk(2, 2)];
    expect(pickRelated(models, 1, 1)).toHaveLength(1);
  });
});
