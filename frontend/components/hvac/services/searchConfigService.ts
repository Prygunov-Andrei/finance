import apiClient from './apiClient';

// Типы провайдеров
export type Provider = 'grok' | 'anthropic' | 'gemini' | 'openai';
export type SearchContextSize = 'low' | 'medium' | 'high';

// Структура промптов
export interface SearchPromptLanguage {
  main: string;
  json_format: string;
}

export interface PromptsConfig {
  system_prompts?: {
    grok?: string;
    openai?: string;
    anthropic?: string;
    gemini?: string;
  };
  search_prompts?: {
    ru?: SearchPromptLanguage;
    en?: SearchPromptLanguage;
    es?: SearchPromptLanguage;
    de?: SearchPromptLanguage;
    pt?: SearchPromptLanguage;
  };
  manufacturer_prompts?: {
    with_websites?: string;
    without_websites?: string;
  };
}

// Результат проверки провайдера
export interface ProviderCheckResult {
  available: boolean;
  balance: number | null;
  error: string | null;
}

// Результат проверки всех провайдеров
export type ProviderCheckResults = {
  [provider in Provider]?: ProviderCheckResult;
};

// Интерфейс конфигурации поиска
export interface SearchConfiguration {
  id: number;
  name: string;
  is_active: boolean;
  
  // Провайдеры
  primary_provider: Provider;
  fallback_chain: string[];
  
  // Параметры LLM
  temperature: number;
  timeout: number;
  max_news_per_resource: number;
  delay_between_requests: number;
  
  // Grok Web Search параметры
  max_search_results: number;
  search_context_size: SearchContextSize;
  
  // Модели LLM
  grok_model: string;
  anthropic_model: string;
  gemini_model: string;
  openai_model: string;
  
  // Тарифы (USD за 1M токенов)
  grok_input_price: number;
  grok_output_price: number;
  anthropic_input_price: number;
  anthropic_output_price: number;
  gemini_input_price: number;
  gemini_output_price: number;
  openai_input_price: number;
  openai_output_price: number;
  
  // Промпты
  prompts: PromptsConfig;
  
  created_at: string;
  updated_at: string;
}

// Краткий формат для списка
export interface SearchConfigurationListItem {
  id: number;
  name: string;
  is_active: boolean;
  primary_provider: string;
  max_search_results: number;
  temperature: number;
  updated_at: string;
}

// Данные для создания/обновления
export interface SearchConfigurationCreateData {
  name: string;
  primary_provider?: Provider;
  fallback_chain?: string[];
  temperature?: number;
  timeout?: number;
  max_news_per_resource?: number;
  delay_between_requests?: number;
  max_search_results?: number;
  search_context_size?: SearchContextSize;
  grok_model?: string;
  anthropic_model?: string;
  gemini_model?: string;
  openai_model?: string;
  grok_input_price?: number;
  grok_output_price?: number;
  anthropic_input_price?: number;
  anthropic_output_price?: number;
  gemini_input_price?: number;
  gemini_output_price?: number;
  openai_input_price?: number;
  openai_output_price?: number;
  prompts?: PromptsConfig;
}

// Discovery Run - запуск поиска
export interface NewsDiscoveryRun {
  id: number;
  last_search_date: string;
  config_snapshot: SearchConfiguration | null;
  
  started_at: string | null;
  finished_at: string | null;
  duration_display: string;
  
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: string;
  
  provider_stats: {
    [provider: string]: {
      requests: number;
      input_tokens: number;
      output_tokens: number;
      cost: number;
      errors: number;
    }
  };
  
  news_found: number;
  news_duplicates: number;
  resources_processed: number;
  resources_failed: number;
  
  efficiency: number;
  api_calls_count: number;
  
  created_at: string;
  updated_at: string;
}

// Краткий формат для списка
export interface NewsDiscoveryRunListItem {
  id: number;
  last_search_date: string;
  config_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_display: string;
  total_requests: number;
  estimated_cost_usd: string;
  news_found: number;
  resources_processed: number;
  resources_failed: number;
  efficiency: number;
  created_at: string;
}

// Статистика
export interface DiscoveryStats {
  total_runs: number;
  total_news_found: number;
  total_cost_usd: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_efficiency: number;
  avg_cost_per_run: string;
  provider_breakdown: {
    [provider: string]: {
      requests: number;
      input_tokens: number;
      output_tokens: number;
      cost: number;
      errors: number;
    }
  };
}

// API Call - отдельный вызов
export interface DiscoveryAPICall {
  id: number;
  discovery_run: number;
  resource: number | null;
  resource_name: string | null;
  manufacturer: number | null;
  manufacturer_name: string | null;
  
  provider: string;
  model: string;
  
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  
  duration_ms: number;
  success: boolean;
  error_message: string;
  
  news_extracted: number;
  
  created_at: string;
}

// Пагинация
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const searchConfigService = {
  // === Search Configuration ===
  
  // Получить список всех конфигураций
  getConfigurations: async (): Promise<SearchConfigurationListItem[]> => {
    const response = await apiClient.get('/search-config/');
    return response.data;
  },

  // Получить конкретную конфигурацию
  getConfiguration: async (id: number): Promise<SearchConfiguration> => {
    const response = await apiClient.get(`/search-config/${id}/`);
    return response.data;
  },

  // Получить активную конфигурацию
  getActiveConfiguration: async (): Promise<SearchConfiguration> => {
    const response = await apiClient.get('/search-config/active/');
    return response.data;
  },

  // Создать конфигурацию
  createConfiguration: async (data: SearchConfigurationCreateData): Promise<SearchConfiguration> => {
    const response = await apiClient.post('/search-config/', data);
    return response.data;
  },

  // Обновить конфигурацию
  updateConfiguration: async (id: number, data: Partial<SearchConfigurationCreateData>): Promise<SearchConfiguration> => {
    const response = await apiClient.patch(`/search-config/${id}/`, data);
    return response.data;
  },

  // Удалить конфигурацию
  deleteConfiguration: async (id: number): Promise<void> => {
    await apiClient.delete(`/search-config/${id}/`);
  },

  // Активировать конфигурацию
  activateConfiguration: async (id: number): Promise<SearchConfiguration> => {
    const response = await apiClient.post(`/search-config/${id}/activate/`);
    return response.data;
  },

  // Дублировать конфигурацию
  duplicateConfiguration: async (id: number): Promise<SearchConfiguration> => {
    const response = await apiClient.post(`/search-config/${id}/duplicate/`);
    return response.data;
  },

  // Получить дефолтные промпты
  getDefaultPrompts: async (): Promise<PromptsConfig> => {
    const response = await apiClient.get('/search-config/default-prompts/');
    return response.data;
  },

  // Проверить провайдеров (доступность и баланс)
  checkProviders: async (providers?: Provider[]): Promise<ProviderCheckResults> => {
    const response = await apiClient.post('/search-config/check-providers/', {
      providers: providers || ['grok', 'anthropic', 'openai', 'gemini']
    });
    return response.data;
  },

  // === Discovery Runs ===
  
  // Получить список запусков
  getDiscoveryRuns: async (page: number = 1): Promise<PaginatedResponse<NewsDiscoveryRunListItem>> => {
    const response = await apiClient.get(`/discovery-runs/?page=${page}`);
    return response.data;
  },

  // Получить детали запуска
  getDiscoveryRun: async (id: number): Promise<NewsDiscoveryRun> => {
    const response = await apiClient.get(`/discovery-runs/${id}/`);
    return response.data;
  },

  // Получить последний запуск
  getLatestDiscoveryRun: async (): Promise<NewsDiscoveryRun> => {
    const response = await apiClient.get('/discovery-runs/latest/');
    return response.data;
  },

  // Получить статистику
  getDiscoveryStats: async (days?: number): Promise<DiscoveryStats> => {
    const url = days ? `/discovery-runs/stats/?days=${days}` : '/discovery-runs/stats/';
    const response = await apiClient.get(url);
    return response.data;
  },

  // Получить API вызовы для запуска
  getDiscoveryRunAPICalls: async (runId: number): Promise<DiscoveryAPICall[]> => {
    const response = await apiClient.get(`/discovery-runs/${runId}/api_calls/`);
    return response.data;
  },

  // === Discovery API Calls ===
  
  // Получить список API вызовов с фильтрами
  getAPICallsFiltered: async (filters: {
    provider?: string;
    success?: boolean;
    run_id?: number;
    page?: number;
  }): Promise<PaginatedResponse<DiscoveryAPICall>> => {
    const params = new URLSearchParams();
    
    if (filters.provider) params.append('provider', filters.provider);
    if (filters.success !== undefined) params.append('success', filters.success.toString());
    if (filters.run_id) params.append('run_id', filters.run_id.toString());
    if (filters.page) params.append('page', filters.page.toString());
    
    const url = params.toString() ? `/discovery-calls/?${params}` : '/discovery-calls/';
    const response = await apiClient.get(url);
    return response.data;
  },

  // Получить детали API вызова
  getAPICall: async (id: number): Promise<DiscoveryAPICall> => {
    const response = await apiClient.get(`/discovery-calls/${id}/`);
    return response.data;
  },
};

export default searchConfigService;
