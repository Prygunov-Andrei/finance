import apiClient from './apiClient';
import type { Provider } from './searchConfigService';

// ============================================================================
// Типы для критериев рейтинга
// ============================================================================

export interface RatingCriterion {
  id: number;
  star_rating: number;
  name: string;
  description: string;
  keywords: string[];
  is_active: boolean;
  parent: number | null;
  override_star_rating: number | null;
  order: number;
  children?: RatingCriterion[];
  created_at: string;
  updated_at: string;
}

export interface RatingCriterionCreate {
  star_rating: number;
  name: string;
  description: string;
  keywords?: string[];
  is_active?: boolean;
  parent?: number | null;
  override_star_rating?: number | null;
  order?: number;
}

// ============================================================================
// Типы для конфигурации рейтинга
// ============================================================================

export interface RatingConfiguration {
  id: number;
  name: string;
  is_active: boolean;
  primary_provider: Provider;
  fallback_chain: string[];
  temperature: number;
  timeout: number;
  grok_model: string;
  anthropic_model: string;
  gemini_model: string;
  openai_model: string;
  batch_size: number;
  duplicate_similarity_threshold: number;
  grok_input_price: number;
  grok_output_price: number;
  anthropic_input_price: number;
  anthropic_output_price: number;
  gemini_input_price: number;
  gemini_output_price: number;
  openai_input_price: number;
  openai_output_price: number;
  prompts: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface RatingConfigListItem {
  id: number;
  name: string;
  is_active: boolean;
  primary_provider: Provider;
  batch_size: number;
  temperature: number;
  updated_at: string;
}

// ============================================================================
// Типы для запусков рейтинга
// ============================================================================

export interface RatingRun {
  id: number;
  discovery_run: number | null;
  config_snapshot: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  duration_display: string;
  total_news_rated: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  provider_stats: Record<string, unknown>;
  rating_distribution: Record<string, number>;
  duplicates_found: number;
  status: 'running' | 'completed' | 'error';
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface RatingRunListItem {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  duration_display: string;
  total_news_rated: number;
  estimated_cost_usd: number;
  duplicates_found: number;
  status: string;
  created_at: string;
}

export interface RatingStats {
  total_runs: number;
  total_news_rated: number;
  total_cost_usd: number;
  total_requests: number;
}

export interface RatingProgress {
  id?: number;
  status: string;
  current_phase: string;
  processed_count: number;
  total_to_rate: number;
  total_news_rated: number;
  estimated_cost_usd: number;
  started_at: string | null;
  finished_at: string | null;
  rating_distribution: Record<string, number>;
  error_message: string;
  message?: string;
}

// ============================================================================
// Сервис
// ============================================================================

const ratingService = {
  // --- Критерии ---
  getCriteria: async (starRating?: number, rootOnly = true): Promise<RatingCriterion[]> => {
    const params: Record<string, string> = {};
    if (starRating !== undefined) params.star_rating = String(starRating);
    if (rootOnly) params.root_only = 'true';
    const response = await apiClient.get('/rating-criteria/', { params });
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  createCriterion: async (data: RatingCriterionCreate): Promise<RatingCriterion> => {
    const response = await apiClient.post('/rating-criteria/', data);
    return response.data;
  },

  updateCriterion: async (id: number, data: Partial<RatingCriterionCreate>): Promise<RatingCriterion> => {
    const response = await apiClient.patch(`/rating-criteria/${id}/`, data);
    return response.data;
  },

  deleteCriterion: async (id: number): Promise<void> => {
    await apiClient.delete(`/rating-criteria/${id}/`);
  },

  moveCriterion: async (id: number, newStarRating: number): Promise<RatingCriterion> => {
    const response = await apiClient.post(`/rating-criteria/${id}/move/`, { star_rating: newStarRating });
    return response.data;
  },

  reorderCriteria: async (items: { id: number; order: number }[]): Promise<void> => {
    await apiClient.post('/rating-criteria/reorder/', { items });
  },

  // --- Конфигурации ---
  getConfigurations: async (): Promise<RatingConfigListItem[]> => {
    const response = await apiClient.get('/rating-config/');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  getConfiguration: async (id: number): Promise<RatingConfiguration> => {
    const response = await apiClient.get(`/rating-config/${id}/`);
    return response.data;
  },

  getActiveConfiguration: async (): Promise<RatingConfiguration> => {
    const response = await apiClient.get('/rating-config/active/');
    return response.data;
  },

  createConfiguration: async (data: Partial<RatingConfiguration>): Promise<RatingConfiguration> => {
    const response = await apiClient.post('/rating-config/', data);
    return response.data;
  },

  updateConfiguration: async (id: number, data: Partial<RatingConfiguration>): Promise<RatingConfiguration> => {
    const response = await apiClient.patch(`/rating-config/${id}/`, data);
    return response.data;
  },

  deleteConfiguration: async (id: number): Promise<void> => {
    await apiClient.delete(`/rating-config/${id}/`);
  },

  activateConfiguration: async (id: number): Promise<void> => {
    await apiClient.post(`/rating-config/${id}/activate/`);
  },

  duplicateConfiguration: async (id: number): Promise<RatingConfiguration> => {
    const response = await apiClient.post(`/rating-config/${id}/duplicate/`);
    return response.data;
  },

  getDefaultPrompts: async (): Promise<Record<string, string>> => {
    const response = await apiClient.get('/rating-config/default-prompts/');
    return response.data;
  },

  // --- Запуски рейтинга ---
  getRatingRuns: async (): Promise<RatingRunListItem[]> => {
    const response = await apiClient.get('/rating-runs/');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  },

  getLatestRun: async (): Promise<RatingRun | null> => {
    try {
      const response = await apiClient.get('/rating-runs/latest/');
      return response.data;
    } catch {
      return null;
    }
  },

  getRatingStats: async (days?: number): Promise<RatingStats> => {
    const params = days ? { days: String(days) } : {};
    const response = await apiClient.get('/rating-runs/stats/', { params });
    return response.data;
  },

  // --- Действия ---
  rateAllUnrated: async (configId?: number): Promise<{ status: string; message: string }> => {
    const data = configId ? { config_id: configId } : {};
    const response = await apiClient.post('/news/rate-all-unrated/', data);
    return response.data;
  },

  rateBatch: async (newsIds: number[], configId?: number): Promise<{ status: string; message: string }> => {
    const data: Record<string, unknown> = { news_ids: newsIds };
    if (configId) data.config_id = configId;
    const response = await apiClient.post('/news/rate-batch/', data);
    return response.data;
  },

  setRating: async (newsId: number, starRating: number): Promise<unknown> => {
    const response = await apiClient.post(`/news/${newsId}/set-rating/`, { star_rating: starRating });
    return response.data;
  },

  getRatingProgress: async (): Promise<RatingProgress> => {
    const response = await apiClient.get('/news/rating-progress/');
    return response.data;
  },

  analyzePublished: async (configId?: number): Promise<{ status: string; message: string }> => {
    const data = configId ? { config_id: configId } : {};
    const response = await apiClient.post('/news/analyze-published/', data);
    return response.data;
  },
};

export default ratingService;
