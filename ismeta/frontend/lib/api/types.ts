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
  note: string;
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

/**
 * Нормализованные поля из tech_specs: JSONField, в который бэкенд кладёт
 * распознанные из PDF/Excel характеристики (model_name, brand, comments,
 * system) + произвольные ТТХ (flow, power, ...). Известные ключи — опциональны;
 * остальное попадает в index signature и доступно по ключу.
 */
export interface EstimateItemTechSpecs {
  model_name?: string;
  brand?: string;
  comments?: string;
  system?: string;
  source_page?: number;
  [key: string]: unknown;
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
  tech_specs: EstimateItemTechSpecs;
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

export interface PageSummary {
  page: number;
  expected_count: number;
  expected_count_vision: number;
  parsed_count: number;
  retried: boolean;
  suspicious: boolean;
}

// Excel-импорт (POST /import/excel/) — update-aware по row_id,
// возвращает счётчики созданных/обновлённых строк.
export interface ExcelImportResult {
  created: number;
  updated: number;
  errors: string[];
}

// PDF-импорт (POST /import/pdf/) через Recognition — всегда создаёт новые
// позиции, дополнительно отдаёт отчёт по страницам и секциям.
export interface PdfImportResult {
  created: number;
  sections: number;
  errors: string[];
  pages_total: number;
  pages_processed: number;
  pages_skipped?: number;
  // pages_summary — покадровый отчёт с флагом suspicious=true когда vision-
  // counter видит позиций больше чем парсер. Optional: legacy backend без поля.
  pages_summary?: PageSummary[];
  // E18: LLM-стоимость распознавания. Отсутствует если backend не прокидывает
  // (старая версия без E18-1) — UI покажет «—».
  llm_costs?: LLMCosts;
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

// =============================================================================
// E19: Background recognition jobs
// =============================================================================

export type RecognitionJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type RecognitionJobFileType = "pdf" | "excel" | "spec" | "invoice";

export interface RecognitionJobPageSummary {
  page: number;
  parsed_count: number;
  expected_count?: number;
  expected_count_vision?: number;
  retried?: boolean;
  suspicious?: boolean;
}

// E18-1: per-call cost breakdown. Recognition отдаёт это поле в response
// каждого parse-эндпоинта; backend проксирует в RecognitionJob.llm_costs и
// в PdfImportResult.llm_costs.
export interface LLMCallCost {
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost_usd: number | null;
}

export interface LLMCosts {
  extract: LLMCallCost | null;
  multimodal: LLMCallCost | null;
  classify: LLMCallCost | null;
  total_usd: number;
}

// Backward compatibility: до полного раскатывания E18-1 backend может слать
// усечённый payload. Поэтому в RecognitionJob ослабляем форму: либо новая
// LLMCosts, либо старый легаси-снимок (только model + total_tokens).
export interface RecognitionJobLlmCosts {
  extract?: LLMCallCost | { model?: string; total_tokens?: number } | null;
  multimodal?: LLMCallCost | null;
  classify?: LLMCallCost | null;
  total_usd?: number;
}

export interface RecognitionJobApplyResult {
  items_created?: number;
  sections_created?: number;
}

// Точный contract от E19-2 backend (RecognitionJobSerializer).
// items не возвращается (тяжёлый, тысячи позиций) — apply через callback.
export interface RecognitionJob {
  id: UUID;
  estimate_id: UUID;
  estimate_name: string;
  file_name: string;
  file_type: RecognitionJobFileType;
  // E18 not yet — profile_id всегда null до E18-2.
  profile_id: number | null;
  status: RecognitionJobStatus;
  pages_total: number | null;
  pages_done: number;
  items_count: number;
  pages_summary: RecognitionJobPageSummary[];
  // E19-1 шлёт {} placeholder; E18-1 заполнит реальную структуру.
  llm_costs: RecognitionJobLlmCosts | Record<string, never>;
  error_message: string;
  apply_result: RecognitionJobApplyResult | Record<string, never>;
  is_active: boolean;
  duration_seconds: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export const RECOGNITION_JOB_STATUS_LABELS: Record<RecognitionJobStatus, string> = {
  queued: "В очереди",
  running: "В работе",
  done: "Готово",
  failed: "Ошибка",
  cancelled: "Отменено",
};

// =============================================================================
// E18: LLM-профили
// =============================================================================

export interface LLMProfile {
  id: number;
  name: string;
  base_url: string;
  api_key_preview: string; // "***abcd"
  extract_model: string;
  multimodal_model: string;
  classify_model: string;
  vision_supported: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// При create/update отправляется plain api_key. Если пустой при update —
// бэкенд не меняет существующий ключ.
export interface LLMProfileCreate {
  name: string;
  base_url: string;
  api_key: string;
  extract_model: string;
  multimodal_model?: string;
  classify_model?: string;
  vision_supported: boolean;
  is_default?: boolean;
}

export interface LLMProfileTestResult {
  ok: boolean;
  status_code?: number;
  models?: string[];
  error?: string;
}
