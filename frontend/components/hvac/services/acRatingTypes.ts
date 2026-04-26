// Типы для административного API рейтинга кондиционеров (Ф8A).
// Соответствуют backend/ac_catalog/admin_serializers.py и
// backend/ac_brands/admin_serializers.py — поля строго по сериализаторам.

export type ACPublishStatus = 'draft' | 'review' | 'published' | 'archived';

export type ACAvailability =
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  | 'unknown';

// AdminACModelListSerializer
export interface ACModelListItem {
  id: number;
  brand_id: number;
  brand_name: string;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  total_index: number;
  publish_status: ACPublishStatus;
  is_ad: boolean;
  ad_position: number | null;
  primary_photo_url: string;
  photos_count: number;
  region_codes: string[];
  price: string | null;
  created_at: string;
  updated_at: string;
}

// AdminACModelPhotoNestedSerializer
export interface ACModelPhotoNested {
  id: number;
  image_url: string;
  alt: string;
  order: number;
}

// AdminACModelPhotoSerializer (отдельный photo endpoint)
export interface ACModelPhoto {
  id: number;
  image: string;
  image_url: string;
  alt: string;
  order: number;
}

// AdminACModelSupplierSerializer
export interface ACModelSupplier {
  id?: number;
  name: string;
  url: string;
  order: number;
  price: string | null;
  city: string;
  rating: string | null;
  availability: ACAvailability;
  availability_display?: string;
  note: string;
}

// AdminModelRawValueSerializer
export interface ACModelRawValue {
  id?: number;
  criterion_code: string;
  criterion_name?: string;
  raw_value: string;
  numeric_value: number | null;
  compressor_model: string;
  source: string;
  source_url: string;
  comment: string;
  verification_status: string;
  lab_status: string;
}

// AdminBrandSerializer
export interface ACBrand {
  id: number;
  name: string;
  logo: string;
  logo_dark: string | null;
  logo_url: string;
  logo_dark_url: string;
  is_active: boolean;
  origin_class: number | null;
  origin_class_name: string | null;
  sales_start_year_ru: number | null;
  models_count: number;
  created_at: string;
  updated_at: string;
}

// AdminACModelDetailSerializer
export interface ACModelDetail {
  id: number;
  slug: string;
  brand: number;
  brand_detail: ACBrand | null;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  equipment_type: number | null;
  publish_status: ACPublishStatus;
  total_index: number;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  price: string | null;
  pros_text: string;
  cons_text: string;
  is_ad: boolean;
  ad_position: number | null;
  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;
  inner_unit_dimensions: string;
  inner_unit_weight_kg: string | null;
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string | null;
  photos: ACModelPhotoNested[];
  suppliers: ACModelSupplier[];
  raw_values: ACModelRawValue[];
  region_codes: string[];
  created_at: string;
  updated_at: string;
}

// Payloads. PATCH/POST в эту форму. Все поля опциональны на уровне типа —
// серверная валидация решает, что обязательно.
export type ACModelWritable = Partial<{
  brand: number;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  equipment_type: number | null;
  publish_status: ACPublishStatus;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  price: string | null;
  pros_text: string;
  cons_text: string;
  is_ad: boolean;
  ad_position: number | null;
  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;
  inner_unit_dimensions: string;
  inner_unit_weight_kg: string | null;
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string | null;
  photos: Array<Pick<ACModelPhotoNested, 'id' | 'alt' | 'order'>>;
  suppliers: ACModelSupplier[];
  raw_values: ACModelRawValue[];
  region_codes: string[];
}>;

export interface EquipmentType {
  id: number;
  name: string;
}

export interface RegionChoice {
  code: string;
  label: string;
}

// DRF может вернуть либо paginated, либо plain list — поддерживаем оба.
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ModelsListParams {
  brand?: number[];
  publish_status?: ACPublishStatus | '';
  equipment_type?: number;
  region?: string;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface BrandsListParams {
  is_active?: 'true' | 'false';
  origin_class?: number;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface NormalizeLogosResponse {
  normalized: number;
  errors: Array<{ brand_id: number; error: string }>;
}

export interface GenerateDarkLogosResponse {
  generated: number;
  skipped_colored: number;
  errors: Array<{ brand_id: number; error: string }>;
}

export interface RecalculateResponse {
  recalculated: boolean;
  model: ACModelDetail;
}

export interface ReorderPhotosResponse {
  photos: ACModelPhoto[];
}

// ── Criteria (Ф8B-1) ──────────────────────────────────────────────────
// Соответствуют backend/ac_methodology/admin_serializers.py.

export type ACCriterionValueType =
  | 'numeric'
  | 'binary'
  | 'categorical'
  | 'custom_scale'
  | 'formula'
  | 'lab'
  | 'fallback'
  | 'brand_age';

export type ACCriterionGroup =
  | 'climate'
  | 'compressor'
  | 'acoustics'
  | 'control'
  | 'dimensions'
  | 'other';

// AdminCriterionListSerializer
export interface ACCriterionListItem {
  id: number;
  code: string;
  name_ru: string;
  photo_url: string;
  unit: string;
  value_type: ACCriterionValueType;
  group: ACCriterionGroup;
  is_active: boolean;
  is_key_measurement: boolean;
  methodologies_count: number;
}

// AdminCriterionSerializer (full)
export interface ACCriterion {
  id: number;
  code: string;
  name_ru: string;
  name_en: string;
  name_de: string;
  name_pt: string;
  description_ru: string;
  description_en: string;
  description_de: string;
  description_pt: string;
  unit: string;
  photo: string;
  photo_url: string;
  value_type: ACCriterionValueType;
  group: ACCriterionGroup;
  is_active: boolean;
  is_key_measurement: boolean;
  created_at: string;
  updated_at: string;
}

export interface CriteriaListParams {
  value_type?: ACCriterionValueType | '';
  group?: ACCriterionGroup | '';
  is_active?: 'true' | 'false';
  is_key_measurement?: 'true' | 'false';
  search?: string;
  ordering?: string;
  page?: number;
}

// ── Methodology (Ф8B-1) ───────────────────────────────────────────────

// AdminMethodologyListSerializer
export interface ACMethodologyListItem {
  id: number;
  version: string;
  name: string;
  is_active: boolean;
  criteria_count: number;
  weight_sum: number;
  needs_recalculation: boolean;
  created_at: string;
  updated_at: string;
}

// AdminMethodologyCriterionReadSerializer
export interface ACMethodologyCriterion {
  id: number;
  criterion: ACCriterionListItem;
  scoring_type: string;
  weight: number;
  min_value: number | null;
  median_value: number | null;
  max_value: number | null;
  is_inverted: boolean;
  median_by_capacity: Record<string, number> | null;
  custom_scale_json: unknown;
  formula_json: unknown;
  is_required_lab: boolean;
  is_required_checklist: boolean;
  is_required_catalog: boolean;
  use_in_lab: boolean;
  use_in_checklist: boolean;
  use_in_catalog: boolean;
  region_scope: string;
  is_public: boolean;
  display_order: number;
  is_active: boolean;
}

// AdminMethodologyDetailSerializer
export interface ACMethodology {
  id: number;
  version: string;
  name: string;
  description: string;
  tab_description_index: string;
  tab_description_quiet: string;
  tab_description_custom: string;
  is_active: boolean;
  needs_recalculation: boolean;
  criteria_count: number;
  weight_sum: number;
  methodology_criteria: ACMethodologyCriterion[];
  created_at: string;
  updated_at: string;
}

// ── AI generate-pros-cons (Ф8B-1) ─────────────────────────────────────

export interface GenerateProsConsResponse {
  model: ACModelDetail;
  generated: { pros: string[]; cons: string[] };
  provider: string;
}
