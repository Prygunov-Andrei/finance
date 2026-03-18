import { ApiClient } from './client';
import type { PaginatedResponse } from './types';

declare module './client' {
  interface ApiClient {
    getNotifications(): Promise<any[]>;
    getUnreadNotificationCount(): Promise<{ count: number }>;
    markNotificationRead(id: number): Promise<any>;
    markAllNotificationsRead(): Promise<any>;
    getSupplyRequests(params?: string): Promise<PaginatedResponse<any>>;
    getSupplyRequest(id: number): Promise<any>;
    updateSupplyRequest(id: number, data: any): Promise<any>;
    getBitrixIntegrations(): Promise<any[]>;
    getBitrixIntegration(id: number): Promise<any>;
    createBitrixIntegration(data: any): Promise<any>;
    updateBitrixIntegration(id: number, data: any): Promise<any>;
    deleteBitrixIntegration(id: number): Promise<void>;
    getInvoices(params?: string): Promise<PaginatedResponse<any>>;
    getInvoice(id: number): Promise<any>;
    createInvoice(formData: FormData): Promise<any>;
    updateInvoice(id: number, data: any): Promise<any>;
    verifyInvoice(id: number): Promise<any>;
    submitInvoiceToRegistry(id: number): Promise<any>;
    approveInvoice(id: number, comment?: string): Promise<any>;
    rejectInvoice(id: number, comment: string): Promise<any>;
    rescheduleInvoice(id: number, newDate: string, comment: string): Promise<any>;
    markCashPaid(id: number): Promise<any>;
    getInvoiceDashboard(): Promise<any>;
    bulkUploadInvoices(formData: FormData): Promise<any>;
    getBulkSessionStatus(sessionId: number): Promise<any>;
    createInvoiceItem(data: { invoice: number; raw_name: string; quantity: string; unit: string; price_per_unit: string; amount: string }): Promise<any>;
    updateInvoiceItem(id: number, data: Record<string, any>): Promise<any>;
    deleteInvoiceItem(id: number): Promise<void>;
    deleteInvoice(id: number): Promise<void>;
    getRecurringPayments(params?: string): Promise<PaginatedResponse<any>>;
    getRecurringPayment(id: number): Promise<any>;
    createRecurringPayment(data: any): Promise<any>;
    updateRecurringPayment(id: number, data: any): Promise<any>;
    deleteRecurringPayment(id: number): Promise<void>;
    getIncomeRecords(params?: string): Promise<PaginatedResponse<any>>;
    createIncomeRecord(data: any): Promise<any>;
    updateIncomeRecord(id: number, data: any): Promise<any>;
    deleteIncomeRecord(id: number): Promise<void>;
    getSupplierIntegrations(): Promise<PaginatedResponse<any>>;
    getSupplierIntegration(id: number): Promise<any>;
    createSupplierIntegration(data: any): Promise<any>;
    updateSupplierIntegration(id: number, data: any): Promise<any>;
    deleteSupplierIntegration(id: number): Promise<void>;
    syncSupplierCatalog(id: number): Promise<any>;
    syncSupplierStock(id: number): Promise<any>;
    getSupplierSyncStatus(id: number): Promise<any>;
    getSupplierProducts(params?: string): Promise<PaginatedResponse<any>>;
    getSupplierProduct(id: number): Promise<any>;
    linkSupplierProduct(id: number, productId: number): Promise<any>;
    getSupplierCategories(params?: string): Promise<PaginatedResponse<any>>;
    updateSupplierCategoryMapping(id: number, ourCategoryId: number | null): Promise<any>;
    getSupplierBrands(params?: string): Promise<PaginatedResponse<any>>;
    getSupplierSyncLogs(params?: string): Promise<PaginatedResponse<any>>;
    getPortalRequests(params?: string): Promise<any[]>;
    getPortalRequestDetail(id: number): Promise<any>;
    approvePortalRequest(id: number): Promise<any>;
    rejectPortalRequest(id: number, reason?: string): Promise<any>;
    getPortalConfig(): Promise<any>;
    updatePortalConfig(data: any): Promise<any>;
    getPortalPricing(): Promise<any[]>;
    createPortalPricing(data: any): Promise<any>;
    updatePortalPricing(id: number, data: any): Promise<any>;
    deletePortalPricing(id: number): Promise<void>;
    getPortalCallbacks(params?: string): Promise<any[]>;
    updateCallbackStatus(id: number, status: string): Promise<any>;
    getPortalStats(): Promise<any>;
  }
}

// =============================================================================
// Supply Module — API methods (added to ApiClient)
// =============================================================================

// --- Notifications ---
ApiClient.prototype.getNotifications = async function (this: ApiClient) {
  return this.request<any[]>('/notifications/');
};
ApiClient.prototype.getUnreadNotificationCount = async function (this: ApiClient) {
  return this.request<{ count: number }>('/notifications/unread_count/');
};
ApiClient.prototype.markNotificationRead = async function (this: ApiClient, id: number) {
  return this.request<any>(`/notifications/${id}/mark_read/`, { method: 'POST' });
};
ApiClient.prototype.markAllNotificationsRead = async function (this: ApiClient) {
  return this.request<any>('/notifications/mark_all_read/', { method: 'POST' });
};

// --- Supply Requests ---
ApiClient.prototype.getSupplyRequests = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/supply-requests/${params ? '?' + params : ''}`);
};
ApiClient.prototype.getSupplyRequest = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supply-requests/${id}/`);
};
ApiClient.prototype.updateSupplyRequest = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/supply-requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};

// --- Bitrix Integrations ---
ApiClient.prototype.getBitrixIntegrations = async function (this: ApiClient) {
  return this.request<any[]>('/bitrix-integrations/');
};
ApiClient.prototype.getBitrixIntegration = async function (this: ApiClient, id: number) {
  return this.request<any>(`/bitrix-integrations/${id}/`);
};
ApiClient.prototype.createBitrixIntegration = async function (this: ApiClient, data: any) {
  return this.request<any>('/bitrix-integrations/', { method: 'POST', body: JSON.stringify(data) });
};
ApiClient.prototype.updateBitrixIntegration = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/bitrix-integrations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.deleteBitrixIntegration = async function (this: ApiClient, id: number) {
  return this.request<void>(`/bitrix-integrations/${id}/`, { method: 'DELETE' });
};

// --- Invoices ---
ApiClient.prototype.getInvoices = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/invoices/${params ? '?' + params : ''}`);
};
ApiClient.prototype.getInvoice = async function (this: ApiClient, id: number) {
  return this.request<any>(`/invoices/${id}/`);
};
ApiClient.prototype.createInvoice = async function (this: ApiClient, formData: FormData) {
  return this.request<any>('/invoices/', {
    method: 'POST',
    body: formData,
    headers: {},  // Let browser set Content-Type for FormData
  });
};
ApiClient.prototype.updateInvoice = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/invoices/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.verifyInvoice = async function (this: ApiClient, id: number) {
  return this.request<any>(`/invoices/${id}/verify/`, { method: 'POST' });
};
ApiClient.prototype.submitInvoiceToRegistry = async function (this: ApiClient, id: number) {
  return this.request<any>(`/invoices/${id}/submit_to_registry/`, { method: 'POST' });
};
ApiClient.prototype.approveInvoice = async function (this: ApiClient, id: number, comment?: string) {
  return this.request<any>(`/invoices/${id}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ comment: comment || '' }),
  });
};
ApiClient.prototype.rejectInvoice = async function (this: ApiClient, id: number, comment: string) {
  return this.request<any>(`/invoices/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
};
ApiClient.prototype.rescheduleInvoice = async function (this: ApiClient, id: number, newDate: string, comment: string) {
  return this.request<any>(`/invoices/${id}/reschedule/`, {
    method: 'POST',
    body: JSON.stringify({ new_date: newDate, comment }),
  });
};
ApiClient.prototype.markCashPaid = async function (this: ApiClient, id: number) {
  return this.request<any>(`/invoices/${id}/mark-cash-paid/`, { method: 'POST' });
};
ApiClient.prototype.getInvoiceDashboard = async function (this: ApiClient) {
  return this.request<any>('/invoices/dashboard/');
};
ApiClient.prototype.bulkUploadInvoices = async function (this: ApiClient, formData: FormData) {
  return this.request<any>('/invoices/bulk-upload/', {
    method: 'POST',
    body: formData,
    headers: {},  // Let browser set Content-Type for FormData
  });
};
ApiClient.prototype.getBulkSessionStatus = async function (this: ApiClient, sessionId: number) {
  return this.request<any>(`/invoices/bulk-sessions/${sessionId}/`);
};

// --- InvoiceItem CRUD ---
ApiClient.prototype.createInvoiceItem = async function (this: ApiClient, data: { invoice: number; raw_name: string; quantity: string; unit: string; price_per_unit: string; amount: string }) {
  return this.request<any>('/invoice-items/', { method: 'POST', body: JSON.stringify(data) });
};
ApiClient.prototype.updateInvoiceItem = async function (this: ApiClient, id: number, data: Record<string, any>) {
  return this.request<any>(`/invoice-items/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.deleteInvoiceItem = async function (this: ApiClient, id: number) {
  return this.request<void>(`/invoice-items/${id}/`, { method: 'DELETE' });
};
ApiClient.prototype.deleteInvoice = async function (this: ApiClient, id: number) {
  return this.request<void>(`/invoices/${id}/`, { method: 'DELETE' });
};

// --- Recurring Payments ---
ApiClient.prototype.getRecurringPayments = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/recurring-payments/${params ? '?' + params : ''}`);
};
ApiClient.prototype.getRecurringPayment = async function (this: ApiClient, id: number) {
  return this.request<any>(`/recurring-payments/${id}/`);
};
ApiClient.prototype.createRecurringPayment = async function (this: ApiClient, data: any) {
  return this.request<any>('/recurring-payments/', { method: 'POST', body: JSON.stringify(data) });
};
ApiClient.prototype.updateRecurringPayment = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/recurring-payments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.deleteRecurringPayment = async function (this: ApiClient, id: number) {
  return this.request<void>(`/recurring-payments/${id}/`, { method: 'DELETE' });
};

// --- Income Records ---
ApiClient.prototype.getIncomeRecords = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/income-records/${params ? '?' + params : ''}`);
};
ApiClient.prototype.createIncomeRecord = async function (this: ApiClient, data: any) {
  return this.request<any>('/income-records/', { method: 'POST', body: JSON.stringify(data) });
};
ApiClient.prototype.updateIncomeRecord = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/income-records/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.deleteIncomeRecord = async function (this: ApiClient, id: number) {
  return this.request<void>(`/income-records/${id}/`, { method: 'DELETE' });
};

// --- Supplier Integrations ---
ApiClient.prototype.getSupplierIntegrations = async function (this: ApiClient) {
  return this.request<PaginatedResponse<any>>('/supplier-integrations/');
};
ApiClient.prototype.getSupplierIntegration = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supplier-integrations/${id}/`);
};
ApiClient.prototype.createSupplierIntegration = async function (this: ApiClient, data: any) {
  return this.request<any>('/supplier-integrations/', { method: 'POST', body: JSON.stringify(data) });
};
ApiClient.prototype.updateSupplierIntegration = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/supplier-integrations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
};
ApiClient.prototype.deleteSupplierIntegration = async function (this: ApiClient, id: number) {
  return this.request<void>(`/supplier-integrations/${id}/`, { method: 'DELETE' });
};
ApiClient.prototype.syncSupplierCatalog = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supplier-integrations/${id}/sync-catalog/`, { method: 'POST' });
};
ApiClient.prototype.syncSupplierStock = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supplier-integrations/${id}/sync-stock/`, { method: 'POST' });
};
ApiClient.prototype.getSupplierSyncStatus = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supplier-integrations/${id}/status/`);
};

// --- Supplier Products ---
ApiClient.prototype.getSupplierProducts = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/supplier-products/${params ? '?' + params : ''}`);
};
ApiClient.prototype.getSupplierProduct = async function (this: ApiClient, id: number) {
  return this.request<any>(`/supplier-products/${id}/`);
};
ApiClient.prototype.linkSupplierProduct = async function (this: ApiClient, id: number, productId: number) {
  return this.request<any>(`/supplier-products/${id}/link/`, { method: 'POST', body: JSON.stringify({ product_id: productId }) });
};

// --- Supplier Categories ---
ApiClient.prototype.getSupplierCategories = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/supplier-categories/${params ? '?' + params : ''}`);
};
ApiClient.prototype.updateSupplierCategoryMapping = async function (this: ApiClient, id: number, ourCategoryId: number | null) {
  return this.request<any>(`/supplier-categories/${id}/`, { method: 'PATCH', body: JSON.stringify({ our_category: ourCategoryId }) });
};

// --- Supplier Brands ---
ApiClient.prototype.getSupplierBrands = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/supplier-brands/${params ? '?' + params : ''}`);
};

// --- Supplier Sync Logs ---
ApiClient.prototype.getSupplierSyncLogs = async function (this: ApiClient, params?: string) {
  return this.request<PaginatedResponse<any>>(`/supplier-sync-logs/${params ? '?' + params : ''}`);
};

// =========================================================================
// Portal Admin API (Заход 6 — управление публичными запросами смет)
// =========================================================================

ApiClient.prototype.getPortalRequests = async function (this: ApiClient, params?: string) {
  return this.request<any[]>(`/portal/requests/${params ? '?' + params : ''}`);
};

ApiClient.prototype.getPortalRequestDetail = async function (this: ApiClient, id: number) {
  return this.request<any>(`/portal/requests/${id}/`);
};

ApiClient.prototype.approvePortalRequest = async function (this: ApiClient, id: number) {
  return this.request<any>(`/portal/requests/${id}/approve/`, { method: 'POST' });
};

ApiClient.prototype.rejectPortalRequest = async function (this: ApiClient, id: number, reason?: string) {
  return this.request<any>(`/portal/requests/${id}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  });
};

ApiClient.prototype.getPortalConfig = async function (this: ApiClient) {
  return this.request<any>(`/portal/config/`);
};

ApiClient.prototype.updatePortalConfig = async function (this: ApiClient, data: any) {
  return this.request<any>(`/portal/config/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

ApiClient.prototype.getPortalPricing = async function (this: ApiClient) {
  return this.request<any[]>(`/portal/pricing/`);
};

ApiClient.prototype.createPortalPricing = async function (this: ApiClient, data: any) {
  return this.request<any>(`/portal/pricing/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

ApiClient.prototype.updatePortalPricing = async function (this: ApiClient, id: number, data: any) {
  return this.request<any>(`/portal/pricing/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

ApiClient.prototype.deletePortalPricing = async function (this: ApiClient, id: number) {
  return this.request<void>(`/portal/pricing/${id}/`, { method: 'DELETE' });
};

ApiClient.prototype.getPortalCallbacks = async function (this: ApiClient, params?: string) {
  return this.request<any[]>(`/portal/callbacks/${params ? '?' + params : ''}`);
};

ApiClient.prototype.updateCallbackStatus = async function (this: ApiClient, id: number, status: string) {
  return this.request<any>(`/portal/callbacks/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
};

ApiClient.prototype.getPortalStats = async function (this: ApiClient) {
  return this.request<any>(`/portal/stats/`);
};

