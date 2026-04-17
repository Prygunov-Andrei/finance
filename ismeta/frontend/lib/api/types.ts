export type UUID = string;

export type EstimateStatus =
  | "draft"
  | "in_progress"
  | "review"
  | "ready"
  | "transmitted"
  | "archived";

export type MatchSource =
  | "manual"
  | "history"
  | "pricelist"
  | "knowledge"
  | "category"
  | "fuzzy"
  | "llm"
  | "web"
  | "supplier"
  | "unmatched";

export type ProcurementStatus =
  | "none"
  | "requested"
  | "quoted"
  | "booked"
  | "ordered";

export type MarkupConfig =
  | { type: "percent"; value: number }
  | { type: "fixed_price"; value: number }
  | { type: "fixed_amount"; value: number };

export interface EstimateListItem {
  id: UUID;
  name: string;
  status: EstimateStatus;
  folder_name: string;
  version_number: number;
  total_equipment: string;
  total_materials: string;
  total_works: string;
  total_amount: string;
  man_hours: string;
  updated_at: string;
}

export interface Estimate {
  id: UUID;
  workspace: UUID;
  folder_name: string;
  name: string;
  status: EstimateStatus;
  version_number: number;
  parent_version: UUID | null;
  version: number;
  default_material_markup: MarkupConfig | Record<string, never>;
  default_work_markup: MarkupConfig | Record<string, never>;
  total_equipment: string;
  total_materials: string;
  total_works: string;
  total_amount: string;
  man_hours: string;
  profitability_percent: string;
  advance_amount: string;
  estimated_days: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEstimateDto {
  name: string;
  folder_name?: string;
  default_material_markup?: MarkupConfig;
  default_work_markup?: MarkupConfig;
}

export interface EstimateSection {
  id: UUID;
  estimate: UUID;
  name: string;
  sort_order: number;
  version: number;
  material_markup: MarkupConfig | null;
  work_markup: MarkupConfig | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateItem {
  id: UUID;
  section: UUID;
  estimate: UUID;
  row_id: UUID;
  sort_order: number;
  name: string;
  unit: string;
  quantity: string;
  equipment_price: string;
  material_price: string;
  work_price: string;
  equipment_total: string;
  material_total: string;
  work_total: string;
  total: string;
  version: number;
  match_source: MatchSource;
  material_markup: MarkupConfig | null;
  work_markup: MarkupConfig | null;
  tech_specs: Record<string, unknown>;
  custom_data: Record<string, unknown>;
  is_deleted: boolean;
  is_key_equipment: boolean;
  procurement_status: ProcurementStatus;
  man_hours: string;
  created_at: string;
  updated_at: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ field?: string; code?: string; message: string }>;
  request_id?: string;
}

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Черновик",
  in_progress: "В работе",
  review: "На проверке",
  ready: "Готова",
  transmitted: "Передана в ERP",
  archived: "Архив",
};
