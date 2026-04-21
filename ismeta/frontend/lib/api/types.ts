export type UUID = string;

export interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

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

export interface CreateSectionDto {
  name: string;
  sort_order?: number;
}

export interface CreateItemDto {
  section_id: UUID;
  name: string;
  unit?: string;
  quantity?: number | string;
  equipment_price?: number | string;
  material_price?: number | string;
  work_price?: number | string;
  sort_order?: number;
  match_source?: MatchSource;
  is_key_equipment?: boolean;
  procurement_status?: ProcurementStatus;
  man_hours?: number | string;
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

export interface MatchingMatch {
  work_name: string;
  work_unit: string;
  work_price: string;
  confidence: string;
  source: MatchSource;
  reasoning: string;
}

export interface MatchingResult {
  group_name: string;
  unit: string;
  item_count: number;
  item_ids: UUID[];
  match: MatchingMatch;
}

export interface MatchingSession {
  session_id: string;
  total_items: number;
  groups: number;
  results: MatchingResult[];
}

// =============================================================================
// Материалы (E-MAT-01): справочник + matching
// =============================================================================

export interface MaterialSearchHit {
  id: UUID;
  name: string;
  unit: string;
  price: string;
  brand: string | null;
  model_name: string | null;
  score: string;
}

export interface MaterialSearchResponse {
  query: string;
  results: MaterialSearchHit[];
}

export type MaterialMatchBucket = "green" | "yellow" | "red";

export interface MaterialMatchResult {
  item_id: UUID;
  material_id: UUID;
  material_name: string;
  material_unit: string;
  material_price: string;
  confidence: string;
  bucket: MaterialMatchBucket;
}

export interface MaterialMatchSession {
  session_id: string;
  total_items: number;
  matched: number;
  results: MaterialMatchResult[];
}

export interface MaterialApplyResponse {
  updated: number;
}

export interface PdfProbeResponse {
  pages_total: number;
  has_text_layer: boolean;
  estimated_seconds: number;
}

export interface ImportResult {
  created: number;
  // updated — только Excel-импорт возвращает это поле (update-aware по row_id).
  // PDF-импорт через Recognition всегда создаёт новые позиции и updated не
  // присылает. Читающий код должен использовать `updated ?? 0`.
  updated?: number;
  // sections / pages_* — только PDF-импорт (отчёт по страницам и секциям).
  sections?: number;
  errors: string[];
  pages_total?: number;
  pages_processed?: number;
}

export interface PdfItem {
  raw_name: string;
  model_name: string | null;
  brand: string | null;
  quantity: number;
  unit: string;
  section_name: string | null;
  tech_specs: Record<string, string>;
  confidence: number;
  source_page: number | null;
}

export interface PdfDocumentMeta {
  filenames: string[];
  pages_total: number;
  pages_processed: number;
  confidence: number;
  processing_time_ms: number;
  tokens_total: number;
  cost_usd: number;
}

export interface PdfImportPreview {
  session_id: string;
  document_meta: PdfDocumentMeta;
  items: PdfItem[];
  errors: string[];
}

export type IssueSeverity = "error" | "warning" | "info";
export type IssueCategory =
  | "price_outlier"
  | "missing_work"
  | "quantity_mismatch"
  | "spec_error";

export interface ValidationIssue {
  item_name: string;
  item_id: UUID | null;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  suggestion: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  summary: string;
  tokens_used: number;
  cost_usd: number;
}

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatToolResult {
  name: string;
  result: unknown;
}

export interface ChatMessage {
  id: UUID;
  role: ChatRole;
  content: string;
  tool_calls: ChatToolCall[] | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

export interface ChatResponse {
  message_id: UUID;
  session_id: UUID;
  content: string;
  tool_calls: ChatToolCall[];
  tool_results: ChatToolResult[];
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export const PROCUREMENT_STATUSES: ProcurementStatus[] = [
  "none",
  "requested",
  "quoted",
  "booked",
  "ordered",
];

export const PROCUREMENT_STATUS_LABELS: Record<ProcurementStatus, string> = {
  none: "—",
  requested: "Запрошено",
  quoted: "КП получено",
  booked: "Забронировано",
  ordered: "Заказано",
};

export const MATCH_SOURCE_LABELS: Record<MatchSource, string> = {
  manual: "Вручную",
  history: "История",
  pricelist: "Прайс",
  knowledge: "База",
  category: "Категория",
  fuzzy: "Fuzzy",
  llm: "LLM",
  web: "Web",
  supplier: "Поставщик",
  unmatched: "Не подобрано",
};
