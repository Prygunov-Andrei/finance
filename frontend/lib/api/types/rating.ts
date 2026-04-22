// =========================================================================
// AC Rating (public) — types for /api/public/v1/rating/*
// Shape aligned with backend/ac_catalog/serializers.py after M2 + M4.
// ВАЖНО: в list-эндпоинте `brand` — string (название), в detail — объект.
// Легаси-решение из бекэнда, мы его не переделываем.
// Поля M4 (editorial_*, inner_unit_dimensions, supplier.price/city/rating, criterion.group)
// могут приходить пустыми ("" / null / 'other') если бекенд M4 ещё не смержен — фронт
// строит graceful fallback, ни одна секция не должна падать.
// =========================================================================

export interface RatingBrand {
  id: number;
  name: string;
  logo: string;
  /** Dark-theme optimized logo (white-on-transparent for mono brands).
   *  Может быть пустой строкой для цветных логотипов — тогда фронт
   *  использует CSS invert-fallback. До мержа backend dark-logos PR
   *  поле может отсутствовать в ответе API; код должен быть устойчив. */
  logo_dark?: string;
}

export interface RatingRegion {
  region_code: string;
  region_display: string;
}

export interface RatingParameterScore {
  criterion_code: string;
  criterion_name: string;
  unit: string;
  raw_value: string;
  normalized_score: number;
  weighted_score: number;
  above_reference: boolean;
}

export interface RatingRawValue {
  criterion_code: string;
  criterion_name: string;
  raw_value: string;
  numeric_value: number | null;
  source: string;
  source_url: string;
  verification_status: string;
  verification_display: string;
}

export interface RatingModelPhoto {
  id: number;
  image: string;
  alt: string;
}

export type RatingSupplierAvailability =
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  | 'unknown';

export interface RatingModelSupplier {
  id: number;
  name: string;
  url: string;
  order: number;
  price: string | null;
  city: string;
  rating: string | null;
  availability: RatingSupplierAvailability;
  availability_display: string;
  note: string;
}

export interface RatingModelListItem {
  id: number;
  slug: string;
  brand: string;
  brand_logo: string;
  /** См. {@link RatingBrand.logo_dark}. Опционально — бекэнд может не
   *  отдавать поле до мержа dark-logos PR. */
  brand_logo_dark?: string;
  inner_unit: string;
  series: string;
  nominal_capacity: number | null;
  total_index: number;
  index_max: number;
  publish_status: string;
  region_availability: RatingRegion[];
  price: string | null;
  noise_score: number | null;
  has_noise_measurement: boolean;
  scores: Record<string, number>;
  is_ad: boolean;
  ad_position: number | null;
  rank: number | null;
}

export interface RatingModelDetail {
  id: number;
  slug: string;
  brand: RatingBrand;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  total_index: number;
  index_max: number;
  publish_status: string;
  region_availability: RatingRegion[];
  price: string | null;
  pros_text: string;
  cons_text: string;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  photos: RatingModelPhoto[];
  suppliers: RatingModelSupplier[];
  parameter_scores: RatingParameterScore[];
  raw_values: RatingRawValue[];
  methodology_version: string;
  rank: number | null;
  median_total_index: number | null;

  // M4 — могут быть "" или null до мержа M4.
  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;
  inner_unit_dimensions: string;
  inner_unit_weight_kg: string | null;
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string | null;

  // M5 — до 5 упоминаний модели в новостях. Могут отсутствовать до мержа M5.
  news_mentions?: RatingNewsMention[];
}

export interface RatingNewsMention {
  id: number;
  title: string;
  pub_date: string;
  category?: string;
  category_display?: string;
  reading_time_minutes?: number | null;
}

export type RatingCriterionGroup =
  | 'climate'
  | 'compressor'
  | 'acoustics'
  | 'control'
  | 'dimensions'
  | 'other';

export interface RatingMethodologyCriterion {
  code: string;
  name_ru: string;
  description_ru: string;
  weight: number;
  unit: string;
  value_type: string;
  scoring_type: string;
  group: RatingCriterionGroup;
  group_display: string;
  display_order: number;
  min_value: number | null;
  median_value: number | null;
  max_value: number | null;
}

export interface RatingMethodologyStats {
  total_models: number;
  active_criteria_count: number;
  median_total_index: number;
}

export interface RatingMethodology {
  version: string;
  name: string;
  criteria: RatingMethodologyCriterion[];
  stats: RatingMethodologyStats;
}

export interface RatingReview {
  id: number;
  author_name: string;
  rating: number;
  pros: string;
  cons: string;
  comment: string;
  created_at: string;
}

export interface RatingBrandOption {
  id: number;
  name: string;
}

export interface RatingReviewCreatePayload {
  model: number;
  author_name: string;
  rating: number;
  pros: string;
  cons: string;
  comment: string;
  website: string;
}
