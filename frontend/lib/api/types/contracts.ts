import type { LegalEntity, Counterparty } from './core';
import type { PriceListList } from './pricelists';
import type { ActPaymentAllocation } from './payments';

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
  price_lists_details?: PriceListList[];
  file?: string;
  notes?: string;
  created_by: number;
  created_by_name: string;
  is_expired: boolean;
  days_until_expiration: number;
  total_contracts_amount: string;
  updated_at: string;
  legal_entity_details?: LegalEntity;
  counterparty_details?: Counterparty;
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
  contract_type_display?: string;
  total_amount: string;
  currency: 'RUB' | 'USD' | 'EUR' | 'CNY';
  contract_date: string;
  end_date?: string;
  date?: string;
  subject?: string;

  // Read-only имена
  counterparty_name: string;
  counterparty?: number;
  counterparty_display?: string;
  contract_number?: string;
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
  allocations?: ActPaymentAllocation[];
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
  material_markup_type: 'percent' | 'fixed_price' | 'fixed_amount' | null;
  material_markup_value: string | null;
  work_markup_type: 'percent' | 'fixed_price' | 'fixed_amount' | null;
  work_markup_value: string | null;
  material_sale_unit_price: string;
  work_sale_unit_price: string;
  material_purchase_total: string;
  work_purchase_total: string;
  material_sale_total: string;
  work_sale_total: string;
  effective_material_markup_percent: string;
  effective_work_markup_percent: string;
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
  material_markup_type: 'percent' | 'fixed_price' | 'fixed_amount' | null;
  material_markup_value: string | null;
  work_markup_type: 'percent' | 'fixed_price' | 'fixed_amount' | null;
  work_markup_value: string | null;
  material_sale_unit_price: string;
  work_sale_unit_price: string;
  material_purchase_total: string;
  work_purchase_total: string;
  material_sale_total: string;
  work_sale_total: string;
  effective_material_markup_percent: string;
  effective_work_markup_percent: string;
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
  material_markup_type?: string | null;
  material_markup_value?: string | null;
  work_markup_type?: string | null;
  work_markup_value?: string | null;
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

// Cash Flow
export interface CashFlowPeriodRow {
  period: string;
  income: number;
  expense: number;
  balance: number;
}

export interface CashFlowPeriodsResponse {
  periods: CashFlowPeriodRow[];
  total_income?: number;
  total_expense?: number;
  [key: string]: unknown;
}

export interface CashFlowResponse {
  [key: string]: unknown;
}
