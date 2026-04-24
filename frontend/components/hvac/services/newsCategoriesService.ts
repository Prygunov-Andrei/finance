import apiClient from './apiClient';
import type { HvacNewsCategoryItem } from '@/lib/api/types/hvac';

export type NewsCategoryItem = HvacNewsCategoryItem;

export interface NewsCategoryCreate {
  slug: string;
  name: string;
  order?: number;
  is_active?: boolean;
}

export interface NewsCategoryUpdate {
  name?: string;
  order?: number;
  is_active?: boolean;
}

export interface BulkUpdateCategoryResponse {
  updated: number;
}

const newsCategoriesService = {
  getNewsCategories: async (): Promise<NewsCategoryItem[]> => {
    const response = await apiClient.get('/news-categories/');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  createNewsCategory: async (data: NewsCategoryCreate): Promise<NewsCategoryItem> => {
    const response = await apiClient.post('/news-categories/', data);
    return response.data;
  },

  updateNewsCategory: async (
    slug: string,
    data: NewsCategoryUpdate,
  ): Promise<NewsCategoryItem> => {
    const response = await apiClient.patch(`/news-categories/${slug}/`, data);
    return response.data;
  },

  deleteNewsCategory: async (slug: string): Promise<void> => {
    await apiClient.delete(`/news-categories/${slug}/`);
  },

  restoreNewsCategory: async (slug: string): Promise<NewsCategoryItem> => {
    const response = await apiClient.patch(`/news-categories/${slug}/`, {
      is_active: true,
    });
    return response.data;
  },

  bulkUpdateNewsCategory: async (
    ids: number[],
    categorySlug: string,
  ): Promise<BulkUpdateCategoryResponse> => {
    const response = await apiClient.patch('/news/bulk-update-category/', {
      ids,
      category_slug: categorySlug,
    });
    return response.data;
  },
};

export default newsCategoriesService;
