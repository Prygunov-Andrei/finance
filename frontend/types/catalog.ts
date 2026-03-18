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
  product_count: number;
  total_count: number;
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
  images: string[];
  booklet_url: string;
  manual_url: string;
  description: string;
  brand: string;
  series: string;
  tech_specs: Record<string, string>;
  source_payment?: number | null;
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
  invoice: number | null;
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

// Каталоги поставщиков
export type SupplierCatalogStatus =
  | 'uploaded'
  | 'detecting_toc'
  | 'toc_ready'
  | 'parsing'
  | 'parsed'
  | 'importing'
  | 'imported'
  | 'error';

export interface SupplierCatalogSection {
  name: string;
  pages: [number, number];
  category_code: string;
  is_new_category?: boolean;
  new_category_name?: string;
  new_category_code?: string;
  parent_category_code?: string;
}

export interface SupplierCatalog {
  id: number;
  name: string;
  supplier_name: string;
  pdf_file: string;
  pdf_url: string | null;
  json_file: string;
  json_url: string | null;
  status: SupplierCatalogStatus;
  status_display: string;
  total_pages: number;
  sections: SupplierCatalogSection[];
  current_section: number;
  total_sections: number;
  current_batch: number;
  total_batches: number;
  products_count: number;
  variants_count: number;
  imported_count: number;
  categories_created: number;
  errors: string[];
  error_message: string;
  task_id: string;
  created_at: string;
  updated_at: string;
}