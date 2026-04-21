import { describe, expect, it } from 'vitest';
import type {
  RatingMethodology,
  RatingModelDetail,
  RatingParameterScore,
  RatingRawValue,
} from '@/lib/api/types/rating';
import { buildSpecGroups, countSpecRows } from './specs';

const criterion = (
  code: string,
  overrides: Partial<RatingMethodology['criteria'][number]> = {},
): RatingMethodology['criteria'][number] => ({
  code,
  name_ru: code,
  description_ru: '',
  weight: 1,
  unit: '',
  value_type: 'numeric',
  scoring_type: 'min_median_max',
  group: 'climate',
  group_display: 'Климат',
  display_order: 0,
  min_value: null,
  median_value: null,
  max_value: null,
  ...overrides,
});

const rv = (
  code: string,
  raw_value: string,
  extra: Partial<RatingRawValue> = {},
): RatingRawValue => ({
  criterion_code: code,
  criterion_name: code,
  raw_value,
  numeric_value: null,
  source: '',
  source_url: '',
  verification_status: '',
  verification_display: '',
  ...extra,
});

const ps = (
  code: string,
  normalized_score: number,
  above_reference = false,
): RatingParameterScore => ({
  criterion_code: code,
  criterion_name: code,
  unit: '',
  raw_value: '',
  normalized_score,
  weighted_score: normalized_score,
  above_reference,
});

function baseDetail(
  raw_values: RatingRawValue[],
  parameter_scores: RatingParameterScore[],
  dims: Partial<
    Pick<
      RatingModelDetail,
      | 'inner_unit_dimensions'
      | 'inner_unit_weight_kg'
      | 'outer_unit_dimensions'
      | 'outer_unit_weight_kg'
    >
  > = {},
): Pick<
  RatingModelDetail,
  | 'raw_values'
  | 'parameter_scores'
  | 'inner_unit_dimensions'
  | 'inner_unit_weight_kg'
  | 'outer_unit_dimensions'
  | 'outer_unit_weight_kg'
> {
  return {
    raw_values,
    parameter_scores,
    inner_unit_dimensions: '',
    inner_unit_weight_kg: null,
    outer_unit_dimensions: '',
    outer_unit_weight_kg: null,
    ...dims,
  };
}

function methodology(
  criteria: RatingMethodology['criteria'],
): RatingMethodology {
  return {
    version: '2026.04',
    name: 'test',
    criteria,
    stats: { total_models: 10, active_criteria_count: criteria.length, median_total_index: 70 },
  };
}

describe('buildSpecGroups', () => {
  it('группирует raw_values по criterion.group', () => {
    const m = methodology([
      criterion('seer', { group: 'climate', group_display: 'Климат', unit: '' }),
      criterion('compressor_type', {
        group: 'compressor',
        group_display: 'Компрессор',
        unit: '',
      }),
    ]);
    const detail = baseDetail(
      [rv('seer', '6.5'), rv('compressor_type', 'DC-инвертор')],
      [],
    );
    const groups = buildSpecGroups(detail, m);
    expect(groups.map((g) => g.group)).toEqual(['climate', 'compressor']);
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[1].rows[0].value).toBe('DC-инвертор');
  });

  it('добавляет unit из methodology к raw_value', () => {
    const m = methodology([
      criterion('cooling_power', { group: 'climate', unit: 'кВт' }),
    ]);
    const groups = buildSpecGroups(
      baseDetail([rv('cooling_power', '3.5')], []),
      m,
    );
    expect(groups[0].rows[0].value).toBe('3.5 кВт');
  });

  it('above_reference=true ставит ticker=above', () => {
    const m = methodology([criterion('seer', { group: 'climate' })]);
    const groups = buildSpecGroups(
      baseDetail([rv('seer', '6.5')], [ps('seer', 80, true)]),
      m,
    );
    expect(groups[0].rows[0].ticker).toBe('above');
  });

  it('normalized_score < 40 ставит ticker=below', () => {
    const m = methodology([criterion('seer', { group: 'climate' })]);
    const groups = buildSpecGroups(
      baseDetail([rv('seer', '3.0')], [ps('seer', 30, false)]),
      m,
    );
    expect(groups[0].rows[0].ticker).toBe('below');
  });

  it('нейтральные значения (40-100, above_reference=false) — ticker=null', () => {
    const m = methodology([criterion('seer', { group: 'climate' })]);
    const groups = buildSpecGroups(
      baseDetail([rv('seer', '5.0')], [ps('seer', 60, false)]),
      m,
    );
    expect(groups[0].rows[0].ticker).toBeNull();
  });

  it('пустые raw_value пропускаются', () => {
    const m = methodology([
      criterion('a', { group: 'climate' }),
      criterion('b', { group: 'climate' }),
    ]);
    const groups = buildSpecGroups(
      baseDetail([rv('a', ''), rv('b', '   '), rv('a', 'ok')], []),
      m,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(1);
  });

  it('добавляет hero-dimensions в группу dimensions', () => {
    const m = methodology([]);
    const groups = buildSpecGroups(
      baseDetail([], [], {
        inner_unit_dimensions: '850×295×189 мм',
        inner_unit_weight_kg: '10',
        outer_unit_dimensions: '820×620×290 мм',
        outer_unit_weight_kg: '42',
      }),
      m,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('dimensions');
    expect(groups[0].rows).toHaveLength(4);
    expect(groups[0].rows[1].value).toBe('10 кг');
  });

  it('пустые dimensions не попадают в rows', () => {
    const m = methodology([]);
    const groups = buildSpecGroups(
      baseDetail([], [], {
        inner_unit_dimensions: '850×295×189 мм',
        inner_unit_weight_kg: null,
        outer_unit_dimensions: '',
        outer_unit_weight_kg: null,
      }),
      m,
    );
    expect(groups[0].rows).toHaveLength(1);
  });

  it('criteria без methodology попадают в other', () => {
    const groups = buildSpecGroups(
      baseDetail([rv('unknown', 'x')], []),
      null,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('other');
    expect(groups[0].group_display).toBe('Прочее');
  });

  it('countSpecRows суммирует все строки', () => {
    const m = methodology([
      criterion('a', { group: 'climate' }),
      criterion('b', { group: 'acoustics', group_display: 'Акустика' }),
    ]);
    const groups = buildSpecGroups(
      baseDetail([rv('a', '1'), rv('b', '2')], []),
      m,
    );
    expect(countSpecRows(groups)).toBe(2);
  });
});
