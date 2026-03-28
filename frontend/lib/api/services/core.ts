import type { RequestFn } from './types';
import type {
  Account, AccountBalance, ConstructionObject, Counterparty,
  CounterpartyDuplicateGroup, CreateAccountData, CreateConstructionObjectData,
  CreateCounterpartyData, CreateLegalEntityData, LegalEntity, PaginatedResponse,
  TaxSystem,
} from '../types';
import type {
  FNSEnrichResponse, FNSQuickCheckResponse, FNSReport,
  FNSReportCreateResponse, FNSReportListItem, FNSStats, FNSSuggestResponse,
} from '../types';
import type { LLMProvider, LLMTaskConfig, ParseInvoiceResponse } from '../types';

const API_BASE_URL = '/api/erp';

export function createCoreService(request: RequestFn) {
  return {
    // Legal Entities
    async getLegalEntities() {
      const response = await request<PaginatedResponse<LegalEntity> | LegalEntity[]>('/legal-entities/');
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as LegalEntity[];
    },

    async createLegalEntity(data: CreateLegalEntityData) {
      return request<LegalEntity>('/legal-entities/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateLegalEntity(id: number, data: Partial<CreateLegalEntityData>) {
      return request<LegalEntity>(`/legal-entities/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteLegalEntity(id: number) {
      return request<void>(`/legal-entities/${id}/`, {
        method: 'DELETE',
      });
    },

    // Tax Systems
    async getTaxSystems() {
      const response = await request<PaginatedResponse<TaxSystem> | TaxSystem[]>('/tax-systems/');
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as TaxSystem[];
    },

    // Accounts
    async getAccounts(params?: { is_active?: boolean }) {
      const queryParams = new URLSearchParams();
      if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
      const queryString = queryParams.toString();
      const endpoint = `/accounts/${queryString ? `?${queryString}` : ''}`;
      const response = await request<PaginatedResponse<Account> | Account[]>(endpoint);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as Account[];
    },

    async createAccount(data: CreateAccountData) {
      return request<Account>('/accounts/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateAccount(id: number, data: Partial<CreateAccountData>) {
      return request<Account>(`/accounts/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteAccount(id: number) {
      return request<void>(`/accounts/${id}/`, {
        method: 'DELETE',
      });
    },

    async getAccountById(id: number) {
      return request<Account>(`/accounts/${id}/`);
    },

    async getAccountBalances(id: number) {
      const response = await request<AccountBalance[] | PaginatedResponse<AccountBalance>>(`/accounts/${id}/balances/?source=internal`);
      if (response && typeof response === 'object' && 'results' in response) return response.results;
      return response as AccountBalance[];
    },

    async getAccountBalancesHistory(id: number, source: 'internal' | 'bank_tochka' | 'all') {
      const response = await request<AccountBalance[] | PaginatedResponse<AccountBalance>>(`/accounts/${id}/balances/?source=${encodeURIComponent(source)}`);
      if (response && typeof response === 'object' && 'results' in response) return response.results;
      return response as AccountBalance[];
    },

    async fetchBankBalance(bankAccountId: number) {
      return request<{
        status: 'ok' | 'error';
        balance_date?: string;
        internal_balance?: string;
        bank_balance?: string;
        delta?: string;
        message?: string;
      }>(`/bank-accounts/${bankAccountId}/fetch-balance/`, { method: 'POST', body: JSON.stringify({}) });
    },

    // Counterparties
    async getCounterparties(params?: { search?: string; type?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.append('search', params.search);
      if (params?.type) queryParams.append('type', params.type);
      const queryString = queryParams.toString();
      const endpoint = `/counterparties/${queryString ? `?${queryString}` : ''}`;
      const response = await request<PaginatedResponse<Counterparty> | Counterparty[]>(endpoint);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as Counterparty[];
    },

    async getCounterpartiesPaginated(params?: { search?: string; type?: string; page?: number }) {
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.append('search', params.search);
      if (params?.type) queryParams.append('type', params.type);
      if (params?.page) queryParams.append('page', String(params.page));
      const queryString = queryParams.toString();
      const endpoint = `/counterparties/${queryString ? `?${queryString}` : ''}`;
      const response = await request<PaginatedResponse<Counterparty> | Counterparty[]>(endpoint);
      if (response && typeof response === 'object' && 'results' in response) {
        return response as PaginatedResponse<Counterparty>;
      }
      return { count: (response as Counterparty[]).length, next: null, previous: null, results: response as Counterparty[] };
    },

    async deleteCounterparties(ids: number[]) {
      return Promise.all(ids.map(id => this.deleteCounterparty(id)));
    },

    async getCounterpartyDuplicates(minSimilarity = 0.85) {
      return request<{
        groups: CounterpartyDuplicateGroup[];
        total_groups: number;
      }>(`/counterparties/duplicates/?min_similarity=${minSimilarity}`);
    },

    async mergeCounterparties(keepId: number, removeIds: number[]) {
      return request<{ merged: number; relations_moved: Record<string, number> }>(
        '/counterparties/merge/',
        { method: 'POST', body: JSON.stringify({ keep_id: keepId, remove_ids: removeIds }) },
      );
    },

    async validateCounterpartyInns(inns: string[]) {
      return request<{
        results: Record<string, { found: boolean; fns_name?: string; status?: string; error?: string }>;
      }>('/counterparties/validate-inns/', {
        method: 'POST',
        body: JSON.stringify({ inns }),
      });
    },

    async createCounterparty(data: CreateCounterpartyData) {
      return request<Counterparty>('/counterparties/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async getCounterparty(id: number) {
      return request<Counterparty>(`/counterparties/${id}/`);
    },

    async updateCounterparty(id: number, data: Partial<CreateCounterpartyData>) {
      return request<Counterparty>(`/counterparties/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteCounterparty(id: number) {
      return request<void>(`/counterparties/${id}/`, {
        method: 'DELETE',
      });
    },

    // ---- API-FNS ----

    async fnsSuggest(query: string): Promise<FNSSuggestResponse> {
      return request<FNSSuggestResponse>(`/fns/suggest/?q=${encodeURIComponent(query)}`);
    },

    async fnsCreateReports(counterpartyId: number, reportTypes: string[]): Promise<FNSReportCreateResponse> {
      return request<FNSReportCreateResponse>('/fns/reports/', {
        method: 'POST',
        body: JSON.stringify({
          counterparty_id: counterpartyId,
          report_types: reportTypes,
        }),
      });
    },

    async fnsGetReports(params?: { counterparty?: number; report_type?: string }): Promise<FNSReportListItem[]> {
      const queryParams = new URLSearchParams();
      if (params?.counterparty) queryParams.append('counterparty', String(params.counterparty));
      if (params?.report_type) queryParams.append('report_type', params.report_type);
      const queryString = queryParams.toString();
      const endpoint = `/fns/reports/list/${queryString ? `?${queryString}` : ''}`;
      const response = await request<PaginatedResponse<FNSReportListItem> | FNSReportListItem[]>(endpoint);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as FNSReportListItem[];
    },

    async fnsGetReport(id: number): Promise<FNSReport> {
      return request<FNSReport>(`/fns/reports/${id}/`);
    },

    async fnsGetStats(): Promise<FNSStats> {
      return request<FNSStats>('/fns/stats/');
    },

    async fnsQuickCheck(inn: string): Promise<FNSQuickCheckResponse> {
      return request<FNSQuickCheckResponse>('/fns/quick-check/', {
        method: 'POST',
        body: JSON.stringify({ inn }),
      });
    },

    async fnsEnrich(inn: string): Promise<FNSEnrichResponse> {
      return request<FNSEnrichResponse>(`/fns/enrich/?inn=${encodeURIComponent(inn)}`);
    },

    // Construction Objects
    async getConstructionObjects(filters?: { status?: string; search?: string }) {
      const queryParams = new URLSearchParams();
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.search) queryParams.append('search', filters.search);
      const queryString = queryParams.toString();
      const endpoint = `/objects/${queryString ? `?${queryString}` : ''}`;
      const response = await request<PaginatedResponse<ConstructionObject> | ConstructionObject[]>(endpoint);
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as ConstructionObject[];
    },

    async createConstructionObject(data: CreateConstructionObjectData) {
      return request<ConstructionObject>('/objects/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateConstructionObject(id: number, data: Partial<CreateConstructionObjectData>) {
      return request<ConstructionObject>(`/objects/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async deleteConstructionObject(id: number) {
      return request<void>(`/objects/${id}/`, {
        method: 'DELETE',
      });
    },

    async getConstructionObjectById(id: number) {
      return request<ConstructionObject>(`/objects/${id}/`);
    },

    async uploadObjectPhoto(id: number, photo: File): Promise<ConstructionObject> {
      const formData = new FormData();
      formData.append('photo', photo);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/objects/${id}/upload-photo/`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed: ${res.status}`);
      }
      return res.json();
    },

    async getObjectCashFlow(id: number, params?: { start_date?: string; end_date?: string }) {
      const queryParams = new URLSearchParams();
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      const queryString = queryParams.toString();
      const endpoint = `/objects/${id}/cash-flow/${queryString ? `?${queryString}` : ''}`;
      return request<Array<{ date: string; income: number; expense: number; net: number }>>(endpoint);
    },

    async getObjects(filters?: { status?: string; search?: string }) {
      return this.getConstructionObjects(filters);
    },

    // CBR Currency Rates
    async getCBRRates(): Promise<{ date: string; usd: string; eur: string; cny: string }> {
      return request('/cbr-rates/');
    },

    // LLM Providers
    async getLLMProviders() {
      const response = await request<PaginatedResponse<LLMProvider> | LLMProvider[]>('/llm-providers/');
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as LLMProvider[];
    },

    async setDefaultLLMProvider(id: number) {
      return request<LLMProvider>(`/llm-providers/${id}/set_default/`, {
        method: 'POST',
      });
    },

    async getLLMTaskConfigs() {
      const response = await request<PaginatedResponse<LLMTaskConfig> | LLMTaskConfig[]>('/llm-task-configs/');
      if (response && typeof response === 'object' && 'results' in response) {
        return response.results;
      }
      return response as LLMTaskConfig[];
    },

    async updateLLMTaskConfig(id: number, data: { provider?: number | null; is_enabled?: boolean }) {
      return request<LLMTaskConfig>(`/llm-task-configs/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    // Invoice Parsing
    async parseInvoice(file: File): Promise<ParseInvoiceResponse> {
      const formData = new FormData();
      formData.append('file', file);

      return request<ParseInvoiceResponse>('/llm/parse-invoice/', {
        method: 'POST',
        body: formData,
      });
    },

    // Object Geo update
    async updateObjectGeo(objectId: number, data: {
      latitude?: string;
      longitude?: string;
      geo_radius?: number;
      allow_geo_bypass?: boolean;
      registration_window_minutes?: number;
    }): Promise<ConstructionObject> {
      return request<ConstructionObject>(`/objects/${objectId}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
  };
}
