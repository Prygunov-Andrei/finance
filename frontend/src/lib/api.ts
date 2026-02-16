import { PaymentItem } from '../types/catalog';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  private getAuthHeader(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private subscribeTokenRefresh(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach(cb => cb(token));
    this.refreshSubscribers = [];
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Определяем заголовки
    const headers: HeadersInit = {
      ...this.getAuthHeader(),
      ...options.headers,
    };

    // Добавляем Content-Type только если body не FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError) {
      throw new Error(`Сетевая ошибка: ${networkError instanceof Error ? networkError.message : 'Неизвестная ошибка'}. Проверьте подключение к серверу ${API_BASE_URL}`);
    }

    if (response.status === 401) {
      // Если уже идет обновление токена, ждем его завершения
      if (this.isRefreshing) {
        return new Promise((resolve, reject) => {
          this.subscribeTokenRefresh((token: string) => {
            // Повторяем запрос с новым токеном
            this.request<T>(endpoint, options).then(resolve).catch(reject);
          });
        });
      }

      this.isRefreshing = true;
      
      const refreshed = await this.refreshToken();
      
      this.isRefreshing = false;
      
      if (refreshed) {
        const newToken = localStorage.getItem('access_token') || '';
        this.onTokenRefreshed(newToken);
        return this.request(endpoint, options);
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
    }

    if (!response.ok) {
      let error;
      
      try {
        const text = await response.text();
        
        if (text) {
          try {
            error = JSON.parse(text);
          } catch (e) {
            error = { detail: text || 'Unknown error' };
          }
        } else {
          error = { detail: `HTTP ${response.status}: ${response.statusText}` };
        }
      } catch (e) {
        error = { detail: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      let errorMessage = '';
      if (typeof error === 'object' && error !== null) {
        const errors = Object.entries(error).map(([field, messages]) => {
          const msgArray = Array.isArray(messages) ? messages : [messages];
          return `${field}: ${msgArray.join(', ')}`;
        });
        errorMessage = errors.join('; ');
      } else if (error.detail) {
        errorMessage = error.detail;
      } else if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage = 'API Error';
      }
      
      throw new Error(errorMessage);
    }

    // Для DELETE запросов или пустых ответов (204 No Content) не пытаемся парсить JSON
    if (response.status === 204 || options.method === 'DELETE') {
      return undefined as T;
    }

    // Проверяем, есть ли содержимое в ответе
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    }
    
    // Если нет JSON, возвращаем пустой объект
    return undefined as T;
  }

  // Auth
  async login(username: string, password: string) {
    const body = { username, password };
    
    const response = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Неверные учётные данные');
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    return data;
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem('access_token', data.access);
      return true;
    } catch {
      return false;
    }
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  async getCurrentUser() {
    return this.request('/users/me/');
  }

  async getUsers() {
    const response = await this.request<PaginatedResponse<any> | any[]>('/users/');
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as any[], count: (response as any[]).length };
  }

  // Legal Entities
  async getLegalEntities() {
    const response = await this.request<PaginatedResponse<LegalEntity> | LegalEntity[]>('/legal-entities/');
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as LegalEntity[];
  }

  async createLegalEntity(data: CreateLegalEntityData) {
    return this.request<LegalEntity>('/legal-entities/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLegalEntity(id: number, data: Partial<CreateLegalEntityData>) {
    return this.request<LegalEntity>(`/legal-entities/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteLegalEntity(id: number) {
    return this.request<void>(`/legal-entities/${id}/`, {
      method: 'DELETE',
    });
  }

  // Tax Systems
  async getTaxSystems() {
    const response = await this.request<PaginatedResponse<TaxSystem> | TaxSystem[]>('/tax-systems/');
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as TaxSystem[];
  }

  // Accounts
  async getAccounts(params?: { is_active?: boolean }) {
    const queryParams = new URLSearchParams();
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
    const queryString = queryParams.toString();
    const endpoint = `/accounts/${queryString ? `?${queryString}` : ''}`;
    const response = await this.request<PaginatedResponse<Account> | Account[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as Account[];
  }

  async createAccount(data: CreateAccountData) {
    return this.request<Account>('/accounts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAccount(id: number, data: Partial<CreateAccountData>) {
    return this.request<Account>(`/accounts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(id: number) {
    return this.request<void>(`/accounts/${id}/`, {
      method: 'DELETE',
    });
  }

  async getAccountById(id: number) {
    return this.request<Account>(`/accounts/${id}/`);
  }

  async getAccountBalances(id: number) {
    // История остатков (по умолчанию internal)
    const response = await this.request<AccountBalance[] | PaginatedResponse<AccountBalance>>(`/accounts/${id}/balances/?source=internal`);
    if (response && typeof response === 'object' && 'results' in response) return response.results;
    return response as AccountBalance[];
  }

  async getAccountBalancesHistory(id: number, source: 'internal' | 'bank_tochka' | 'all') {
    const response = await this.request<AccountBalance[] | PaginatedResponse<AccountBalance>>(`/accounts/${id}/balances/?source=${encodeURIComponent(source)}`);
    if (response && typeof response === 'object' && 'results' in response) return response.results;
    return response as AccountBalance[];
  }

  async fetchBankBalance(bankAccountId: number) {
    return this.request<{
      status: 'ok' | 'error';
      balance_date?: string;
      internal_balance?: string;
      bank_balance?: string;
      delta?: string;
      message?: string;
    }>(`/bank-accounts/${bankAccountId}/fetch-balance/`, { method: 'POST', body: JSON.stringify({}) });
  }

  // Counterparties
  async getCounterparties(params?: { search?: string; type?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.type) queryParams.append('type', params.type);
    const queryString = queryParams.toString();
    const endpoint = `/counterparties/${queryString ? `?${queryString}` : ''}`;
    const response = await this.request<PaginatedResponse<Counterparty> | Counterparty[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as Counterparty[];
  }

  async createCounterparty(data: CreateCounterpartyData) {
    return this.request<Counterparty>('/counterparties/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCounterparty(id: number, data: Partial<CreateCounterpartyData>) {
    return this.request<Counterparty>(`/counterparties/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCounterparty(id: number) {
    return this.request<void>(`/counterparties/${id}/`, {
      method: 'DELETE',
    });
  }

  // ─── API-FNS ────────────────────────────────────────────────────

  async fnsSuggest(query: string): Promise<FNSSuggestResponse> {
    return this.request<FNSSuggestResponse>(`/fns/suggest/?q=${encodeURIComponent(query)}`);
  }

  async fnsCreateReports(counterpartyId: number, reportTypes: string[]): Promise<FNSReportCreateResponse> {
    return this.request<FNSReportCreateResponse>('/fns/reports/', {
      method: 'POST',
      body: JSON.stringify({
        counterparty_id: counterpartyId,
        report_types: reportTypes,
      }),
    });
  }

  async fnsGetReports(params?: { counterparty?: number; report_type?: string }): Promise<FNSReportListItem[]> {
    const queryParams = new URLSearchParams();
    if (params?.counterparty) queryParams.append('counterparty', String(params.counterparty));
    if (params?.report_type) queryParams.append('report_type', params.report_type);
    const queryString = queryParams.toString();
    const endpoint = `/fns/reports/list/${queryString ? `?${queryString}` : ''}`;
    const response = await this.request<PaginatedResponse<FNSReportListItem> | FNSReportListItem[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as FNSReportListItem[];
  }

  async fnsGetReport(id: number): Promise<FNSReport> {
    return this.request<FNSReport>(`/fns/reports/${id}/`);
  }

  async fnsGetStats(): Promise<FNSStats> {
    return this.request<FNSStats>('/fns/stats/');
  }

  async fnsQuickCheck(inn: string): Promise<FNSQuickCheckResponse> {
    return this.request<FNSQuickCheckResponse>('/fns/quick-check/', {
      method: 'POST',
      body: JSON.stringify({ inn }),
    });
  }

  async fnsEnrich(inn: string): Promise<FNSEnrichResponse> {
    return this.request<FNSEnrichResponse>(`/fns/enrich/?inn=${encodeURIComponent(inn)}`);
  }

  // Construction Objects
  async getConstructionObjects(filters?: { status?: string; search?: string }) {
    const queryParams = new URLSearchParams();
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.search) queryParams.append('search', filters.search);
    const queryString = queryParams.toString();
    const endpoint = `/objects/${queryString ? `?${queryString}` : ''}`;
    const response = await this.request<PaginatedResponse<ConstructionObject> | ConstructionObject[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as ConstructionObject[];
  }

  async createConstructionObject(data: CreateConstructionObjectData) {
    return this.request<ConstructionObject>('/objects/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateConstructionObject(id: number, data: Partial<CreateConstructionObjectData>) {
    return this.request<ConstructionObject>(`/objects/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteConstructionObject(id: number) {
    return this.request<void>(`/objects/${id}/`, {
      method: 'DELETE',
    });
  }

  async getConstructionObjectById(id: number) {
    return this.request<ConstructionObject>(`/objects/${id}/`);
  }

  async getObjectCashFlow(id: number, params?: { start_date?: string; end_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    const queryString = queryParams.toString();
    const endpoint = `/objects/${id}/cash-flow/${queryString ? `?${queryString}` : ''}`;
    return this.request<Array<{ date: string; income: number; expense: number; net: number }>>(endpoint);
  }

  // Алиас для getConstructionObjects (для совместимости)
  async getObjects(filters?: { status?: string; search?: string }) {
    return this.getConstructionObjects(filters);
  }

  // Framework Contracts (Рамочные договоры)
  async getFrameworkContracts(params?: {
    counterparty?: number;
    legal_entity?: number;
    status?: FrameworkContractStatus;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.counterparty) queryParams.append('counterparty', params.counterparty.toString());
    if (params?.legal_entity) queryParams.append('legal_entity', params.legal_entity.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/framework-contracts/?${queryString}` : '/framework-contracts/';
    
    const response = await this.request<PaginatedResponse<FrameworkContractListItem> | FrameworkContractListItem[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as FrameworkContractListItem[], count: (response as FrameworkContractListItem[]).length };
  }

  async getFrameworkContract(id: number) {
    return this.request<FrameworkContractDetail>(`/framework-contracts/${id}/`);
  }

  async createFrameworkContract(data: CreateFrameworkContractData) {
    // Если есть файл, используем FormData
    if (data.file) {
      const formData = new FormData();
      if (data.number) formData.append('number', data.number);
      formData.append('name', data.name);
      formData.append('date', data.date);
      formData.append('valid_from', data.valid_from);
      formData.append('valid_until', data.valid_until);
      formData.append('legal_entity', data.legal_entity.toString());
      formData.append('counterparty', data.counterparty.toString());
      if (data.status) formData.append('status', data.status);
      if (data.notes) formData.append('notes', data.notes);
      if (data.price_lists) {
        data.price_lists.forEach(id => formData.append('price_lists', id.toString()));
      }
      formData.append('file', data.file);

      return this.request<FrameworkContractDetail>('/framework-contracts/', {
        method: 'POST',
        body: formData,
      });
    }

    // Если файла нет, используем о��ычный JSON
    return this.request<FrameworkContractDetail>('/framework-contracts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFrameworkContract(id: number, data: UpdateFrameworkContractData) {
    // Если есть файл, используем FormData
    if (data.file) {
      const formData = new FormData();
      if (data.number !== undefined) formData.append('number', data.number);
      if (data.name) formData.append('name', data.name);
      if (data.date) formData.append('date', data.date);
      if (data.valid_from) formData.append('valid_from', data.valid_from);
      if (data.valid_until) formData.append('valid_until', data.valid_until);
      if (data.legal_entity) formData.append('legal_entity', data.legal_entity.toString());
      if (data.counterparty) formData.append('counterparty', data.counterparty.toString());
      if (data.status) formData.append('status', data.status);
      if (data.notes !== undefined) formData.append('notes', data.notes);
      if (data.price_lists) {
        data.price_lists.forEach(id => formData.append('price_lists', id.toString()));
      }
      formData.append('file', data.file);

      return this.request<FrameworkContractDetail>(`/framework-contracts/${id}/`, {
        method: 'PATCH',
        body: formData,
      });
    }

    return this.request<FrameworkContractDetail>(`/framework-contracts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFrameworkContract(id: number) {
    return this.request<void>(`/framework-contracts/${id}/`, {
      method: 'DELETE',
    });
  }

  async getFrameworkContractContracts(id: number) {
    return this.request<ContractListItem[]>(`/framework-contracts/${id}/contracts/`);
  }

  async addPriceListsToFrameworkContract(id: number, priceListIds: number[]) {
    return this.request<{ status: string }>(`/framework-contracts/${id}/add_price_lists/`, {
      method: 'POST',
      body: JSON.stringify({ price_list_ids: priceListIds }),
    });
  }

  async removePriceListsFromFrameworkContract(id: number, priceListIds: number[]) {
    return this.request<{ status: string }>(`/framework-contracts/${id}/remove_price_lists/`, {
      method: 'POST',
      body: JSON.stringify({ price_list_ids: priceListIds }),
    });
  }

  async activateFrameworkContract(id: number) {
    return this.request<{ status: string }>(`/framework-contracts/${id}/activate/`, {
      method: 'POST',
    });
  }

  async terminateFrameworkContract(id: number) {
    return this.request<{ status: string }>(`/framework-contracts/${id}/terminate/`, {
      method: 'POST',
    });
  }

  // Contracts
  async getContracts(params?: { 
    object?: number; 
    status?: string;
    contract_type?: string;
    search?: string;
    ordering?: string;
    page_size?: number;
    page?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.contract_type) queryParams.append('contract_type', params.contract_type);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.ordering) queryParams.append('ordering', params.ordering);
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.page) queryParams.append('page', params.page.toString());
    const queryString = queryParams.toString();
    const endpoint = `/contracts/${queryString ? `?${queryString}` : ''}`;
    const response = await this.request<PaginatedResponse<ContractListItem> | ContractListItem[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as ContractListItem[], count: (response as ContractListItem[]).length };
  }

  async getContractDetail(id: number) {
    return this.request<ContractDetail>(`/contracts/${id}/`);
  }

  async getContractBalance(id: number) {
    return this.request<{ balance: string }>(`/contracts/${id}/balance/`);
  }

  // Алиас для getContractDetail (для совместимости)
  async getContract(id: number) {
    return this.getContractDetail(id);
  }

  async getContractSchedule(contractId: number) {
    return this.request<WorkScheduleItem[]>(`/contracts/${contractId}/schedule/`);
  }

  async getContractMargin(id: number) {
    return this.request<{ margin: string; margin_percent: string }>(`/contracts/${id}/margin/`);
  }

  async getContractCashFlow(id: number, params?: { start_date?: string; end_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    const queryString = queryParams.toString();
    return this.request<any>(`/contracts/${id}/cash-flow/${queryString ? `?${queryString}` : ''}`);
  }

  async getContractCashFlowPeriods(id: number, params?: { period_type?: string; start_date?: string; end_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.period_type) queryParams.append('period_type', params.period_type);
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    const queryString = queryParams.toString();
    return this.request<any>(`/contracts/${id}/cash-flow-periods/${queryString ? `?${queryString}` : ''}`);
  }

  async getContractCorrespondence(contractId: number) {
    return this.request<Correspondence[]>(`/contracts/${contractId}/correspondence/`);
  }

  // Work Schedule
  async getWorkSchedule(contractId: number) {
    const response = await this.request<PaginatedResponse<WorkScheduleItem> | WorkScheduleItem[]>(`/work-schedule/?contract=${contractId}`);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as WorkScheduleItem[];
  }

  async createWorkScheduleItem(data: CreateWorkScheduleItemData) {
    return this.request<WorkScheduleItem>('/work-schedule/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Acts
  async getActs(contractId: number) {
    const response = await this.request<PaginatedResponse<Act> | Act[]>(`/acts/?contract=${contractId}`);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as Act[];
  }

  async createAct(data: CreateActData) {
    return this.request<Act>('/acts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async signAct(id: number) {
    return this.request<Act>(`/acts/${id}/sign/`, {
      method: 'POST',
    });
  }

  async getActDetail(id: number) {
    return this.request<Act>(`/acts/${id}/`);
  }

  async updateAct(id: number, data: Partial<CreateActData>) {
    return this.request<Act>(`/acts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAct(id: number) {
    return this.request<void>(`/acts/${id}/`, {
      method: 'DELETE',
    });
  }

  // Work Schedule (дополнительные методы)
  async updateWorkScheduleItem(id: number, data: Partial<CreateWorkScheduleItemData>) {
    return this.request<WorkScheduleItem>(`/work-schedule/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkScheduleItem(id: number) {
    return this.request<void>(`/work-schedule/${id}/`, {
      method: 'DELETE',
    });
  }

  // Contract Amendments (Дополнительные соглашения)
  async getContractAmendments(contractId: number) {
    const response = await this.request<PaginatedResponse<ContractAmendment> | ContractAmendment[]>(`/contract-amendments/?contract=${contractId}`);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as ContractAmendment[];
  }

  async createContractAmendment(data: CreateContractAmendmentData) {
    if (data.file) {
      const formData = new FormData();
      formData.append('contract', data.contract.toString());
      formData.append('number', data.number);
      formData.append('date', data.date);
      formData.append('reason', data.reason);
      if (data.new_start_date) formData.append('new_start_date', data.new_start_date);
      if (data.new_end_date) formData.append('new_end_date', data.new_end_date);
      if (data.new_total_amount) formData.append('new_total_amount', data.new_total_amount);
      formData.append('file', data.file);

      return this.request<ContractAmendment>('/contract-amendments/', {
        method: 'POST',
        body: formData,
      });
    }

    return this.request<ContractAmendment>('/contract-amendments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateContractAmendment(id: number, data: Partial<CreateContractAmendmentData>) {
    if (data.file) {
      const formData = new FormData();
      if (data.contract) formData.append('contract', data.contract.toString());
      if (data.number) formData.append('number', data.number);
      if (data.date) formData.append('date', data.date);
      if (data.reason) formData.append('reason', data.reason);
      if (data.new_start_date) formData.append('new_start_date', data.new_start_date);
      if (data.new_end_date) formData.append('new_end_date', data.new_end_date);
      if (data.new_total_amount) formData.append('new_total_amount', data.new_total_amount);
      formData.append('file', data.file);

      return this.request<ContractAmendment>(`/contract-amendments/${id}/`, {
        method: 'PATCH',
        body: formData,
      });
    }

    return this.request<ContractAmendment>(`/contract-amendments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteContractAmendment(id: number) {
    return this.request<void>(`/contract-amendments/${id}/`, {
      method: 'DELETE',
    });
  }

  // Contracts (CRUD методы)
  async createContract(data: any) {
    if (data.file) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (key !== 'file' && data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key].toString());
        }
      });
      if (data.file) formData.append('file', data.file);

      return this.request<ContractDetail>('/contracts/', {
        method: 'POST',
        body: formData,
      });
    }

    return this.request<ContractDetail>('/contracts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateContract(id: number, data: any) {
    if (data.file) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (key !== 'file' && data[key] !== undefined && data[key] !== null) {
          formData.append(key, data[key].toString());
        }
      });
      if (data.file) formData.append('file', data.file);

      return this.request<ContractDetail>(`/contracts/${id}/`, {
        method: 'PATCH',
        body: formData,
      });
    }

    return this.request<ContractDetail>(`/contracts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteContract(id: number) {
    return this.request<void>(`/contracts/${id}/`, {
      method: 'DELETE',
    });
  }

  // Payment Registry
  async getPaymentRegistry(page: number = 1, statusFilter?: string) {
    let url = `/payment-registry/?ordering=-id&page=${page}`;
    if (statusFilter && statusFilter !== 'all') {
      url += `&status=${statusFilter}`;
    }
    const response = await this.request<PaginatedResponse<PaymentRegistryItem> | PaymentRegistryItem[]>(url);
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as PaymentRegistryItem[], count: (response as PaymentRegistryItem[]).length, next: null, previous: null };
  }

  async createPaymentRegistryItem(data: CreatePaymentRegistryData) {
    return this.request<PaymentRegistryItem>('/payment-registry/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approvePaymentRegistryItem(id: number) {
    return this.request<PaymentRegistryItem>(`/payment-registry/${id}/approve/`, {
      method: 'POST',
    });
  }

  async payPaymentRegistryItem(id: number) {
    return this.request<PaymentRegistryItem>(`/payment-registry/${id}/pay/`, {
      method: 'POST',
    });
  }

  async cancelPaymentRegistryItem(id: number, reason?: string) {
    return this.request<PaymentRegistryItem>(`/payment-registry/${id}/cancel/`, {
      method: 'POST',
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  }

  // Payments
  async getPayments(params?: {
    payment_type?: 'income' | 'expense';
    contract?: number;
    account?: number;
    category?: number;
    status?: string;
    payment_date_from?: string;
    payment_date_to?: string;
    search?: string;
    is_internal_transfer?: boolean;
    internal_transfer_group?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.payment_type) queryParams.append('payment_type', params.payment_type);
    if (params?.contract) queryParams.append('contract', params.contract.toString());
    if (params?.account) queryParams.append('account', params.account.toString());
    if (params?.category) queryParams.append('category', params.category.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.payment_date_from) queryParams.append('payment_date_from', params.payment_date_from);
    if (params?.payment_date_to) queryParams.append('payment_date_to', params.payment_date_to);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.is_internal_transfer !== undefined) queryParams.append('is_internal_transfer', params.is_internal_transfer.toString());
    if (params?.internal_transfer_group) queryParams.append('internal_transfer_group', params.internal_transfer_group);
    if (params?.ordering) queryParams.append('ordering', params.ordering);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    
    const queryString = queryParams.toString();
    const endpoint = `/payments/${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request<PaginatedResponse<Payment> | Payment[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as Payment[], count: (response as Payment[]).length };
  }

  async createPayment(data: CreatePaymentData) {
    const formData = new FormData();
    formData.append('payment_type', data.payment_type);
    formData.append('account_id', data.account_id.toString());
    formData.append('category_id', data.category_id.toString());
    formData.append('payment_date', data.payment_date);
    formData.append('amount_gross', data.amount_gross);
    if (data.amount_net) formData.append('amount_net', data.amount_net);
    if (data.vat_amount) formData.append('vat_amount', data.vat_amount);
    if (data.contract_id) formData.append('contract_id', data.contract_id.toString());
    if (data.legal_entity_id) formData.append('legal_entity_id', data.legal_entity_id.toString());
    if (data.description) formData.append('description', data.description);
    formData.append('scan_file', data.scan_file); // ОБЯЗАТЕЛЬНЫЙ!
    if (data.is_internal_transfer !== undefined) formData.append('is_internal_transfer', data.is_internal_transfer.toString());
    if (data.internal_transfer_group) formData.append('internal_transfer_group', data.internal_transfer_group);

    return this.request<Payment>('/payments/', {
      method: 'POST',
      body: formData,
    });
  }

  async updatePayment(id: number, data: Partial<CreatePaymentData>) {
    const formData = new FormData();
    if (data.account_id) formData.append('account_id', data.account_id.toString());
    if (data.contract_id) formData.append('contract_id', data.contract_id.toString());
    if (data.category_id) formData.append('category_id', data.category_id.toString());
    if (data.legal_entity_id) formData.append('legal_entity_id', data.legal_entity_id.toString());
    if (data.payment_type) formData.append('payment_type', data.payment_type);
    if (data.payment_date) formData.append('payment_date', data.payment_date);
    if (data.amount_gross) formData.append('amount_gross', data.amount_gross);
    if (data.amount_net) formData.append('amount_net', data.amount_net);
    if (data.vat_amount) formData.append('vat_amount', data.vat_amount);
    if (data.description) formData.append('description', data.description);
    if (data.scan_file) formData.append('scan_file', data.scan_file);
    if (data.is_internal_transfer !== undefined) formData.append('is_internal_transfer', data.is_internal_transfer.toString());
    if (data.internal_transfer_group) formData.append('internal_transfer_group', data.internal_transfer_group);

    return this.request<Payment>(`/payments/${id}/`, {
      method: 'PATCH',
      body: formData,
    });
  }

  async deletePayment(id: number) {
    return this.request<void>(`/payments/${id}/`, {
      method: 'DELETE',
    });
  }

  // Correspondence
  async getCorrespondence(params?: {
    contract?: number;
    type?: 'incoming' | 'outgoing';
    category?: string;
    status?: string;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.contract) queryParams.append('contract', params.contract.toString());
    if (params?.type) queryParams.append('type', params.type);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    
    const queryString = queryParams.toString();
    const endpoint = `/correspondence/${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request<PaginatedResponse<Correspondence> | Correspondence[]>(endpoint);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as Correspondence[];
  }

  async createCorrespondence(data: CreateCorrespondenceData) {
    const formData = new FormData();
    formData.append('contract', data.contract.toString());
    formData.append('type', data.type);
    formData.append('category', data.category);
    formData.append('number', data.number);
    formData.append('date', data.date);
    formData.append('subject', data.subject);
    if (data.status) formData.append('status', data.status);
    if (data.description) formData.append('description', data.description);
    if (data.file) formData.append('file', data.file);
    if (data.related_to) formData.append('related_to', data.related_to.toString());

    return this.request<Correspondence>('/correspondence/', {
      method: 'POST',
      body: formData,
    });
  }

  async updateCorrespondence(id: number, data: Partial<CreateCorrespondenceData>) {
    const formData = new FormData();
    if (data.contract) formData.append('contract', data.contract.toString());
    if (data.type) formData.append('type', data.type);
    if (data.category) formData.append('category', data.category);
    if (data.number) formData.append('number', data.number);
    if (data.date) formData.append('date', data.date);
    if (data.subject) formData.append('subject', data.subject);
    if (data.status) formData.append('status', data.status);
    if (data.description) formData.append('description', data.description);
    if (data.file) formData.append('file', data.file);
    if (data.related_to) formData.append('related_to', data.related_to.toString());

    return this.request<Correspondence>(`/correspondence/${id}/`, {
      method: 'PATCH',
      body: formData,
    });
  }

  async deleteCorrespondence(id: number) {
    return this.request<void>(`/correspondence/${id}/`, {
      method: 'DELETE',
    });
  }

  // Expense Categories
  async getExpenseCategories(tree: boolean = false) {
    const url = tree ? '/expense-categories/?tree=true' : '/expense-categories/';
    const response = await this.request<PaginatedResponse<ExpenseCategory> | ExpenseCategory[]>(url);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as ExpenseCategory[];
  }

  async createExpenseCategory(data: CreateExpenseCategoryData) {
    return this.request<ExpenseCategory>('/expense-categories/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExpenseCategory(id: number, data: Partial<CreateExpenseCategoryData>) {
    return this.request<ExpenseCategory>(`/expense-categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteExpenseCategory(id: number) {
    return this.request(`/expense-categories/${id}/`, {
      method: 'DELETE',
    });
  }

  // Analytics
  async getCashFlow(period: string = 'year') {
    return this.request<CashFlowData[]>(`/analytics/cashflow/?period=${period}`);
  }

  async getDebtSummary() {
    return this.request<DebtSummary>('/analytics/debt_summary/');
  }

  // Worker Grades
  async getWorkerGrades(isActive?: boolean) {
    let url = '/worker-grades/';
    if (isActive !== undefined) {
      url += `?is_active=${isActive}`;
    }
    const response = await this.request<PaginatedResponse<WorkerGrade> | WorkerGrade[]>(url);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as WorkerGrade[];
  }

  async createWorkerGrade(data: CreateWorkerGradeData) {
    return this.request<WorkerGrade>('/worker-grades/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkerGrade(id: number, data: Partial<CreateWorkerGradeData>) {
    return this.request<WorkerGrade>(`/worker-grades/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Work Sections
  async getWorkSections(tree?: boolean, search?: string) {
    let url = '/work-sections/';
    const params: string[] = [];
    if (tree) params.push('tree=true');
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    
    const response = await this.request<PaginatedResponse<WorkSection> | WorkSection[]>(url);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as WorkSection[];
  }

  async createWorkSection(data: CreateWorkSectionData) {
    return this.request<WorkSection>('/work-sections/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkSection(id: number, data: Partial<CreateWorkSectionData>) {
    return this.request<WorkSection>(`/work-sections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Worker Grade Skills
  async getWorkerGradeSkills(gradeId?: number, sectionId?: number) {
    let url = '/worker-grade-skills/';
    const params: string[] = [];
    if (gradeId) params.push(`grade=${gradeId}`);
    if (sectionId) params.push(`section=${sectionId}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    
    const response = await this.request<PaginatedResponse<WorkerGradeSkills> | WorkerGradeSkills[]>(url);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as WorkerGradeSkills[];
  }

  async createWorkerGradeSkills(data: CreateWorkerGradeSkillsData) {
    return this.request<WorkerGradeSkills>('/worker-grade-skills/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkerGradeSkills(id: number, data: Partial<CreateWorkerGradeSkillsData>) {
    return this.request<WorkerGradeSkills>(`/worker-grade-skills/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkerGradeSkills(id: number) {
    return this.request<void>(`/worker-grade-skills/${id}/`, {
      method: 'DELETE',
    });
  }

  // Work Items
  async getWorkItems() {
    let allItems: WorkItemList[] = [];
    let nextUrl: string | null = '/work-items/';
    
    while (nextUrl) {
      const response = await this.request<PaginatedResponse<WorkItemList> | WorkItemList[]>(nextUrl);
      
      if (response && typeof response === 'object' && 'results' in response) {
        allItems = [...allItems, ...response.results];
        
        // Если next - полный URL, извлекаем только путь (начиная с /api/v1/)
        if (response.next) {
          try {
            const url = new URL(response.next);
            // Убираем /api/v1 из начала pathname, чтобы избежать дублирования
            let path = url.pathname + url.search;
            if (path.startsWith('/api/v1')) {
              path = path.substring(7); // Убираем '/api/v1'
            }
            nextUrl = path;
          } catch {
            // Если next уже является относительным путем
            nextUrl = response.next;
          }
        } else {
          nextUrl = null;
        }
      } else {
        // Если ответ - массив (не пагинированный)
        return response as WorkItemList[];
      }
    }
    
    return allItems;
  }

  async getWorkItemDetail(id: number) {
    return this.request<WorkItemDetail>(`/work-items/${id}/`);
  }

  async createWorkItem(data: CreateWorkItemData) {
    return this.request<WorkItemDetail>('/work-items/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkItem(id: number, data: Partial<CreateWorkItemData>) {
    return this.request<WorkItemDetail>(`/work-items/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkItem(id: number) {
    return this.request<void>(`/work-items/${id}/`, {
      method: 'DELETE',
    });
  }

  async getWorkItemVersions(id: number) {
    return this.request<WorkItemDetail[]>(`/work-items/${id}/versions/`);
  }

  // Price Lists
  async getPriceLists() {
    const response = await this.request<PaginatedResponse<PriceListList> | PriceListList[]>('/price-lists/');
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as PriceListList[];
  }

  async getPriceListDetail(id: number) {
    return this.request<PriceListDetail>(`/price-lists/${id}/`);
  }

  async createPriceList(data: CreatePriceListData) {
    return this.request<PriceListDetail>('/price-lists/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePriceList(id: number, data: Partial<CreatePriceListData>) {
    return this.request<PriceListDetail>(`/price-lists/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async addPriceListItems(id: number, workItems: number[]) {
    return this.request<PriceListDetail>(`/price-lists/${id}/add-items/`, {
      method: 'POST',
      body: JSON.stringify({ work_items: workItems }),
    });
  }

  async removePriceListItems(id: number, workItems: number[]) {
    return this.request<PriceListDetail>(`/price-lists/${id}/remove-items/`, {
      method: 'POST',
      body: JSON.stringify({ work_items: workItems }),
    });
  }

  async createPriceListItem(data: CreatePriceListItemData) {
    return this.request<PriceListItem>('/price-list-items/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePriceListItem(id: number, data: UpdatePriceListItemData) {
    return this.request<PriceListItem>(`/price-list-items/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePriceListItem(id: number) {
    return this.request<void>(`/price-list-items/${id}/`, {
      method: 'DELETE',
    });
  }

  async createPriceListAgreement(data: CreatePriceListAgreementData) {
    return this.request<PriceListAgreement>('/price-list-agreements/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deletePriceListAgreement(id: number) {
    return this.request<void>(`/price-list-agreements/${id}/`, {
      method: 'DELETE',
    });
  }

  async createPriceListVersion(id: number) {
    return this.request<PriceListDetail>(`/price-lists/${id}/create-version/`, {
      method: 'POST',
    });
  }

  async exportPriceList(id: number): Promise<Blob> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/price-lists/${id}/export/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Ошибка при экспорте прайс-листа');
    }

    return response.blob();
  }

  // ==================== PROJECTS ====================
  
  async getProjects(params?: {
    object?: number;
    stage?: 'П' | 'РД';
    is_approved_for_production?: boolean;
    primary_check_done?: boolean;
    secondary_check_done?: boolean;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.stage) queryParams.append('stage', params.stage);
    if (params?.is_approved_for_production !== undefined) queryParams.append('is_approved_for_production', params.is_approved_for_production.toString());
    if (params?.primary_check_done !== undefined) queryParams.append('primary_check_done', params.primary_check_done.toString());
    if (params?.secondary_check_done !== undefined) queryParams.append('secondary_check_done', params.secondary_check_done.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const url = `/projects/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<ProjectList> | ProjectList[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as ProjectList[];
  }

  async getProjectDetail(id: number) {
    return this.request<ProjectDetail>(`/projects/${id}/`);
  }

  async createProject(data: FormData) {
    return this.request<ProjectDetail>('/projects/', {
      method: 'POST',
      body: data,
    });
  }

  async updateProject(id: number, data: FormData) {
    return this.request<ProjectDetail>(`/projects/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async createProjectVersion(id: number) {
    return this.request<ProjectDetail>(`/projects/${id}/create-version/`, {
      method: 'POST',
    });
  }

  async getProjectVersions(id: number) {
    return this.request<ProjectList[]>(`/projects/${id}/versions/`);
  }

  async primaryCheckProject(id: number) {
    return this.request<ProjectDetail>(`/projects/${id}/primary-check/`, {
      method: 'POST',
    });
  }

  async secondaryCheckProject(id: number) {
    return this.request<ProjectDetail>(`/projects/${id}/secondary-check/`, {
      method: 'POST',
    });
  }

  async approveProduction(id: number, file: File) {
    const formData = new FormData();
    formData.append('production_approval_file', file);
    return this.request<ProjectDetail>(`/projects/${id}/approve-production/`, {
      method: 'POST',
      body: formData,
    });
  }

  // Project Notes
  async getProjectNotes(projectId?: number) {
    const url = projectId ? `/project-notes/?project=${projectId}` : '/project-notes/';
    const response = await this.request<PaginatedResponse<ProjectNote> | ProjectNote[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as ProjectNote[];
  }

  async createProjectNote(data: { project: number; text: string }) {
    return this.request<ProjectNote>('/project-notes/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProjectNote(id: number, data: { text: string }) {
    return this.request<ProjectNote>(`/project-notes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProjectNote(id: number) {
    return this.request<void>(`/project-notes/${id}/`, {
      method: 'DELETE',
    });
  }

  // ==================== ESTIMATES ====================
  
  async getEstimates(params?: {
    object?: number;
    legal_entity?: number;
    status?: string;
    approved_by_customer?: boolean;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.legal_entity) queryParams.append('legal_entity', params.legal_entity.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.approved_by_customer !== undefined) queryParams.append('approved_by_customer', params.approved_by_customer.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const url = `/estimates/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<EstimateList> | EstimateList[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as EstimateList[];
  }

  async getEstimateDetail(id: number) {
    return this.request<EstimateDetail>(`/estimates/${id}/`);
  }

  async createEstimate(data: EstimateCreateRequest) {
    return this.request<EstimateDetail>('/estimates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEstimate(id: number, data: Partial<EstimateCreateRequest>) {
    return this.request<EstimateDetail>(`/estimates/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createEstimateVersion(id: number) {
    return this.request<EstimateDetail>(`/estimates/${id}/create-version/`, {
      method: 'POST',
    });
  }

  async getEstimateVersions(id: number) {
    return this.request<EstimateList[]>(`/estimates/${id}/versions/`);
  }

  async createMountingEstimateFromEstimate(estimateId: number) {
    return this.request<MountingEstimateDetail>(`/estimates/${estimateId}/create-mounting-estimate/`, {
      method: 'POST',
    });
  }

  // Estimate Sections
  async getEstimateSections(estimateId: number) {
    const response = await this.request<PaginatedResponse<EstimateSection> | EstimateSection[]>(`/estimate-sections/?estimate=${estimateId}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as EstimateSection[];
  }

  async createEstimateSection(data: { estimate: number; name: string; sort_order?: number }) {
    return this.request<EstimateSection>('/estimate-sections/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEstimateSection(id: number, data: Partial<EstimateSection>) {
    return this.request<EstimateSection>(`/estimate-sections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEstimateSection(id: number) {
    return this.request<void>(`/estimate-sections/${id}/`, {
      method: 'DELETE',
    });
  }

  // Estimate Subsections
  async getEstimateSubsections(params: { section?: number; estimate?: number }) {
    const queryParams = new URLSearchParams();
    if (params.section) queryParams.append('section', params.section.toString());
    if (params.estimate) queryParams.append('estimate', params.estimate.toString());
    
    const response = await this.request<PaginatedResponse<EstimateSubsection> | EstimateSubsection[]>(`/estimate-subsections/?${queryParams.toString()}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as EstimateSubsection[];
  }

  async createEstimateSubsection(data: {
    section: number;
    name: string;
    materials_sale: string;
    works_sale: string;
    materials_purchase: string;
    works_purchase: string;
    sort_order?: number;
  }) {
    return this.request<EstimateSubsection>('/estimate-subsections/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEstimateSubsection(id: number, data: Partial<EstimateSubsection>) {
    return this.request<EstimateSubsection>(`/estimate-subsections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEstimateSubsection(id: number) {
    return this.request<void>(`/estimate-subsections/${id}/`, {
      method: 'DELETE',
    });
  }

  // Estimate Characteristics
  async getEstimateCharacteristics(estimateId: number) {
    const response = await this.request<PaginatedResponse<EstimateCharacteristic> | EstimateCharacteristic[]>(`/estimate-characteristics/?estimate=${estimateId}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as EstimateCharacteristic[];
  }

  async createEstimateCharacteristic(data: {
    estimate: number;
    name: string;
    purchase_amount: string;
    sale_amount: string;
    source_type: 'sections' | 'manual';
    sort_order?: number;
  }) {
    return this.request<EstimateCharacteristic>('/estimate-characteristics/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEstimateCharacteristic(id: number, data: Partial<EstimateCharacteristic>) {
    return this.request<EstimateCharacteristic>(`/estimate-characteristics/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEstimateCharacteristic(id: number) {
    return this.request<void>(`/estimate-characteristics/${id}/`, {
      method: 'DELETE',
    });
  }

  // ==================== MOUNTING ESTIMATES ====================
  
  async getMountingEstimates(params?: {
    object?: number;
    source_estimate?: number;
    status?: string;
    agreed_counterparty?: number;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.source_estimate) queryParams.append('source_estimate', params.source_estimate.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.agreed_counterparty) queryParams.append('agreed_counterparty', params.agreed_counterparty.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const url = `/mounting-estimates/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<MountingEstimateList> | MountingEstimateList[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as MountingEstimateList[];
  }

  async getMountingEstimateDetail(id: number) {
    return this.request<MountingEstimateDetail>(`/mounting-estimates/${id}/`);
  }

  async createMountingEstimate(data: MountingEstimateCreateRequest) {
    return this.request<MountingEstimateDetail>('/mounting-estimates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createMountingEstimateFromEstimateId(estimateId: number) {
    return this.request<MountingEstimateDetail>('/mounting-estimates/from-estimate/', {
      method: 'POST',
      body: JSON.stringify({ estimate_id: estimateId }),
    });
  }

  async updateMountingEstimate(id: number, data: Partial<MountingEstimateCreateRequest>) {
    return this.request<MountingEstimateDetail>(`/mounting-estimates/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createMountingEstimateVersion(id: number) {
    return this.request<MountingEstimateDetail>(`/mounting-estimates/${id}/create-version/`, {
      method: 'POST',
    });
  }

  async agreeMountingEstimate(id: number, counterpartyId: number) {
    return this.request<MountingEstimateDetail>(`/mounting-estimates/${id}/agree/`, {
      method: 'POST',
      body: JSON.stringify({ counterparty_id: counterpartyId }),
    });
  }

  // ==================== ТКП И МП - СПРАВОЧНИКИ ====================
  
  // Фронт работ
  async getFrontOfWorkItems(filters?: { category?: string; is_active?: boolean; is_default?: boolean; search?: string }) {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    if (filters?.is_default !== undefined) params.append('is_default', filters.is_default.toString());
    if (filters?.search) params.append('search', filters.search);
    
    const url = `/front-of-work-items/${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<FrontOfWorkItem> | FrontOfWorkItem[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as FrontOfWorkItem[];
  }

  async createFrontOfWorkItem(data: CreateFrontOfWorkItemData) {
    return this.request<FrontOfWorkItem>('/front-of-work-items/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFrontOfWorkItem(id: number, data: Partial<CreateFrontOfWorkItemData>) {
    return this.request<FrontOfWorkItem>(`/front-of-work-items/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFrontOfWorkItem(id: number) {
    return this.request<void>(`/front-of-work-items/${id}/`, {
      method: 'DELETE',
    });
  }

  // Условия для МП
  async getMountingConditions(filters?: { is_active?: boolean; is_default?: boolean; search?: string }) {
    const params = new URLSearchParams();
    if (filters?.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    if (filters?.is_default !== undefined) params.append('is_default', filters.is_default.toString());
    if (filters?.search) params.append('search', filters.search);
    
    const url = `/mounting-conditions/${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<MountingCondition> | MountingCondition[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as MountingCondition[];
  }

  async createMountingCondition(data: CreateMountingConditionData) {
    return this.request<MountingCondition>('/mounting-conditions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMountingCondition(id: number, data: Partial<CreateMountingConditionData>) {
    return this.request<MountingCondition>(`/mounting-conditions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMountingCondition(id: number) {
    return this.request<void>(`/mounting-conditions/${id}/`, {
      method: 'DELETE',
    });
  }

  // ==================== ТКП - ТЕХНИКО-КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ ====================
  
  // Список ТКП
  async getTechnicalProposals(filters?: {
    object?: number;
    legal_entity?: number;
    status?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.object) params.append('object', filters.object.toString());
    if (filters?.legal_entity) params.append('legal_entity', filters.legal_entity.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    
    const url = `/technical-proposals/${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<TechnicalProposalListItem> | TechnicalProposalListItem[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as TechnicalProposalListItem[], count: (response as TechnicalProposalListItem[]).length };
  }

  async getTechnicalProposal(id: number) {
    return this.request<TechnicalProposalDetail>(`/technical-proposals/${id}/`);
  }

  async createTechnicalProposal(data: FormData) {
    return this.request<TechnicalProposalDetail>('/technical-proposals/', {
      method: 'POST',
      body: data,
    });
  }

  async updateTechnicalProposal(id: number, data: FormData) {
    return this.request<TechnicalProposalDetail>(`/technical-proposals/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteTechnicalProposal(id: number) {
    return this.request<void>(`/technical-proposals/${id}/`, {
      method: 'DELETE',
    });
  }

  async createTechnicalProposalVersion(id: number, data?: { date?: string }) {
    return this.request<TechnicalProposalDetail>(`/technical-proposals/${id}/create-version/`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : JSON.stringify({}),
    });
  }

  async getTechnicalProposalVersions(id: number) {
    return this.request<TechnicalProposalListItem[]>(`/technical-proposals/${id}/versions/`);
  }

  // Работа со сметами в ТКП
  async addEstimatesToTKP(id: number, estimateIds: number[], copyData: boolean = true) {
    return this.request<{ message: string; estimates_count: number }>(`/technical-proposals/${id}/add-estimates/`, {
      method: 'POST',
      body: JSON.stringify({ estimate_ids: estimateIds, copy_data: copyData }),
    });
  }

  async removeEstimatesFromTKP(id: number, estimateIds: number[]) {
    return this.request<{ message: string }>(`/technical-proposals/${id}/remove-estimates/`, {
      method: 'POST',
      body: JSON.stringify({ estimate_ids: estimateIds }),
    });
  }

  async copyDataFromEstimates(id: number) {
    return this.request<{ message: string }>(`/technical-proposals/${id}/copy-from-estimates/`, {
      method: 'POST',
    });
  }

  // Разделы ТКП
  async getTKPSections(tkpId: number) {
    const response = await this.request<PaginatedResponse<TKPEstimateSection> | TKPEstimateSection[]>(`/tkp-sections/?tkp=${tkpId}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as TKPEstimateSection[];
  }

  async updateTKPSection(id: number, data: Partial<TKPEstimateSection>) {
    return this.request<TKPEstimateSection>(`/tkp-sections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateTKPSubsection(id: number, data: Partial<TKPEstimateSubsection>) {
    return this.request<TKPEstimateSubsection>(`/tkp-subsections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Фронт работ в ТКП
  async getTKPFrontOfWork(tkpId: number) {
    const response = await this.request<PaginatedResponse<TKPFrontOfWork> | TKPFrontOfWork[]>(`/tkp-front-of-work/?tkp=${tkpId}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as TKPFrontOfWork[];
  }

  async createTKPFrontOfWork(data: {
    tkp: number;
    front_item: number;
    when_text?: string;
    when_date?: string;
    sort_order?: number;
  }) {
    return this.request<TKPFrontOfWork>('/tkp-front-of-work/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTKPFrontOfWork(id: number, data: Partial<{
    when_text: string;
    when_date: string;
    sort_order: number;
  }>) {
    return this.request<TKPFrontOfWork>(`/tkp-front-of-work/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTKPFrontOfWork(id: number) {
    return this.request<void>(`/tkp-front-of-work/${id}/`, {
      method: 'DELETE',
    });
  }

  // Характеристики ТКП
  async getTKPCharacteristics(tkpId: number) {
    const response = await this.request<PaginatedResponse<TKPCharacteristic> | TKPCharacteristic[]>(`/tkp-characteristics/?tkp=${tkpId}`);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as TKPCharacteristic[];
  }

  async createTKPCharacteristic(data: {
    tkp: number;
    name: string;
    purchase_amount: string;
    sale_amount: string;
    sort_order?: number;
  }) {
    return this.request<TKPCharacteristic>('/tkp-characteristics/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTKPCharacteristic(id: number, data: Partial<{
    name: string;
    purchase_amount: string;
    sale_amount: string;
    sort_order: number;
  }>) {
    return this.request<TKPCharacteristic>(`/tkp-characteristics/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTKPCharacteristic(id: number) {
    return this.request<void>(`/tkp-characteristics/${id}/`, {
      method: 'DELETE',
    });
  }

  // ==================== МОНТАЖНЫЕ ПРЕДЛОЖЕНИЯ (МП) ====================
  
  // Список МП
  async getMountingProposals(filters?: { 
    object?: string; 
    counterparty?: string; 
    status?: string; 
    search?: string;
    parent_tkp?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.object) params.append('object', filters.object);
    if (filters?.counterparty) params.append('counterparty', filters.counterparty);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.parent_tkp) params.append('parent_tkp', filters.parent_tkp);
    
    const url = `/mounting-proposals/${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.request<PaginatedResponse<MountingProposalListItem> | MountingProposalListItem[]>(url);
    
    if (response && typeof response === 'object' && 'results' in response) {
      return response;
    }
    return { results: response as MountingProposalListItem[], count: (response as MountingProposalListItem[]).length };
  }

  async getMountingProposal(id: number) {
    return this.request<MountingProposalDetail>(`/mounting-proposals/${id}/`);
  }

  async createMountingProposalStandalone(data: FormData) {
    return this.request<MountingProposalDetail>('/mounting-proposals/', {
      method: 'POST',
      body: data,
    });
  }

  async updateMountingProposal(id: number, data: FormData) {
    return this.request<MountingProposalDetail>(`/mounting-proposals/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteMountingProposal(id: number) {
    return this.request<void>(`/mounting-proposals/${id}/`, {
      method: 'DELETE',
    });
  }

  async createMountingProposalVersion(id: number, data?: { date?: string }) {
    return this.request<MountingProposalDetail>(`/mounting-proposals/${id}/create-version/`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : JSON.stringify({}),
    });
  }

  async getMountingProposalVersions(id: number) {
    return this.request<MountingProposalListItem[]>(`/mounting-proposals/${id}/versions/`);
  }

  async publishMountingProposalToTelegram(id: number) {
    return this.request<{ message: string; published_at: string }>(`/mounting-proposals/${id}/mark-telegram-published/`, {
      method: 'POST',
    });
  }

  async createMountingProposalFromTKP(tkpId: number, data: { counterparty: number; notes?: string }) {
    return this.request<MountingProposalDetail>(`/technical-proposals/${tkpId}/create-mp/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Catalog API Methods
  // ============================================

  // Categories
  async getCategories() {
    const response = await this.request<PaginatedResponse<any> | any[]>('/catalog/categories/');
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as any[];
  }

  async getCategoryTree() {
    return this.request<any[]>('/catalog/categories/tree/');
  }

  async getCategoryById(id: number) {
    return this.request<any>(`/catalog/categories/${id}/`);
  }

  async createCategory(data: any) {
    return this.request<any>('/catalog/categories/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCategory(id: number, data: any) {
    return this.request<any>(`/catalog/categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: number) {
    return this.request<void>(`/catalog/categories/${id}/`, {
      method: 'DELETE',
    });
  }

  // Products
  async getProducts(filters?: {
    status?: string;
    category?: number;
    is_service?: boolean;
    search?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category.toString());
    if (filters?.is_service !== undefined) params.append('is_service', filters.is_service.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    
    const queryString = params.toString();
    const endpoint = `/catalog/products/${queryString ? `?${queryString}` : ''}`;
    return this.request<PaginatedResponse<any>>(endpoint);
  }

  async getProductById(id: number) {
    return this.request<any>(`/catalog/products/${id}/`);
  }

  async getProductPrices(id: number) {
    const response = await this.request<PaginatedResponse<any> | any[]>(`/catalog/products/${id}/prices/`);
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as any[];
  }

  async verifyProduct(id: number) {
    return this.request<any>(`/catalog/products/${id}/verify/`, {
      method: 'POST',
    });
  }

  async archiveProduct(id: number) {
    return this.request<any>(`/catalog/products/${id}/archive/`, {
      method: 'POST',
    });
  }

  async updateProduct(id: number, data: any) {
    return this.request<any>(`/catalog/products/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createProduct(data: any) {
    return this.request<any>('/catalog/products/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: number) {
    return this.request<any>(`/catalog/products/${id}/`, {
      method: 'DELETE',
    });
  }

  // Product moderation
  async findDuplicateProducts() {
    return this.request<any[]>('/catalog/products/duplicates/');
  }

  async mergeProducts(data: { source_ids: number[]; target_id: number }) {
    return this.request<any>('/catalog/products/merge/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // LLM Providers
  async getLLMProviders() {
    const response = await this.request<PaginatedResponse<LLMProvider> | LLMProvider[]>('/llm-providers/');
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as LLMProvider[];
  }

  async setDefaultLLMProvider(id: number) {
    return this.request<LLMProvider>(`/llm-providers/${id}/set_default/`, {
      method: 'POST',
    });
  }

  // Invoice Parsing
  async parseInvoice(file: File): Promise<ParseInvoiceResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<ParseInvoiceResponse>('/llm/parse-invoice/', {
      method: 'POST',
      body: formData,
    });
  }

  // =============================================================================
  // Worklog API (Сервис фиксации работ)
  // =============================================================================

  async getWorkJournalSummary(objectId: number): Promise<WorkJournalSummary> {
    return this.request<WorkJournalSummary>(`/objects/${objectId}/work-journal/`);
  }

  async getWorklogShifts(params?: {
    object?: number;
    contractor?: number;
    status?: string;
    date?: string;
    shift_type?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<WorklogShift>> {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.contractor) queryParams.append('contractor', params.contractor.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.date) queryParams.append('date', params.date);
    if (params?.shift_type) queryParams.append('shift_type', params.shift_type);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogShift>>(`/worklog/shifts/${qs ? `?${qs}` : ''}`);
  }

  async getWorklogTeams(params?: {
    object?: number;
    shift?: string;
    status?: string;
    contractor?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<WorklogTeam>> {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.shift) queryParams.append('shift', params.shift);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.contractor) queryParams.append('contractor', params.contractor.toString());
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogTeam>>(`/worklog/teams/${qs ? `?${qs}` : ''}`);
  }

  async getWorklogMedia(params?: {
    team?: string;
    media_type?: string;
    tag?: string;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<WorklogMedia>> {
    const queryParams = new URLSearchParams();
    if (params?.team) queryParams.append('team', params.team);
    if (params?.media_type) queryParams.append('media_type', params.media_type);
    if (params?.tag) queryParams.append('tag', params.tag);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogMedia>>(`/worklog/media/${qs ? `?${qs}` : ''}`);
  }

  async getWorklogReports(params?: {
    team?: string;
    shift?: string;
    report_type?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<WorklogReport>> {
    const queryParams = new URLSearchParams();
    if (params?.team) queryParams.append('team', params.team);
    if (params?.shift) queryParams.append('shift', params.shift);
    if (params?.report_type) queryParams.append('report_type', params.report_type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogReport>>(`/worklog/reports/${qs ? `?${qs}` : ''}`);
  }

  async getWorklogReportDetail(reportId: string): Promise<WorklogReportDetail> {
    return this.request<WorklogReportDetail>(`/worklog/reports/${reportId}/`);
  }

  async getWorklogQuestions(params?: {
    report?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<WorklogQuestion>> {
    const queryParams = new URLSearchParams();
    if (params?.report) queryParams.append('report', params.report);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogQuestion>>(`/worklog/questions/${qs ? `?${qs}` : ''}`);
  }

  async createWorklogShift(data: {
    contract: number;
    date: string;
    shift_type: string;
    start_time: string;
    end_time: string;
  }): Promise<WorklogShift> {
    return this.request<WorklogShift>('/worklog/shifts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async activateWorklogShift(shiftId: string): Promise<WorklogShift> {
    return this.request<WorklogShift>(`/worklog/shifts/${shiftId}/activate/`, {
      method: 'POST',
    });
  }

  async closeWorklogShift(shiftId: string): Promise<WorklogShift> {
    return this.request<WorklogShift>(`/worklog/shifts/${shiftId}/close/`, {
      method: 'POST',
    });
  }

  async createWorklogQuestion(data: { report_id: string; text: string }): Promise<WorklogQuestion> {
    return this.request<WorklogQuestion>('/worklog/questions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async answerWorklogQuestion(questionId: string, data: { text: string }): Promise<WorklogAnswer> {
    return this.request<WorklogAnswer>(`/worklog/questions/${questionId}/answer/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateObjectGeo(objectId: number, data: {
    latitude?: string;
    longitude?: string;
    geo_radius?: number;
    allow_geo_bypass?: boolean;
    registration_window_minutes?: number;
  }): Promise<ConstructionObject> {
    return this.request<ConstructionObject>(`/objects/${objectId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getWorklogSupergroups(params?: {
    object?: number;
    contractor?: number;
    is_active?: boolean;
  }): Promise<PaginatedResponse<WorklogSupergroup>> {
    const queryParams = new URLSearchParams();
    if (params?.object) queryParams.append('object', params.object.toString());
    if (params?.contractor) queryParams.append('contractor', params.contractor.toString());
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<WorklogSupergroup>>(`/worklog/supergroups/${qs ? `?${qs}` : ''}`);
  }

  // ========================
  // InviteToken (deep-link)
  // ========================

  async createInviteToken(data: {
    contractor: number;
    role?: string;
  }): Promise<InviteToken> {
    return this.request<InviteToken>('/worklog/invites/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInviteTokens(params?: {
    contractor?: number;
    used?: boolean;
    role?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<InviteToken>> {
    const queryParams = new URLSearchParams();
    if (params?.contractor) queryParams.append('contractor', params.contractor.toString());
    if (params?.used !== undefined) queryParams.append('used', params.used.toString());
    if (params?.role) queryParams.append('role', params.role);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    const qs = queryParams.toString();
    return this.request<PaginatedResponse<InviteToken>>(`/worklog/invites/${qs ? `?${qs}` : ''}`);
  }

  // =====================================================================
  // PERSONNEL (Персонал)
  // =====================================================================

  async getEmployees(params?: {
    search?: string;
    legal_entity?: number;
    is_active?: boolean;
  }): Promise<Employee[]> {
    const qp = new URLSearchParams();
    if (params?.search) qp.append('search', params.search);
    if (params?.legal_entity) qp.append('legal_entity', params.legal_entity.toString());
    if (params?.is_active !== undefined) qp.append('is_active', params.is_active.toString());
    const qs = qp.toString();
    const response = await this.request<PaginatedResponse<Employee> | Employee[]>(
      `/personnel/employees/${qs ? `?${qs}` : ''}`
    );
    if (response && typeof response === 'object' && 'results' in response) {
      return response.results;
    }
    return response as Employee[];
  }

  async getEmployee(id: number): Promise<EmployeeDetail> {
    return this.request<EmployeeDetail>(`/personnel/employees/${id}/`);
  }

  async createEmployee(data: CreateEmployeeData): Promise<EmployeeDetail> {
    return this.request<EmployeeDetail>('/personnel/employees/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmployee(id: number, data: Partial<CreateEmployeeData>): Promise<EmployeeDetail> {
    return this.request<EmployeeDetail>(`/personnel/employees/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEmployee(id: number): Promise<void> {
    return this.request<void>(`/personnel/employees/${id}/`, {
      method: 'DELETE',
    });
  }

  // Должности сотрудника
  async getEmployeePositions(employeeId: number): Promise<PositionRecord[]> {
    return this.request<PositionRecord[]>(`/personnel/employees/${employeeId}/positions/`);
  }

  async createPositionRecord(employeeId: number, data: CreatePositionRecordData): Promise<PositionRecord> {
    return this.request<PositionRecord>(`/personnel/employees/${employeeId}/positions/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePositionRecord(id: number, data: Partial<CreatePositionRecordData>): Promise<PositionRecord> {
    return this.request<PositionRecord>(`/personnel/position-records/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePositionRecord(id: number): Promise<void> {
    return this.request<void>(`/personnel/position-records/${id}/`, {
      method: 'DELETE',
    });
  }

  // История оклада
  async getEmployeeSalaryHistory(employeeId: number): Promise<SalaryHistoryRecord[]> {
    return this.request<SalaryHistoryRecord[]>(`/personnel/employees/${employeeId}/salary-history/`);
  }

  async createSalaryRecord(employeeId: number, data: CreateSalaryRecordData): Promise<SalaryHistoryRecord> {
    return this.request<SalaryHistoryRecord>(`/personnel/employees/${employeeId}/salary-history/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteSalaryRecord(id: number): Promise<void> {
    return this.request<void>(`/personnel/salary-history/${id}/`, {
      method: 'DELETE',
    });
  }

  // Оргсхема
  async getOrgChart(legalEntityId?: number): Promise<OrgChartData> {
    const qs = legalEntityId ? `?legal_entity=${legalEntityId}` : '';
    return this.request<OrgChartData>(`/personnel/org-chart/${qs}`);
  }

  // Создание контрагента из сотрудника
  async createCounterpartyFromEmployee(employeeId: number): Promise<{ id: number; name: string; message: string }> {
    return this.request<{ id: number; name: string; message: string }>(
      `/personnel/employees/${employeeId}/create-counterparty/`,
      { method: 'POST' }
    );
  }

  // =========================================================================
  // Banking — Банковские подключения
  // =========================================================================

  async getBankConnections(): Promise<BankConnection[]> {
    const res = await this.request<PaginatedResponse<BankConnection> | BankConnection[]>('/bank-connections/');
    if (res && typeof res === 'object' && 'results' in res) return res.results;
    return res as BankConnection[];
  }

  async createBankConnection(data: CreateBankConnectionData): Promise<BankConnection> {
    return this.request<BankConnection>('/bank-connections/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBankConnection(id: number, data: Partial<CreateBankConnectionData>): Promise<BankConnection> {
    return this.request<BankConnection>(`/bank-connections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBankConnection(id: number): Promise<void> {
    return this.request<void>(`/bank-connections/${id}/`, { method: 'DELETE' });
  }

  async testBankConnection(id: number): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>(`/bank-connections/${id}/test/`, {
      method: 'POST',
    });
  }

  async syncBankAccounts(connectionId: number): Promise<any> {
    return this.request<any>(`/bank-connections/${connectionId}/sync-accounts/`, {
      method: 'POST',
    });
  }

  // =========================================================================
  // Banking — Банковские счета (привязки)
  // =========================================================================

  async getBankAccounts(): Promise<BankAccount[]> {
    const res = await this.request<PaginatedResponse<BankAccount> | BankAccount[]>('/bank-accounts/');
    if (res && typeof res === 'object' && 'results' in res) return res.results;
    return res as BankAccount[];
  }

  async createBankAccount(data: CreateBankAccountData): Promise<BankAccount> {
    return this.request<BankAccount>('/bank-accounts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBankAccount(id: number, data: Partial<CreateBankAccountData>): Promise<BankAccount> {
    return this.request<BankAccount>(`/bank-accounts/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBankAccount(id: number): Promise<void> {
    return this.request<void>(`/bank-accounts/${id}/`, { method: 'DELETE' });
  }

  async syncBankStatements(bankAccountId: number, dateFrom?: string, dateTo?: string): Promise<{ status: string; new_transactions: number }> {
    return this.request<{ status: string; new_transactions: number }>(`/bank-accounts/${bankAccountId}/sync-statements/`, {
      method: 'POST',
      body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
    });
  }

  // =========================================================================
  // Banking — Банковские транзакции
  // =========================================================================

  async getBankTransactions(params?: {
    bank_account?: number;
    transaction_type?: string;
    reconciled?: boolean;
    date?: string;
    search?: string;
    ordering?: string;
    page?: number;
  }): Promise<PaginatedResponse<BankTransaction>> {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          qs.set(key, String(value));
        }
      });
    }
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<PaginatedResponse<BankTransaction>>(`/bank-transactions/${query}`);
  }

  async reconcileBankTransaction(transactionId: number, paymentId: number): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/bank-transactions/${transactionId}/reconcile/`, {
      method: 'POST',
      body: JSON.stringify({ payment_id: paymentId }),
    });
  }

  // =========================================================================
  // Banking — Платёжные поручения
  // =========================================================================

  async getBankPaymentOrders(params?: {
    status?: string;
    bank_account?: number;
    payment_date?: string;
    search?: string;
    ordering?: string;
    page?: number;
  }): Promise<PaginatedResponse<BankPaymentOrder>> {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          qs.set(key, String(value));
        }
      });
    }
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<PaginatedResponse<BankPaymentOrder>>(`/bank-payment-orders/${query}`);
  }

  async getBankPaymentOrder(id: number): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/`);
  }

  async createBankPaymentOrder(data: CreateBankPaymentOrderData): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>('/bank-payment-orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async submitBankPaymentOrder(id: number): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/submit/`, {
      method: 'POST',
    });
  }

  async approveBankPaymentOrder(id: number, data?: { payment_date?: string; comment?: string }): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/approve/`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async rejectBankPaymentOrder(id: number, comment?: string): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ comment: comment || '' }),
    });
  }

  async rescheduleBankPaymentOrder(id: number, paymentDate: string, comment: string): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/reschedule/`, {
      method: 'POST',
      body: JSON.stringify({ payment_date: paymentDate, comment }),
    });
  }

  async executeBankPaymentOrder(id: number): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/execute/`, {
      method: 'POST',
    });
  }

  async checkBankPaymentOrderStatus(id: number): Promise<BankPaymentOrder> {
    return this.request<BankPaymentOrder>(`/bank-payment-orders/${id}/status/`);
  }

  async getBankPaymentOrderEvents(id: number): Promise<BankPaymentOrderEvent[]> {
    return this.request<BankPaymentOrderEvent[]>(`/bank-payment-orders/${id}/events/`);
  }
}

// Types
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
  type: 'customer' | 'potential_customer' | 'vendor' | 'both' | 'employee';
  vendor_subtype?: 'supplier' | 'executor' | 'both' | null;
  vendor_subtype_display?: string;
  legal_form?: string;
  address?: string;
  contact_info?: string;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface ConstructionObject {
  id: number;
  name: string;
  address: string;
  status: 'planned' | 'active' | 'completed' | 'suspended';
  start_date: string | null;
  end_date: string | null;
  description?: string;
  contracts_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateConstructionObjectData {
  name: string;
  address: string;
  status: 'planned' | 'active' | 'completed' | 'suspended';
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
  type: 'customer' | 'potential_customer' | 'vendor' | 'both' | 'employee';
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
  
  status: 'planned' | 'active' | 'completed' | 'terminated';
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

export interface Act {
  id: number;
  contract: number;
  number: string;
  date: string;
  period_start: string;
  period_end: string;
  amount_gross: string;
  amount_net: string;
  vat_amount: string;
  status: 'draft' | 'signed' | 'cancelled';
  unpaid_amount?: string;
  description?: string;
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
  description?: string;
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
  unit: 'шт' | 'м.п.' | 'м²' | 'м³' | 'компл' | 'ед' | 'ч' | 'кг' | 'т';
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
  signatory_name: string;
  signatory_position: string;
  checked_by_name: string | null;
  approved_by_name: string | null;
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

export const ERP_SECTIONS = [
  { code: 'objects', label: 'Объекты' },
  { code: 'payments', label: 'Платежи' },
  { code: 'projects', label: 'Проекты и Сметы' },
  { code: 'proposals', label: 'Предложения' },
  { code: 'contracts', label: 'Договоры' },
  { code: 'catalog', label: 'Каталог' },
  { code: 'communications', label: 'Переписка' },
  { code: 'settings', label: 'Настройки' },
  { code: 'banking', label: 'Банковские операции' },
  { code: 'banking_approve', label: 'Одобрение платежей' },
] as const;

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
ApiClient.prototype.getInvoiceDashboard = async function (this: ApiClient) {
  return this.request<any>('/invoices/dashboard/');
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

export const api = new ApiClient();