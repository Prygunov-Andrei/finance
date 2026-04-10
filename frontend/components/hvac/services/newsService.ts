import axios from 'axios';
import apiClient from './apiClient';
import type {
  HvacNews as News,
  HvacNewsAuthor as NewsAuthor,
  HvacNewsMedia as NewsMedia,
  HvacPaginatedResponse as PaginatedResponse,
  HvacSourceLanguage,
} from '@/lib/api/types/hvac';

export type { News, NewsAuthor, NewsMedia, PaginatedResponse };

export interface NewsCreateData {
  title: string;
  body: string;
  pub_date: string;
  status: 'draft' | 'scheduled' | 'published';
  source_language: HvacSourceLanguage;
  auto_translate?: boolean;
  source_url?: string;
}

export interface NewsUpdateData {
  title?: string;
  body?: string;
  pub_date?: string;
  status?: 'draft' | 'scheduled' | 'published';
  source_language?: HvacSourceLanguage;
  auto_translate?: boolean;
  source_url?: string;
}

export interface MediaUpload {
  id: number;
  file: string;
  url: string;
  media_type: 'image' | 'video';
  file_size: number;
  uploaded_by: number;
  created_at: string;
}

const newsService = {
  // Получить список новостей
  getNews: async (language?: string, page?: number, starRating?: number[]): Promise<PaginatedResponse<News>> => {
    try {
      const config = language ? {
        headers: { 'Accept-Language': language }
      } : {};
      const params: Record<string, string | number> = {};
      if (page) params.page = page;
      if (starRating && starRating.length > 0) params.star_rating = starRating.join(',');
      const response = await apiClient.get('/news/', { ...config, params });
      return response.data;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const statusText = axios.isAxiosError(error) ? error.response?.statusText : undefined;
      const data = axios.isAxiosError(error) ? error.response?.data : undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.error('newsService.getNews error:', {
        status,
        statusText,
        data,
        message,
        language,
        page,
      });

      // Если ошибка 500, попробуем без языкового заголовка
      if (status === 500 && language) {
        console.warn('Retrying without Accept-Language header...');
        try {
          const params = page ? { page } : {};
          const response = await apiClient.get('/news/', { params });
          return response.data;
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
          throw error; // Бросаем оригинальную ошибку
        }
      }
      
      throw error;
    }
  },

  // Получить детальную информацию о новости
  getNewsById: async (id: number, language?: string): Promise<News> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get(`/news/${id}/`, config);
    return response.data;
  },

  // Создать новость (только для админов)
  // Таймаут увеличен: автоперевод через OpenAI может занять до 2 минут
  createNews: async (data: NewsCreateData): Promise<News> => {
    const response = await apiClient.post('/news/', data, { timeout: 120000 });
    return response.data;
  },

  // Обновить новость (только для админов)
  // Таймаут увеличен: автоперевод через OpenAI может занять до 2 минут
  updateNews: async (id: number, data: NewsUpdateData): Promise<News> => {
    const response = await apiClient.patch(`/news/${id}/`, data, { timeout: 120000 });
    return response.data;
  },

  // Удалить новость (только для админов)
  deleteNews: async (id: number): Promise<void> => {
    await apiClient.delete(`/news/${id}/`);
  },

  // Массовое удаление новостей (только для админов)
  bulkDeleteNews: async (ids: number[]): Promise<void> => {
    await Promise.all(ids.map(id => apiClient.delete(`/news/${id}/`)));
  },

  // Получить запланированные новости (только для админов)
  getScheduled: async (): Promise<News[]> => {
    const response = await apiClient.get('/news/scheduled/');
    return response.data;
  },

  // Получить записи "новостей не найдено" (только для админов)
  getNoNewsFound: async (): Promise<News[]> => {
    const response = await apiClient.get('/news/', {
      params: { is_no_news_found: true }
    });
    return response.data.results || response.data;
  },

  // Массовое удаление записей "новостей не найдено" (только для админов)
  bulkDeleteNoNewsFound: async (): Promise<{ deleted: number; errors: number }> => {
    // Сначала получаем все записи "не найдено"
    const response = await apiClient.get('/news/', {
      params: { is_no_news_found: true, status: 'draft' }
    });
    const records = response.data.results || response.data;
    
    let deleted = 0;
    let errors = 0;
    
    // Удаляем каждую запись
    for (const record of records) {
      try {
        await apiClient.delete(`/news/${record.id}/`);
        deleted++;
      } catch (error) {
        console.error(`Failed to delete record ${record.id}:`, error);
        errors++;
      }
    }
    
    return { deleted, errors };
  },

  // Опубликовать новость (только для админов)
  publishNews: async (id: number): Promise<News> => {
    const response = await apiClient.post(`/news/${id}/publish/`);
    return response.data;
  },

  // Загрузить медиафайл (только для админов)
  uploadMedia: async (file: File): Promise<MediaUpload> => {
    const formData = new FormData();
    formData.append('file', file);
    
    // media_type определится автоматически
    if (file.type.startsWith('image/')) {
      formData.append('media_type', 'image');
    } else if (file.type.startsWith('video/')) {
      formData.append('media_type', 'video');
    }

    const response = await apiClient.post('/media/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Получить список медиафайлов (только для админов)
  getMedia: async (): Promise<MediaUpload[]> => {
    const response = await apiClient.get('/media/');
    return response.data;
  },

  // Удалить медиафайл (только для админов)
  deleteMedia: async (id: number): Promise<void> => {
    await apiClient.delete(`/media/${id}/`);
  },
};

export default newsService;