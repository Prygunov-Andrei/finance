import axios from 'axios';
import apiClient from './apiClient';
import type {
  HvacNews as News,
  HvacNewsAuthor as NewsAuthor,
  HvacNewsCategory,
  HvacNewsMedia as NewsMedia,
  HvacPaginatedResponse as PaginatedResponse,
  HvacSourceLanguage,
} from '@/lib/api/types/hvac';
import type { RatingModelListItem } from '@/lib/api/types/rating';

export type { News, NewsAuthor, NewsMedia, PaginatedResponse };

/**
 * Shape автора-«редактора» для публичной подписи новости (M5).
 * Соответствует NewsAuthorLiteSerializer из backend/news/serializers.py.
 */
export interface EditorialAuthor {
  id: number;
  name: string;
  role: string;
  avatar_url: string;
}

export interface NewsCreateData {
  title: string;
  body: string;
  pub_date: string;
  status: 'draft' | 'scheduled' | 'published';
  source_language: HvacSourceLanguage;
  auto_translate?: boolean;
  source_url?: string;
  // M5 — публичные editorial-поля (опциональны, backend имеет defaults):
  category?: HvacNewsCategory;
  lede?: string;
  editorial_author?: number | null;
  mentioned_ac_models?: number[];
}

export interface NewsUpdateData {
  title?: string;
  body?: string;
  pub_date?: string;
  status?: 'draft' | 'scheduled' | 'published';
  source_language?: HvacSourceLanguage;
  auto_translate?: boolean;
  source_url?: string;
  // M5 — публичные editorial-поля:
  category?: HvacNewsCategory;
  lede?: string;
  editorial_author?: number | null;
  mentioned_ac_models?: number[];
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
    // Автоперевод теперь асинхронный (Celery), но оставляем запас 30 сек на случай медленной БД
    const response = await apiClient.post('/news/', data, { timeout: 30000 });
    return response.data;
  },

  // Обновить новость (только для админов)
  updateNews: async (id: number, data: NewsUpdateData): Promise<News> => {
    const response = await apiClient.patch(`/news/${id}/`, data, { timeout: 30000 });
    return response.data;
  },

  // Перезапустить фоновый перевод (используется после failed)
  retranslate: async (id: number): Promise<News> => {
    const response = await apiClient.post(`/news/${id}/retranslate/`);
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

  /**
   * M5: список редакторов-авторов для picker'а в форме новости.
   *
   * Endpoint реализует Петя в backup-ветке (task Ф7C-backend). До мержа
   * его изменений будет вернуться 404 — вызывающая сторона должна
   * ловить исключение и рисовать graceful empty state.
   *
   * TODO(Ф7C-backend): убрать этот комментарий после мержа
   * ac-rating/backup-and-authors-api.
   */
  getEditorialAuthors: async (): Promise<EditorialAuthor[]> => {
    const response = await apiClient.get('/news-authors/');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  /**
   * M5: список AC-моделей для multi-select'а «Упомянутые модели».
   *
   * Используем публичный endpoint `/api/public/v1/rating/models/` — он
   * возвращает plain array ~27 моделей, фильтрация client-side.
   * Идёт напрямую через fetch (минуя apiClient с hvac-admin префиксом).
   */
  getACModelsForSelector: async (): Promise<RatingModelListItem[]> => {
    const base =
      typeof window !== 'undefined' ? window.location.origin : '';
    const response = await fetch(`${base}/api/public/v1/rating/models/`);
    if (!response.ok) {
      throw new Error(`Rating API ${response.status}`);
    }
    return response.json() as Promise<RatingModelListItem[]>;
  },
};

export default newsService;