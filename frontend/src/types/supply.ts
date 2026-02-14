// =============================================================================
// Supply Module Types
// =============================================================================

// --- BitrixIntegration ---
export interface BitrixIntegration {
  id: number;
  name: string;
  portal_url: string;
  webhook_url?: string;
  outgoing_webhook_token?: string;
  target_category_id: number;
  target_stage_id: string;
  contract_field_mapping: string;
  object_field_mapping: string;
  is_active: boolean;
  created_at: string;
}

// --- SupplyRequest ---
export type SupplyRequestStatus = 'received' | 'processing' | 'completed' | 'error';

export interface SupplyRequest {
  id: number;
  bitrix_integration: number;
  bitrix_deal_id: number;
  bitrix_deal_title: string;
  object: number | null;
  object_name: string | null;
  contract: number | null;
  contract_number: string | null;
  operator: number | null;
  operator_name: string | null;
  request_text: string;
  request_file: string | null;
  notes: string;
  amount: string | null;
  status: SupplyRequestStatus;
  mapping_errors: Record<string, string>;
  raw_deal_data?: Record<string, unknown>;
  raw_comments_data?: unknown[];
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  invoices_count: number;
}

// --- Invoice ---
export type InvoiceSource = 'bitrix' | 'manual' | 'recurring';
export type InvoiceStatus =
  | 'recognition'
  | 'review'
  | 'in_registry'
  | 'approved'
  | 'sending'
  | 'paid'
  | 'cancelled';

export interface InvoiceItem {
  id: number;
  raw_name: string;
  product: number | null;
  product_name: string | null;
  quantity: string;
  unit: string;
  price_per_unit: string;
  amount: string;
  vat_amount: string | null;
}

export interface InvoiceEvent {
  id: number;
  event_type: string;
  user: number | null;
  user_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  comment: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  source: InvoiceSource;
  source_display: string;
  status: InvoiceStatus;
  status_display: string;
  invoice_file: string | null;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  counterparty: number | null;
  counterparty_name: string | null;
  object: number | null;
  object_name: string | null;
  contract: number | null;
  contract_number: string | null;
  category: number | null;
  category_name: string | null;
  account: number | null;
  account_name: string | null;
  legal_entity: number | null;
  legal_entity_name: string | null;
  amount_gross: string | null;
  amount_net: string | null;
  vat_amount: string | null;
  supply_request: number | null;
  recurring_payment: number | null;
  bank_payment_order: number | null;
  description: string;
  comment: string;
  recognition_confidence: number | null;
  created_by: number | null;
  created_by_name: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  paid_at: string | null;
  is_overdue: boolean;
  items: InvoiceItem[];
  events: InvoiceEvent[];
  created_at: string;
  updated_at: string;
}

// --- RecurringPayment ---
export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringPayment {
  id: number;
  name: string;
  counterparty: number;
  counterparty_name: string | null;
  category: number;
  category_name: string | null;
  account: number;
  account_name: string | null;
  contract: number | null;
  object: number | null;
  legal_entity: number;
  amount: string;
  amount_is_fixed: boolean;
  frequency: RecurringFrequency;
  frequency_display: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  next_generation_date: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- IncomeRecord ---
export interface IncomeRecord {
  id: number;
  account: number;
  account_name: string | null;
  contract: number | null;
  category: number;
  category_name: string | null;
  legal_entity: number;
  counterparty: number | null;
  counterparty_name: string | null;
  amount: string;
  payment_date: string;
  description: string;
  scan_file: string | null;
  created_at: string;
  updated_at: string;
}

// --- Dashboard ---
export interface AccountBalanceInfo {
  id: number;
  name: string;
  number: string;
  currency: string;
  internal_balance: string;
  bank_balance: string | null;
  bank_balance_date: string | null;
}

export interface RegistrySummary {
  total_amount: string;
  total_count: number;
  overdue_amount: string;
  overdue_count: number;
  today_amount: string;
  today_count: number;
  this_week_amount: string;
  this_week_count: number;
  this_month_amount: string;
  this_month_count: number;
}

export interface DashboardData {
  account_balances: AccountBalanceInfo[];
  registry_summary: RegistrySummary;
  by_object: Array<{
    object__id: number | null;
    object__name: string | null;
    total: string;
    count: number;
  }>;
  by_category: Array<{
    category__id: number | null;
    category__name: string | null;
    total: string;
    count: number;
  }>;
}

// --- Notification ---
export interface AppNotification {
  id: number;
  notification_type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}
