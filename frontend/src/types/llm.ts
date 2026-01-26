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
  date: string;
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
  confidence: number;
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
