import { describe, expect, it } from 'vitest';
import type {
  RatingMethodologyCriterion,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import { buildPresetsFromCriteria, computeIndex } from './CustomRatingTab';

const crit = (
  code: string,
  weight: number,
  name_ru = code
): RatingMethodologyCriterion => ({
  code,
  name_ru,
  description_ru: '',
  weight,
  unit: '',
  value_type: 'number',
  scoring_type: 'linear',
  group: 'other',
  group_display: 'Прочее',
  display_order: 0,
  min_value: null,
  median_value: null,
  max_value: null,
});

const mkModel = (
  id: number,
  scores: Record<string, number>
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
  noise_score: 75,
  has_noise_measurement: true,
  scores,
  is_ad: false,
  ad_position: null,
  rank: id,
});

describe('computeIndex', () => {
  const criteria = [crit('a', 10), crit('b', 5), crit('c', 2)];

  it('возвращает 0 при пустом множестве активных критериев', () => {
    const m = mkModel(1, { a: 80, b: 90, c: 60 });
    expect(computeIndex(m, new Set(), criteria)).toBe(0);
  });

  it('с одним критерием даёт его score', () => {
    const m = mkModel(1, { a: 80, b: 90, c: 60 });
    expect(computeIndex(m, new Set(['b']), criteria)).toBe(90);
  });

  it('усредняет с учётом весов', () => {
    const m = mkModel(1, { a: 100, b: 0 });
    // (10*100 + 5*0) / (10+5) = 1000/15 = 66.666...
    expect(computeIndex(m, new Set(['a', 'b']), criteria)).toBeCloseTo(66.667, 3);
  });

  it('пропускает критерии без данных', () => {
    const m = mkModel(1, { a: 80 });
    // b, c отсутствуют — остаётся только a
    expect(computeIndex(m, new Set(['a', 'b', 'c']), criteria)).toBe(80);
  });
});

describe('buildPresetsFromCriteria', () => {
  it('«all» возвращает все коды', () => {
    const c = [crit('x', 1), crit('y', 2), crit('z', 3)];
    const presets = buildPresetsFromCriteria(c);
    const all = presets.find((p) => p.id === 'all');
    expect(all?.codes).toEqual(['x', 'y', 'z']);
  });

  it('«budget» исключает smart-критерии', () => {
    const c = [
      crit('inverter', 5),
      crit('wifi', 2),
      crit('alice_support', 2),
      crit('noise_level', 4),
    ];
    const presets = buildPresetsFromCriteria(c);
    const budget = presets.find((p) => p.id === 'budget');
    expect(budget?.codes).toContain('inverter');
    expect(budget?.codes).toContain('noise_level');
    expect(budget?.codes).not.toContain('wifi');
    expect(budget?.codes).not.toContain('alice_support');
  });

  it('«silence» включает noise/inverter и исключает остальное', () => {
    const c = [
      crit('noise_level', 4),
      crit('inverter', 5),
      crit('wifi', 2),
      crit('heat_exchanger_inner', 10),
    ];
    const presets = buildPresetsFromCriteria(c);
    const silence = presets.find((p) => p.id === 'silence');
    expect(silence?.codes).toEqual(
      expect.arrayContaining(['noise_level', 'inverter'])
    );
    expect(silence?.codes).not.toContain('wifi');
  });
});
