import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  RatingMethodology,
  RatingModelDetail,
  RatingRawValue,
} from '@/lib/api/types/rating';
import DetailSpecs from './DetailSpecs';
import {
  buildSpecsPlainText,
  buildCsvUrl,
  copySpecsToClipboard,
} from './detailSpecsActions';
import type { SpecGroup } from './specs';

const rv = (code: string, raw: string, name = code): RatingRawValue => ({
  criterion_code: code,
  criterion_name: name,
  raw_value: raw,
  numeric_value: null,
  source: '',
  source_url: '',
  verification_status: '',
  verification_display: '',
});

const baseDetail = (): RatingModelDetail => ({
  id: 1,
  slug: 'casarte-cas-25',
  brand: { id: 1, name: 'Casarte', logo: '' },
  series: '',
  inner_unit: 'CAS-25',
  outer_unit: '',
  nominal_capacity: null,
  total_index: 78,
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
  raw_values: [rv('seer', '6.5', 'SEER'), rv('noise_min', '21', 'Мин. шум')],
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

const methodology: RatingMethodology = {
  version: '2026.04',
  name: 't',
  criteria: [
    {
      code: 'seer',
      name_ru: 'SEER',
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
    {
      code: 'noise_min',
      name_ru: 'Мин. шум',
      description_ru: '',
      weight: 1,
      unit: 'дБ',
      value_type: 'numeric',
      scoring_type: 'min_median_max',
      group: 'acoustics',
      group_display: 'Акустика',
      display_order: 1,
      min_value: null,
      median_value: null,
      max_value: null,
    },
  ],
  stats: { total_models: 10, active_criteria_count: 2, median_total_index: 70 },
  presets: [],
};

describe('buildSpecsPlainText', () => {
  it('формирует табличное представление с заголовками групп', () => {
    const groups: SpecGroup[] = [
      {
        group: 'climate',
        group_display: 'Климат',
        rows: [
          { key: 'seer', name: 'SEER', value: '6.5', ticker: null },
        ],
      },
      {
        group: 'acoustics',
        group_display: 'Акустика',
        rows: [
          { key: 'noise', name: 'Мин. шум', value: '21 дБ', ticker: null },
        ],
      },
    ];
    const text = buildSpecsPlainText(groups);
    expect(text).toContain('КЛИМАТ');
    expect(text).toContain('SEER\t6.5');
    expect(text).toContain('АКУСТИКА');
    expect(text).toContain('Мин. шум\t21 дБ');
  });

  it('группы разделены пустой строкой', () => {
    const groups: SpecGroup[] = [
      {
        group: 'climate',
        group_display: 'A',
        rows: [{ key: 'k', name: 'k', value: 'v', ticker: null }],
      },
      {
        group: 'compressor',
        group_display: 'B',
        rows: [{ key: 'k2', name: 'k2', value: 'v2', ticker: null }],
      },
    ];
    const text = buildSpecsPlainText(groups);
    expect(text).toMatch(/k\tv\n\nB\nk2\tv2/);
  });
});

describe('buildCsvUrl', () => {
  it('собирает корректный URL экспорта', () => {
    const url = buildCsvUrl('casarte-cas-25');
    expect(url).toMatch(
      /\/api\/public\/v1\/rating\/models\/casarte-cas-25\/export\.csv$/,
    );
  });

  it('экранирует spec-символы в slug', () => {
    const url = buildCsvUrl('foo bar');
    expect(url).toContain('foo%20bar');
  });
});

describe('copySpecsToClipboard', () => {
  it('пишет текст в navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(globalThis.navigator, {
      clipboard: { writeText },
    });
    const groups: SpecGroup[] = [
      {
        group: 'climate',
        group_display: 'Климат',
        rows: [{ key: 'a', name: 'A', value: '1', ticker: null }],
      },
    ];
    const ok = await copySpecsToClipboard(groups);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('КЛИМАТ');
  });

  it('возвращает false если writeText падает', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(globalThis.navigator, { clipboard: { writeText } });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await copySpecsToClipboard([]);
    expect(ok).toBe(false);
    spy.mockRestore();
  });
});

describe('DetailSpecs', () => {
  beforeEach(() => {
    Object.assign(globalThis.navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('раскладка 2 колонки на desktop (grid-template-columns: 1fr 1fr)', () => {
    const { container } = render(
      <DetailSpecs detail={baseDetail()} methodology={methodology} />,
    );
    const grid = container.querySelector('.rt-specs-grid') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('CSV-ссылка указывает на Петин endpoint /export.csv и имеет attribute download', () => {
    render(<DetailSpecs detail={baseDetail()} methodology={methodology} />);
    const link = screen.getByTestId('specs-csv-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(
      /\/api\/public\/v1\/rating\/models\/casarte-cas-25\/export\.csv$/,
    );
    expect(link.getAttribute('download')).toBe('casarte-cas-25.csv');
  });

  it('клик на «Копировать» вызывает navigator.clipboard.writeText и меняет лейбл на «Скопировано»', async () => {
    render(<DetailSpecs detail={baseDetail()} methodology={methodology} />);
    const copyBtn = screen.getByTitle('Скопировать в буфер обмена');
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/скопировано/i)).toBeTruthy();
    });
  });

  it('рендерит кнопки PDF, CSV, Копировать', () => {
    render(<DetailSpecs detail={baseDetail()} methodology={methodology} />);
    expect(screen.getByTitle('Сохранить PDF')).toBeTruthy();
    expect(screen.getByTitle('Скачать CSV')).toBeTruthy();
    expect(screen.getByTitle('Скопировать в буфер обмена')).toBeTruthy();
  });
});
