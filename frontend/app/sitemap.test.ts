import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/services/rating', () => ({
  getRatingMethodology: vi.fn(),
  getRatingModels: vi.fn(),
}));

vi.mock('@/lib/hvac-api', () => ({
  getAllNews: vi.fn(),
}));

import sitemap from './sitemap';
import { getRatingMethodology, getRatingModels } from '@/lib/api/services/rating';
import { getAllNews } from '@/lib/hvac-api';

const mockedMethodology = vi.mocked(getRatingMethodology);
const mockedModels = vi.mocked(getRatingModels);
const mockedNews = vi.mocked(getAllNews);

describe('app/sitemap.ts', () => {
  beforeEach(() => {
    mockedMethodology.mockReset();
    mockedModels.mockReset();
    mockedNews.mockReset();
  });

  it('содержит главную, rating, methodology, archive, submit, quiet и 7 ценовых страниц при пустых API', async () => {
    mockedMethodology.mockRejectedValue(new Error('no api'));
    mockedModels.mockRejectedValue(new Error('no api'));
    mockedNews.mockRejectedValue(new Error('no api'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await sitemap();
    errSpy.mockRestore();

    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://hvac-info.com/');
    expect(urls).toContain('https://hvac-info.com/rating-split-system');
    expect(urls).toContain('https://hvac-info.com/rating-split-system/methodology');
    expect(urls).toContain('https://hvac-info.com/rating-split-system/archive');
    expect(urls).toContain('https://hvac-info.com/rating-split-system/submit');
    expect(urls).toContain('https://hvac-info.com/quiet');
    for (const slug of [
      'do-20000-rub',
      'do-25000-rub',
      'do-30000-rub',
      'do-35000-rub',
      'do-40000-rub',
      'do-50000-rub',
      'do-60000-rub',
    ]) {
      expect(urls).toContain(`https://hvac-info.com/price/${slug}`);
    }
  });

  it('добавляет presets, models и news, не генерирует anchor-URL с #', async () => {
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'Август-климат',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 1, median_total_index: 50 },
      presets: [
        { id: 1, slug: 'all', label: 'Всё', order: 0, description: '', is_all_selected: true, criteria_codes: [] },
        { id: 2, slug: 'quiet-preset', label: 'Тихие', order: 1, description: '', is_all_selected: false, criteria_codes: [] },
      ],
    });
    mockedModels.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      { slug: 'mdv-aurora', publish_status: 'published' },
      // @ts-expect-error — частичный fixture
      { slug: 'draft', publish_status: 'draft' },
    ]);
    mockedNews.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      { id: 42, pub_date: '2026-04-01T00:00:00Z' },
    ]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://hvac-info.com/rating-split-system/preset/quiet-preset');
    expect(urls).not.toContain('https://hvac-info.com/rating-split-system/preset/all');
    expect(urls).toContain('https://hvac-info.com/rating-split-system/mdv-aurora');
    expect(urls).not.toContain('https://hvac-info.com/rating-split-system/draft');
    expect(urls).toContain('https://hvac-info.com/news/42');
    expect(urls.filter((u) => u.includes('#'))).toHaveLength(0);
  });

  it('использует updated_at для lastModified моделей и добавляет images если main_photo_url есть', async () => {
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'Август-климат',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 1, median_total_index: 50 },
      presets: [],
    });
    mockedModels.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      {
        slug: 'mdv-aurora',
        publish_status: 'published',
        updated_at: '2026-04-15T10:00:00Z',
        main_photo_url: 'https://hvac-info.com/media/ac_rating/photos/mdv.jpg',
      },
    ]);
    mockedNews.mockRejectedValue(new Error('no api'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await sitemap();
    errSpy.mockRestore();

    const modelEntry = entries.find((e) => e.url.includes('/mdv-aurora'));
    expect(modelEntry).toBeDefined();
    expect(modelEntry!.lastModified).toEqual(new Date('2026-04-15T10:00:00Z'));
    expect(modelEntry!.images).toEqual([
      'https://hvac-info.com/media/ac_rating/photos/mdv.jpg',
    ]);
  });

  it('пропускает images если main_photo_url пустой', async () => {
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'Август-климат',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 1, median_total_index: 50 },
      presets: [],
    });
    mockedModels.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      { slug: 'no-photo', publish_status: 'published' },
    ]);
    mockedNews.mockRejectedValue(new Error('no api'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await sitemap();
    errSpy.mockRestore();

    const modelEntry = entries.find((e) => e.url.includes('/no-photo'));
    expect(modelEntry?.images).toBeUndefined();
  });

  it('использует updated_at для lastModified пресетов', async () => {
    mockedMethodology.mockResolvedValue({
      version: 'v1',
      name: 'Август-климат',
      criteria: [],
      stats: { total_models: 1, active_criteria_count: 1, median_total_index: 50 },
      presets: [
        // @ts-expect-error — частичный fixture
        {
          slug: 'eco-preset',
          is_all_selected: false,
          updated_at: '2026-04-20T08:30:00Z',
        },
      ],
    });
    mockedModels.mockRejectedValue(new Error('no api'));
    mockedNews.mockRejectedValue(new Error('no api'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = await sitemap();
    errSpy.mockRestore();

    const presetEntry = entries.find((e) => e.url.endsWith('/preset/eco-preset'));
    expect(presetEntry).toBeDefined();
    expect(presetEntry!.lastModified).toEqual(new Date('2026-04-20T08:30:00Z'));
  });
});
