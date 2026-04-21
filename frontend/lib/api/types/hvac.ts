import type { PaginatedResponse } from './common';

export type HvacNewsStatus = 'draft' | 'scheduled' | 'published';
export type HvacSourceLanguage = 'ru' | 'en' | 'de' | 'pt';
export type HvacTranslationStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface HvacNewsMedia {
  id: number;
  file: string;
  media_type: 'image' | 'video' | string;
  caption?: string;
}

export interface HvacNewsAuthor {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface HvacManufacturerRef {
  id: number;
  name: string;
}

export interface HvacNewsEditorialAuthor {
  id: number;
  name: string;
  role?: string;
  avatar_url?: string;
}

export interface HvacNewsMentionedAcModel {
  id: number;
  slug: string;
  brand: string;
  brand_logo?: string;
  inner_unit: string;
  total_index?: number;
  price?: string | null;
}

export interface HvacNews {
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
  status?: HvacNewsStatus;
  source_url?: string;
  source_language?: HvacSourceLanguage;
  created_at?: string;
  updated_at?: string;
  author?: HvacNewsAuthor;
  media?: HvacNewsMedia[];
  manufacturer?: HvacManufacturerRef | null;
  is_no_news_found?: boolean;
  // AI-рейтинг
  star_rating?: number | null;
  rating_explanation?: string;
  matched_criteria?: number[];
  duplicate_group?: number | null;
  // Асинхронный перевод
  translation_status?: HvacTranslationStatus | null;
  translation_error?: string | null;
  // M5 (редизайн ленты, Ф7A). Могут приходить пустыми до мержа M5 —
  // фронт строит graceful fallback.
  category?: string;
  category_display?: string;
  lede?: string;
  reading_time_minutes?: number | null;
  editorial_author?: HvacNewsEditorialAuthor | null;
  mentioned_ac_models?: HvacNewsMentionedAcModel[];
}

export interface HvacManufacturer {
  id: number;
  name: string;
  name_ru?: string;
  name_en?: string;
  website?: string;
  logo?: string;
  description?: string;
  description_ru?: string;
  description_en?: string;
  country?: string;
  region?: string;
  news_count: number;
  brands_count: number;
}

export interface HvacBrand {
  id: number;
  name: string;
  name_ru?: string;
  name_en?: string;
  manufacturer: HvacManufacturerRef;
  description?: string;
}

export interface HvacResource {
  id: number;
  name: string;
  url: string;
  description?: string;
  is_active?: boolean;
}

export type HvacPaginatedResponse<T> = PaginatedResponse<T>;
