import apiClient from './apiClient';

export interface NewsMedia {
  id: number;
  file: string;
  media_type: 'image' | 'video';
}

export interface NewsAuthor {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface News {
  id: number;
  title: string;
  title_ru?: string;
  title_en?: string;
  title_de?: string;
  title_pt?: string;
  body: string;
  body_ru?: string;
  body_en?: string;
  body_de?: string;
  body_pt?: string;
  pub_date: string;
  status?: 'draft' | 'scheduled' | 'published';
  source_language?: 'ru' | 'en' | 'de' | 'pt';
  source_url?: string; // URL оригинального источника новости (для автоматически созданных новостей)
  is_no_news_found?: boolean; // Признак записи "новостей не найдено"
  created_at?: string;
  updated_at?: string;
  author?: NewsAuthor;
  media?: NewsMedia[];
}

export interface NewsCreateData {
  title: string;
  body: string;
  pub_date: string;
  status: 'draft' | 'scheduled' | 'published';
  source_language: 'ru' | 'en' | 'de' | 'pt';
  auto_translate?: boolean;
  source_url?: string;
}

export interface NewsUpdateData {
  title?: string;
  body?: string;
  pub_date?: string;
  status?: 'draft' | 'scheduled' | 'published';
  source_language?: 'ru' | 'en' | 'de' | 'pt';
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

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const newsService = {
  // Получить список новостей
  getNews: async (language?: string, page?: number): Promise<PaginatedResponse<News>> => {
    try {
      const config = language ? {
        headers: { 'Accept-Language': language }
      } : {};
      const params = page ? { page } : {};
      const response = await apiClient.get('/news/', { ...config, params });
      return response.data;
    } catch (error: any) {
      console.error('newsService.getNews error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        language,
        page,
      });
      
      // Если ошибка 500, попробуем без языкового заголовка
      if (error.response?.status === 500 && language) {
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

  // Получить черновики (только для админов)
  getDrafts: async (): Promise<News[]> => {
    const response = await apiClient.get('/news/drafts/');
    return response.data;
  },

  // Получить черновики с фильтрами (только для админов)
  getDraftsFiltered: async (params?: {
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
    status?: string;
    is_no_news_found?: boolean;
  }): Promise<News[]> => {
    const response = await apiClient.get('/news/drafts/', { params });
    return response.data;
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