import type {
  RatingCriterionGroup,
  RatingMethodology,
  RatingMethodologyCriterion,
  RatingModelDetail,
  RatingParameterScore,
  RatingRawValue,
} from '@/lib/api/types/rating';

export type SpecTicker = 'above' | 'below' | null;

/** Расширяем RatingCriterionGroup синтетической группой `key_measurements`,
 *  которую DetailSpecs показывает первым блоком (Polish 2.0 п. A4). */
export type SpecGroupCode = RatingCriterionGroup | 'key_measurements';

export interface SpecRow {
  key: string;
  name: string;
  value: string;
  ticker: SpecTicker;
  /** true для критериев с criterion.is_key_measurement — DetailSpecs может
   *  визуально подсветить такие строки (badge / accent border). */
  is_key?: boolean;
}

export interface SpecGroup {
  group: SpecGroupCode;
  group_display: string;
  rows: SpecRow[];
}

const GROUP_ORDER: SpecGroupCode[] = [
  'key_measurements',
  'climate',
  'compressor',
  'acoustics',
  'control',
  'dimensions',
  'other',
];

const GROUP_DISPLAY_FALLBACK: Record<SpecGroupCode, string> = {
  key_measurements: 'Ключевые замеры',
  climate: 'Климат',
  compressor: 'Компрессор и контур',
  acoustics: 'Акустика',
  control: 'Управление и датчики',
  dimensions: 'Габариты и комплектация',
  other: 'Прочее',
};

function tickerFor(score: RatingParameterScore | undefined): SpecTicker {
  if (!score) return null;
  if (score.above_reference) return 'above';
  if (score.normalized_score < 40) return 'below';
  return null;
}

function formatValue(raw: string, unit: string): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  const u = (unit ?? '').trim();
  if (!u) return v;
  if (v.endsWith(u)) return v;
  return `${v} ${u}`;
}

export function buildSpecGroups(
  detail: Pick<
    RatingModelDetail,
    | 'raw_values'
    | 'parameter_scores'
    | 'inner_unit_dimensions'
    | 'inner_unit_weight_kg'
    | 'outer_unit_dimensions'
    | 'outer_unit_weight_kg'
  >,
  methodology: RatingMethodology | null,
): SpecGroup[] {
  const criteriaByCode = new Map<string, RatingMethodologyCriterion>();
  for (const c of methodology?.criteria ?? []) {
    criteriaByCode.set(c.code, c);
  }
  const scoresByCode = new Map<string, RatingParameterScore>();
  for (const s of detail.parameter_scores ?? []) {
    scoresByCode.set(s.criterion_code, s);
  }

  const groups = new Map<SpecGroupCode, SpecGroup>();
  const ensure = (g: SpecGroupCode, display: string): SpecGroup => {
    let cur = groups.get(g);
    if (!cur) {
      cur = {
        group: g,
        group_display: display || GROUP_DISPLAY_FALLBACK[g],
        rows: [],
      };
      groups.set(g, cur);
    }
    return cur;
  };

  for (const rv of detail.raw_values ?? []) {
    const code = rv.criterion_code;
    if (!code) continue;
    const crit = criteriaByCode.get(code);
    const isKey = Boolean(crit?.is_key_measurement);
    // Polish 2.0 A4: ключевые замеры — отдельный синтетический блок наверху.
    const group: SpecGroupCode = isKey
      ? 'key_measurements'
      : crit?.group ?? 'other';
    const display = isKey
      ? GROUP_DISPLAY_FALLBACK.key_measurements
      : crit?.group_display ?? GROUP_DISPLAY_FALLBACK[group];
    const value = formatValue(rv.raw_value ?? '', crit?.unit ?? '');
    if (!value) continue;
    const bucket = ensure(group, display);
    bucket.rows.push({
      key: code,
      name: crit?.name_ru || rv.criterion_name || code,
      value,
      ticker: tickerFor(scoresByCode.get(code)),
      is_key: isKey || undefined,
    });
  }

  const dimensions = ensure('dimensions', GROUP_DISPLAY_FALLBACK.dimensions);
  const extra: Array<[string, string, string]> = [
    ['inner_unit_dimensions', 'Внутренний блок (размер)', detail.inner_unit_dimensions ?? ''],
    [
      'inner_unit_weight_kg',
      'Внутренний блок (вес)',
      detail.inner_unit_weight_kg ? `${detail.inner_unit_weight_kg} кг` : '',
    ],
    ['outer_unit_dimensions', 'Наружный блок (размер)', detail.outer_unit_dimensions ?? ''],
    [
      'outer_unit_weight_kg',
      'Наружный блок (вес)',
      detail.outer_unit_weight_kg ? `${detail.outer_unit_weight_kg} кг` : '',
    ],
  ];
  for (const [key, name, value] of extra) {
    const v = (value ?? '').trim();
    if (!v) continue;
    dimensions.rows.push({ key, name, value: v, ticker: null });
  }
  if (dimensions.rows.length === 0) groups.delete('dimensions');

  return GROUP_ORDER.map((g) => groups.get(g)).filter(
    (g): g is SpecGroup => !!g && g.rows.length > 0,
  );
}

export function countSpecRows(groups: SpecGroup[]): number {
  return groups.reduce((s, g) => s + g.rows.length, 0);
}
