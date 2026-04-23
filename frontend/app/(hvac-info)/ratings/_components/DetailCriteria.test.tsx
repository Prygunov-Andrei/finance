import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  RatingMethodology,
  RatingModelDetail,
  RatingParameterScore,
} from '@/lib/api/types/rating';
import DetailCriteria, { pluralParam } from './DetailCriteria';

const mkScore = (code: string, over: Partial<RatingParameterScore> = {}): RatingParameterScore => ({
  criterion_code: code,
  criterion_name: code,
  unit: '',
  raw_value: '1',
  normalized_score: 70,
  weighted_score: 5,
  above_reference: false,
  ...over,
});

const baseDetail = (scores: RatingParameterScore[]): RatingModelDetail => ({
  id: 1,
  slug: 'test',
  brand: { id: 1, name: 'Test', logo: '' },
  series: '',
  inner_unit: 'T-1',
  outer_unit: '',
  nominal_capacity: null,
  total_index: 80,
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
  parameter_scores: scores,
  raw_values: [],
  methodology_version: '2026.04',
  rank: 1,
  median_total_index: 70,
  editorial_lede: '',
  editorial_body: '',
  editorial_quote: '',
  editorial_quote_author: '',
  inner_unit_dimensions: '',
  inner_unit_weight_kg: null,
  outer_unit_dimensions: '',
  outer_unit_weight_kg: null,
});

const mkMethodology = (
  criteria: RatingMethodology['criteria'] = [],
): RatingMethodology => ({
  version: '2026.04',
  name: 'test',
  criteria,
  stats: { total_models: 10, active_criteria_count: 30, median_total_index: 70 },
  presets: [],
});

describe('pluralParam', () => {
  it('1 → параметр (Им.п. ед.)', () => {
    expect(pluralParam(1)).toBe('параметр');
  });

  it('2, 3, 4 → параметра (Р.п. ед.)', () => {
    expect(pluralParam(2)).toBe('параметра');
    expect(pluralParam(3)).toBe('параметра');
    expect(pluralParam(4)).toBe('параметра');
  });

  it('5-20 → параметров (покрывает кейс 11-14)', () => {
    expect(pluralParam(5)).toBe('параметров');
    expect(pluralParam(11)).toBe('параметров');
    expect(pluralParam(14)).toBe('параметров');
    expect(pluralParam(20)).toBe('параметров');
  });

  it('21 → параметр (20 + 1, Им.п. ед.)', () => {
    expect(pluralParam(21)).toBe('параметр');
  });

  it('30 → параметров', () => {
    expect(pluralParam(30)).toBe('параметров');
  });

  it('32 → параметра', () => {
    expect(pluralParam(32)).toBe('параметра');
  });
});

describe('DetailCriteria', () => {
  it('заголовок использует activeCriteriaCount (30), а не parameter_scores.length (32)', () => {
    const scores = Array.from({ length: 32 }, (_, i) => mkScore(`c${i}`));
    const detail = baseDetail(scores);
    render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={30}
        methodology={mkMethodology()}
      />,
    );
    expect(screen.getByText(/30 параметров рейтинга/)).toBeTruthy();
    expect(screen.queryByText(/32 параметров/)).toBeNull();
  });

  it('ключевые замеры (is_key_measurement=True) рендерятся первыми с badge', () => {
    const detail = baseDetail([
      mkScore('normal_a', { weighted_score: 10 }),
      mkScore('key_one', { weighted_score: 2 }),
      mkScore('normal_b', { weighted_score: 8 }),
    ]);
    const methodology = mkMethodology([
      {
        code: 'normal_a',
        name_ru: 'normal_a',
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
        is_key_measurement: false,
      },
      {
        code: 'key_one',
        name_ru: 'key_one',
        description_ru: '',
        weight: 1,
        unit: '',
        value_type: 'numeric',
        scoring_type: 'min_median_max',
        group: 'acoustics',
        group_display: 'Акустика',
        display_order: 0,
        min_value: null,
        median_value: null,
        max_value: null,
        is_key_measurement: true,
      },
    ]);
    const { container } = render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={3}
        methodology={methodology}
      />,
    );
    // Бейдж «КЛЮЧЕВОЙ ЗАМЕР»:
    expect(screen.getByText(/ключевой замер/i)).toBeTruthy();
    // Key-measurement row идёт первым (раньше normal_a, хоть у normal_a выше weighted_score):
    const rows = Array.from(
      container.querySelectorAll('[data-testid="key-measurement-row"]'),
    );
    expect(rows.length).toBe(1);
    // Первый родительский блок внутри списка — именно key-measurement (перед всеми ListRow).
    const listItems = container.querySelectorAll('.rt-criteria-main > div > div');
    // первый элемент имеет test-id key-measurement-row
    expect(
      (listItems[0] as HTMLElement)?.getAttribute('data-testid'),
    ).toBe('key-measurement-row');
  });

  it('если is_key_measurement отсутствует в API (backend Пети ещё не смержен) — фронт не падает', () => {
    const detail = baseDetail([mkScore('a', { weighted_score: 5 })]);
    // methodology.criteria без поля is_key_measurement (optional).
    const methodology = mkMethodology([
      {
        code: 'a',
        name_ru: 'a',
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
      },
    ]);
    const { container } = render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={1}
        methodology={methodology}
      />,
    );
    // Ни одного key-measurement — графиня превращается в обычный ListRow.
    expect(container.querySelectorAll('[data-testid="key-measurement-row"]')).toHaveLength(0);
    expect(screen.queryByText(/ключевой замер/i)).toBeNull();
  });

  it('tooltip «?» отображает description_ru при клике', () => {
    const detail = baseDetail([mkScore('a')]);
    const methodology = mkMethodology([
      {
        code: 'a',
        name_ru: 'a',
        description_ru: 'Подробное описание критерия',
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
      },
    ]);
    const { container } = render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={1}
        methodology={methodology}
      />,
    );
    const tooltipTrigger = container.querySelector(
      'button[aria-label="Описание критерия"]',
    ) as HTMLButtonElement;
    expect(tooltipTrigger).toBeTruthy();
    fireEvent.click(tooltipTrigger);
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Подробное описание критерия',
    );
    // Native title-атрибут тоже установлен — keyboard users и SR получают подсказку.
    expect(tooltipTrigger.getAttribute('title')).toBe(
      'Подробное описание критерия',
    );
  });

  it('ViewSwitcher содержит только «Список» и «Паутинка» (без «Сетка»)', () => {
    const detail = baseDetail([mkScore('a')]);
    render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={1}
        methodology={mkMethodology()}
      />,
    );
    expect(screen.getByText('Список')).toBeTruthy();
    expect(screen.getByText('Паутинка')).toBeTruthy();
    expect(screen.queryByText('Сетка')).toBeNull();
  });

  it('DetailEditorial рендерится в aside (pros/cons + Вердикт редакции)', () => {
    const detail: RatingModelDetail = {
      ...baseDetail([mkScore('a')]),
      pros_text: 'Тихий — минимальный шум 21 дБ\nСтильный дизайн',
      cons_text: 'Дорогая установка',
      editorial_body: 'Эта модель — эталон класса.',
    };
    render(
      <DetailCriteria
        detail={detail}
        activeCriteriaCount={1}
        methodology={mkMethodology()}
      />,
    );
    expect(screen.getByText(/вердикт редакции/i)).toBeTruthy();
    expect(screen.getByText(/Плюсы · 2/)).toBeTruthy();
    expect(screen.getByText(/Минусы · 1/)).toBeTruthy();
    // Хардкод авторов:
    expect(screen.getByText(/Савинов Максим/)).toBeTruthy();
    expect(screen.getByText(/Прыгунов Андрей/)).toBeTruthy();
  });
});
