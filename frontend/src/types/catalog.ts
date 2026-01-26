// Категории
export interface Category {
  id: number;
  name: string;
  code: string;
  parent: number | null;
  parent_name: string | null;
  full_path: string;
  description: string;
  level: number;
  sort_order: number;
  is_active: boolean;
  children_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryTreeNode {
  id: number;
  name: string;
  code: string;
  level: number;
  children: CategoryTreeNode[];
}

// Товары
export type ProductStatus = 'new' | 'verified' | 'merged' | 'archived';

export interface Product {
  id: number;
  name: string;
  normalized_name: string;
  category: number | null;
  category_name: string | null;
  category_path: string | null;
  default_unit: string;
  is_service: boolean;
  status: ProductStatus;
  status_display: string;
  merged_into: number | null;
  aliases: ProductAlias[];
  aliases_count: number;
  source_payment?: number | null; // Платёж, из которого создан товар (для новых товаров)
  created_at: string;
  updated_at: string;
}

export interface ProductAlias {
  id: number;
  alias_name: string;
  source_payment: number | null;
  created_at: string;
}

// Позиции платежа (из БД)
export interface PaymentItem {
  id: number;
  raw_name: string;
  product: number | null;
  product_name: string | null;
  product_category: string | null;
  quantity: string;
  unit: string;
  price_per_unit: string;
  amount: string;
  vat_amount: string | null;
  created_at: string;
}

export interface ProductPriceHistory {
  id: number;
  counterparty: number;
  counterparty_name: string;
  price: string;
  unit: string;
  invoice_date: string;
  invoice_number: string;
  payment: number | null;
  created_at: string;
}

export interface ProductDuplicate {
  product: {
    id: number;
    name: string;
  };
  similar: Array<{
    id: number;
    name: string;
    score: number;
  }>;
}

// Объединение
export interface MergeProductsPayload {
  source_ids: number[];
  target_id: number;
}