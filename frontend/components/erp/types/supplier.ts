export interface SupplierIntegration {
  id: number;
  name: string;
  provider: 'breez';
  counterparty: number | null;
  counterparty_name: string | null;
  base_url: string;
  is_active: boolean;
  last_catalog_sync: string | null;
  last_stock_sync: string | null;
  products_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierProduct {
  id: number;
  external_id: number;
  nc_code: string;
  articul: string;
  title: string;
  description: string;
  brand_name: string | null;
  category_name: string | null;
  series: string;
  base_price: string | null;
  base_price_currency: string;
  ric_price: string | null;
  ric_price_currency: string;
  for_marketplace: boolean;
  images: string[];
  booklet_url: string;
  manual_url: string;
  tech_specs: Record<string, string>;
  product: number | null;
  product_name: string | null;
  stocks: SupplierStock[];
  total_stock: number;
  is_active: boolean;
  price_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierStock {
  warehouse_name: string;
  quantity: number;
}

export interface SupplierCategory {
  id: number;
  external_id: number;
  title: string;
  parent: number | null;
  parent_external_id: number | null;
  our_category: number | null;
  our_category_name: string | null;
}

export interface SupplierBrand {
  id: number;
  external_id: number;
  title: string;
  image_url: string;
  website_url: string;
}

export interface SupplierSyncLog {
  id: number;
  sync_type: 'catalog_full' | 'stock_sync';
  sync_type_display: string;
  status: 'started' | 'success' | 'partial' | 'failed';
  status_display: string;
  items_processed: number;
  items_created: number;
  items_updated: number;
  items_errors: number;
  error_details: string[];
  duration_seconds: number | null;
  created_at: string;
}

export interface SupplierSyncStatus {
  last_catalog_sync: SupplierSyncLog | null;
  last_stock_sync: SupplierSyncLog | null;
  products_count: number;
  categories_count: number;
  brands_count: number;
}
