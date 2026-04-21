// =========================================================================
// AC Rating (public) — types for /api/public/v1/rating/*
// Shape aligned with backend/ac_catalog/serializers.py after M2.
// ВАЖНО: в list-эндпоинте `brand` — string (название), в detail — объект.
// Легаси-решение из бекэнда, мы его не переделываем.
// =========================================================================

export interface RatingBrand {
  id: number;
  name: string;
  logo: string;
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

export interface RatingModelPhoto {
  id: number;
  image: string;
  alt: string;
}

export interface RatingModelSupplier {
  id: number;
  name: string;
  url: string;
}

export interface RatingModelListItem {
  id: number;
  slug: string;
  brand: string;
  brand_logo: string;
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
  price: string | null;
  total_index: number;
  rank: number;
  regions: RatingRegion[];
  pros_text: string;
  cons_text: string;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  photos: RatingModelPhoto[];
  suppliers: RatingModelSupplier[];
  parameter_scores: RatingParameterScore[];
  median_total_index: number;
}

export interface RatingMethodologyCriterion {
  code: string;
  name_ru: string;
  weight: number;
  unit: string;
  value_type: string;
  scoring_type: string;
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
  body: string;
  stars: number;
  created_at: string;
}
