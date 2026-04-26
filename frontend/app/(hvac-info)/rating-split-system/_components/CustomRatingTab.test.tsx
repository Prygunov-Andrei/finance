import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  RatingMethodology,
  RatingMethodologyCriterion,
  RatingMethodologyPreset,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import CustomRatingTab, { computeIndex } from './CustomRatingTab';

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

const preset = (
  id: number,
  slug: string,
  label: string,
  order: number,
  criteria_codes: string[],
  is_all_selected = false,
): RatingMethodologyPreset => ({
  id,
  slug,
  label,
  order,
  description: '',
  is_all_selected,
  criteria_codes,
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

const mkMethodology = (
  criteria: RatingMethodologyCriterion[],
  presets: RatingMethodologyPreset[],
): RatingMethodology => ({
  version: '2026.04',
  name: 'test',
  criteria,
  stats: {
    total_models: 10,
    active_criteria_count: criteria.length,
    median_total_index: 70,
  },
  presets,
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

describe('CustomRatingTab — пресеты из API', () => {
  const criteria = [
    crit('noise_level', 4, 'Уровень шума'),
    crit('inverter', 5, 'Инвертор'),
    crit('wifi', 2, 'Wi-Fi'),
    crit('heat_exchanger_inner', 10, 'Теплообменник'),
  ];

  // NB: лейблы специально не совпадают с заголовком колонки «Август-климат»
  // в DesktopCustomTable, чтобы getByText не ловил два узла.
  const presets: RatingMethodologyPreset[] = [
    preset(1, 'avgust', 'Август (full)', 0, [
      'noise_level', 'inverter', 'wifi', 'heat_exchanger_inner',
    ], true),
    preset(2, 'silence', 'Тишина', 1, ['noise_level', 'inverter']),
    preset(3, 'budget', 'Бюджет', 2, ['noise_level', 'inverter', 'heat_exchanger_inner']),
  ];

  it('рендерит preset-chips из methodology.presets', () => {
    const methodology = mkMethodology(criteria, presets);
    render(
      <CustomRatingTab
        models={[mkModel(1, { noise_level: 80, inverter: 70 })]}
        methodology={methodology}
        variant="desktop"
      />,
    );
    expect(screen.getByText('Август (full)')).toBeInTheDocument();
    expect(screen.getByText('Тишина')).toBeInTheDocument();
    expect(screen.getByText('Бюджет')).toBeInTheDocument();
  });

  it('пресеты сортируются по полю order', () => {
    const shuffled: RatingMethodologyPreset[] = [
      preset(3, 'c', 'Третий', 2, ['noise_level']),
      preset(1, 'a', 'Первый', 0, ['noise_level']),
      preset(2, 'b', 'Второй', 1, ['noise_level']),
    ];
    const methodology = mkMethodology(criteria, shuffled);
    render(
      <CustomRatingTab
        models={[mkModel(1, { noise_level: 80 })]}
        methodology={methodology}
        variant="desktop"
      />,
    );
    const labels = ['Первый', 'Второй', 'Третий'];
    const buttons = labels.map((l) => screen.getByText(l));
    // DOM-порядок совпадает с order.
    for (let i = 0; i < buttons.length - 1; i++) {
      const pos = buttons[i].compareDocumentPosition(buttons[i + 1]);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('клик по пресету выбирает ровно его criteria_codes', () => {
    const methodology = mkMethodology(criteria, presets);
    render(
      <CustomRatingTab
        models={[
          mkModel(1, { noise_level: 80, inverter: 70, wifi: 50, heat_exchanger_inner: 60 }),
        ]}
        methodology={methodology}
        variant="desktop"
      />,
    );
    // Стартуем с «все 4 критерия выбраны» (initial active = allCodes).
    expect(screen.getByText(/^\s*4\s*$/)).toBeInTheDocument();
    // Клик «Тишина» — 2 кода → счётчик «2/4».
    fireEvent.click(screen.getByText('Тишина'));
    expect(screen.getByText(/^\s*2\s*$/)).toBeInTheDocument();
    // Клик «Бюджет» — 3 кода.
    fireEvent.click(screen.getByText('Бюджет'));
    expect(screen.getByText(/^\s*3\s*$/)).toBeInTheDocument();
  });

  it('пустой presets → 0 preset-chips, grid всё равно работает', () => {
    const methodology = mkMethodology(criteria, []);
    render(
      <CustomRatingTab
        models={[mkModel(1, { noise_level: 80, inverter: 70 })]}
        methodology={methodology}
        variant="desktop"
      />,
    );
    // Preset labels, которых не должно быть (заголовок колонки «Август-климат»
    // остаётся статичным в таблице — его не проверяем).
    expect(screen.queryByText('Август (full)')).not.toBeInTheDocument();
    expect(screen.queryByText('Тишина')).not.toBeInTheDocument();
    expect(screen.queryByText('Бюджет')).not.toBeInTheDocument();
    // Но таблица и критерии остались живы.
    expect(screen.getByText('Уровень шума')).toBeInTheDocument();
    expect(screen.getByText('Настроить критерии')).toBeInTheDocument();
  });
});
