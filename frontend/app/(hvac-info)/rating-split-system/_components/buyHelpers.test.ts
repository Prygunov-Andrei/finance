import { describe, expect, it } from 'vitest';
import type { RatingModelSupplier } from '@/lib/api/types/rating';
import {
  availabilityDotColor,
  cityCounts,
  computePriceStats,
  filterSuppliers,
  sortByPriceAsc,
  toNumber,
} from './buyHelpers';

const mk = (
  id: number,
  price: string | null,
  city = 'Москва',
  extra: Partial<RatingModelSupplier> = {},
): RatingModelSupplier => ({
  id,
  name: `Магазин ${id}`,
  url: '',
  order: id,
  price,
  city,
  rating: null,
  availability: 'unknown',
  availability_display: 'Не известно',
  note: '',
  ...extra,
});

describe('computePriceStats', () => {
  it('возвращает count=0 и нули если нет цен', () => {
    const st = computePriceStats([mk(1, null), mk(2, null)]);
    expect(st.count).toBe(0);
    expect(st.minSupplier).toBeNull();
  });

  it('считает min/max/avg/median для двух цен (чётное)', () => {
    const st = computePriceStats([mk(1, '100'), mk(2, '200'), mk(3, null)]);
    expect(st.count).toBe(2);
    expect(st.min).toBe(100);
    expect(st.max).toBe(200);
    expect(st.avg).toBe(150);
    expect(st.median).toBe(150);
    expect(st.minSupplier?.id).toBe(1);
    expect(st.maxSupplier?.id).toBe(2);
  });

  it('считает median для нечётного количества', () => {
    const st = computePriceStats([mk(1, '100'), mk(2, '150'), mk(3, '300')]);
    expect(st.median).toBe(150);
    expect(st.avg).toBeCloseTo(183.33, 1);
  });

  it('игнорирует невалидные числа', () => {
    const st = computePriceStats([mk(1, 'abc'), mk(2, '200')]);
    expect(st.count).toBe(1);
  });
});

describe('filterSuppliers', () => {
  it('фильтрует по городу', () => {
    const s = [mk(1, '100', 'Москва'), mk(2, '200', 'СПб'), mk(3, '300', 'Москва')];
    expect(filterSuppliers(s, { city: 'Москва' }).map((x) => x.id)).toEqual([1, 3]);
  });

  it('без city возвращает всё', () => {
    const s = [mk(1, '100', 'Москва'), mk(2, '200', 'СПб')];
    expect(filterSuppliers(s, { city: null })).toHaveLength(2);
    expect(filterSuppliers(s, { city: '' })).toHaveLength(2);
  });
});

describe('cityCounts', () => {
  it('считает суппаеры по городам, сортирует по count DESC', () => {
    const s = [
      mk(1, '100', 'Москва'),
      mk(2, '200', 'СПб'),
      mk(3, '300', 'Москва'),
      mk(4, '400', 'Москва'),
      mk(5, '500', ''),
    ];
    expect(cityCounts(s)).toEqual([
      { city: 'Москва', count: 3 },
      { city: 'СПб', count: 1 },
    ]);
  });
});

describe('sortByPriceAsc', () => {
  it('сортирует по цене ASC, null в конец', () => {
    const s = [
      mk(1, '200'),
      mk(2, null),
      mk(3, '100'),
      mk(4, '150'),
    ];
    expect(sortByPriceAsc(s).map((x) => x.id)).toEqual([3, 4, 1, 2]);
  });
});

describe('toNumber', () => {
  it('преобразует строку, null, пусто, нечисло', () => {
    expect(toNumber('155000')).toBe(155000);
    expect(toNumber(null)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });
});

describe('availabilityDotColor', () => {
  it('возвращает цвет для каждого статуса', () => {
    expect(availabilityDotColor('in_stock')).toBe('#1f8f4c');
    expect(availabilityDotColor('low_stock')).toBe('#c9821c');
    expect(availabilityDotColor('out_of_stock')).toBe('#b24a3b');
    expect(availabilityDotColor('unknown')).toContain('rt-ink-40');
  });
});
