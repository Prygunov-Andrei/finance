/** Вложенный контрагент в профиле исполнителя */
export interface ExecutorCounterparty {
  id: number;
  name: string;
  short_name: string;
  inn: string;
  legal_form: string;
  type: string;
  vendor_subtype: string | null;
}

/** Профиль исполнителя (список) */
export interface ExecutorProfileListItem {
  id: number;
  counterparty: number;
  counterparty_name: string;
  counterparty_short_name: string;
  source: 'manual' | 'avito' | 'telegram' | 'referral';
  phone: string;
  email: string;
  contact_person: string;
  city: string;
  region: string;
  specializations: string[];
  hourly_rate: string | null;
  daily_rate: string | null;
  team_size: number | null;
  rating: string;
  is_potential: boolean;
  is_verified: boolean;
  is_available: boolean;
  avito_user_id: string;
  contact_history_count: number;
  created_at: string;
}

/** Профиль исполнителя (детальный) */
export interface ExecutorProfileDetail extends Omit<ExecutorProfileListItem, 'counterparty' | 'counterparty_name' | 'counterparty_short_name'> {
  counterparty: ExecutorCounterparty;
  telegram_username: string;
  whatsapp: string;
  address: string;
  work_radius_km: number | null;
  experience_years: number | null;
  has_legal_entity: boolean;
  avito_profile_url: string;
  notes: string;
  work_sections: number[];
  updated_at: string;
}

/** Данные для создания профиля исполнителя */
export interface CreateExecutorProfileData {
  name: string;
  short_name?: string;
  inn: string;
  legal_form?: string;
  source?: string;
  phone?: string;
  email?: string;
  telegram_username?: string;
  whatsapp?: string;
  contact_person?: string;
  specializations?: string[];
  city?: string;
  region?: string;
  address?: string;
  work_radius_km?: number | null;
  hourly_rate?: string | null;
  daily_rate?: string | null;
  team_size?: number | null;
  rating?: string;
  experience_years?: number | null;
  has_legal_entity?: boolean;
  is_potential?: boolean;
  is_available?: boolean;
  notes?: string;
}

/** Данные для обновления профиля */
export type UpdateExecutorProfileData = Partial<Omit<CreateExecutorProfileData, 'name' | 'inn' | 'legal_form'>>;

/** Фильтры для списка исполнителей */
export interface ExecutorProfileFilters {
  city?: string;
  specializations?: string;
  is_potential?: string;
  is_available?: string;
  source?: string;
  search?: string;
}

/** Настройки Avito (singleton) */
export interface AvitoConfig {
  id: number;
  client_id: string;
  client_secret: string;
  token_expires_at: string | null;
  user_id: string;
  auto_publish_mp: boolean;
  listing_category_id: number | null;
  listing_template: string;
  search_enabled: boolean;
  search_regions: number[];
  is_active: boolean;
  is_token_valid: boolean;
  created_at: string;
  updated_at: string;
}

/** Ключевое слово для поиска на Avito */
export interface AvitoSearchKeyword {
  id: number;
  keyword: string;
  is_active: boolean;
  last_scan_at: string | null;
  results_count: number;
  created_at: string;
}

/** Объявление Avito (найденное) */
export interface AvitoListingItem {
  id: number;
  avito_item_id: string;
  url: string;
  title: string;
  price: string | null;
  city: string;
  category: string;
  seller_name: string;
  seller_avito_id: string;
  status: 'new' | 'reviewed' | 'contacted' | 'converted' | 'rejected';
  keyword: number | null;
  keyword_text: string;
  executor_profile: number | null;
  executor_name: string;
  discovered_at: string;
}

/** Объявление Avito (детальное) */
export interface AvitoListingDetail extends AvitoListingItem {
  description: string;
  published_at: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Данные для ручного добавления объявления */
export interface CreateAvitoListingData {
  avito_item_id: string;
  url: string;
  title: string;
  description?: string;
  price?: string | null;
  city?: string;
  category?: string;
  seller_name?: string;
  seller_avito_id?: string;
  keyword?: number | null;
  published_at?: string | null;
}

/** Наше опубликованное объявление на Avito */
export interface AvitoPublishedListingItem {
  id: number;
  mounting_proposal: number;
  mp_number: string;
  mp_name: string;
  object_name: string;
  avito_item_id: string;
  avito_url: string;
  status: 'pending' | 'published' | 'expired' | 'deactivated' | 'error';
  listing_title: string;
  listing_text: string;
  error_message: string;
  views_count: number;
  contacts_count: number;
  favorites_count: number;
  last_stats_sync: string | null;
  published_at: string | null;
  created_at: string;
}

/** Запись контакта */
export interface ContactHistoryItem {
  id: number;
  executor_profile: number;
  executor_name: string;
  channel: 'email' | 'sms' | 'phone' | 'avito_msg' | 'telegram' | 'whatsapp' | 'meeting';
  direction: 'in' | 'out';
  subject: string;
  body: string;
  avito_listing: number | null;
  campaign: number | null;
  created_by: number | null;
  created_by_name: string;
  created_at: string;
}

/** Данные для создания контакта */
export interface CreateContactData {
  channel: string;
  direction: string;
  subject?: string;
  body?: string;
  avito_listing?: number | null;
}

/** Рассылка (список) */
export interface CampaignListItem {
  id: number;
  name: string;
  campaign_type: 'email' | 'sms';
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  error_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

/** Рассылка (детальная) */
export interface CampaignDetail extends CampaignListItem {
  subject: string;
  body: string;
  attachment_mp: number | null;
  attachment_estimate: number | null;
  mp_name: string;
  estimate_name: string;
  filter_specializations: string[];
  filter_cities: string[];
  filter_is_potential: boolean | null;
  filter_is_available: boolean | null;
  updated_at: string;
}

/** Данные для создания рассылки */
export interface CreateCampaignData {
  name: string;
  campaign_type: 'email' | 'sms';
  subject?: string;
  body: string;
  attachment_mp?: number | null;
  attachment_estimate?: number | null;
  filter_specializations?: string[];
  filter_cities?: string[];
  filter_is_potential?: boolean | null;
  filter_is_available?: boolean | null;
  scheduled_at?: string | null;
}

/** Получатель рассылки */
export interface CampaignRecipientItem {
  id: number;
  campaign: number;
  executor_profile: number;
  executor_name: string;
  executor_phone: string;
  executor_email: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'unsubscribed';
  error_message: string;
  sent_at: string | null;
  created_at: string;
}

/** Предпросмотр рассылки */
export interface CampaignPreview {
  total_recipients: number;
  recipients_preview: Array<{
    id: number;
    counterparty__name: string;
    phone: string;
    email: string;
    city: string;
  }>;
  estimated_sms_cost: string | null;
}

/** Настройки Unisender (singleton) */
export interface UnisenderConfig {
  id: number;
  api_key: string;
  sender_email: string;
  sender_name: string;
  sms_sender: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Лог маркетинга */
export interface MarketingSyncLogItem {
  id: number;
  sync_type: 'avito_scan' | 'avito_publish' | 'avito_stats' | 'email_campaign' | 'sms_campaign';
  status: 'started' | 'success' | 'partial' | 'failed';
  items_processed: number;
  items_created: number;
  items_updated: number;
  items_errors: number;
  error_details: unknown[];
  duration_seconds: number | null;
  created_at: string;
}

/** Дашборд маркетинга */
export interface MarketingDashboard {
  executors: {
    total: number;
    potential: number;
    available: number;
  };
  avito: {
    published_active: number;
    total_views: number;
    total_contacts: number;
    incoming_new: number;
  };
  campaigns: {
    total: number;
    sent_this_month: number;
    total_recipients_sent: number;
  };
  recent_contacts: ContactHistoryItem[];
}
