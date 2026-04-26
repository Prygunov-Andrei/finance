import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/services/rating', () => ({
  getRatingMethodology: vi.fn(),
  getRatingModels: vi.fn(),
}));

import { GET } from './route';
import { getRatingMethodology, getRatingModels } from '@/lib/api/services/rating';

const mockedMethodology = vi.mocked(getRatingMethodology);
const mockedModels = vi.mocked(getRatingModels);

describe('GET /llms-full.txt', () => {
  beforeEach(() => {
    mockedMethodology.mockReset();
    mockedModels.mockReset();
  });

  it('возвращает базовое описание + авторов даже когда API не отвечает', async () => {
    mockedMethodology.mockRejectedValue(new Error('no api'));
    mockedModels.mockRejectedValue(new Error('no api'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET();
    errSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body).toMatch(/# HVAC Info — Полная база знаний/);
    expect(body).toContain('Максим Савинов');
    expect(body).toContain('Август-климат');
    // Без методики и моделей разделов нет
    expect(body).not.toContain('Топ-30 моделей');
    expect(body).not.toContain('Критерии оценки');
  });

  it('рендерит методику с критериями и пресетами + топ моделей', async () => {
    mockedMethodology.mockResolvedValue({
      version: 'v1.2',
      name: 'Август-климат',
      criteria: [
        {
          code: 'noise',
          name_ru: 'Уровень шума',
          description_ru: 'Лабораторный замер шума внутреннего блока',
          weight: 15,
          unit: 'дБ(А)',
          value_type: 'number',
          scoring_type: 'lower_is_better',
          group: 'acoustics',
          group_display: 'Акустика',
          display_order: 1,
          min_value: 18,
          median_value: 32,
          max_value: 50,
        },
      ],
      stats: { total_models: 100, active_criteria_count: 30, median_total_index: 55.4 },
      presets: [
        { id: 1, slug: 'all', label: 'Всё', order: 0, description: '', is_all_selected: true, criteria_codes: [] },
        { id: 2, slug: 'quiet-preset', label: 'Тихие', order: 1, description: 'Только шум и виброизоляция', is_all_selected: false, criteria_codes: ['noise'] },
      ],
    });
    mockedModels.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      {
        slug: 'mdv-aurora-09',
        brand: 'MDV',
        series: 'Aurora',
        inner_unit: 'AURORA-09H',
        total_index: 78.5,
        rank: 1,
        publish_status: 'published',
        price: '32000',
      },
      // @ts-expect-error — draft не должен попасть
      { slug: 'draft', brand: 'X', series: '', inner_unit: 'D', total_index: 0, rank: 99, publish_status: 'draft' },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(body).toContain('Методика «Август-климат» (версия v1.2)');
    expect(body).toContain('Активных критериев: 30');
    expect(body).toContain('Уровень шума (вес 15%)');
    expect(body).toContain('Лабораторный замер шума внутреннего блока');
    expect(body).toContain('Медиана по рынку: 32 дБ(А)');
    expect(body).toContain('Группа: Акустика');
    expect(body).toContain('**Тихие** — Только шум и виброизоляция');

    expect(body).toContain('Топ-30 моделей в рейтинге');
    expect(body).toMatch(/\| 1 \| MDV \| Aurora \| AURORA-09H \| 78\.5 \|/);
    expect(body).toContain('₽');
    // Draft исключён
    expect(body).not.toMatch(/\| 99 \|/);
  });
});
