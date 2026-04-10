// ==================== PROJECTS AND ESTIMATES ====================

// Projects
export interface ProjectList {
  id: number;
  cipher: string;
  name: string;
  date: string;
  stage: 'П' | 'РД';
  stage_display: string;
  object: number;
  object_name: string;
  is_approved_for_production: boolean;
  primary_check_done: boolean;
  secondary_check_done: boolean;
  version_number: number;
  is_current: boolean;
  project_files: ProjectFile[];
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectList {
  file?: string;
  notes?: string;
  production_approval_file?: string;
  production_approval_date?: string;
  primary_check_by?: number;
  primary_check_by_username?: string;
  primary_check_date?: string;
  secondary_check_by?: number;
  secondary_check_by_username?: string;
  secondary_check_date?: string;
  parent_version?: number;
  project_notes: ProjectNote[];
}

export interface ProjectNote {
  id: number;
  project: number;
  author: {
    id: number;
    username: string;
  };
  text: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFileType {
  id: number;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: number;
  project: number;
  file: string;
  file_type: number;
  file_type_name: string;
  title: string;
  original_filename: string;
  uploaded_by: number | null;
  uploaded_by_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreateRequest {
  cipher: string;
  name: string;
  date: string;
  stage: 'П' | 'РД';
  object: number;
  notes?: string;
}

// Estimates
export type ColumnType =
  | 'builtin'
  | 'custom_number'
  | 'custom_text'
  | 'custom_date'
  | 'custom_select'
  | 'custom_checkbox'
  | 'formula';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  builtin_field?: string | null;
  width: number;
  editable: boolean;
  visible: boolean;
  formula?: string | null;
  decimal_places?: number | null;
  aggregatable: boolean;
  options?: string[] | null;
}

export interface ColumnConfigTemplate {
  id: number;
  name: string;
  description: string;
  column_config: ColumnDef[];
  is_default: boolean;
  created_by: number;
  created_by_username: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_COLUMN_CONFIG: ColumnDef[] = [
  { key: 'item_number', label: '№', type: 'builtin', builtin_field: 'item_number', width: 50, editable: false, visible: true, formula: null, decimal_places: null, aggregatable: false, options: null },
  { key: 'name', label: 'Наименование', type: 'builtin', builtin_field: 'name', width: 250, editable: true, visible: true, formula: null, decimal_places: null, aggregatable: false, options: null },
  { key: 'model_name', label: 'Модель', type: 'builtin', builtin_field: 'model_name', width: 150, editable: true, visible: true, formula: null, decimal_places: null, aggregatable: false, options: null },
  { key: 'unit', label: 'Ед.', type: 'builtin', builtin_field: 'unit', width: 60, editable: true, visible: true, formula: null, decimal_places: null, aggregatable: false, options: null },
  { key: 'quantity', label: 'Кол-во', type: 'builtin', builtin_field: 'quantity', width: 80, editable: true, visible: true, formula: null, decimal_places: 3, aggregatable: false, options: null },
  { key: 'material_unit_price', label: 'Закупка мат.', type: 'builtin', builtin_field: 'material_unit_price', width: 100, editable: true, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'work_unit_price', label: 'Закупка раб.', type: 'builtin', builtin_field: 'work_unit_price', width: 100, editable: true, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'material_total', label: 'Итого закупка мат.', type: 'builtin', builtin_field: 'material_total', width: 110, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  { key: 'work_total', label: 'Итого закупка раб.', type: 'builtin', builtin_field: 'work_total', width: 110, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  { key: 'line_total', label: 'Итого закупка', type: 'builtin', builtin_field: 'line_total', width: 120, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  // Наценки (скрыты по умолчанию)
  { key: 'effective_material_markup_percent', label: 'Наценка мат. %', type: 'builtin', builtin_field: 'effective_material_markup_percent', width: 90, editable: false, visible: false, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'effective_work_markup_percent', label: 'Наценка раб. %', type: 'builtin', builtin_field: 'effective_work_markup_percent', width: 90, editable: false, visible: false, formula: null, decimal_places: 2, aggregatable: false, options: null },
  // Продажные цены
  { key: 'material_sale_unit_price', label: 'Продажа мат.', type: 'builtin', builtin_field: 'material_sale_unit_price', width: 100, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'work_sale_unit_price', label: 'Продажа раб.', type: 'builtin', builtin_field: 'work_sale_unit_price', width: 100, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'material_sale_total', label: 'Итого продажа мат.', type: 'builtin', builtin_field: 'material_sale_total', width: 120, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  { key: 'work_sale_total', label: 'Итого продажа раб.', type: 'builtin', builtin_field: 'work_sale_total', width: 120, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
];

export interface EstimateList {
  id: number;
  number: string;
  name: string;
  object: number;
  object_name: string;
  legal_entity: number;
  legal_entity_name: string;
  status: 'draft' | 'in_progress' | 'checking' | 'approved' | 'sent' | 'agreed' | 'rejected';
  status_display: string;
  with_vat: boolean;
  approved_by_customer: boolean;
  version_number: number;
  created_at: string;
  updated_at: string;
}

export interface EstimateDetail extends EstimateList {
  vat_rate: string;
  projects: Array<{
    id: number;
    cipher: string;
    name: string;
    file?: string;
    project_files: Array<{
      id: number;
      file: string;
      file_type: number;
      file_type_name: string;
      file_type_code: string;
      title: string;
      original_filename: string;
    }>;
  }>;
  price_list?: number;
  price_list_name?: string;
  man_hours: string;
  usd_rate?: string;
  eur_rate?: string;
  cny_rate?: string;
  file?: string;
  approved_date?: string;
  created_by: number;
  created_by_username: string;
  checked_by?: number;
  checked_by_username?: string;
  approved_by?: number;
  approved_by_username?: string;
  parent_version?: number;
  column_config?: ColumnDef[];
  sections: EstimateSection[];
  characteristics: EstimateCharacteristic[];
  total_materials_sale: string;
  total_works_sale: string;
  total_materials_purchase: string;
  total_works_purchase: string;
  total_sale: string;
  total_purchase: string;
  vat_amount: string;
  total_with_vat: string;
  profit_amount: string;
  profit_percent: string;
  default_material_markup_percent: string;
  default_work_markup_percent: string;
}

export interface EstimateSection {
  id: number;
  estimate: number;
  name: string;
  sort_order: number;
  subsections: EstimateSubsection[];
  total_materials_sale: string;
  total_works_sale: string;
  total_materials_purchase: string;
  total_works_purchase: string;
  total_sale: string;
  total_purchase: string;
  material_markup_percent: string | null;
  work_markup_percent: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateSubsection {
  id: number;
  section: number;
  name: string;
  materials_sale: string;
  works_sale: string;
  materials_purchase: string;
  works_purchase: string;
  sort_order: number;
  total_sale: string;
  total_purchase: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateCharacteristic {
  id: number;
  estimate: number;
  name: string;
  purchase_amount: string;
  sale_amount: string;
  is_auto_calculated: boolean;
  source_type: 'sections' | 'manual';
  source_type_display: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EstimateCreateRequest {
  object: number;
  legal_entity: number;
  name: string;
  with_vat?: boolean;
  vat_rate?: string;
  projects?: number[];
  price_list?: number;
  man_hours?: string;
  usd_rate?: string;
  eur_rate?: string;
  cny_rate?: string;
}

// Mounting Estimates
export interface MountingEstimateList {
  id: number;
  number: string;
  name: string;
  object: number;
  object_name: string;
  source_estimate?: {
    id: number;
    number: string;
    name: string;
  };
  total_amount: string;
  man_hours: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  status_display: string;
  agreed_counterparty?: number;
  agreed_counterparty_name?: string;
  agreed_date?: string;
  version_number: number;
  with_vat?: boolean;
  vat_rate?: string;
  vat_amount?: string;
  total_with_vat?: string;
  created_at: string;
  updated_at: string;
}

export interface MountingEstimateWork {
  id: number;
  name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
}

export interface MountingEstimateDetail extends MountingEstimateList {
  file?: string;
  created_by: number;
  created_by_username: string;
  agreed_counterparty_detail?: {
    id: number;
    name: string;
    short_name: string;
  };
  parent_version?: number;
  works?: MountingEstimateWork[];
}

export interface MountingEstimateCreateRequest {
  name: string;
  object: number;
  source_estimate?: number;
  total_amount: string;
  man_hours?: string;
  status?: 'draft' | 'sent' | 'approved' | 'rejected';
}

// ===================================
// ТКП и МП - Новые типы данных
// ===================================

// Фронт работ (справочник)
export interface FrontOfWorkItem {
  id: number;
  name: string;
  category: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFrontOfWorkItemData {
  name: string;
  category?: string;
  is_active?: boolean;
  is_default?: boolean;
  sort_order?: number;
}

// Условия для МП (справочник)
export interface MountingCondition {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMountingConditionData {
  name: string;
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
  sort_order?: number;
}

// ==================== ASYNC WORK MATCHING ====================

export interface WorkMatchingSession {
  session_id: string;
  total_items: number;
}

export type WorkMatchingStatus = 'processing' | 'completed' | 'error' | 'cancelled';

export type WorkMatchingSource =
  | 'default'
  | 'history'
  | 'pricelist'
  | 'knowledge'
  | 'category'
  | 'fuzzy'
  | 'llm'
  | 'web'
  | 'unmatched';

export interface WorkMatchingMatchedWork {
  id: number;
  name: string;
  article: string;
  section_name: string;
  hours: string;
  required_grade: string;
  unit: string;
  calculated_cost: string | null;
}

export interface WorkMatchingAlternative {
  id: number;
  name: string;
  article: string;
  hours?: string;
  unit?: string;
  section_name?: string;
  required_grade?: string;
  calculated_cost?: string | null;
  confidence: number;
}

export interface WorkMatchingResult {
  item_id: number;
  item_name: string;
  matched_work: WorkMatchingMatchedWork | null;
  alternatives: WorkMatchingAlternative[];
  confidence: number;
  source: WorkMatchingSource;
  llm_reasoning: string;
}

export interface WorkMatchingProgress {
  session_id: string;
  status: WorkMatchingStatus;
  total_items: number;
  current_item: number;
  current_tier: string;
  current_item_name: string;
  results: WorkMatchingResult[];
  stats: Record<string, number>;
  errors: Array<{ error: string }>;
  man_hours_total: string;
}

export interface WorkMatchingApplyItem {
  item_id: number;
  work_item_id: number | null;
  work_price?: string;
}

export interface WorkMatchingApplyResult {
  applied: number;
  man_hours: string;
}
