export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LegalEntity {
  id: number;
  name: string;
  inn: string;
  tax_system: string | number | TaxSystem; // Может быть строкой, числом (ID) или объектом
  tax_system_id?: number;
  tax_system_details?: TaxSystem; // Детали системы налогообложения (has_vat, vat_rate)
  short_name?: string;
  kpp?: string;
  ogrn?: string;
  director?: number;
  director_name?: string;
  director_position?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  id: number;
  name: string;
  balance: string;
  currency: string;
  account_type: string;
  bank_name?: string;
  account_number?: string;
  number?: string;
  bic?: string;
  bik?: string;
  legal_entity?: number;
  legal_entity_name?: string;
  current_balance?: string;
  initial_balance?: string;
  balance_date?: string;
  bank_account_id?: number | null;
  bank_balance_latest?: string | null;
  bank_balance_date?: string | null;
  bank_delta?: string | null;
  location?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AccountBalance {
  id: number;
  account: number;
  balance_date: string;
  source?: 'internal' | 'bank_tochka';
  balance: string;
}

export interface Counterparty {
  id: number;
  name: string;
  short_name?: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  type: 'customer' | 'potential_customer' | 'vendor' | 'both' | 'employee' | 'supplier';
  vendor_subtype?: 'supplier' | 'executor' | 'both' | null;
  vendor_subtype_display?: string;
  legal_form?: string;
  address?: string;
  contact_info?: string;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface CounterpartyDuplicateItem {
  id: number;
  name: string;
  short_name?: string;
  inn: string;
  type: string;
  vendor_subtype?: string | null;
  legal_form?: string;
  kpp?: string;
  ogrn?: string;
  is_active?: boolean;
  _relations: {
    invoices_count: number;
    contracts_count: number;
    price_history_count: number;
  };
}

export interface CounterpartyDuplicateGroup {
  normalized_name: string;
  counterparties: CounterpartyDuplicateItem[];
  similarity: number;
}

export interface ConstructionObject {
  id: number;
  name: string;
  address: string;
  status: 'planned' | 'in_progress' | 'completed' | 'suspended';
  start_date: string | null;
  end_date: string | null;
  description?: string;
  photo?: string | null;
  contracts_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateConstructionObjectData {
  name: string;
  address: string;
  status: 'planned' | 'in_progress' | 'completed' | 'suspended';
  start_date?: string | null;
  end_date?: string | null;
  description?: string;
}

export interface CreateCounterpartyData {
  name: string;
  short_name?: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  type: 'customer' | 'potential_customer' | 'vendor' | 'both' | 'employee' | 'supplier';
  vendor_subtype?: 'supplier' | 'executor' | 'both' | null;
  legal_form: string;
  address?: string;
  contact_info?: string;
  notes?: string;
}

export interface CreateLegalEntityData {
  name: string;
  inn: string;
  tax_system: number; // ID системы налогообложения
  short_name?: string;
  kpp?: string;
  ogrn?: string;
  director?: number;
  director_name?: string;
  director_position?: string;
}

export interface CreateAccountData {
  name: string;
  number: string;
  account_type: 'bank_account' | 'cash' | 'deposit' | 'currency_account';
  bank_name?: string;
  bik?: string;
  currency: string;
  initial_balance?: string;
  legal_entity: number;
  location?: string;
  description?: string;
}

export interface TaxSystem {
  id: number;
  name: string;
  code: string;
  vat_rate?: string;
  has_vat: boolean;
  description?: string;
  is_active: boolean;
}

// Framework Contracts (Рамочные договоры)
export type FrameworkContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface FrameworkContractListItem {
  id: number;
  number: string;
  name: string;
  date: string;
  valid_from: string;
  valid_until: string;
  counterparty: number;
  counterparty_name: string;
  legal_entity: number;
  legal_entity_name: string;
  status: FrameworkContractStatus;
  is_active: boolean;
  contracts_count: number;
  created_at: string;
}

export interface FrameworkContractDetail extends FrameworkContractListItem {
  price_lists: number[];
  price_lists_details?: any[];
  file?: string;
  notes?: string;
  created_by: number;
  created_by_name: string;
  is_expired: boolean;
  days_until_expiration: number;
  total_contracts_amount: string;
  updated_at: string;
  legal_entity_details?: any;
  counterparty_details?: any;
}

export interface CreateFrameworkContractData {
  number?: string;
  name: string;
  date: string;
  valid_from: string;
  valid_until: string;
  legal_entity: number;
  counterparty: number;
  price_lists?: number[];
  status?: FrameworkContractStatus;
  file?: File;
  notes?: string;
}

export interface UpdateFrameworkContractData extends Partial<CreateFrameworkContractData> {}

export interface ContractListItem {
  id: number;
  number: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'suspended' | 'terminated';
  contract_type: 'income' | 'expense';
  total_amount: string;
  currency: 'RUB' | 'USD' | 'EUR' | 'CNY';
  contract_date: string;
  
  // Read-only имена
  counterparty_name: string;
  object_name: string;
  legal_entity_name: string;
}

export interface ContractDetail {
  id: number;
  // IDs (для редактирования)
  object_id: number;
  legal_entity: number;
  counterparty: number;
  commercial_proposal?: number;
  parent_contract?: number;
  framework_contract?: number;
  responsible_manager?: number;
  responsible_engineer?: number;

  // Names (для отображения)
  object_name: string;
  legal_entity_name: string;
  counterparty_name: string;
  commercial_proposal_number?: string;
  technical_proposal_number?: string;
  mounting_proposal_number?: string;
  framework_contract_details?: FrameworkContractListItem;
  responsible_manager_name?: string;
  responsible_engineer_name?: string;

  contract_type: 'income' | 'expense';
  number: string;
  name: string;
  contract_date: string;
  start_date?: string;
  end_date?: string;

  total_amount: string;
  currency: 'RUB' | 'USD' | 'EUR' | 'CNY';
  vat_rate: '0' | '10' | '20' | 'no_vat';
  vat_included: boolean;

  status: 'planned' | 'active' | 'completed' | 'suspended' | 'terminated';
  file?: string;
  notes?: string;
}

export interface WorkScheduleItem {
  id: number;
  contract: number;
  name: string;
  start_date: string;
  end_date: string;
  workers_count: number;
  status: 'pending' | 'in_progress' | 'done';
}

export interface CreateWorkScheduleItemData {
  contract: number;
  name: string;
  start_date: string;
  end_date: string;
  workers_count: number;
}

export interface ActItem {
  id: number;
  act: number;
  contract_estimate_item: number | null;
  name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  amount: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Act {
  id: number;
  contract: number;
  contract_number?: string;
  act_type: 'ks2' | 'ks3' | 'simple';
  act_type_display?: string;
  contract_estimate?: number | null;
  number: string;
  date: string;
  period_start: string;
  period_end: string;
  amount_gross: string;
  amount_net: string;
  vat_amount: string;
  status: 'draft' | 'agreed' | 'signed' | 'cancelled';
  unpaid_amount?: string;
  due_date?: string;
  description?: string;
  file?: string | null;
  allocations?: any[];
  act_items?: ActItem[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateActData {
  contract: number;
  number: string;
  date: string;
  period_start: string;
  period_end: string;
  amount_gross: string;
  amount_net: string;
  vat_amount: string;
  act_type?: 'ks2' | 'ks3' | 'simple';
  contract_estimate?: number;
  description?: string;
}

export interface ContractEstimateListItem {
  id: number;
  contract: number;
  source_estimate: number | null;
  number: string;
  name: string;
  status: 'draft' | 'agreed' | 'signed';
  signed_date: string | null;
  version_number: number;
  parent_version: number | null;
  amendment: number | null;
  file: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ContractEstimateSection {
  id: number;
  contract_estimate: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContractEstimateItem {
  id: number;
  contract_estimate: number;
  section: number;
  source_item: number | null;
  item_number: number;
  name: string;
  model_name: string;
  unit: string;
  quantity: string;
  material_unit_price: string;
  work_unit_price: string;
  material_total: string;
  work_total: string;
  line_total: string;
  product: number | null;
  work_item: number | null;
  is_analog: boolean;
  analog_reason: string;
  original_name: string;
  item_type: 'regular' | 'consumable' | 'additional';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContractText {
  id: number;
  contract: number;
  amendment: number | null;
  content_md: string;
  version: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccumulativeEstimateRow {
  item_id: number;
  item_number: number;
  name: string;
  unit: string;
  estimate_quantity: string;
  estimate_material_price: string;
  estimate_work_price: string;
  estimate_total: string;
  purchased_quantity: string;
  purchased_amount: string;
  purchase_links: Array<{
    invoice_item_id: number;
    quantity: string;
    price: string;
    match_type: string;
  }>;
}

export interface EstimateRemainderRow {
  item_id: number;
  item_number: number;
  name: string;
  unit: string;
  estimate_quantity: string;
  remaining_quantity: string;
  remaining_amount: string;
}

// EstimateItem (Строки сметы)
export interface EstimateItem {
  id: number;
  estimate: number;
  section: number;
  subsection: number | null;
  sort_order: number;
  item_number: number;
  name: string;
  model_name: string;
  unit: string;
  quantity: string;
  material_unit_price: string;
  work_unit_price: string;
  material_total: string;
  work_total: string;
  line_total: string;
  product: number | null;
  product_name?: string;
  work_item: number | null;
  work_item_name?: string;
  is_analog: boolean;
  analog_reason: string;
  original_name: string;
  source_price_history: number | null;
  custom_data?: Record<string, string>;
  computed_values?: Record<string, string | null>;
  created_at: string;
  updated_at: string;
}

export interface CreateEstimateItemData {
  estimate: number;
  section: number;
  subsection?: number | null;
  sort_order?: number;
  item_number?: number;
  name: string;
  model_name?: string;
  unit?: string;
  quantity: string;
  material_unit_price?: string;
  work_unit_price?: string;
  product?: number | null;
  work_item?: number | null;
  is_analog?: boolean;
  analog_reason?: string;
  original_name?: string;
}

export interface AutoMatchOffer {
  price: string;
  source_type: 'supplier_catalog' | 'invoice';
  counterparty_name: string | null;
  counterparty_id: number | null;
  supplier_product_id?: number;
  source_price_history_id?: number;
  invoice_number?: string;
  invoice_date?: string;
  price_date?: string | null;
}

export interface AutoMatchResult {
  item_id: number;
  name: string;
  matched_product: { id: number; name: string; price: string } | null;
  matched_work: { id: number; name: string; cost: string } | null;
  best_offer: AutoMatchOffer | null;
  all_offers: AutoMatchOffer[];
  product_confidence: number;
  work_confidence: number;
  invoice_info: {
    invoice_number: string;
    invoice_date: string;
    counterparty_name: string | null;
    invoice_id: number | null;
  } | null;
  source_price_history_id: number | null;
}

export interface WorkMatchResult {
  item_id: number;
  name: string;
  matched_work: {
    id: number;
    name: string;
    article: string;
    section_name: string;
    hours: string;
    required_grade: string;
    unit: string;
  } | null;
  work_price: string | null;
  work_confidence: number;
  source: string;
}

export interface EstimateImportPreview {
  rows: Array<{
    item_number: number;
    name: string;
    model_name: string;
    unit: string;
    quantity: string;
    material_unit_price: string;
    work_unit_price: string;
    section_name: string;
  }>;
  sections: string[];
  total_rows: number;
  confidence?: number;
}

export interface EstimatePdfImportSession {
  session_id: string;
  total_pages: number;
}

export interface EstimateImportProgress {
  session_id: string;
  status: 'processing' | 'completed' | 'error' | 'cancelled';
  total_pages: number;
  current_page: number;
  rows: EstimateImportPreview['rows'];
  sections: string[];
  errors: Array<{ page: number; error: string }>;
}

export interface EstimateDeviationRow {
  item_id: number;
  item_number: number;
  name: string;
  unit: string;
  deviation_type: 'analog' | 'price_exceeds' | 'quantity_exceeds' | 'additional';
  estimate_value: string;
  actual_value: string;
  reason: string;
}

export interface EstimatePurchaseLink {
  id: number;
  contract_estimate_item: number;
  invoice_item: number;
  match_type: 'exact' | 'analog' | 'manual';
  quantity_exceeds: boolean;
  price_exceeds: boolean;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceComplianceResult {
  invoice_id: number;
  items: Array<{
    invoice_item_id: number;
    invoice_item_name: string;
    status: 'matched' | 'unmatched' | 'exceeds' | 'analog_candidate';
    contract_estimate_item_id: number | null;
    contract_estimate_item_name: string | null;
    quantity_exceeds: boolean;
    price_exceeds: boolean;
    details: string;
  }>;
}

// Contract Amendments (Дополнительные соглашения)
export interface ContractAmendment {
  id: number;
  contract: number;
  number: string;
  date: string;
  reason: string;
  new_start_date?: string | null;
  new_end_date?: string | null;
  new_total_amount?: string | null;
  file?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContractAmendmentData {
  contract: number;
  number: string;
  date: string;
  reason: string;
  new_start_date?: string;
  new_end_date?: string;
  new_total_amount?: string;
  file?: File;
}

export interface PaymentRegistryItem {
  id: number;
  
  // Ссылки (Read-only)
  contract_number?: string;
  contract_name?: string;
  category_name?: string;
  account_name?: string;
  act_number?: string;
  
  planned_date: string;
  amount: string;
  status: 'planned' | 'approved' | 'paid' | 'cancelled';
  status_display?: string;
  
  initiator?: string;
  approved_by_name?: string;
  approved_at?: string;
  
  comment?: string;
  invoice_file?: string; // URL файла
  
  payment_id?: number; // ID связанного платежа
  
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentRegistryData {
  category_id: number;
  contract_id?: number;
  act_id?: number;
  account_id?: number;
  planned_date: string;
  amount: string;
  comment?: string;
  invoice_file?: File;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  code?: string;
  parent?: number;
  parent_name?: string;
  requires_contract: boolean;
  is_active: boolean;
  sort_order: number;
  children?: ExpenseCategory[];
}

export interface CreateExpenseCategoryData {
  name: string;
  code?: string;
  parent?: number | null;
  requires_contract?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface CashFlowData {
  month: string;
  income: number;
  expense: number;
}

export interface ObjectCashFlowData {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export interface DebtSummary {
  total_receivables: number;
  total_payables: number;
}

// ============================================
// Pricelis Interfaces
// ============================================

export interface WorkerGrade {
  id: number;
  grade: number; // 1-5
  name: string;
  default_hourly_rate: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkerGradeData {
  grade: number;
  name: string;
  default_hourly_rate: string;
  is_active?: boolean;
}

export interface WorkSection {
  id: number;
  code: string;
  name: string;
  parent: number | null;
  parent_name?: string | null;
  is_active: boolean;
  sort_order: number;
  children?: WorkSection[];
  created_at: string;
  updated_at: string;
}

export interface CreateWorkSectionData {
  code: string;
  name: string;
  parent?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface WorkerGradeSkills {
  id: number;
  grade: number;
  grade_detail?: {
    id: number;
    grade: number;
    name: string;
  };
  section: number;
  section_detail?: {
    id: number;
    code: string;
    name: string;
  };
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkerGradeSkillsData {
  grade: number;
  section: number;
  description: string;
}

// Work Items
export interface WorkItemList {
  id: number;
  article: string; // "V-001" (генерируется автоматически)
  section: number;
  section_name: string;
  name: string;
  unit: 'шт' | 'м.п.' | 'м²' | 'м³' | 'компл' | 'ед' | 'ч' | 'кг' | 'т' | 'точка';
  hours: string | null; // Часы (опционально, null = 0)
  grade: number; // ID разряда из справочника
  grade_name: string;
  required_grade: string; // Фактический числовой разряд (может быть дробным: "3.50", "2.50", "4.00")
  coefficient: string;
  version_number: number;
  is_current: boolean;
  comment?: string; // Комментарий к работе (опционально)
}

export interface WorkItemDetail extends WorkItemList {
  section_detail: WorkSection;
  grade_detail: WorkerGrade;
  composition: string;
  parent_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkItemData {
  section: number;
  name: string;
  unit: 'шт' | 'м.п.' | 'м²' | 'м³' | 'компл' | 'ед' | 'ч' | 'кг' | 'т' | 'точка';
  hours?: string | null; // Часы (опционально, если не указано, бэкенд подставит 0)
  grade: string; // Разряд как строка для поддержки дробных значений (например, "2.5", "3.65")
  coefficient: string;
  composition?: string;
  comment?: string; // Комментарий к работе (опционально)
}

// Price Lists
export interface PriceListList {
  id: number;
  number: string;
  name: string;
  date: string; // YYYY-MM-DD
  status: 'draft' | 'active' | 'archived';
  status_display: string;
  version_number: number;
  items_count: number;
  agreements_count: number;
  created_at: string;
  updated_at: string;
}

export interface PriceListItem {
  id: number;
  price_list: number;
  work_item: number;
  work_item_detail: {
    id: number;
    article: string;
    section_name: string;
    name: string;
    unit: string; // Сокращенное значение единицы измерения: "шт", "м.п.", "компл", "м²", "точка", "кг"
    hours: string;
    grade: number;
    grade_name: string;
    coefficient: string;
  };
  hours_override: string | null;
  coefficient_override: string | null;
  grade_override: string | null; // Переопределённый разряд (может быть дробным)
  effective_hours: string;
  effective_coefficient: string;
  effective_grade: string; // Read-only: эффективный разряд (grade_override || work_item.grade.grade)
  calculated_cost: string;
  is_included: boolean;
  created_at: string;
}

export interface PriceListAgreement {
  id: number;
  price_list: number;
  counterparty: number;
  counterparty_detail: {
    id: number;
    name: string;
    inn: string;
  };
  agreed_date: string;
  notes: string;
  created_at: string;
}

export interface PriceListDetail {
  id: number;
  number: string;
  name: string;
  date: string;
  status: 'draft' | 'active' | 'archived';
  status_display: string;
  grade_1_rate: string;
  grade_2_rate: string;
  grade_3_rate: string;
  grade_4_rate: string;
  grade_5_rate: string;
  version_number: number;
  parent_version: number | null;
  items: PriceListItem[];
  agreements: PriceListAgreement[];
  items_count: number;
  total_cost: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePriceListData {
  number: string;
  name?: string;
  date: string; // YYYY-MM-DD
  status?: 'draft' | 'active' | 'archived';
  grade_1_rate: string;
  grade_2_rate: string;
  grade_3_rate: string;
  grade_4_rate: string;
  grade_5_rate: string;
  work_items?: number[];
  populate_rates?: boolean;
}

export interface UpdatePriceListItemData {
  hours_override?: string | null;
  coefficient_override?: string | null;
  grade_override?: string | null; // Переопределённый разряд (может быть дробным)
  is_included?: boolean;
}

export interface CreatePriceListItemData {
  price_list: number;
  work_item: number;
  hours_override?: string | null;
  coefficient_override?: string | null;
  grade_override?: string | null; // Переопределённый разряд (может быть дробным)
  is_included?: boolean;
}

export interface CreatePriceListAgreementData {
  price_list: number;
  counterparty: number;
  agreed_date: string;
  notes?: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectList {
  file: string;
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
  { key: 'material_unit_price', label: 'Цена мат.', type: 'builtin', builtin_field: 'material_unit_price', width: 100, editable: true, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'work_unit_price', label: 'Цена раб.', type: 'builtin', builtin_field: 'work_unit_price', width: 100, editable: true, visible: true, formula: null, decimal_places: 2, aggregatable: false, options: null },
  { key: 'material_total', label: 'Итого мат.', type: 'builtin', builtin_field: 'material_total', width: 110, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  { key: 'work_total', label: 'Итого раб.', type: 'builtin', builtin_field: 'work_total', width: 110, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
  { key: 'line_total', label: 'Итого', type: 'builtin', builtin_field: 'line_total', width: 120, editable: false, visible: true, formula: null, decimal_places: 2, aggregatable: true, options: null },
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
  with_vat: boolean;
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

// ТКП - Технико-Коммерческие Предложения
export type TKPStatus = 'draft' | 'in_progress' | 'checking' | 'approved' | 'sent';

export interface TechnicalProposalListItem {
  id: number;
  number: string;
  outgoing_number: string | null;
  name: string;
  date: string;
  due_date: string | null;
  object: number;
  object_name: string;
  object_address: string;
  object_area: number | null;
  legal_entity: number;
  legal_entity_name: string;
  status: TKPStatus;
  validity_days: number;
  validity_date: string;
  created_by: number;
  created_by_name: string;
  checked_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  total_amount: string;
  total_with_vat: string;
  version_number: number;
  parent_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface TKPEstimateSubsection {
  id: number;
  section: number;
  source_subsection: number | null;
  name: string;
  materials_sale: string;
  works_sale: string;
  materials_purchase: string;
  works_purchase: string;
  sort_order: number;
  total_sale: string;
  total_purchase: string;
  created_at: string;
}

export interface TKPEstimateSection {
  id: number;
  tkp: number;
  source_estimate: number | null;
  source_section: number | null;
  name: string;
  sort_order: number;
  subsections: TKPEstimateSubsection[];
  total_sale: string;
  total_purchase: string;
  profit: string;
  estimate_name: string | null;
  estimate_number: string | null;
  created_at: string;
}

export interface TKPCharacteristic {
  id: number;
  tkp: number;
  source_estimate: number | null;
  source_characteristic: number | null;
  name: string;
  purchase_amount: string;
  sale_amount: string;
  sort_order: number;
  created_at: string;
}

export interface TKPFrontOfWork {
  id: number;
  tkp: number;
  front_item: number;
  front_item_name: string;
  front_item_category: string;
  when_text: string;
  when_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface TKPStatusHistoryItem {
  id: number;
  old_status: string;
  new_status: string;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
  comment: string;
}

export interface TechnicalProposalDetail extends TechnicalProposalListItem {
  advance_required: string;
  work_duration: string;
  notes: string;
  estimates: number[];
  estimate_sections: TKPEstimateSection[];
  characteristics: TKPCharacteristic[];
  front_of_work: TKPFrontOfWork[];
  total_profit: string;
  profit_percent: string;
  total_man_hours: string;
  currency_rates: {
    usd: string | null;
    eur: string | null;
    cny: string | null;
  };
  file_url: string | null;
  versions_count: number;
  is_latest_version: boolean;
  signatory_name: string;
  signatory_position: string;
  checked_by_name: string | null;
  approved_by_name: string | null;
  checked_at: string | null;
  status_history: TKPStatusHistoryItem[];
}

// МП - Монтажные Предложения
export type MPStatus = 'draft' | 'published' | 'sent' | 'approved' | 'rejected';

export interface MountingProposalListItem {
  id: number;
  number: string;
  name: string;
  date: string;
  object: number;
  object_name: string;
  counterparty: number | null;
  counterparty_name: string | null;
  parent_tkp: number | null;
  parent_tkp_number: string | null;
  mounting_estimates: number[];
  total_amount: string;
  man_hours: string;
  status: MPStatus;
  telegram_published: boolean;
  telegram_published_at: string | null;
  created_by: number;
  created_by_name: string;
  version_number: number;
  parent_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface MountingProposalDetail extends MountingProposalListItem {
  notes: string;
  conditions: MountingCondition[];
  conditions_ids: number[];
  mounting_estimates_ids: number[];
  file_url: string | null;
  versions_count: number;
  parent_tkp_name: string | null;
}

export interface ActPaymentAllocation {
  id: number;
  act: number;
  payment: number;
  payment_description: string;
  payment_date: string;
  amount: string;
  created_at: string;
}

// ============================================
// Payments Interfaces
// ============================================

export interface Payment {
  id: number;
  account: number; // ID счёта
  account_name?: string; // Read-only
  contract?: number; // ID договора
  contract_name?: string; // Read-only
  contract_number?: string; // Read-only
  category: number; // ID категории
  category_name?: string; // Read-only
  category_full_path?: string; // Read-only: полный путь категории
  legal_entity: number; // ID юрлица
  legal_entity_name?: string; // Read-only
  payment_type: 'income' | 'expense';
  payment_date: string; // YYYY-MM-DD
  amount: string; // Decimal string (для обратной совместимости, равен amount_gross)
  amount_gross: string; // Decimal string: сумма с НДС
  amount_net: string; // Decimal string: сумма без НДС
  vat_amount: string; // Decimal string: сумма НДС
  status: 'pending' | 'paid' | 'cancelled';
  description?: string;
  scan_file: string; // URL файла (ОБЯЗАТЕЛЬНЫЙ!)
  payment_registry?: number; // ID заявки в реестре (только для expense)
  is_internal_transfer: boolean;
  internal_transfer_group: string | null; // Группа для связывания внутренних переводов
  items?: PaymentItem[]; // Позиции товаров (только для expense)
  items_count?: number; // Количество позиций
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentData {
  payment_type: 'income' | 'expense';
  account_id: number;
  category_id: number;
  payment_date: string;
  amount_gross: string;
  amount_net?: string; // Рассчитывается автоматически, но можно переопределить
  vat_amount?: string; // Рассчитывается автоматически, но можно переопределить
  contract_id?: number;
  legal_entity_id?: number;
  description?: string;
  scan_file: File; // ОБЯЗАТЕЛЬНЫЙ PDF
  is_internal_transfer?: boolean;
  internal_transfer_group?: string;
  items_input?: Array<{
    raw_name: string;
    quantity: string;
    unit: string;
    price_per_unit: string;
    vat_amount?: string;
  }>; // Позиции товаров (только для expense)
}

// ============================================
// Correspondence Interfaces
// ============================================

export interface Correspondence {
  id: number;
  contract: number; // ID договора
  contract_number?: string; // Read-only
  contract_name?: string; // Read-only
  type: 'incoming' | 'outgoing';
  category: 'уведомление' | 'претензия' | 'запрос' | 'ответ' | 'прочее';
  number: string;
  date: string; // YYYY-MM-DD
  status: 'новое' | 'в работе' | 'отвечено' | 'закрыто';
  subject: string;
  description?: string;
  file?: string; // URL файла
  related_to?: number; // ID связанного письма
  related_to_number?: string; // Read-only
  created_at: string;
  updated_at: string;
}

export interface CreateCorrespondenceData {
  contract: number;
  type: 'incoming' | 'outgoing';
  category: 'уведомление' | 'претензия' | 'запрос' | 'ответ' | 'прочее';
  number: string;
  date: string;
  status?: 'новое' | 'в работе' | 'отвечено' | 'закрыто';
  subject: string;
  description?: string;
  file?: File;
  related_to?: number;
}

// ============================================
// LLM Providers Interfaces
// ============================================

export type LLMProviderType = 'openai' | 'gemini' | 'grok';

export interface LLMProvider {
  id: number;
  provider_type: LLMProviderType;
  provider_type_display: string;
  model_name: string;
  env_key_name: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Invoice Parsing Interfaces
// ============================================

export interface ParsedVendor {
  name: string;
  inn: string;
  kpp: string | null;
}

export interface ParsedBuyer {
  name: string;
  inn: string;
}

export interface ParsedInvoiceInfo {
  number: string;
  date: string; // YYYY-MM-DD
}

export interface ParsedTotals {
  amount_gross: string;
  vat_amount: string;
}

export interface ParsedItem {
  name: string;
  quantity: string;
  unit: string;
  price_per_unit: string;
}

export interface ParsedInvoiceData {
  vendor: ParsedVendor;
  buyer: ParsedBuyer;
  invoice: ParsedInvoiceInfo;
  totals: ParsedTotals;
  items: ParsedItem[];
  confidence: number; // 0.0-1.0
}

export interface VendorMatchSuggestion {
  id: number;
  name: string;
  short_name: string | null;
  inn: string;
  score: number;
}

export interface VendorMatch {
  match_type: 'exact' | 'similar' | 'not_found';
  counterparty_id: number | null;
  suggestions: VendorMatchSuggestion[];
}

export interface BuyerMatch {
  match_type: 'exact' | 'not_found';
  legal_entity_id: number | null;
  error: string | null;
}

export interface ProductMatchSimilar {
  product_id: number;
  product_name: string;
  score: number;
}

export interface ProductMatch {
  raw_name: string;
  similar_products: ProductMatchSimilar[];
}

export interface ParseInvoiceResponse {
  success: boolean;
  from_cache: boolean;
  document_id: number | null;
  data: ParsedInvoiceData | null;
  matches: {
    vendor: VendorMatch;
    buyer: BuyerMatch;
    products: ProductMatch[];
  } | null;
  warnings: string[];
  error: string | null;
}

// Invoice Items for payment creation/display
export interface InvoiceItem {
  raw_name: string;
  quantity: string;
  unit: string;
  price_per_unit: string;
  amount?: string; // Calculated
  vat_amount?: string;
}

// =============================================================================
// Worklog Types (Сервис фиксации работ)
// =============================================================================

export interface WorklogShift {
  id: string;
  contract: number | null;
  contract_number: string | null;
  contract_name: string | null;
  object: number;
  object_name: string;
  contractor: number;
  contractor_name: string;
  date: string;
  shift_type: 'day' | 'evening' | 'night';
  start_time: string;
  end_time: string;
  qr_token: string;
  status: 'scheduled' | 'active' | 'closed';
  registrations_count: number;
  teams_count: number;
}

export interface WorklogTeam {
  id: string;
  object_name: string;
  shift: string;
  topic_name: string;
  brigadier_name: string | null;
  status: 'active' | 'closed';
  is_solo: boolean;
  media_count: number;
}

export interface WorklogMedia {
  id: string;
  team: string | null;
  team_name: string | null;
  author_name: string;
  media_type: 'photo' | 'video' | 'audio' | 'voice' | 'document' | 'text';
  tag: string;
  file_url: string;
  thumbnail_url: string;
  text_content: string;
  status: string;
  created_at: string;
}

export interface WorklogReport {
  id: string;
  team: string;
  team_name: string | null;
  shift: string;
  report_number: number;
  report_type: 'intermediate' | 'final' | 'supplement';
  media_count: number;
  status: string;
  created_at: string;
}

export interface WorkJournalSummary {
  total_shifts: number;
  active_shifts: number;
  total_teams: number;
  total_media: number;
  total_reports: number;
  total_workers: number;
  recent_shifts: WorklogShift[];
}

export interface WorklogReportDetail extends WorklogReport {
  trigger: string;
  media_items: WorklogMedia[];
  questions: WorklogQuestion[];
}

export interface WorklogQuestion {
  id: string;
  report: string;
  author: string;
  author_name: string;
  text: string;
  status: 'pending' | 'answered';
  created_at: string;
  answers: WorklogAnswer[];
}

export interface WorklogAnswer {
  id: string;
  question: string;
  author: string;
  author_name: string;
  text: string;
  created_at: string;
}

export interface WorklogSupergroup {
  id: string;
  object: number;
  object_name: string;
  contractor: number;
  contractor_name: string;
  telegram_chat_id: number;
  chat_title: string;
  invite_link: string;
  is_active: boolean;
  created_at: string;
}

export interface InviteToken {
  id: string;
  code: string;
  contractor: number;
  contractor_name: string;
  created_by: number | null;
  created_by_username: string | null;
  role: string;
  expires_at: string;
  used: boolean;
  used_by: string | null;
  used_by_name: string | null;
  used_at: string | null;
  bot_link: string;
  is_valid: boolean;
  created_at: string;
}

// ─── API-FNS Types ──────────────────────────────────────────────

export interface FNSSuggestResult {
  inn: string;
  name: string;
  short_name: string;
  kpp: string;
  ogrn: string;
  address: string;
  legal_form: string;
  status: string;
  registration_date: string;
  is_local: boolean;
  local_id: number | null;
}

export interface FNSSuggestResponse {
  source: 'local' | 'fns' | 'mixed';
  results: FNSSuggestResult[];
  total: number;
  error?: string;
}

export interface FNSReport {
  id: number;
  counterparty: number;
  counterparty_name: string;
  report_type: 'check' | 'egr' | 'bo';
  report_type_display: string;
  inn: string;
  report_date: string;
  data: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  requested_by: number | null;
  requested_by_username: string | null;
  created_at: string;
}

export interface FNSReportListItem {
  id: number;
  counterparty: number;
  counterparty_name: string;
  report_type: 'check' | 'egr' | 'bo';
  report_type_display: string;
  inn: string;
  report_date: string;
  summary: Record<string, unknown> | null;
  requested_by_username: string | null;
  created_at: string;
}

export interface FNSReportCreateResponse {
  reports: FNSReport[];
  created_count: number;
  errors?: Array<{ report_type: string; error: string }>;
}

export interface FNSStatsMethod {
  name: string;
  display_name: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface FNSStats {
  is_configured: boolean;
  status: string;
  start_date: string;
  end_date: string;
  methods: FNSStatsMethod[];
  error?: string;
}

export interface FNSQuickCheckResponse {
  inn: string;
  summary: {
    positive: string[];
    negative: string[];
    positive_count: number;
    negative_count: number;
    risk_level: 'low' | 'medium' | 'high' | 'unknown';
  };
  raw_data: Record<string, unknown>;
}

export interface FNSEnrichResponse {
  inn: string;
  name: string;
  short_name: string;
  kpp: string;
  ogrn: string;
  address: string;
  legal_form: string;
  status: string;
  registration_date: string;
  director: string;
  okved: string;
  okved_name: string;
  capital: string;
  contact_info: string;
  error?: string;
}

// =====================================================================
// PERSONNEL TYPES (Персонал)
// =====================================================================

export interface ERPPermissionChild {
  code: string;
  label: string;
}

export interface ERPPermissionSection {
  code: string;
  label: string;
  children: ERPPermissionChild[];
}

export const ERP_PERMISSION_TREE: ERPPermissionSection[] = [
  { code: 'dashboard', label: 'Пункт управления', children: [] },
  { code: 'commercial', label: 'Коммерческие предложения', children: [
    { code: 'kanban', label: 'Канбан КП' },
    { code: 'tkp', label: 'ТКП' },
    { code: 'mp', label: 'МП' },
    { code: 'estimates', label: 'Сметы' },
  ]},
  { code: 'objects', label: 'Объекты', children: [] },
  { code: 'finance', label: 'Финансы', children: [
    { code: 'dashboard', label: 'Дашборд' },
    { code: 'payments', label: 'Платежи' },
    { code: 'statements', label: 'Выписки' },
    { code: 'recurring', label: 'Периодические платежи' },
    { code: 'debtors', label: 'Дебиторская задолженность' },
    { code: 'accounting', label: 'Бухгалтерия' },
    { code: 'budget', label: 'Расходный бюджет' },
    { code: 'indicators', label: 'Финансовые показатели' },
  ]},
  { code: 'contracts', label: 'Договоры', children: [
    { code: 'framework', label: 'Рамочные договоры' },
    { code: 'object_contracts', label: 'Договоры по объектам' },
    { code: 'estimates', label: 'Сметы' },
    { code: 'mounting_estimates', label: 'Монтажные сметы' },
    { code: 'acts', label: 'Акты' },
    { code: 'household', label: 'Хозяйственные договоры' },
  ]},
  { code: 'supply', label: 'Снабжение и Склад', children: [
    { code: 'kanban', label: 'Канбан снабжения' },
    { code: 'invoices', label: 'Счета на оплату' },
    { code: 'drivers', label: 'Календарь водителей' },
    { code: 'moderation', label: 'Модерация товаров' },
    { code: 'warehouse', label: 'Склад' },
  ]},
  { code: 'goods', label: 'Товары и услуги', children: [
    { code: 'categories', label: 'Категории' },
    { code: 'catalog', label: 'Номенклатура' },
    { code: 'moderation', label: 'Модерация' },
    { code: 'works', label: 'Каталог работ' },
    { code: 'pricelists', label: 'Прайс-листы' },
    { code: 'grades', label: 'Разряды монтажников' },
  ]},
  { code: 'pto', label: 'ПТО', children: [
    { code: 'projects', label: 'Проекты' },
    { code: 'production', label: 'Производственная документация' },
    { code: 'executive', label: 'Исполнительная документация' },
    { code: 'samples', label: 'Образцы документов' },
    { code: 'knowledge', label: 'Руководящие документы' },
  ]},
  { code: 'marketing', label: 'Маркетинг', children: [
    { code: 'kanban', label: 'Канбан поиска объектов' },
    { code: 'potential_customers', label: 'Потенциальные заказчики' },
    { code: 'executors', label: 'Поиск исполнителей' },
  ]},
  { code: 'communications', label: 'Переписка', children: [] },
  { code: 'settings', label: 'Справочники и настройки', children: [
    { code: 'work_conditions', label: 'Фронт работ и монтажные условия' },
    { code: 'personnel', label: 'Персонал' },
    { code: 'counterparties', label: 'Контрагенты' },
    { code: 'config', label: 'Настройки' },
  ]},
  { code: 'help', label: 'Справка', children: [] },
  { code: 'finance_approve', label: 'Одобрение платежей', children: [] },
  { code: 'supply_approve', label: 'Одобрение счетов', children: [] },
  { code: 'kanban_admin', label: 'Администрирование канбана', children: [] },
];

export type ERPPermissionLevel = 'none' | 'read' | 'edit';
export type ERPPermissions = Record<string, ERPPermissionLevel>;

export interface EmployeeBrief {
  id: number;
  full_name: string;
  current_position: string;
}

export interface PositionRecord {
  id: number;
  employee: number;
  legal_entity: number;
  legal_entity_name: string;
  position_title: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  order_number: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SalaryHistoryRecord {
  id: number;
  employee: number;
  salary_full: string;
  salary_official: string;
  effective_date: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  full_name: string;
  date_of_birth: string | null;
  gender: 'M' | 'F' | '';
  current_position: string;
  hire_date: string | null;
  salary_full: string;
  salary_official: string;
  is_active: boolean;
  current_legal_entities: Array<{
    id: number;
    short_name: string;
    position_title: string;
  }>;
  supervisors_brief: EmployeeBrief[];
  created_at: string;
  updated_at: string;
}

export interface EmployeeDetail extends Employee {
  responsibilities: string;
  bank_name: string;
  bank_bik: string;
  bank_corr_account: string;
  bank_account: string;
  bank_card_number: string;
  user: number | null;
  user_username: string | null;
  counterparty: number | null;
  counterparty_name: string | null;
  subordinates_brief: EmployeeBrief[];
  erp_permissions: ERPPermissions;
  positions: PositionRecord[];
  salary_history: SalaryHistoryRecord[];
}

export interface CreateEmployeeData {
  full_name: string;
  date_of_birth?: string | null;
  gender?: 'M' | 'F' | '';
  current_position?: string;
  hire_date?: string | null;
  salary_full?: number;
  salary_official?: number;
  responsibilities?: string;
  bank_name?: string;
  bank_bik?: string;
  bank_corr_account?: string;
  bank_account?: string;
  bank_card_number?: string;
  user?: number | null;
  counterparty?: number | null;
  supervisor_ids?: number[];
  erp_permissions?: ERPPermissions;
  is_active?: boolean;
}

export interface CreatePositionRecordData {
  legal_entity: number;
  position_title: string;
  start_date: string;
  end_date?: string | null;
  is_current?: boolean;
  order_number?: string;
  notes?: string;
}

export interface CreateSalaryRecordData {
  salary_full: number;
  salary_official: number;
  effective_date: string;
  reason?: string;
}

export interface OrgChartNode {
  id: number;
  full_name: string;
  current_position: string;
  is_active: boolean;
  legal_entities: Array<{
    id: number;
    short_name: string;
    position_title: string;
  }>;
}

export interface OrgChartEdge {
  source: number;
  target: number;
}

export interface OrgChartData {
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
}

// =========================================================================
// Banking Types
// =========================================================================

export interface BankConnection {
  id: number;
  name: string;
  legal_entity: number;
  legal_entity_name: string;
  provider: 'tochka';
  provider_display: string;
  payment_mode: 'for_sign' | 'auto_sign';
  payment_mode_display: string;
  customer_code: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

export interface CreateBankConnectionData {
  name: string;
  legal_entity: number;
  provider?: string;
  client_id: string;
  client_secret: string;
  customer_code: string;
  payment_mode?: 'for_sign' | 'auto_sign';
  is_active?: boolean;
}

export interface BankAccount {
  id: number;
  account: number;
  account_name: string;
  account_number: string;
  bank_connection: number;
  connection_name: string;
  external_account_id: string;
  last_statement_date: string | null;
  sync_enabled: boolean;
  created_at: string;
}

export interface CreateBankAccountData {
  account: number;
  bank_connection: number;
  external_account_id: string;
  sync_enabled?: boolean;
}

export interface BankTransaction {
  id: number;
  bank_account: number;
  bank_account_name: string;
  external_id: string;
  transaction_type: 'incoming' | 'outgoing';
  transaction_type_display: string;
  amount: string;
  date: string;
  purpose: string;
  counterparty_name: string;
  counterparty_inn: string;
  counterparty_kpp: string;
  counterparty_account: string;
  counterparty_bank_name: string;
  counterparty_bik: string;
  counterparty_corr_account: string;
  document_number: string;
  payment: number | null;
  reconciled: boolean;
  created_at: string;
}

export interface BankPaymentOrder {
  id: number;
  bank_account: number;
  bank_account_name: string;
  payment_registry: number | null;
  recipient_name: string;
  recipient_inn: string;
  recipient_kpp?: string;
  recipient_account?: string;
  recipient_bank_name?: string;
  recipient_bik?: string;
  recipient_corr_account?: string;
  amount: string;
  purpose: string;
  vat_info: string;
  payment_date: string;
  original_payment_date: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent_to_bank' | 'pending_sign' | 'executed' | 'rejected' | 'failed';
  status_display: string;
  created_by: number;
  created_by_username: string;
  approved_by: number | null;
  approved_by_username: string;
  approved_at: string | null;
  sent_at: string | null;
  executed_at: string | null;
  error_message: string;
  reschedule_count: number;
  can_reschedule: boolean;
  created_at: string;
}

export interface CreateBankPaymentOrderData {
  bank_account: number;
  payment_registry?: number;
  recipient_name: string;
  recipient_inn: string;
  recipient_kpp?: string;
  recipient_account: string;
  recipient_bank_name: string;
  recipient_bik: string;
  recipient_corr_account?: string;
  amount: string;
  purpose: string;
  vat_info?: string;
  payment_date: string;
}

export interface BankPaymentOrderEvent {
  id: number;
  order: number;
  event_type: 'created' | 'submitted' | 'approved' | 'rejected' | 'rescheduled' | 'sent_to_bank' | 'executed' | 'failed' | 'comment';
  event_type_display: string;
  user: number | null;
  username: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  comment: string;
  created_at: string;
}

