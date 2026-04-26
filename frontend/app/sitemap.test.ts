import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/services/rating', () => ({
  getRatingMethodology: vi.fn(),
  getRatingModels: vi.fn(),
}));

vi.mock('@/lib/hvac-api', () => ({
  getAllNews: vi.fn(),
  getManufacturers: vi.fn(),
}));

import sitemap from './sitemap';
import { getRatingMethodology, getRatingModels } from '@/lib/api/services/rating';
import { getAllNews, getManufacturers } from '@/lib/hvac-api';

const mockedMethodology = vi.mocked(getRatingMethodology);
const mockedModels = vi.mocked(getRatingModels);
const mockedNews = vi.mocked(getAllNews);
const mockedManufacturers = vi.mocked(getManufacturers);

describe('app/sitemap.ts', () => {
  beforeEach(() => {
    mockedMethodology.mockReset();
    mockedModels.mockReset();
    mockedNews.mockReset();
    mockedManufacturers.mockReset();
  });

  it('содержит главную, rating, methodology, archive, submit, quiet и 7 ценовых страниц при пустых API', async () => {
    mockedMethodology.mockRejectedValue(new Error('no api'));
    mockedModels.mockRejectedValue(new Error('no api'));
    mockedNews.mockRejectedValue(new Error('no api'));
    mockedManufacturers.mockRejectedValue(new Error('no api'));

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

  it('добавляет presets, models, news и manufacturers если API отвечает', async () => {
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
    mockedManufacturers.mockResolvedValue([
      // @ts-expect-error — частичный fixture
      { id: 7, name: 'MDV' },
    ]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://hvac-info.com/rating-split-system/quiet-preset');
    expect(urls).not.toContain('https://hvac-info.com/rating-split-system/all');
    expect(urls).toContain('https://hvac-info.com/rating-split-system/mdv-aurora');
    expect(urls).not.toContain('https://hvac-info.com/rating-split-system/draft');
    expect(urls).toContain('https://hvac-info.com/news/42');
    expect(urls).toContain('https://hvac-info.com/manufacturers#7');
  });
});
