import { describe, expect, it } from 'vitest';
import type { RatingModelListItem } from '@/lib/api/types/rating';
import {
  PRICE_SLUGS,
  filterByBudget,
  findPriceSlug,
} from './priceHelpers';

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
  price: '30000',
  noise_score: 80,
  has_noise_measurement: true,
  scores: {},
  is_ad: false,
  ad_position: null,
  rank: id,
  ...partial,
});

describe('PRICE_SLUGS', () => {
  it('содержит ровно 7 ценовых вариантов', () => {
    expect(PRICE_SLUGS).toHaveLength(7);
  });

  it('все slugs уникальны', () => {
    const slugs = PRICE_SLUGS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('priceMax возрастает по списку', () => {
    for (let i = 1; i < PRICE_SLUGS.length; i++) {
      expect(PRICE_SLUGS[i].priceMax).toBeGreaterThan(PRICE_SLUGS[i - 1].priceMax);
    }
  });
});

describe('findPriceSlug', () => {
  it('возвращает defs для известного slug', () => {
    expect(findPriceSlug('do-30000-rub')?.priceMax).toBe(30000);
    expect(findPriceSlug('do-60000-rub')?.label).toBe('до 60 000 ₽');
  });

  it('возвращает undefined для неизвестного', () => {
    expect(findPriceSlug('do-12345-rub')).toBeUndefined();
    expect(findPriceSlug('')).toBeUndefined();
  });
});

describe('filterByBudget', () => {
  it('пропускает модели с ценой ≤ priceMax', () => {
    const data = [
      mk(1, { price: '15000' }),
      mk(2, { price: '20000' }),
      mk(3, { price: '21000' }),
    ];
    const out = filterByBudget(data, 20000);
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it('оставляет модели без цены (редакция могла не озвучить)', () => {
    const data = [
      mk(1, { price: null }),
      mk(2, { price: '50000' }),
      mk(3, { price: '15000' }),
    ];
    const out = filterByBudget(data, 30000);
    expect(out.map((m) => m.id)).toEqual([1, 3]);
  });

  it('исключает неопубликованные', () => {
    const data = [
      mk(1, { publish_status: 'draft', price: '10000' }),
      mk(2, { publish_status: 'published', price: '10000' }),
    ];
    const out = filterByBudget(data, 20000);
    expect(out.map((m) => m.id)).toEqual([2]);
  });

  it('некорректное значение price (нечисло) трактуется как «нет цены»', () => {
    const data = [
      mk(1, { price: 'foo' as unknown as string }),
      mk(2, { price: '50000' }),
    ];
    const out = filterByBudget(data, 20000);
    expect(out.map((m) => m.id)).toEqual([1]);
  });
});
