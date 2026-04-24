import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('./apiClient', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import newsCategoriesService from './newsCategoriesService';

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
  mockDelete.mockReset();
});

describe('newsCategoriesService', () => {
  it('getNewsCategories: возвращает массив для plain-array ответа', async () => {
    mockGet.mockResolvedValue({
      data: [
        { slug: 'business', name: 'Деловые', order: 10, is_active: true },
        { slug: 'industry', name: 'Индустрия', order: 20, is_active: true },
      ],
    });
    const result = await newsCategoriesService.getNewsCategories();
    expect(mockGet).toHaveBeenCalledWith('/news-categories/');
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('business');
  });

  it('getNewsCategories: разворачивает paginated {results: [...]}', async () => {
    mockGet.mockResolvedValue({
      data: { results: [{ slug: 'guide', name: 'Гайд', order: 60, is_active: true }] },
    });
    const result = await newsCategoriesService.getNewsCategories();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('guide');
  });

  it('createNewsCategory: POST с payload', async () => {
    const created = { slug: 'foo', name: 'Foo', order: 99, is_active: true };
    mockPost.mockResolvedValue({ data: created });
    const result = await newsCategoriesService.createNewsCategory({
      slug: 'foo',
      name: 'Foo',
      order: 99,
    });
    expect(mockPost).toHaveBeenCalledWith('/news-categories/', {
      slug: 'foo',
      name: 'Foo',
      order: 99,
    });
    expect(result).toEqual(created);
  });

  it('updateNewsCategory: PATCH /news-categories/<slug>/ с partial body', async () => {
    mockPatch.mockResolvedValue({
      data: { slug: 'business', name: 'Бизнес', order: 10, is_active: true },
    });
    await newsCategoriesService.updateNewsCategory('business', { name: 'Бизнес' });
    expect(mockPatch).toHaveBeenCalledWith('/news-categories/business/', {
      name: 'Бизнес',
    });
  });

  it('deleteNewsCategory: DELETE /news-categories/<slug>/', async () => {
    mockDelete.mockResolvedValue({});
    await newsCategoriesService.deleteNewsCategory('other');
    expect(mockDelete).toHaveBeenCalledWith('/news-categories/other/');
  });

  it('restoreNewsCategory: PATCH с is_active=true', async () => {
    mockPatch.mockResolvedValue({
      data: { slug: 'other', name: 'Прочее', order: 80, is_active: true },
    });
    await newsCategoriesService.restoreNewsCategory('other');
    expect(mockPatch).toHaveBeenCalledWith('/news-categories/other/', {
      is_active: true,
    });
  });

  it('bulkUpdateNewsCategory: PATCH /news/bulk-update-category/ с {ids, category_slug}', async () => {
    mockPatch.mockResolvedValue({ data: { updated: 3 } });
    const result = await newsCategoriesService.bulkUpdateNewsCategory(
      [1, 2, 3],
      'guide',
    );
    expect(mockPatch).toHaveBeenCalledWith('/news/bulk-update-category/', {
      ids: [1, 2, 3],
      category_slug: 'guide',
    });
    expect(result.updated).toBe(3);
  });
});
