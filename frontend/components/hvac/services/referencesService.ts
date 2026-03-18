import apiClient from './apiClient';
import axios from 'axios';
import { API_CONFIG } from '../config/api';

export interface Manufacturer {
  id: number;
  name: string;
  region?: string;
  website_1?: string;
  website_2?: string;
  website_3?: string;
  description?: string;
  description_ru?: string;
  description_en?: string;
  description_de?: string;
  description_pt?: string;
  // Статистические данные
  statistics?: ManufacturerStatistics;
}

export interface Brand {
  id: number;
  manufacturer: number;
  manufacturer_name?: string;
  name: string;
  logo?: string;
  description?: string;
  description_ru?: string;
  description_en?: string;
  description_de?: string;
  description_pt?: string;
}

export interface Resource {
  id: number;
  name: string;
  url: string;
  logo?: string;
  section?: string;
  description?: string;
  description_ru?: string;
  description_en?: string;
  description_de?: string;
  description_pt?: string;
  // Статистические данные
  statistics?: ResourceStatistics;
  is_problematic?: boolean; // Источник с error_rate >= 30%
  // Настройки поиска
  source_type?: 'auto' | 'manual' | 'hybrid';
  language?: string;
  custom_search_instructions?: string;
  internal_notes?: string;
  is_auto_searchable?: boolean;
  requires_manual_input?: boolean;
}

// Интерфейс статистики по производителю
export interface ManufacturerStatistics {
  total_news_found: number;
  total_searches: number;
  total_no_news: number;
  total_errors: number;
  success_rate: number;
  last_search_date: string | null;
  news_last_30_days: number;
  ranking_score: number;
}

// Интерфейс статистики по источнику
export interface ResourceStatistics {
  total_news_found: number;
  total_searches: number;
  total_no_news: number;
  total_errors: number;
  success_rate: number;
  error_rate: number; // Процент ошибок (total_errors / total_searches * 100)
  last_search_date: string | null;
  news_last_30_days: number;
  ranking_score: number;
}

// Интерфейс для топ-источников
export interface TopSource {
  id: number;
  name: string;
  total_news: number;
  ranking_score: number;
  news_last_30_days?: number;
}

// Интерфейс для топ-производителей
export interface TopManufacturer {
  id: number;
  name: string;
  total_news: number;
  ranking_score: number;
  news_last_30_days?: number;
}

// Интерфейс для сводной статистики
export interface StatisticsSummary {
  overview: {
    total_resources: number;
    resources_with_stats: number;
    active_resources: number;
    inactive_resources: number;
  };
  aggregated: {
    total_news_found: number;
    total_searches: number;
    total_no_news: number;
    total_errors: number;
    news_last_30_days: number;
  };
  averages: {
    success_rate: number;
    avg_news_per_search: number;
    avg_ranking_score: number;
  };
  categories: {
    high_performers: number;
    medium_performers: number;
    low_performers: number;
    problematic: number;
  };
  top_sources: {
    by_news: TopSource[];
    by_ranking: TopSource[];
    by_activity: TopSource[];
  };
}

// Интерфейс для сводной статистики производителей
export interface ManufacturerStatisticsSummary {
  overview: {
    total_manufacturers: number;
    manufacturers_with_stats: number;
    active_manufacturers: number;
    inactive_manufacturers: number;
  };
  aggregated: {
    total_news_found: number;
    total_searches: number;
    total_no_news: number;
    total_errors: number;
    news_last_30_days: number;
  };
  averages: {
    success_rate: number;
    avg_news_per_search: number;
    avg_ranking_score: number;
  };
  categories: {
    high_performers: number;
    medium_performers: number;
    low_performers: number;
    problematic: number;
  };
  top_manufacturers: {
    by_news: TopManufacturer[];
    by_ranking: TopManufacturer[];
    by_activity: TopManufacturer[];
  };
}

// Интерфейсы для автоматического поиска новостей
export interface NewsDiscoveryStatus {
  status: 'none' | 'running' | 'completed' | 'error';
  processed: number;
  total: number;
  percent: number;
  created?: number;
  errors?: number;
  total_processed?: number;
  message?: string;
}

// Интерфейс для провайдеров LLM
export interface Provider {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

export interface ProvidersResponse {
  providers: Provider[];
  default: string;
}

export interface NewsDiscoveryInfo {
  last_discovery_date: string | null;
  period_start: string | null;
  period_end: string;
  total_resources: number;
}

// Интерфейсы для автоматического поиска новостей по производителям
export interface ManufacturerNewsDiscoveryStatus {
  status: 'none' | 'running' | 'completed' | 'error';
  processed: number;
  total: number;
  percent: number;
  created?: number;
  errors?: number;
  total_processed?: number;
  message?: string;
}

export interface ManufacturerNewsDiscoveryInfo {
  last_discovery_date: string | null;
  period_start: string | null;
  period_end: string;
  total_manufacturers: number;
}

// Интерфейсы для создания/обновления
export interface ManufacturerCreateData {
  name: string;
  website_1?: string;
  website_2?: string;
  website_3?: string;
  description?: string;
  region?: string;
}

export interface BrandCreateData {
  name: string;
  manufacturer: number;
  logo?: File | null;
  description?: string;
}

export interface ResourceCreateData {
  name: string;
  url: string;
  logo?: File | null;
  description?: string;
  section?: string;
  // Настройки поиска
  source_type?: 'auto' | 'manual' | 'hybrid';
  language?: string;
  custom_search_instructions?: string;
  internal_notes?: string;
  is_auto_searchable?: boolean;
  requires_manual_input?: boolean;
}

// Интерфейс для упрощенного производителя (поиск)
export interface ManufacturerSearchResult {
  id: number;
  name: string;
  region?: string;
  website_1?: string;
}

const referencesService = {
  // Получить список производителей
  getManufacturers: async (language?: string): Promise<Manufacturer[]> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get('/references/manufacturers/', config);
    return response.data;
  },

  // Получить список брендов
  getBrands: async (language?: string): Promise<Brand[]> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get('/references/brands/', config);
    return response.data;
  },

  // Получить список ресурсов
  getResources: async (language?: string, filters?: { is_problematic?: boolean; ordering?: string }): Promise<Resource[]> => {
    const params = new URLSearchParams();
    
    // Фильтр проблемных источников
    if (filters?.is_problematic !== undefined) {
      params.append('is_problematic', filters.is_problematic.toString());
    }
    
    // Сортировка
    if (filters?.ordering) {
      params.append('ordering', filters.ordering);
    }
    
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    
    const url = params.toString() ? `/references/resources/?${params.toString()}` : '/references/resources/';
    const response = await apiClient.get(url, config);
    return response.data;
  },

  // Получить информацию о последнем поиске новостей
  getNewsDiscoveryInfo: async (): Promise<NewsDiscoveryInfo> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/newsresource/discover-news-info/`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Accept-Language': language,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      });
      
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  // Получить список доступных провайдеров LLM
  getAvailableProviders: async (): Promise<ProvidersResponse> => {
    const response = await apiClient.get('/references/resources/available_providers/');
    return response.data;
  },

  // Запустить поиск новостей для конкретного источника
  discoverNewsForResource: async (
    resourceId: number, 
    provider: string = 'auto'
  ): Promise<{ status: string; resource_id: number; resource_name: string; provider: string; message: string }> => {
    const token = localStorage.getItem('access_token');
    
    const response = await axios.post(
      `${API_CONFIG.BASE_URL}/references/resources/${resourceId}/discover_news/`,
      { provider },
      {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      }
    );
    
    return response.data;
  },

  // Запустить автоматический поиск новостей
  startNewsDiscovery: async (params?: { configId?: number; sections?: string[]; lastSearchDate?: string }): Promise<NewsDiscoveryStatus> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/newsresource/discover-news/`;
    
    // Создаем FormData для отправки параметров запуска
    const formData = new FormData();
    if (params?.configId) {
      formData.append('config_id', String(params.configId));
    }
    if (params?.lastSearchDate) {
      formData.append('last_search_date', params.lastSearchDate);
    }
    if (params?.sections && params.sections.length > 0) {
      for (const section of params.sections) {
        formData.append('sections', section);
      }
    }
    
    const response = await axios.post(url, formData, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept-Language': language,
        'X-Requested-With': 'XMLHttpRequest',
      },
      withCredentials: true,
    });
    
    return response.data;
  },

  // Получить статус автоматического поиска новостей
  getNewsDiscoveryStatus: async (): Promise<NewsDiscoveryStatus> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/newsresource/discover-news-status/`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept-Language': language,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
    
    return response.data;
  },

  // Получить сводную статистику по источникам
  getStatisticsSummary: async (): Promise<StatisticsSummary> => {
    const response = await apiClient.get('/references/resources/statistics_summary/');
    return response.data;
  },

  // Получить сводную статистику по производителям
  getManufacturerStatisticsSummary: async (): Promise<ManufacturerStatisticsSummary> => {
    const response = await apiClient.get('/references/manufacturers/statistics_summary/');
    return response.data;
  },

  // Получить информацию о последнем поиске новостей по производителям
  getManufacturerNewsDiscoveryInfo: async (): Promise<ManufacturerNewsDiscoveryInfo> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/manufacturer/discover-manufacturers-info/`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept-Language': language,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
    
    return response.data;
  },

  // Запустить автоматический поиск новостей по производителям
  startManufacturerNewsDiscovery: async (params?: { lastSearchDate?: string; configId?: number; sections?: string[] }): Promise<ManufacturerNewsDiscoveryStatus> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/manufacturer/discover-manufacturers-news/`;
    
    const formData = new FormData();
    if (params?.lastSearchDate) {
      formData.append('last_search_date', params.lastSearchDate);
    }

    const response = await axios.post(url, formData, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept-Language': language,
        'X-Requested-With': 'XMLHttpRequest',
      },
      withCredentials: true,
    });
    
    return response.data;
  },

  // Получить статус автоматического поиска новостей по производителям
  getManufacturerNewsDiscoveryStatus: async (): Promise<ManufacturerNewsDiscoveryStatus> => {
    const token = localStorage.getItem('access_token');
    const language = localStorage.getItem('language') || 'ru';
    
    const url = `${API_CONFIG.BASE_URL.replace('/api/hvac', '')}/hvac-admin/references/manufacturer/discover-manufacturers-status/`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept-Language': language,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
    
    return response.data;
  },

  // === CRUD для Производителей ===
  
  // Получить одного производителя
  getManufacturer: async (id: number, language?: string): Promise<Manufacturer> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get(`/references/manufacturers/${id}/`, config);
    return response.data;
  },

  // Создать производителя
  createManufacturer: async (data: ManufacturerCreateData): Promise<Manufacturer> => {
    const response = await apiClient.post('/references/manufacturers/', data);
    return response.data;
  },

  // Обновить производителя
  updateManufacturer: async (id: number, data: Partial<ManufacturerCreateData>): Promise<Manufacturer> => {
    const response = await apiClient.patch(`/references/manufacturers/${id}/`, data);
    return response.data;
  },

  // Удалить производителя
  deleteManufacturer: async (id: number): Promise<void> => {
    await apiClient.delete(`/references/manufacturers/${id}/`);
  },

  // Поиск брендов для производителя
  searchBrands: async (search: string, manufacturerId?: number, limit: number = 20): Promise<Brand[]> => {
    const params = new URLSearchParams({ search, limit: limit.toString() });
    if (manufacturerId) {
      params.append('manufacturer_id', manufacturerId.toString());
    }
    const response = await apiClient.get(`/references/manufacturers/search_brands/?${params.toString()}`);
    return response.data;
  },

  // === CRUD для Брендов ===
  
  // Получить один бренд
  getBrand: async (id: number, language?: string): Promise<Brand> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get(`/references/brands/${id}/`, config);
    return response.data;
  },

  // Создать бренд
  createBrand: async (data: BrandCreateData): Promise<Brand> => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('manufacturer', data.manufacturer.toString());
    if (data.description) {
      formData.append('description', data.description);
    }
    if (data.logo) {
      formData.append('logo', data.logo);
    }
    
    const response = await apiClient.post('/references/brands/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Обновить бренд
  updateBrand: async (id: number, data: Partial<BrandCreateData>): Promise<Brand> => {
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.manufacturer) formData.append('manufacturer', data.manufacturer.toString());
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.logo) formData.append('logo', data.logo);
    
    const response = await apiClient.patch(`/references/brands/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Удалить бренд
  deleteBrand: async (id: number): Promise<void> => {
    await apiClient.delete(`/references/brands/${id}/`);
  },

  // Поиск производителей для бренда
  searchManufacturers: async (search: string, limit: number = 20): Promise<ManufacturerSearchResult[]> => {
    const params = new URLSearchParams({ search, limit: limit.toString() });
    const response = await apiClient.get(`/references/brands/search_manufacturers/?${params.toString()}`);
    return response.data;
  },

  // === CRUD для Источников ===
  
  // Получить один источник
  getResource: async (id: number, language?: string): Promise<Resource> => {
    const config = language ? {
      headers: { 'Accept-Language': language }
    } : {};
    const response = await apiClient.get(`/references/resources/${id}/`, config);
    return response.data;
  },

  // Создать источник
  createResource: async (data: ResourceCreateData): Promise<Resource> => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('url', data.url);
    if (data.description) {
      formData.append('description', data.description);
    }
    if (data.section) {
      formData.append('section', data.section);
    }
    if (data.logo) {
      formData.append('logo', data.logo);
    }
    // Настройки поиска
    if (data.source_type) {
      formData.append('source_type', data.source_type);
    }
    if (data.language) {
      formData.append('language', data.language);
    }
    if (data.custom_search_instructions) {
      formData.append('custom_search_instructions', data.custom_search_instructions);
    }
    if (data.internal_notes) {
      formData.append('internal_notes', data.internal_notes);
    }
    if (data.is_auto_searchable !== undefined) {
      formData.append('is_auto_searchable', data.is_auto_searchable.toString());
    }
    if (data.requires_manual_input !== undefined) {
      formData.append('requires_manual_input', data.requires_manual_input.toString());
    }
    
    const response = await apiClient.post('/references/resources/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Обновить источник
  updateResource: async (id: number, data: Partial<ResourceCreateData>): Promise<Resource> => {
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.url) formData.append('url', data.url);
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.section !== undefined) formData.append('section', data.section);
    if (data.logo) formData.append('logo', data.logo);
    // Настройки поиска
    if (data.source_type) {
      formData.append('source_type', data.source_type);
    }
    if (data.language) {
      formData.append('language', data.language);
    }
    if (data.custom_search_instructions) {
      formData.append('custom_search_instructions', data.custom_search_instructions);
    }
    if (data.internal_notes) {
      formData.append('internal_notes', data.internal_notes);
    }
    if (data.is_auto_searchable !== undefined) {
      formData.append('is_auto_searchable', data.is_auto_searchable.toString());
    }
    if (data.requires_manual_input !== undefined) {
      formData.append('requires_manual_input', data.requires_manual_input.toString());
    }
    
    const response = await apiClient.patch(`/references/resources/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Удалить источник
  deleteResource: async (id: number): Promise<void> => {
    await apiClient.delete(`/references/resources/${id}/`);
  },
};

export default referencesService;